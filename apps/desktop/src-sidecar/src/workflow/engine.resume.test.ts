import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDefinition } from '@gemini-cowork/shared';
import { DatabaseConnection, WorkflowEventRepository, WorkflowRunRepository } from '@gemini-cowork/storage';
import { WorkflowEngine } from './engine.js';

function createDefinition(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  const now = Date.now();
  return {
    id: 'wf_resume_test',
    version: 1,
    status: 'published',
    name: 'Resume Workflow Test',
    description: 'Workflow for deterministic resume validation.',
    tags: [],
    schemaVersion: '1',
    triggers: [{ id: 'manual_1', type: 'manual', enabled: true }],
    nodes: [
      { id: 'start_1', type: 'start', name: 'Start', config: {} },
      {
        id: 'tool_1',
        type: 'tool',
        name: 'Tool Node',
        config: {},
        retry: {
          maxAttempts: 2,
          backoffMs: 0,
          maxBackoffMs: 0,
          jitterRatio: 0,
        },
      },
      { id: 'end_1', type: 'end', name: 'End', config: {} },
    ],
    edges: [
      { id: 'edge_start_tool', from: 'start_1', to: 'tool_1', condition: 'success' },
      { id: 'edge_tool_end', from: 'tool_1', to: 'end_1', condition: 'success' },
    ],
    defaults: {
      maxRunTimeMs: 5 * 60 * 1000,
      nodeTimeoutMs: 60 * 1000,
      retry: {
        maxAttempts: 2,
        backoffMs: 0,
        maxBackoffMs: 0,
        jitterRatio: 0,
      },
    },
    permissionsProfile: undefined,
    createdAt: now,
    updatedAt: now,
    createdBy: 'test',
    ...overrides,
  };
}

function createEngineFixture(
  executeAgentPrompt: (prompt: string) => Promise<{ content: string; promptTokens?: number; completionTokens?: number }>,
  definition: WorkflowDefinition,
) {
  const db = new DatabaseConnection({ inMemory: true });
  const runRepository = new WorkflowRunRepository(db);
  const eventRepository = new WorkflowEventRepository(db);
  const engine = new WorkflowEngine({
    runRepository,
    eventRepository,
    executeAgentPrompt: (prompt) => executeAgentPrompt(prompt),
  });
  engine.setDefinitionResolver(() => ({
    definition,
    compiled: engine.getCompiled(definition),
  }));
  return { db, runRepository, eventRepository, engine };
}

const openDbs: DatabaseConnection[] = [];
afterEach(() => {
  for (const db of openDbs.splice(0, openDbs.length)) {
    db.close();
  }
});

describe('WorkflowEngine deterministic resume and compensation', () => {
  it('uses checkpoint resume pointer to avoid duplicate side-effect node execution', async () => {
    const executeAgentPrompt = vi.fn(async () => ({ content: 'should_not_execute' }));
    const definition = createDefinition();
    const { db, runRepository, eventRepository, engine } = createEngineFixture(executeAgentPrompt, definition);
    openDbs.push(db);

    const run = runRepository.create({
      workflowId: definition.id,
      workflowVersion: definition.version,
      triggerType: 'manual',
      triggerContext: {},
      input: {},
      status: 'queued',
      startedAt: Date.now(),
      currentNodeId: 'tool_1',
      correlationId: 'corr_resume_1',
    });

    const completedNodeRun = runRepository.createNodeRun({
      runId: run.id,
      nodeId: 'tool_1',
      attempt: 1,
      status: 'succeeded',
      input: {},
      output: { text: 'already completed' },
      startedAt: Date.now() - 1_000,
      completedAt: Date.now() - 900,
      durationMs: 100,
    });

    runRepository.updateStatus(run.id, {
      status: 'queued',
      currentNodeId: 'tool_1',
      output: {
        __runtime: {
          checkpoint: {
            step: 2,
            completedNodeId: 'tool_1',
            nextNodeId: 'end_1',
            nodeRunId: completedNodeRun.id,
            recordedAt: Date.now() - 800,
          },
        },
      },
    });

    const finalRun = await engine.execute(run.id);
    expect(finalRun.status).toBe('completed');
    expect(executeAgentPrompt).not.toHaveBeenCalled();

    const nodeRuns = runRepository.getNodeRuns(run.id).filter((nodeRun) => nodeRun.nodeId === 'tool_1');
    expect(nodeRuns).toHaveLength(1);

    const events = eventRepository.list(run.id);
    const resumedEvent = events.find((event) => event.type === 'run_resumed');
    expect(resumedEvent).toBeDefined();
    expect((resumedEvent?.payload as { reason?: string }).reason).toBe('deterministic_resume_checkpoint');
  });

  it('executes configured compensation hook before retrying a failed side-effect node', async () => {
    let toolAttempts = 0;
    const executeAgentPrompt = vi.fn(async (prompt: string) => {
      if (prompt.startsWith('Execute workflow node type: tool')) {
        toolAttempts += 1;
        if (toolAttempts === 1) {
          throw new Error('transient failure');
        }
        return { content: 'tool_success' };
      }

      if (prompt.includes('compensate tool_1')) {
        return { content: 'compensation_applied' };
      }

      return { content: 'ok' };
    });

    const definition = createDefinition({
      nodes: [
        { id: 'start_1', type: 'start', name: 'Start', config: {} },
        {
          id: 'tool_1',
          type: 'tool',
          name: 'Tool Node',
          config: {
            compensation: {
              enabled: true,
              strategy: 'before_retry',
              promptTemplate: 'compensate {{compensation.nodeId}} after {{compensation.error}}',
              maxTurns: 1,
            },
          },
          retry: {
            maxAttempts: 2,
            backoffMs: 0,
            maxBackoffMs: 0,
            jitterRatio: 0,
          },
        },
        { id: 'end_1', type: 'end', name: 'End', config: {} },
      ],
    });
    const { db, runRepository, eventRepository, engine } = createEngineFixture(executeAgentPrompt, definition);
    openDbs.push(db);

    const run = runRepository.create({
      workflowId: definition.id,
      workflowVersion: definition.version,
      triggerType: 'manual',
      triggerContext: {},
      input: {},
      status: 'queued',
      currentNodeId: undefined,
      correlationId: 'corr_comp_1',
    });

    const finalRun = await engine.execute(run.id);
    expect(finalRun.status).toBe('completed');
    expect(executeAgentPrompt).toHaveBeenCalledTimes(3);

    const toolRuns = runRepository.getNodeRuns(run.id).filter((nodeRun) => nodeRun.nodeId === 'tool_1');
    expect(toolRuns).toHaveLength(2);
    expect(toolRuns[0]?.status).toBe('failed');
    expect(toolRuns[0]?.output).toMatchObject({
      compensation: {
        applied: true,
      },
    });
    expect(toolRuns[1]?.status).toBe('succeeded');

    const failedEvent = eventRepository
      .list(run.id)
      .find((event) => event.type === 'node_failed' && (event.payload as { nodeId?: string }).nodeId === 'tool_1');
    expect(failedEvent).toBeDefined();
    expect((failedEvent?.payload as { compensationApplied?: boolean }).compensationApplied).toBe(true);
  });
});
