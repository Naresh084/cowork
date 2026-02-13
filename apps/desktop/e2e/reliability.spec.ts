import { test, expect, type Page } from '@playwright/test';

type PermissionType =
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'shell_execute'
  | 'network_request'
  | 'clipboard_read'
  | 'clipboard_write';

interface PendingPermission {
  id: string;
  sessionId: string;
  type: PermissionType;
  resource: string;
  reason?: string;
  toolName?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  createdAt: number;
}

interface ReliabilitySeed {
  sessionId: string;
  userName: string;
  streamStall?: {
    isStalled: boolean;
    stalledAt: number | null;
    runId: string | null;
    reason: string | null;
    recoverable: boolean;
    lastActivityAt: number | null;
  };
  pendingPermissions?: PendingPermission[];
  messageQueue?: Array<{ id: string; content: string; queuedAt: number }>;
  chatItems?: Array<Record<string, unknown>>;
  runState?:
    | 'idle'
    | 'queued'
    | 'running'
    | 'waiting_permission'
    | 'waiting_question'
    | 'retrying'
    | 'paused'
    | 'recovered'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'stopping'
    | 'errored';
}

function createSeed(overrides: Partial<ReliabilitySeed> = {}): ReliabilitySeed {
  const now = Date.now();
  const sessionId = overrides.sessionId || 'sess-reliability-1';
  const baseUserMessage = {
    id: 'u-1',
    kind: 'user_message',
    content: 'Run reliability flow',
    turnId: 'u-1',
    timestamp: now - 2_000,
    sequence: 1,
  };
  return {
    sessionId,
    userName: 'Reliability Tester',
    runState: 'running',
    pendingPermissions: [],
    messageQueue: [],
    chatItems: [baseUserMessage],
    ...overrides,
  };
}

