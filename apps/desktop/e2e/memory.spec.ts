// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { test, expect, type Page } from '@playwright/test';

interface MemorySeed {
  sessionId: string;
  userName: string;
}

interface MemoryCommandResult {
  id: string;
  title: string;
  content: string;
  group: 'preferences' | 'learnings' | 'context' | 'instructions';
  tags: string[];
  source: 'auto' | 'manual';
  confidence?: number;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
  relatedSessionIds: string[];
  relatedMemoryIds: string[];
}

function createSeed(overrides: Partial<MemorySeed> = {}): MemorySeed {
  return {
    sessionId: overrides.sessionId || 'sess-memory-1',
    userName: overrides.userName || 'Memory Tester',
  };
}

async function installDesktopMock(page: Page, seed: MemorySeed): Promise<void> {
  await page.addInitScript(({ payload }) => {
    const now = Date.now();
    const memoryGroups = ['preferences', 'learnings', 'context', 'instructions'];
    const memoryEntries: Array<{
      id: string;
      title: string;
      content: string;
      group: 'preferences' | 'learnings' | 'context' | 'instructions';
      tags: string[];
      source: 'auto' | 'manual';
      confidence?: number;
      createdAt: string;
      updatedAt: string;
      accessCount: number;
      lastAccessedAt: string;
      relatedSessionIds: string[];
      relatedMemoryIds: string[];
    }> = [];
    const feedbackBoostByAtom: Record<string, number> = {};
    let memoryCounter = 0;
    let queryCounter = 0;
    let feedbackCounter = 0;

    const sessionSummary = {
      id: payload.sessionId,
      type: 'main',
      provider: 'lmstudio',
      executionMode: 'execute',
      title: 'Memory Session',
      firstMessage: 'Memory lifecycle',
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

    const cloneMemory = (memory: typeof memoryEntries[number]) => ({ ...memory, tags: [...memory.tags], relatedSessionIds: [...memory.relatedSessionIds], relatedMemoryIds: [...memory.relatedMemoryIds] });
    const memoryToAtomType = (group: string) => {
      if (group === 'preferences') return 'preference';
      if (group === 'instructions') return 'instructions';
      if (group === 'learnings') return 'semantic';
      return 'context';
    };

    const lexicalScore = (query: string, value: string) => {
      const q = query.toLowerCase();
      const target = value.toLowerCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return 0;
      const matches = tokens.filter((token) => target.includes(token)).length;
      return matches / tokens.length;
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
              description: 'Mock model for memory tests',
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
        if (cmd === 'cron_get_status') {
          return {
            running: true,
            jobCount: 0,
            activeRuns: 0,
            queuedRuns: 0,
            nextRunAt: null,
          };
        }

        if (cmd === 'deep_memory_list') {
          return memoryEntries.map((entry) => cloneMemory(entry));
        }
        if (cmd === 'deep_memory_list_groups') {
          return [...memoryGroups];
        }
        if (cmd === 'deep_memory_create') {
          const input = (args.input || {}) as Record<string, unknown>;
          const timestamp = new Date().toISOString();
          const memory = {
            id: `memory-${++memoryCounter}`,
            title: String(input.title || ''),
            content: String(input.content || ''),
            group: (input.group as 'preferences' | 'learnings' | 'context' | 'instructions') || 'context',
            tags: Array.isArray(input.tags) ? (input.tags as string[]) : [],
            source: (input.source as 'auto' | 'manual') || 'manual',
            confidence: typeof input.confidence === 'number' ? input.confidence : 0.8,
            createdAt: timestamp,
            updatedAt: timestamp,
            accessCount: 0,
            lastAccessedAt: timestamp,
            relatedSessionIds: [payload.sessionId],
            relatedMemoryIds: [],
          };
          memoryEntries.push(memory);
          return cloneMemory(memory);
        }
        if (cmd === 'deep_memory_update') {
          const id = String(args.id || '');
          const updates = (args.updates || {}) as Record<string, unknown>;
          const target = memoryEntries.find((entry) => entry.id === id);
          if (!target) {
            throw new Error(`Memory not found: ${id}`);
          }
          if (typeof updates.title === 'string') target.title = updates.title;
          if (typeof updates.content === 'string') target.content = updates.content;
          if (typeof updates.group === 'string') {
            target.group = updates.group as 'preferences' | 'learnings' | 'context' | 'instructions';
          }
          if (Array.isArray(updates.tags)) target.tags = updates.tags as string[];
          target.updatedAt = new Date().toISOString();
          return cloneMemory(target);
        }
        if (cmd === 'deep_memory_delete') {
          const id = String(args.id || '');
          const index = memoryEntries.findIndex((entry) => entry.id === id);
          if (index >= 0) {
            memoryEntries.splice(index, 1);
          }
          return null;
        }
        if (cmd === 'deep_memory_search') {
          const query = String(args.query || '').toLowerCase();
          return memoryEntries
            .filter((entry) =>
              `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase().includes(query),
            )
            .map((entry) => cloneMemory(entry));
        }
        if (cmd === 'deep_memory_get_relevant') {
          const context = String(args.context || '');
          const limit = typeof args.limit === 'number' ? args.limit : 5;
          return memoryEntries
            .map((entry) => {
              const score = lexicalScore(context, `${entry.title} ${entry.content}`) + (feedbackBoostByAtom[entry.id] || 0);
              return {
                ...cloneMemory(entry),
                relevanceScore: Number(score.toFixed(4)),
              };
            })
            .sort((left, right) => right.relevanceScore - left.relevanceScore)
            .slice(0, Math.max(1, limit));
        }
        if (cmd === 'deep_memory_query') {
          const query = String(args.query || '');
          const queryId = `query-${++queryCounter}`;
          const scored = memoryEntries.map((entry) => {
            const base = lexicalScore(query, `${entry.title} ${entry.content} ${entry.tags.join(' ')}`);
            const boost = feedbackBoostByAtom[entry.id] || 0;
            const score = Number((base + boost).toFixed(4));
            const reasons = [
              base > 0 ? 'Lexical match' : 'Context similarity fallback',
            ];
            const normalized = `${entry.title} ${entry.content}`.toLowerCase();
            if (
              query.toLowerCase().includes('indent') &&
              (normalized.includes('tabs') || normalized.includes('spaces'))
            ) {
              reasons.push('Potential conflict signal for indentation preference');
            }
            if (boost > 0) reasons.push('User feedback boosted rank');
            if (boost < 0) reasons.push('User feedback reduced rank');
            return {
              entry,
              score,
              reasons,
            };
          });

          scored.sort((left, right) => right.score - left.score);
          const evidence = scored.map((item) => ({
            atomId: item.entry.id,
            score: item.score,
            reasons: item.reasons,
          }));
          const atoms = scored.map((item) => ({
            id: item.entry.id,
            projectId: 'project-memory-e2e',
            sessionId: payload.sessionId,
            atomType: memoryToAtomType(item.entry.group),
            content: item.entry.content,
            summary: item.entry.title,
            keywords: item.entry.tags,
            confidence: item.entry.confidence ?? 0.7,
            sensitivity: 'normal',
            pinned: false,
            createdAt: Date.parse(item.entry.createdAt),
            updatedAt: Date.parse(item.entry.updatedAt),
          }));

          return {
            queryId,
            sessionId: payload.sessionId,
            query,
            options: (args.options || {}) as Record<string, unknown>,
            evidence,
            atoms,
            totalCandidates: atoms.length,
            latencyMs: 12,
            createdAt: Date.now(),
          };
        }
        if (cmd === 'deep_memory_feedback') {
          const atomId = String(args.atomId || '');
          const feedback = String(args.feedback || '');
          const nowTs = Date.now();
          const adjust = (() => {
            switch (feedback) {
              case 'positive':
                return 0.4;
              case 'negative':
                return -0.4;
              case 'pin':
                return 1;
              case 'unpin':
                return -1;
              case 'hide':
                return -2;
              case 'report_conflict':
                return -0.6;
              default:
                return 0;
            }
          })();
          feedbackBoostByAtom[atomId] = (feedbackBoostByAtom[atomId] || 0) + adjust;
          return {
            id: `feedback-${++feedbackCounter}`,
            sessionId: String(args.sessionId || payload.sessionId),
            queryId: String(args.queryId || ''),
            atomId,
            feedback,
            note: typeof args.note === 'string' ? args.note : undefined,
            createdAt: nowTs,
          };
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

async function invokeMemoryCommand<T>(
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

test.describe('Memory Flows', () => {
  test('supports memory create/update/delete lifecycle', async ({ page }) => {
    const seed = createSeed();
    await installDesktopMock(page, seed);
    await page.goto('/');

    const created = await invokeMemoryCommand<MemoryCommandResult>(page, 'deep_memory_create', {
      workingDirectory: '/tmp',
      input: {
        title: 'CLI preferences',
        content: 'Prefer concise command output.',
        group: 'preferences',
        tags: ['cli', 'verbosity'],
        source: 'manual',
      },
    });
    expect(created.title).toBe('CLI preferences');
    expect(created.group).toBe('preferences');

    const updated = await invokeMemoryCommand<MemoryCommandResult>(page, 'deep_memory_update', {
      workingDirectory: '/tmp',
      id: created.id,
      updates: {
        content: 'Prefer concise command output with strict errors.',
      },
    });
    expect(updated.content).toContain('strict errors');

    const listAfterUpdate = await invokeMemoryCommand<MemoryCommandResult[]>(page, 'deep_memory_list', {
      workingDirectory: '/tmp',
    });
    expect(listAfterUpdate).toHaveLength(1);
    expect(listAfterUpdate[0]?.id).toBe(created.id);

    await invokeMemoryCommand<null>(page, 'deep_memory_delete', {
      workingDirectory: '/tmp',
      id: created.id,
    });
    const listAfterDelete = await invokeMemoryCommand<MemoryCommandResult[]>(page, 'deep_memory_list', {
      workingDirectory: '/tmp',
    });
    expect(listAfterDelete).toHaveLength(0);

    const calls = await tauriCalls(page);
    expect(calls.some((call) => call.cmd === 'deep_memory_create')).toBe(true);
    expect(calls.some((call) => call.cmd === 'deep_memory_update')).toBe(true);
    expect(calls.some((call) => call.cmd === 'deep_memory_delete')).toBe(true);
  });

  test('returns query evidence including conflict diagnostics', async ({ page }) => {
    const seed = createSeed({ sessionId: 'sess-memory-conflict' });
    await installDesktopMock(page, seed);
    await page.goto('/');

    await invokeMemoryCommand(page, 'deep_memory_create', {
      workingDirectory: '/tmp',
      input: {
        title: 'Indentation preference',
        content: 'Use tabs for indentation in scripts.',
        group: 'preferences',
        tags: ['indentation', 'tabs'],
        source: 'manual',
      },
    });
    await invokeMemoryCommand(page, 'deep_memory_create', {
      workingDirectory: '/tmp',
      input: {
        title: 'Formatting preference',
        content: 'Use spaces for indentation in project files.',
        group: 'preferences',
        tags: ['indentation', 'spaces'],
        source: 'manual',
      },
    });

    const result = await invokeMemoryCommand<{
      queryId: string;
      evidence: Array<{ atomId: string; score: number; reasons: string[] }>;
      atoms: Array<{ id: string }>;
    }>(page, 'deep_memory_query', {
      sessionId: seed.sessionId,
      query: 'indentation preference tabs spaces',
      options: { limit: 8 },
    });

    expect(result.queryId).toContain('query-');
    expect(result.atoms.length).toBeGreaterThanOrEqual(2);
    expect(result.evidence.some((item) => item.reasons.some((reason) => reason.toLowerCase().includes('conflict')))).toBe(true);
  });

  test('applies feedback and changes retrieval ranking on subsequent queries', async ({ page }) => {
    const seed = createSeed({ sessionId: 'sess-memory-feedback' });
    await installDesktopMock(page, seed);
    await page.goto('/');

    const first = await invokeMemoryCommand<MemoryCommandResult>(page, 'deep_memory_create', {
      workingDirectory: '/tmp',
      input: {
        title: 'Testing style',
        content: 'Default to unit tests for utility code.',
        group: 'learnings',
        tags: ['testing', 'unit'],
        source: 'manual',
      },
    });
    const second = await invokeMemoryCommand<MemoryCommandResult>(page, 'deep_memory_create', {
      workingDirectory: '/tmp',
      input: {
        title: 'Integration style',
        content: 'Prefer integration tests for user-facing flows.',
        group: 'learnings',
        tags: ['testing', 'integration'],
        source: 'manual',
      },
    });

    const before = await invokeMemoryCommand<{
      queryId: string;
      evidence: Array<{ atomId: string; score: number }>;
    }>(page, 'deep_memory_query', {
      sessionId: seed.sessionId,
      query: 'testing style',
      options: { limit: 8 },
    });
    expect(before.evidence.length).toBeGreaterThanOrEqual(2);

    await invokeMemoryCommand(page, 'deep_memory_feedback', {
      sessionId: seed.sessionId,
      queryId: before.queryId,
      atomId: second.id,
      feedback: 'positive',
      note: 'This matches current expectation',
    });
    await invokeMemoryCommand(page, 'deep_memory_feedback', {
      sessionId: seed.sessionId,
      queryId: before.queryId,
      atomId: first.id,
      feedback: 'report_conflict',
      note: 'Outdated preference',
    });

    const after = await invokeMemoryCommand<{
      evidence: Array<{ atomId: string; score: number }>;
    }>(page, 'deep_memory_query', {
      sessionId: seed.sessionId,
      query: 'testing style',
      options: { limit: 8 },
    });

    expect(after.evidence[0]?.atomId).toBe(second.id);
    expect(after.evidence.some((item) => item.atomId === first.id)).toBe(true);

    const calls = await tauriCalls(page);
    const feedbackCalls = calls.filter((call) => call.cmd === 'deep_memory_feedback');
    expect(feedbackCalls).toHaveLength(2);
  });
});
