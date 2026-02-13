import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExecuteWorkflowPackTool, createRunWorkflowTool } from './workflow-tool.js';
import { workflowService } from '../workflow/index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('workflow-tool pack execution + typed errors', () => {
  it('runs workflow pack from adaptive trigger match', async () => {
    vi.spyOn(workflowService, 'evaluateChatTriggers').mockReturnValue([
      {
        workflowId: 'wf_deploy',
        workflowVersion: 2,
        triggerId: 'chat_deploy',
        confidence: 0.92,
        shouldActivate: true,
        matchedPhrase: 'deploy release to production',
        reasonCodes: ['exact_phrase_match', 'activation_threshold_met'],
        workflowName: 'Deploy Flow',
        breakdown: {
          exactMatch: true,
          substringMatch: true,
          tokenCoverage: 1,
          messageCoverage: 1,
          strictMatch: false,
          effectiveThreshold: 0.72,
          componentScores: {
            exactScore: 1,
            substringScore: 0.88,
            lexicalScore: 1,
            penaltyScore: 0,
          },
        },
      },
    ]);

    const runSpy = vi.spyOn(workflowService, 'run').mockResolvedValue({
      id: 'run_123',
      workflowId: 'wf_deploy',
      workflowVersion: 2,
      triggerType: 'chat',
      triggerContext: {},
      input: {},
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const tool = createExecuteWorkflowPackTool();
    const result = await tool.execute({
      message: 'please deploy release to production tonight',
      input: { dryRun: true },
    }, {
      workingDirectory: process.cwd(),
      sessionId: 'session_test',
      agentId: 'agent_test',
    });

    expect(result.success).toBe(true);
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy.mock.calls[0]?.[0]).toMatchObject({
      workflowId: 'wf_deploy',
      version: 2,
      triggerType: 'chat',
    });
  });

  it('returns typed trigger_match_not_found when activation is required', async () => {
    vi.spyOn(workflowService, 'evaluateChatTriggers').mockReturnValue([
      {
        workflowId: 'wf_deploy',
        workflowVersion: 2,
        triggerId: 'chat_deploy',
        confidence: 0.4,
        shouldActivate: false,
        matchedPhrase: 'deploy release to production',
        reasonCodes: ['activation_threshold_not_met'],
        workflowName: 'Deploy Flow',
        breakdown: {
          exactMatch: false,
          substringMatch: false,
          tokenCoverage: 0.5,
          messageCoverage: 0.3,
          strictMatch: false,
          effectiveThreshold: 0.72,
          componentScores: {
            exactScore: 0,
            substringScore: 0,
            lexicalScore: 0.42,
            penaltyScore: -0.02,
          },
        },
      },
    ]);

    const tool = createExecuteWorkflowPackTool();
    const result = await tool.execute({
      message: 'deploy-ish maybe later',
    }, {
      workingDirectory: process.cwd(),
      sessionId: 'session_test',
      agentId: 'agent_test',
    });

    expect(result.success).toBe(false);
    const resultAny = result as { data?: { error?: { code?: string } } };
    expect(resultAny.data?.error?.code).toBe('trigger_match_not_found');
  });

  it('maps run_workflow not-found errors to typed error payload', async () => {
    vi.spyOn(workflowService, 'run').mockRejectedValue(new Error('Workflow not found: wf_missing'));
    const tool = createRunWorkflowTool();

    const result = await tool.execute({
      workflowId: 'wf_missing',
    }, {
      workingDirectory: process.cwd(),
      sessionId: 'session_test',
      agentId: 'agent_test',
    });

    expect(result.success).toBe(false);
    const resultAny = result as { data?: { error?: { code?: string; retryable?: boolean } } };
    expect(resultAny.data?.error?.code).toBe('workflow_not_found');
    expect(resultAny.data?.error?.retryable).toBe(false);
  });
});