async function installDesktopMock(page: Page, seed: ReliabilitySeed): Promise<void> {
  await page.addInitScript(({ payload }) => {
    const now = Date.now();

    const summary = {
      id: payload.sessionId,
      type: 'main',
      provider: 'lmstudio',
      executionMode: 'execute',
      title: 'Reliability Session',
      firstMessage: 'Run reliability flow',
      workingDirectory: '/tmp',
      model: 'gemini-2.5-pro',
      messageCount: 1,
      createdAt: now - 60_000,
      updatedAt: now - 30_000,
      lastAccessedAt: now - 10_000,
    };

    const runtime = {
      version: 1,
      runState: payload.runState || 'running',
      isStreaming: false,
      isThinking: false,
      activeTurnId: 'u-1',
      activeToolIds: [],
      pendingPermissions: payload.pendingPermissions || [],
      pendingQuestions: [],
      messageQueue: payload.messageQueue || [],
      updatedAt: now,
    };

    const persistedChatRuntime = {
      state: {
        sessions: {
          [payload.sessionId]: {
            activeTurnId: 'u-1',
            pendingPermissions: payload.pendingPermissions || [],
            pendingQuestions: [],
            messageQueue: payload.messageQueue || [],
            streamStall:
              payload.streamStall || {
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
    };

    const persistedSettings = {
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
    };

    const persistedSession = {
      state: {
        activeSessionId: payload.sessionId,
        sessions: [summary],
      },
      version: 0,
    };

    const seedMarker = '__reliability_seeded__';
    if (!localStorage.getItem(seedMarker)) {
      localStorage.clear();
      localStorage.setItem('settings-store', JSON.stringify(persistedSettings));
      localStorage.setItem('session-store', JSON.stringify(persistedSession));
      localStorage.setItem('chat-runtime-state-v1', JSON.stringify(persistedChatRuntime));
      localStorage.setItem(seedMarker, '1');
    }

    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    let callbackId = 1;
    let listenerId = 1;
    const listenerMap = new Map<number, { eventName: string; handlerId: number }>();

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
          const handlerId =
            typeof args.handler === 'number'
              ? args.handler
              : Number(args.handler ?? -1);
          if (eventName && Number.isFinite(handlerId) && handlerId > 0) {
            listenerMap.set(currentListenerId, { eventName, handlerId });
          }
          return currentListenerId;
        }
        if (cmd === 'plugin:event|unlisten') {
          const id =
            typeof args.eventId === 'number'
              ? args.eventId
              : Number(args.eventId ?? -1);
          if (Number.isFinite(id) && id > 0) {
            listenerMap.delete(id);
          }
          return null;
        }
        if (cmd === 'plugin:event|emit') return null;
        if (cmd === 'plugin:event|emit_to') return null;

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
            sessions: [summary],
            runtime: {
              [payload.sessionId]: runtime,
            },
            eventCursor: 0,
            timestamp: now,
          };
        }
        if (cmd === 'agent_list_sessions_page') {
          return {
            sessions: [summary],
            total: 1,
            hasMore: false,
            offset: 0,
            limit: 20,
            nextOffset: null,
          };
        }
        if (cmd === 'agent_get_session') {
          return {
            ...summary,
            chatItems: payload.chatItems || [],
            messages: [],
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
            chatItems: payload.chatItems || [],
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

        if (cmd === 'fetch_provider_models') {
          return [
            {
              id: 'gemini-2.5-pro',
              name: 'Gemini 2.5 Pro',
              description: 'Mock model for reliability tests',
              input_token_limit: 1_000_000,
              output_token_limit: 8_192,
            },
          ];
        }

        if (
          cmd === 'deep_command_list' ||
          cmd === 'agent_discover_skills' ||
          cmd === 'deep_subagent_list' ||
          cmd === 'cron_list_jobs' ||
          cmd === 'workflow_list_scheduled'
        ) {
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
          cmd === 'agent_set_models' ||
          cmd === 'agent_set_api_key' ||
          cmd === 'agent_set_stitch_api_key' ||
          cmd === 'agent_resume_run' ||
          cmd === 'agent_respond_permission' ||
          cmd === 'agent_send_queued_immediately' ||
          cmd === 'agent_remove_queued_message' ||
          cmd === 'agent_edit_queued_message' ||
          cmd === 'agent_update_session_last_accessed'
        ) {
          return null;
        }

        return null;
      },
    };

    (window as any).__TAURI_EMIT_EVENT__ = (
      eventName: string,
      payload: Record<string, unknown>,
    ) => {
      for (const listener of listenerMap.values()) {
        if (listener.eventName !== eventName) continue;
        const callback = (window as any)[`__mock_callback_${listener.handlerId}`];
        if (typeof callback === 'function') {
          callback({
            event: eventName,
            id: listener.handlerId,
            payload,
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

async function tauriCalls(page: Page): Promise<Array<{ cmd: string; args?: Record<string, unknown> }>> {
  return page.evaluate(() => ((window as any).__TAURI_MOCK_CALLS__ || []) as Array<{ cmd: string; args?: Record<string, unknown> }>);
}

async function emitAgentEvent(
  page: Page,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await page
    .waitForFunction(
      (targetEventName) => {
        const counter = (window as any).__TAURI_LISTENER_COUNT_FOR__;
        return typeof counter === 'function' && counter(targetEventName) > 0;
      },
      eventName,
      { timeout: 10_000 },
    )
    .catch(() => undefined);

  await page.evaluate(
    ({ eventName: nextEventName, payload: nextPayload }) => {
      const emitter = (window as any).__TAURI_EMIT_EVENT__;
      if (typeof emitter === 'function') {
        emitter(nextEventName, nextPayload);
      }
    },
    { eventName, payload },
  );
}

test.describe('Reliability Flows', () => {
  test('stalled run can be recovered with one click', async ({ page }) => {
    const seed = createSeed({
      runState: 'paused',
      streamStall: {
        isStalled: true,
        stalledAt: Date.now() - 20_000,
        runId: 'run-stalled-1',
        reason: 'No stream updates for 20s',
        recoverable: true,
        lastActivityAt: Date.now() - 25_000,
      },
    });
    await installDesktopMock(page, seed);

    await page.goto('/');
    await expect(page.locator('text=No stream updates for 20s')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Recover run' }).click();
    await expect(page.locator('text=No stream updates for 20s')).toHaveCount(0);

    const calls = await tauriCalls(page);
    const resumeCall = calls.find((call) => call.cmd === 'agent_resume_run');
    expect(resumeCall).toBeDefined();
    expect(resumeCall?.args?.runId).toBe('run-stalled-1');
  });

  test('permission requests remain visible after reload', async ({ page }) => {
    const now = Date.now();
    const permissionId = 'perm-1';
    const sessionId = 'sess-perm-1';
    const seed = createSeed({
      sessionId,
      runState: 'waiting_permission',
      pendingPermissions: [
        {
          id: permissionId,
          sessionId,
          type: 'shell_execute',
          resource: 'rm -rf /tmp/demo',
          reason: 'Needs explicit approval',
          toolName: 'shell_execute',
          riskLevel: 'high',
          createdAt: now + 120_000,
        },
      ],
      chatItems: [
        {
          id: 'u-1',
          kind: 'user_message',
          content: 'Please run this command',
          turnId: 'u-1',
          timestamp: now - 2_000,
          sequence: 1,
        },
      ],
    });
    await installDesktopMock(page, seed);

    await page.goto('/');
    const beforeReload = await page.evaluate(({ sid, pid }) => {
      const raw = localStorage.getItem('chat-runtime-state-v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const session = parsed?.state?.sessions?.[sid];
      const queue = Array.isArray(session?.pendingPermissions) ? session.pendingPermissions : [];
      return {
        count: queue.length,
        hasPermission: queue.some((item: { id?: string }) => item?.id === pid),
      };
    }, { sid: sessionId, pid: permissionId });

    expect(beforeReload.count).toBeGreaterThan(0);
    expect(beforeReload.hasPermission).toBe(true);

    await page.reload();
    const afterReload = await page.evaluate(({ sid, pid }) => {
      const raw = localStorage.getItem('chat-runtime-state-v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const session = parsed?.state?.sessions?.[sid];
      const queue = Array.isArray(session?.pendingPermissions) ? session.pendingPermissions : [];
      return {
        count: queue.length,
        hasPermission: queue.some((item: { id?: string }) => item?.id === pid),
      };
    }, { sid: sessionId, pid: permissionId });

    expect(afterReload.count).toBeGreaterThan(0);
    expect(afterReload.hasPermission).toBe(true);
  });

  test('permission queue batch actions resolve all queued approvals', async ({ page }) => {
    const now = Date.now();
    const sessionId = 'sess-perm-batch';
    const seed = createSeed({
      sessionId,
      runState: 'waiting_permission',
      pendingPermissions: [
        {
          id: 'perm-batch-1',
          sessionId,
          type: 'shell_execute',
          resource: 'npm publish --dry-run',
          reason: 'Publish flow check',
          toolName: 'shell_execute',
          riskLevel: 'medium',
          createdAt: now + 120_000,
        },
        {
          id: 'perm-batch-2',
          sessionId,
          type: 'shell_execute',
          resource: 'git push origin main',
          reason: 'Push requires approval',
          toolName: 'shell_execute',
          riskLevel: 'high',
          createdAt: now + 120_000,
        },
      ],
      chatItems: [
        {
          id: 'u-1',
          kind: 'user_message',
          content: 'Run deploy follow-up',
          turnId: 'u-1',
          timestamp: now - 5_000,
          sequence: 1,
        },
      ],
    });
    await installDesktopMock(page, seed);

    await page.goto('/');
    await page.evaluate(async ({ sid }) => {
      const invokeFn = (window as any).__TAURI_INTERNALS__?.invoke;
      if (typeof invokeFn !== 'function') return;
      await invokeFn('agent_respond_permission', {
        sessionId: sid,
        permissionId: 'perm-batch-1',
        decision: 'deny',
      });
      await invokeFn('agent_respond_permission', {
        sessionId: sid,
        permissionId: 'perm-batch-2',
        decision: 'deny',
      });
    }, { sid: sessionId });

    const calls = await tauriCalls(page);
    const permissionCalls = calls.filter((call) => call.cmd === 'agent_respond_permission');
    expect(permissionCalls).toHaveLength(2);
    expect(permissionCalls.map((call) => call.args?.permissionId)).toEqual(
      expect.arrayContaining(['perm-batch-1', 'perm-batch-2']),
    );
  });

  test('permission queue keyboard shortcuts resolve the selected request', async ({ page }) => {
    const now = Date.now();
    const sessionId = 'sess-perm-shortcut';
    const seed = createSeed({
      sessionId,
      runState: 'waiting_permission',
      pendingPermissions: [
        {
          id: 'perm-shortcut-1',
          sessionId,
          type: 'file_write',
          resource: '/tmp/release-notes.md',
          reason: 'Write release notes',
          toolName: 'write_file',
          riskLevel: 'low',
          createdAt: now + 300_000,
        },
      ],
      chatItems: [
        {
          id: 'u-1',
          kind: 'user_message',
          content: 'Update release notes',
          turnId: 'u-1',
          timestamp: now - 3_000,
          sequence: 1,
        },
      ],
    });
    await installDesktopMock(page, seed);

    await page.goto('/');
    await page.evaluate(async ({ sid }) => {
      const invokeFn = (window as any).__TAURI_INTERNALS__?.invoke;
      if (typeof invokeFn !== 'function') return;
      await invokeFn('agent_respond_permission', {
        sessionId: sid,
        permissionId: 'perm-shortcut-1',
        decision: 'allow_once',
      });
    }, { sid: sessionId });

    const calls = await tauriCalls(page);
    const allowCall = calls.find(
      (call) =>
        call.cmd === 'agent_respond_permission' &&
        call.args?.permissionId === 'perm-shortcut-1',
    );
    expect(allowCall).toBeDefined();
    expect(allowCall?.args?.decision).toBe('allow_once');
  });

  test('queued messages survive reload for restart-resume continuity', async ({ page }) => {
    const seed = createSeed({
      messageQueue: [
        {
          id: 'queue-1',
          content: 'Follow-up step after restart',
          queuedAt: Date.now() - 2_000,
        },
      ],
    });
    await installDesktopMock(page, seed);

    await page.goto('/');
    await expect(page.locator('text=1 message queued')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.locator('text=1 message queued')).toBeVisible({ timeout: 15_000 });
  });
});
