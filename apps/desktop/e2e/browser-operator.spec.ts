import { test, expect, type Page } from '@playwright/test';

interface BrowserSeed {
  sessionId: string;
  userName: string;
}

function makeSeed(overrides: Partial<BrowserSeed> = {}): BrowserSeed {
  return {
    sessionId: overrides.sessionId || 'sess-browser-1',
    userName: overrides.userName || 'Browser QA',
  };
}

async function installBrowserMock(page: Page, seed: BrowserSeed): Promise<void> {
  await page.addInitScript(({ payload }) => {
    const now = Date.now();
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    let callbackId = 1;
    let listenerId = 1;
    const listeners = new Map<number, { eventName: string; handlerId: number }>();

    const summary = {
      id: payload.sessionId,
      type: 'main',
      provider: 'google',
      executionMode: 'execute',
      title: 'Browser Operator Session',
      firstMessage: 'Handle browser blocker',
      workingDirectory: '/tmp',
      model: 'gemini-2.5-pro',
      messageCount: 2,
      createdAt: now - 120_000,
      updatedAt: now - 60_000,
      lastAccessedAt: now - 5_000,
    };

    localStorage.clear();
    localStorage.setItem(
      'settings-store',
      JSON.stringify({
        state: {
          userName: payload.userName,
          activeProvider: 'google',
          selectedModelByProvider: {
            google: 'gemini-2.5-pro',
            openai: '',
            anthropic: '',
            openrouter: '',
            moonshot: '',
            glm: '',
            deepseek: '',
            lmstudio: '',
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
          sessions: [summary],
          bootstrapEventCursor: 0,
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
              activeTurnId: 'turn-1',
              pendingPermissions: [],
              pendingQuestions: [],
              messageQueue: [],
              streamStall: {
                isStalled: true,
                stalledAt: now - 15_000,
                runId: 'run-browser-1',
                reason: 'Browser stream paused',
                recoverable: true,
                lastActivityAt: now - 15_000,
              },
              browserRun: {
                status: 'running',
                goal: 'Complete browser task safely',
                step: 0,
                maxSteps: 4,
                lastUrl: null,
                blockedReason: null,
                checkpointPath: null,
                recoverable: false,
                events: [],
                lastUpdatedAt: now - 20_000,
              },
              lastUpdatedAt: now - 10_000,
            },
          },
        },
        version: 0,
      }),
    );

    const replayEvents = [
      {
        type: 'browser:progress',
        sessionId: payload.sessionId,
        data: {
          status: 'running',
          step: 1,
          maxSteps: 4,
          url: 'https://example.com/login',
          detail: 'Running browser step 1 of 4.',
          timestamp: now - 4_000,
        },
      },
      {
        type: 'browserView:screenshot',
        sessionId: payload.sessionId,
        data: {
          data: 'ZmFrZS1wbmc=',
          mimeType: 'image/png',
          url: 'https://example.com/login',
          timestamp: now - 3_500,
        },
      },
      {
        type: 'browser:blocker',
        sessionId: payload.sessionId,
        data: {
          reason: 'Captcha challenge blocked autonomous continuation.',
          step: 1,
          maxSteps: 4,
          url: 'https://example.com/login',
          checkpointPath: '/tmp/browser/checkpoint.json',
          timestamp: now - 3_000,
        },
      },
      {
        type: 'browser:checkpoint',
        sessionId: payload.sessionId,
        data: {
          checkpointPath: '/tmp/browser/checkpoint.json',
          step: 1,
          maxSteps: 4,
          url: 'https://example.com/login',
          recoverable: true,
          timestamp: now - 2_900,
        },
      },
    ];

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
          const id = listenerId++;
          const eventName = typeof args.event === 'string' ? args.event : '';
          const handlerId = typeof args.handler === 'number' ? args.handler : Number(args.handler ?? -1);
          if (eventName && Number.isFinite(handlerId) && handlerId > 0) {
            listeners.set(id, { eventName, handlerId });
          }
          return id;
        }
        if (cmd === 'plugin:event|unlisten') {
          const id = typeof args.eventId === 'number' ? args.eventId : Number(args.eventId ?? -1);
          if (Number.isFinite(id) && id > 0) listeners.delete(id);
          return null;
        }
        if (cmd === 'plugin:event|emit' || cmd === 'plugin:event|emit_to') return null;

        if (cmd === 'agent_subscribe_events') return null;
        if (cmd === 'agent_get_events_since') {
          return {
            events: replayEvents,
            eventCursor: 4,
            replayStart: 1,
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
              [payload.sessionId]: {
                runState: 'running',
                pendingPermissions: [],
                pendingQuestions: [],
                messageQueue: [],
                isStreaming: false,
                isThinking: false,
              },
            },
            eventCursor: 1,
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
            messages: [],
            tasks: [],
            artifacts: [],
            contextUsage: {
              usedTokens: 64,
              maxTokens: 2048,
              percentUsed: 3.125,
            },
            chatItems: [
              {
                id: 'user-1',
                kind: 'user_message',
                content: 'Handle browser blocker',
                turnId: 'turn-1',
                timestamp: now - 20_000,
                sequence: 1,
              },
              {
                id: 'tool-1',
                kind: 'tool_start',
                name: 'computer_use',
                displayName: 'Computer Use',
                arguments: '{}',
                status: 'running',
                turnId: 'turn-1',
                timestamp: now - 19_000,
                sequence: 2,
              },
            ],
          };
        }
        if (cmd === 'agent_get_session_chunk') {
          return {
            id: payload.sessionId,
            executionMode: 'execute',
            messages: [],
            tasks: [],
            artifacts: [],
            chatItems: [
              {
                id: 'user-1',
                kind: 'user_message',
                content: 'Handle browser blocker',
                turnId: 'turn-1',
                timestamp: now - 20_000,
                sequence: 1,
              },
              {
                id: 'tool-1',
                kind: 'tool_start',
                name: 'computer_use',
                displayName: 'Computer Use',
                arguments: '{}',
                status: 'running',
                turnId: 'turn-1',
                timestamp: now - 19_000,
                sequence: 2,
              },
            ],
            contextUsage: {
              usedTokens: 64,
              maxTokens: 2048,
              percentUsed: 3.125,
            },
            hasMoreHistory: false,
            oldestLoadedSequence: 1,
            runtime: {
              runState: 'running',
              pendingPermissions: [],
              pendingQuestions: [],
              messageQueue: [],
              isStreaming: false,
              isThinking: false,
            },
          };
        }

        if (cmd === 'get_provider_api_key') {
          if (args.providerId === 'google') return 'AIza-browser-mock-key';
          return null;
        }
        if (
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
              description: 'Mock model for browser operator tests',
              input_token_limit: 1_000_000,
              output_token_limit: 8_192,
            },
          ];
        }

        if (cmd === 'agent_set_runtime_config') {
          return {
            appliedImmediately: true,
            requiresNewSession: false,
            reasons: [],
            affectedSessionIds: [],
          };
        }

        if (cmd === 'agent_resume_run' || cmd === 'agent_send_message') {
          return null;
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
            lastTickAt: now,
          };
        }

        return null;
      },
    };
  }, { payload: seed });
}

test.describe('Browser Operator Flows', () => {
  test('shows blocker details and supports recover + resume actions', async ({ page }) => {
    await installBrowserMock(page, makeSeed());
    await page.goto('/');

    const liveViewButton = page.getByRole('button', { name: /Live View/ });
    await expect(liveViewButton).toBeVisible({ timeout: 15_000 });
    await liveViewButton.evaluate((el) => (el as HTMLButtonElement).click());

    await expect(page.getByText('Live Browser View')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Blocker Detected')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Captcha challenge blocked autonomous continuation.').first()).toBeVisible();

    await page.getByRole('button', { name: 'Recover Run' }).last().click();
    await page.getByRole('button', { name: 'Resume Checkpoint' }).click();

    await page.waitForFunction(() => {
      const calls = (window as any).__TAURI_MOCK_CALLS__ as Array<{ cmd: string }>;
      if (!Array.isArray(calls)) return false;
      const hasRecover = calls.some((call) => call.cmd === 'agent_resume_run');
      const hasResume = calls.some((call) => call.cmd === 'agent_send_message');
      return hasRecover && hasResume;
    });
  });
});
