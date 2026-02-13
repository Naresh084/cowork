import { test, expect, type Page } from '@playwright/test';

async function installOnboardingMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const now = Date.now();
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    let callbackId = 1;
    let listenerId = 1;
    const listeners = new Map<number, { eventName: string; handlerId: number }>();

    localStorage.clear();
    localStorage.setItem(
      'settings-store',
      JSON.stringify({
        state: {
          userName: '',
          activeProvider: 'google',
          selectedModelByProvider: {
            google: '',
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
          activeSessionId: null,
          sessions: [],
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      'chat-runtime-state-v1',
      JSON.stringify({
        state: {
          sessions: {},
        },
        version: 0,
      }),
    );

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
            typeof args.handler === 'number' ? args.handler : Number(args.handler ?? -1);
          if (eventName && Number.isFinite(handlerId) && handlerId > 0) {
            listeners.set(currentListenerId, { eventName, handlerId });
          }
          return currentListenerId;
        }
        if (cmd === 'plugin:event|unlisten') {
          const id = typeof args.eventId === 'number' ? args.eventId : Number(args.eventId ?? -1);
          if (Number.isFinite(id) && id > 0) {
            listeners.delete(id);
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
          return { initialized: true, sessionCount: 0 };
        }
        if (cmd === 'agent_get_bootstrap_state') {
          return {
            sessions: [],
            runtime: {},
            eventCursor: 0,
            timestamp: now,
          };
        }
        if (cmd === 'agent_list_sessions_page') {
          return {
            sessions: [],
            total: 0,
            hasMore: false,
            offset: 0,
            limit: 20,
            nextOffset: null,
          };
        }
        if (cmd === 'agent_get_session') {
          return {
            id: 'onboarding-session',
            executionMode: 'execute',
            messages: [],
            chatItems: [],
            tasks: [],
            artifacts: [],
            hasMoreHistory: false,
            oldestLoadedSequence: 0,
          };
        }
        if (cmd === 'agent_get_session_chunk') {
          return {
            id: 'onboarding-session',
            executionMode: 'execute',
            messages: [],
            chatItems: [],
            tasks: [],
            artifacts: [],
            hasMoreHistory: false,
            oldestLoadedSequence: 0,
            runtime: {
              runState: 'idle',
              pendingPermissions: [],
              pendingQuestions: [],
              messageQueue: [],
              isStreaming: false,
              isThinking: false,
            },
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

        if (cmd === 'validate_provider_connection') return true;
        if (
          cmd === 'set_provider_api_key' ||
          cmd === 'set_provider_base_url' ||
          cmd === 'set_google_api_key' ||
          cmd === 'set_openai_api_key' ||
          cmd === 'set_fal_api_key' ||
          cmd === 'set_exa_api_key' ||
          cmd === 'set_tavily_api_key' ||
          cmd === 'set_stitch_api_key' ||
          cmd === 'agent_set_api_key' ||
          cmd === 'agent_set_stitch_api_key'
        ) {
          return null;
        }

        if (cmd === 'fetch_provider_models') {
          return [
            {
              id: 'gemini-2.5-pro',
              name: 'Gemini 2.5 Pro',
              description: 'Mock model for onboarding tests',
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

        if (
          cmd === 'agent_discover_skills' ||
          cmd === 'deep_command_list' ||
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
  });
}

test.describe('Onboarding Flows', () => {
  test('completes fast-path setup and applies runtime config', async ({ page }) => {
    await installOnboardingMock(page);
    await page.goto('/');

    await expect(page.getByText('Welcome to Cowork')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Fast Path' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByPlaceholder('Enter your name').fill('QA Onboarding');
    await page.getByPlaceholder('Enter Google API key').fill('AIza-test-key');
    await page.getByPlaceholder('Or enter custom model ID').fill('gemini-2.5-pro');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('Quick Start Capability Summary')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('Review Setup')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Run Checks' }).click();
    await expect(page.getByText('Runtime backend')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Complete Setup' }).click();

    await page.waitForFunction(() => {
      const calls = (window as any).__TAURI_MOCK_CALLS__ as Array<{ cmd: string; args?: Record<string, unknown> }>;
      if (!Array.isArray(calls)) return false;
      const hasKeyWrite = calls.some((call) => call.cmd === 'set_provider_api_key');
      const hasRuntimeApply = calls.some((call) => call.cmd === 'agent_set_runtime_config');
      return hasKeyWrite && hasRuntimeApply;
    });
  });
});
