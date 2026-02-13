import { test, expect, type Page } from '@playwright/test';

interface WorkflowSeed {
  sessionId: string;
  userName: string;
}

function createSeed(overrides: Partial<WorkflowSeed> = {}): WorkflowSeed {
  return {
    sessionId: overrides.sessionId || 'sess-workflow-1',
    userName: overrides.userName || 'Workflow Tester',
  };
}

async function installDesktopMock(page: Page, seed: WorkflowSeed): Promise<void> {
  await page.addInitScript(({ payload }) => {
    const now = Date.now();
    let workflowCounter = 0;
    let runCounter = 0;
    let eventCounter = 0;
    let nodeRunCounter = 0;

    type WorkflowDef = {
      id: string;
      version: number;
      status: 'draft' | 'published' | 'archived';
      name: string;
      description?: string;
      tags: string[];
      schemaVersion: string;
      triggers: Array<Record<string, unknown>>;
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
      defaults: Record<string, unknown>;
      permissionsProfile?: string;
      createdAt: number;
      updatedAt: number;
      createdBy?: string;
    };
    type WorkflowRunState = {
      id: string;
      workflowId: string;
      workflowVersion: number;
      triggerType: string;
      triggerContext: Record<string, unknown>;
      input: Record<string, unknown>;
      output?: Record<string, unknown>;
      status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'failed_recoverable';
      startedAt?: number;
      completedAt?: number;
      currentNodeId?: string;
      error?: string;
      correlationId?: string;
      createdAt: number;
      updatedAt: number;
      _pollCount: number;
      _forceRecoverableFail: boolean;
    };
    type WorkflowEventState = {
      id: string;
      runId: string;
      ts: number;
      type:
        | 'run_started'
        | 'run_completed'
        | 'run_failed'
        | 'run_paused'
        | 'run_resumed'
        | 'run_cancelled'
        | 'node_started'
        | 'node_succeeded';
      payload: Record<string, unknown>;
    };
    type WorkflowNodeRunState = {
      id: string;
      runId: string;
      nodeId: string;
      attempt: number;
      status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';
      input: Record<string, unknown>;
      output?: Record<string, unknown>;
      error?: string;
      startedAt?: number;
      completedAt?: number;
      durationMs?: number;
    };

    const workflows: WorkflowDef[] = [];
    const runs: WorkflowRunState[] = [];
    const runEventsByRunId: Record<string, WorkflowEventState[]> = {};
    const nodeRunsByRunId: Record<string, WorkflowNodeRunState[]> = {};

    const sessionSummary = {
      id: payload.sessionId,
      type: 'main',
      provider: 'lmstudio',
      executionMode: 'execute',
      title: 'Workflow Session',
      firstMessage: 'Workflow lifecycle',
      workingDirectory: '/tmp',
      model: 'gemini-2.5-pro',
      messageCount: 1,
      createdAt: now - 60_000,
      updatedAt: now - 30_000,
      lastAccessedAt: now - 10_000,
    };

    const runtime = {
      version: 1,
      runState: 'idle',
      isStreaming: false,
      isThinking: false,
      activeTurnId: 'u-1',
      activeToolIds: [],
      pendingPermissions: [],
      pendingQuestions: [],
      messageQueue: [],
      updatedAt: now,
    };

    localStorage.clear();
    localStorage.setItem(
      'settings-store',
      JSON.stringify({
        state: {
          userName: payload.userName,
          activeProvider: 'lmstudio',
          selectedModel: 'gemini-2.5-pro',
          selectedModelByProvider: {
            google: 'gemini-2.5-pro',
            openai: '',
            anthropic: '',
            openrouter: '',
            moonshot: '',
            glm: '',
            deepseek: '',
            lmstudio: 'gemini-2.5-pro',
          },
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      'session-store',
      JSON.stringify({
        state: {
          activeSessionId: payload.sessionId,
          sessions: [sessionSummary],
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      'chat-runtime-state-v1',
      JSON.stringify({
        state: {
          sessions: {
            [payload.sessionId]: {
              activeTurnId: 'u-1',
              pendingPermissions: [],
              pendingQuestions: [],
              messageQueue: [],
              streamStall: {
                isStalled: false,
                stalledAt: null,
                runId: null,
                reason: null,
                recoverable: false,
                lastActivityAt: now,
              },
              lastUpdatedAt: now,
            },
          },
        },
        version: 0,
      }),
    );

    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    let callbackId = 1;
    let listenerId = 1;
    const listenerMap = new Map<number, { eventName: string; handlerId: number }>();

    const defaultNodes = () => [
      { id: 'node-start', type: 'start', name: 'Start', config: {} },
      { id: 'node-tool', type: 'tool', name: 'Execute', config: {} },
      { id: 'node-end', type: 'end', name: 'End', config: {} },
    ];
    const defaultEdges = () => [
      { id: 'edge-1', from: 'node-start', to: 'node-tool', condition: 'always' },
      { id: 'edge-2', from: 'node-tool', to: 'node-end', condition: 'success' },
    ];

    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

    const appendRunEvent = (runId: string, type: WorkflowEventState['type'], payloadData: Record<string, unknown> = {}) => {
      const entry: WorkflowEventState = {
        id: `wf-event-${++eventCounter}`,
        runId,
        ts: Date.now(),
        type,
        payload: payloadData,
      };
      if (!runEventsByRunId[runId]) runEventsByRunId[runId] = [];
      runEventsByRunId[runId]!.push(entry);
    };

    const ensureNodeRuns = (run: WorkflowRunState) => {
      if (!nodeRunsByRunId[run.id] || nodeRunsByRunId[run.id]!.length === 0) {
        nodeRunsByRunId[run.id] = [
          {
            id: `wf-node-run-${++nodeRunCounter}`,
            runId: run.id,
            nodeId: 'node-tool',
            attempt: 1,
            status: 'queued',
            input: {},
          },
        ];
      }
      return nodeRunsByRunId[run.id]!;
    };

    const advanceRunState = (run: WorkflowRunState) => {
      run._pollCount += 1;

      if (run.status === 'queued') {
        run.status = 'running';
        run.startedAt = run.startedAt || Date.now();
        run.updatedAt = Date.now();
        run.currentNodeId = 'node-tool';
        appendRunEvent(run.id, 'run_started', { workflowId: run.workflowId });
        appendRunEvent(run.id, 'node_started', { nodeId: 'node-tool' });
        const nodeRuns = ensureNodeRuns(run);
        nodeRuns[0]!.status = 'running';
        nodeRuns[0]!.startedAt = Date.now();
        return;
      }

      if (run.status !== 'running') return;

      if (run._forceRecoverableFail && run._pollCount >= 2) {
        run.status = 'failed_recoverable';
        run.error = 'Recoverable node failure';
        run.updatedAt = Date.now();
        appendRunEvent(run.id, 'run_failed', { recoverable: true, error: run.error });
        const nodeRuns = ensureNodeRuns(run);
        nodeRuns[0]!.status = 'failed';
        nodeRuns[0]!.error = run.error;
        nodeRuns[0]!.completedAt = Date.now();
        nodeRuns[0]!.durationMs = 500;
        return;
      }

      if (run._pollCount >= 2) {
        run.status = 'completed';
        run.output = { success: true };
        run.completedAt = Date.now();
        run.updatedAt = Date.now();
        run.currentNodeId = undefined;
        appendRunEvent(run.id, 'node_succeeded', { nodeId: 'node-tool' });
        appendRunEvent(run.id, 'run_completed', { workflowId: run.workflowId });
        const nodeRuns = ensureNodeRuns(run);
        nodeRuns[0]!.status = 'succeeded';
        nodeRuns[0]!.completedAt = Date.now();
        nodeRuns[0]!.durationMs = 500;
      }
    };

    (window as any).__TAURI__ = {};
    (window as any).__TAURI_MOCK_CALLS__ = calls;
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };

    (window as any).__TAURI_INTERNALS__ = {
      transformCallback: (cb: (payload: unknown) => void) => {
        const id = callbackId++;
        (window as any)[`__mock_callback_${id}`] = cb;
        return id;
      },
      unregisterCallback: (id: number) => {
        delete (window as any)[`__mock_callback_${id}`];
      },
      convertFileSrc: (path: string) => `asset://${path}`,
      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        calls.push({ cmd, args });

        if (cmd === 'plugin:event|listen') {
          const currentListenerId = listenerId++;
          const eventName = typeof args.event === 'string' ? args.event : '';
          const handlerId = typeof args.handler === 'number' ? args.handler : Number(args.handler ?? -1);
          if (eventName && Number.isFinite(handlerId) && handlerId > 0) {
            listenerMap.set(currentListenerId, { eventName, handlerId });
          }
          return currentListenerId;
        }
        if (cmd === 'plugin:event|unlisten') {
          const id = typeof args.eventId === 'number' ? args.eventId : Number(args.eventId ?? -1);
          if (Number.isFinite(id) && id > 0) {
            listenerMap.delete(id);
          }
          return null;
        }
        if (cmd === 'plugin:event|emit' || cmd === 'plugin:event|emit_to') return null;
        if (cmd === 'agent_subscribe_events') return null;
        if (cmd === 'agent_get_events_since') {
          return {
            events: [],
            eventCursor: 0,
            replayStart: 0,
            hasGap: false,
          };
        }

        if (cmd === 'agent_get_initialization_status') {
          return { initialized: true, sessionCount: 1 };
        }
        if (cmd === 'agent_get_bootstrap_state') {
          return {
            sessions: [sessionSummary],
            runtime: {
              [payload.sessionId]: runtime,
            },
            eventCursor: 0,
            timestamp: now,
          };
        }
        if (cmd === 'agent_list_sessions_page') {
          return {
            sessions: [sessionSummary],
            total: 1,
            hasMore: false,
            offset: 0,
            limit: 20,
            nextOffset: null,
          };
        }
        if (cmd === 'agent_get_session') {
          return {
            ...sessionSummary,
            messages: [],
            chatItems: [],
            tasks: [],
            artifacts: [],
            contextUsage: {
              usedTokens: 64,
              maxTokens: 1024,
              percentUsed: 6.25,
            },
          };
        }
        if (cmd === 'agent_get_session_chunk') {
          return {
            id: payload.sessionId,
            executionMode: 'execute',
            messages: [],
            chatItems: [],
            tasks: [],
            artifacts: [],
            contextUsage: {
              usedTokens: 64,
              maxTokens: 1024,
              percentUsed: 6.25,
            },
            hasMoreHistory: false,
            oldestLoadedSequence: 1,
            runtime,
          };
        }
        if (cmd === 'fetch_provider_models') {
          return [
            {
              id: 'gemini-2.5-pro',
              name: 'Gemini 2.5 Pro',
              description: 'Mock model for workflow tests',
              input_token_limit: 1_000_000,
              output_token_limit: 8_192,
            },
          ];
        }
        if (
          cmd === 'deep_command_list' ||
          cmd === 'agent_discover_skills' ||
          cmd === 'deep_subagent_list' ||
          cmd === 'cron_list_jobs'
        ) {
          return [];
        }
        if (cmd === 'workflow_list_scheduled') {
          return [];
        }
        if (cmd === 'cron_get_status') {
          return {
            running: true,
            jobCount: 0,
            activeRuns: 0,
            queuedRuns: 0,
            nextRunAt: null,
          };
        }
        if (
          cmd === 'get_provider_api_key' ||
          cmd === 'get_google_api_key' ||
          cmd === 'get_openai_api_key' ||
          cmd === 'get_fal_api_key' ||
          cmd === 'get_exa_api_key' ||
          cmd === 'get_tavily_api_key' ||
          cmd === 'get_stitch_api_key'
        ) {
          return null;
        }

        if (cmd === 'workflow_list') {
          return clone(workflows).sort((a, b) => b.updatedAt - a.updatedAt);
        }
        if (cmd === 'workflow_get') {
          const workflowId = String(args.workflowId || '');
          const found = workflows.find((workflow) => workflow.id === workflowId);
          return found ? clone(found) : null;
        }
        if (cmd === 'workflow_create_draft') {
          const input = (args.input || {}) as Record<string, unknown>;
          const createdAt = Date.now();
          const workflow: WorkflowDef = {
            id: `workflow-${++workflowCounter}`,
            version: 1,
            status: 'draft',
            name: String(input.name || `Workflow ${workflowCounter}`),
            description: typeof input.description === 'string' ? input.description : undefined,
            tags: Array.isArray(input.tags) ? (input.tags as string[]) : [],
            schemaVersion: '1',
            triggers: Array.isArray(input.triggers)
              ? (input.triggers as Array<Record<string, unknown>>)
              : [{ id: 'trigger-manual', type: 'manual', enabled: true }],
            nodes: Array.isArray(input.nodes) ? (input.nodes as Array<Record<string, unknown>>) : defaultNodes(),
            edges: Array.isArray(input.edges) ? (input.edges as Array<Record<string, unknown>>) : defaultEdges(),
            defaults:
              (input.defaults as Record<string, unknown>) ||
              {
                maxRunTimeMs: 30 * 60 * 1000,
                nodeTimeoutMs: 5 * 60 * 1000,
                retry: {
                  maxAttempts: 3,
                  backoffMs: 1000,
                  maxBackoffMs: 20000,
                  jitterRatio: 0.2,
                },
              },
            permissionsProfile: typeof input.permissionsProfile === 'string' ? input.permissionsProfile : undefined,
            createdAt,
            updatedAt: createdAt,
          };
          workflows.unshift(workflow);
          return clone(workflow);
        }
        if (cmd === 'workflow_publish') {
          const workflowId = String(args.workflowId || '');
          const found = workflows.find((workflow) => workflow.id === workflowId);
          if (!found) throw new Error(`Workflow not found: ${workflowId}`);
          found.status = 'published';
          found.updatedAt = Date.now();
          return clone(found);
        }
        if (cmd === 'workflow_archive') {
          const workflowId = String(args.workflowId || '');
          const found = workflows.find((workflow) => workflow.id === workflowId);
          if (!found) throw new Error(`Workflow not found: ${workflowId}`);
          found.status = 'archived';
          found.updatedAt = Date.now();
          return clone(found);
        }
        if (cmd === 'workflow_run') {
          const input = ((args.input || {}) as Record<string, unknown>);
          const workflowId = String(input.workflowId || '');
          const found = workflows.find((workflow) => workflow.id === workflowId);
          if (!found) throw new Error(`Workflow not found: ${workflowId}`);

          const run: WorkflowRunState = {
            id: `workflow-run-${++runCounter}`,
            workflowId,
            workflowVersion: found.version,
            triggerType: String(input.triggerType || 'manual'),
            triggerContext: (input.triggerContext as Record<string, unknown>) || {},
            input: (input.input as Record<string, unknown>) || {},
            status: 'queued',
            correlationId: typeof input.correlationId === 'string' ? input.correlationId : undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            _pollCount: 0,
            _forceRecoverableFail: Boolean(
              (input.input as Record<string, unknown> | undefined)?.forceRecoverableFail,
            ),
          };
          runs.unshift(run);
          runEventsByRunId[run.id] = [];
          nodeRunsByRunId[run.id] = [];
          return clone(run);
        }
        if (cmd === 'workflow_list_runs') {
          const workflowId = typeof args.workflowId === 'string' ? args.workflowId : undefined;
          const status = typeof args.status === 'string' ? args.status : undefined;
          let output = [...runs];
          if (workflowId) {
            output = output.filter((run) => run.workflowId === workflowId);
          }
          if (status) {
            output = output.filter((run) => run.status === status);
          }
          return clone(output);
        }
        if (cmd === 'workflow_get_run') {
          const runId = String(args.runId || '');
          const run = runs.find((item) => item.id === runId);
          if (!run) throw new Error(`Run not found: ${runId}`);
          advanceRunState(run);
          return {
            run: clone(run),
            nodeRuns: clone(nodeRunsByRunId[run.id] || []),
            events: clone(runEventsByRunId[run.id] || []),
          };
        }
        if (cmd === 'workflow_get_run_events') {
          const runId = String(args.runId || '');
          const sinceTs = typeof args.sinceTs === 'number' ? args.sinceTs : undefined;
          const events = runEventsByRunId[runId] || [];
          if (typeof sinceTs !== 'number') return clone(events);
          return clone(events.filter((event) => event.ts >= sinceTs));
        }
        if (cmd === 'workflow_pause_run') {
          const runId = String(args.runId || '');
          const run = runs.find((item) => item.id === runId);
          if (!run) throw new Error(`Run not found: ${runId}`);
          run.status = 'paused';
          run.updatedAt = Date.now();
          appendRunEvent(run.id, 'run_paused', {});
          return clone(run);
        }
        if (cmd === 'workflow_resume_run') {
          const runId = String(args.runId || '');
          const run = runs.find((item) => item.id === runId);
          if (!run) throw new Error(`Run not found: ${runId}`);
          run.status = 'running';
          run.error = undefined;
          run._forceRecoverableFail = false;
          run.updatedAt = Date.now();
          appendRunEvent(run.id, 'run_resumed', {});
          return clone(run);
        }
        if (cmd === 'workflow_cancel_run') {
          const runId = String(args.runId || '');
          const run = runs.find((item) => item.id === runId);
          if (!run) throw new Error(`Run not found: ${runId}`);
          run.status = 'cancelled';
          run.completedAt = Date.now();
          run.updatedAt = Date.now();
          appendRunEvent(run.id, 'run_cancelled', {});
          return clone(run);
        }

        return null;
      },
    };

    (window as any).__TAURI_EMIT_EVENT__ = (
      eventName: string,
      payloadData: Record<string, unknown>,
    ) => {
      for (const listener of listenerMap.values()) {
        if (listener.eventName !== eventName) continue;
        const callback = (window as any)[`__mock_callback_${listener.handlerId}`];
        if (typeof callback === 'function') {
          callback({
            event: eventName,
            id: listener.handlerId,
            payload: payloadData,
          });
        }
      }
    };

    (window as any).__TAURI_LISTENER_COUNT_FOR__ = (eventName: string) => {
      let count = 0;
      for (const listener of listenerMap.values()) {
        if (listener.eventName === eventName) {
          count += 1;
        }
      }
      return count;
    };
  }, { payload: seed });
}

async function invokeWorkflowCommand<T>(
  page: Page,
  cmd: string,
  args: Record<string, unknown>,
): Promise<T> {
  await page.waitForFunction(
    () => typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function',
    undefined,
    { timeout: 10_000 },
  );
  return page.evaluate(
    async ({ command, commandArgs }) => {
      const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') {
        throw new Error('Tauri invoke mock is unavailable');
      }
      return invoke(command, commandArgs);
    },
    { command: cmd, commandArgs: args },
  );
}

async function tauriCalls(page: Page): Promise<Array<{ cmd: string; args?: Record<string, unknown> }>> {
  return page.evaluate(
    () => ((window as any).__TAURI_MOCK_CALLS__ || []) as Array<{ cmd: string; args?: Record<string, unknown> }>,
  );
}

test.describe('Workflow Flows', () => {
  test('supports workflow draft creation and publish lifecycle', async ({ page }) => {
    const seed = createSeed();
    await installDesktopMock(page, seed);
    await page.goto('/');

    const draft = await invokeWorkflowCommand<{ id: string; status: string; name: string }>(
      page,
      'workflow_create_draft',
      {
        input: {
          name: 'Release Notes Pipeline',
          description: 'Generate and publish release notes',
        },
      },
    );
    expect(draft.status).toBe('draft');
    expect(draft.name).toContain('Release Notes');

    const published = await invokeWorkflowCommand<{ id: string; status: string }>(
      page,
      'workflow_publish',
      { workflowId: draft.id },
    );
    expect(published.status).toBe('published');

    const list = await invokeWorkflowCommand<Array<{ id: string; status: string }>>(
      page,
      'workflow_list',
      { limit: 50, offset: 0 },
    );
    expect(list.some((item) => item.id === draft.id && item.status === 'published')).toBe(true);
  });

  test('runs a workflow and records timeline events through completion', async ({ page }) => {
    const seed = createSeed({ sessionId: 'sess-workflow-run' });
    await installDesktopMock(page, seed);
    await page.goto('/');

    const workflow = await invokeWorkflowCommand<{ id: string }>(page, 'workflow_create_draft', {
      input: { name: 'Run Workflow' },
    });
    await invokeWorkflowCommand(page, 'workflow_publish', { workflowId: workflow.id });

    const run = await invokeWorkflowCommand<{ id: string; status: string }>(page, 'workflow_run', {
      input: { workflowId: workflow.id, input: { payload: 'v1' } },
    });
    expect(run.status).toBe('queued');

    const details1 = await invokeWorkflowCommand<{ run: { status: string } }>(
      page,
      'workflow_get_run',
      { runId: run.id },
    );
    expect(details1.run.status).toBe('running');

    const details2 = await invokeWorkflowCommand<{ run: { status: string } }>(
      page,
      'workflow_get_run',
      { runId: run.id },
    );
    expect(details2.run.status).toBe('completed');

    const events = await invokeWorkflowCommand<Array<{ type: string }>>(page, 'workflow_get_run_events', {
      runId: run.id,
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['run_started', 'node_started', 'node_succeeded', 'run_completed']),
    );
  });

  test('recovers from a recoverable failure and resumes to completion', async ({ page }) => {
    const seed = createSeed({ sessionId: 'sess-workflow-retry' });
    await installDesktopMock(page, seed);
    await page.goto('/');

    const workflow = await invokeWorkflowCommand<{ id: string }>(page, 'workflow_create_draft', {
      input: { name: 'Recoverable Workflow' },
    });
    await invokeWorkflowCommand(page, 'workflow_publish', { workflowId: workflow.id });

    const run = await invokeWorkflowCommand<{ id: string }>(page, 'workflow_run', {
      input: { workflowId: workflow.id, input: { forceRecoverableFail: true } },
    });

    await invokeWorkflowCommand(page, 'workflow_get_run', { runId: run.id });
    const failed = await invokeWorkflowCommand<{ run: { status: string } }>(page, 'workflow_get_run', {
      runId: run.id,
    });
    expect(failed.run.status).toBe('failed_recoverable');

    const resumed = await invokeWorkflowCommand<{ status: string }>(page, 'workflow_resume_run', {
      runId: run.id,
    });
    expect(resumed.status).toBe('running');

    await invokeWorkflowCommand(page, 'workflow_get_run', { runId: run.id });
    const completed = await invokeWorkflowCommand<{ run: { status: string } }>(page, 'workflow_get_run', {
      runId: run.id,
    });
    expect(completed.run.status).toBe('completed');

    const calls = await tauriCalls(page);
    expect(calls.some((call) => call.cmd === 'workflow_resume_run')).toBe(true);
  });
});
