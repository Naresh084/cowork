// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { expect, test, type Page } from '@playwright/test';

interface BranchSeed {
  sessionId: string;
  userName: string;
  activeBranchId: string | null;
  branches: Array<{
    id: string;
    sessionId: string;
    name: string;
    status: 'active' | 'merged' | 'abandoned';
    fromTurnId?: string;
    parentBranchId?: string;
    createdAt: number;
    updatedAt: number;
  }>;
  chatItems?: Array<Record<string, unknown>>;
}

function createSeed(overrides: Partial<BranchSeed> = {}): BranchSeed {
  const now = Date.now();
  const sessionId = overrides.sessionId || 'sess-branch-1';
  return {
    sessionId,
    userName: 'Branch Tester',
    activeBranchId: null,
    branches: [],
    chatItems: [
      {
        id: 'u-1',
        kind: 'user_message',
        content: 'Test branch flow',
        turnId: 'u-1',
        timestamp: now - 2_000,
        sequence: 1,
      },
    ],
    ...overrides,
  };
}

async function installDesktopMock(page: Page, seed: BranchSeed): Promise<void> {
  await page.addInitScript(({ payload }) => {
    const now = Date.now();

    const summary = {
      id: payload.sessionId,
      type: 'main',
      provider: 'lmstudio',
      executionMode: 'execute',
      title: 'Branch Session',
      firstMessage: 'Test branch flow',
      workingDirectory: '/tmp',
      model: 'gemini-2.5-pro',
      messageCount: 1,
      createdAt: now - 60_000,
      updatedAt: now - 30_000,
      lastAccessedAt: now - 10_000,
    };

    const persistedChatRuntime = {
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
        branchesBySession: {
          [payload.sessionId]: payload.branches || [],
        },
        activeBranchBySession: {
          [payload.sessionId]: payload.activeBranchId ?? null,
        },
      },
      version: 0,
    };

    localStorage.clear();
    localStorage.setItem('settings-store', JSON.stringify(persistedSettings));
    localStorage.setItem('session-store', JSON.stringify(persistedSession));
    localStorage.setItem('chat-runtime-state-v1', JSON.stringify(persistedChatRuntime));

    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    let callbackId = 1;
    let listenerId = 1;

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

        if (cmd === 'plugin:event|listen') return listenerId++;
        if (cmd === 'plugin:event|unlisten') return null;
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
              [payload.sessionId]: {
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
              },
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
        if (cmd === 'agent_get_session' || cmd === 'agent_get_session_chunk') {
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
            hasMoreHistory: false,
            oldestLoadedSequence: 1,
            runtime: {
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

        if (cmd === 'fetch_provider_models') {
          return [
            {
              id: 'gemini-2.5-pro',
              name: 'Gemini 2.5 Pro',
              description: 'Mock model',
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

        if (cmd === 'agent_branch_session') {
          const branchName = typeof args.branchName === 'string' ? args.branchName : 'branch';
          const branchId = `branch-${String(branchName).replace(/\\s+/g, '-').toLowerCase()}`;
          return {
            id: branchId,
            sessionId: payload.sessionId,
            name: branchName,
            status: 'active',
            fromTurnId: typeof args.fromTurnId === 'string' ? args.fromTurnId : undefined,
            parentBranchId: payload.activeBranchId ?? undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        }

        if (cmd === 'agent_merge_branch') {
          return {
            mergeId: 'merge-1',
            sourceBranchId: args.sourceBranchId,
            targetBranchId: args.targetBranchId,
            strategy: args.strategy || 'auto',
            status: 'merged',
            conflictCount: 0,
            conflicts: [],
            mergedAt: Date.now(),
            activeBranchId: args.targetBranchId,
          };
        }

        if (cmd === 'agent_set_active_branch') {
          return {
            sessionId: payload.sessionId,
            activeBranchId: args.branchId,
          };
        }

        if (
          cmd === 'agent_set_models' ||
          cmd === 'agent_set_api_key' ||
          cmd === 'agent_set_stitch_api_key' ||
          cmd === 'agent_update_session_last_accessed' ||
          cmd === 'agent_set_execution_mode' ||
          cmd === 'agent_set_approval_mode'
        ) {
          return null;
        }

        return null;
      },
    };
  }, { payload: seed });
}

async function tauriCalls(page: Page): Promise<Array<{ cmd: string; args?: Record<string, unknown> }>> {
  return page.evaluate(
    () => ((window as any).__TAURI_MOCK_CALLS__ || []) as Array<{ cmd: string; args?: Record<string, unknown> }>,
  );
}

test.describe('Branching Flows', () => {
  test('creates a branch from chat branch panel', async ({ page }) => {
    await installDesktopMock(page, createSeed());
    await page.goto('/');
    await expect(page.locator('text=Test branch flow')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /Branches/ }).click();
    const branchNameInput = page.getByPlaceholder('New branch name');
    await branchNameInput.fill('feature-ui');
    await expect(branchNameInput).toHaveValue('feature-ui');
    const createButton = page.getByRole('button', { name: 'Create' });
    await expect(createButton).toBeEnabled({ timeout: 5_000 });
    await createButton.click();

    await expect(page.getByText('Active: feature-ui')).toBeVisible({ timeout: 15_000 });

    const calls = await tauriCalls(page);
    const createCall = calls.find((call) => call.cmd === 'agent_branch_session');
    expect(createCall).toBeDefined();
    expect(createCall?.args?.branchName).toBe('feature-ui');
  });

  test('merges a non-active branch into the active branch', async ({ page }) => {
    const now = Date.now();
    const sessionId = 'sess-branch-2';
    await installDesktopMock(
      page,
      createSeed({
        sessionId,
        activeBranchId: 'branch-main',
        branches: [
          {
            id: 'branch-main',
            sessionId,
            name: 'main-line',
            status: 'active',
            createdAt: now - 10_000,
            updatedAt: now - 8_000,
          },
          {
            id: 'branch-fix',
            sessionId,
            name: 'fix-io',
            status: 'active',
            parentBranchId: 'branch-main',
            createdAt: now - 6_000,
            updatedAt: now - 5_000,
          },
        ],
      }),
    );
    await page.goto('/');
    await expect(page.getByText('Active: main-line')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /Branches/ }).click();
    const fixRow = page.locator('div').filter({ hasText: 'fix-io' }).first();
    await fixRow.getByRole('button', { name: 'Merge' }).click();

    const calls = await tauriCalls(page);
    const mergeCall = calls.find((call) => call.cmd === 'agent_merge_branch');
    expect(mergeCall).toBeDefined();
    expect(mergeCall?.args?.sourceBranchId).toBe('branch-fix');
    expect(mergeCall?.args?.targetBranchId).toBe('branch-main');
  });

  test('switches active branch within cached-state latency target', async ({ page }) => {
    const now = Date.now();
    const sessionId = 'sess-branch-3';
    await installDesktopMock(
      page,
      createSeed({
        sessionId,
        activeBranchId: 'branch-main',
        branches: [
          {
            id: 'branch-main',
            sessionId,
            name: 'main-line',
            status: 'active',
            createdAt: now - 10_000,
            updatedAt: now - 9_000,
          },
          {
            id: 'branch-exp',
            sessionId,
            name: 'experiment',
            status: 'active',
            parentBranchId: 'branch-main',
            createdAt: now - 8_000,
            updatedAt: now - 7_000,
          },
        ],
      }),
    );
    await page.goto('/');

    await page.getByRole('button', { name: /Branches/ }).click();
    const experimentRow = page.locator('div').filter({ hasText: 'experiment' }).first();
    const startedAt = Date.now();
    await experimentRow.getByRole('button', { name: 'Use' }).click();
    await expect(page.getByText('Active: experiment')).toBeVisible({ timeout: 15_000 });
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(300);

    const calls = await tauriCalls(page);
    const switchCall = calls.find((call) => call.cmd === 'agent_set_active_branch');
    expect(switchCall).toBeDefined();
    expect(switchCall?.args?.branchId).toBe('branch-exp');
  });
});
