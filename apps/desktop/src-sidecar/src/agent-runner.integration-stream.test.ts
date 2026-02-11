import { describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner.js';

type StreamSession = {
  activeAssistantSegmentText: string;
  lastRawAssistantChunkText: string;
};

function applyChunk(
  runner: AgentRunner,
  session: StreamSession,
  rawChunk: string,
): string {
  const delta = (runner as unknown as {
    normalizeAssistantStreamChunk: (s: StreamSession, chunk: string) => string;
  }).normalizeAssistantStreamChunk(session, rawChunk);
  if (delta) {
    session.activeAssistantSegmentText += delta;
  }
  return delta;
}

describe('agent-runner stream normalization', () => {
  it('keeps delta chunks unchanged', () => {
    const runner = new AgentRunner();
    const session: StreamSession = {
      activeAssistantSegmentText: '',
      lastRawAssistantChunkText: '',
    };

    expect(applyChunk(runner, session, 'Hello')).toBe('Hello');
    expect(applyChunk(runner, session, ' world')).toBe(' world');
    expect(session.activeAssistantSegmentText).toBe('Hello world');
  });

  it('converts cumulative chunks into deltas', () => {
    const runner = new AgentRunner();
    const session: StreamSession = {
      activeAssistantSegmentText: '',
      lastRawAssistantChunkText: '',
    };

    expect(applyChunk(runner, session, 'Hello')).toBe('Hello');
    expect(applyChunk(runner, session, 'Hello world')).toBe(' world');
    expect(session.activeAssistantSegmentText).toBe('Hello world');
  });

  it('drops exact repeats and overlap-only chunks', () => {
    const runner = new AgentRunner();
    const session: StreamSession = {
      activeAssistantSegmentText: '',
      lastRawAssistantChunkText: '',
    };

    expect(applyChunk(runner, session, 'Hello world')).toBe('Hello world');
    expect(applyChunk(runner, session, 'Hello world')).toBe('');
    expect(applyChunk(runner, session, ' world')).toBe('');
    expect(applyChunk(runner, session, 'world!')).toBe('!');
    expect(session.activeAssistantSegmentText).toBe('Hello world!');
  });
});

describe('agent-runner integration capability refresh', () => {
  it('rebuilds tools only for non-streaming sessions', async () => {
    const runner = new AgentRunner() as unknown as {
      runtimeConfig: { activeProvider: string };
      sessions: Map<string, any>;
      buildToolHandlers: (session: any) => unknown[];
      createDeepAgent: (session: any, tools: unknown[]) => Promise<unknown>;
      refreshIntegrationCapabilities: (reason?: string) => Promise<void>;
    };

    runner.runtimeConfig.activeProvider = 'lmstudio';

    const rebuildableSession: Record<string, unknown> = {
      id: 'sess-rebuild',
      isStreaming: false,
      agent: { invoke: vi.fn() },
    };
    const streamingSession: Record<string, unknown> = {
      id: 'sess-streaming',
      isStreaming: true,
      agent: { invoke: vi.fn() },
    };
    const dormantSession: Record<string, unknown> = {
      id: 'sess-dormant',
      isStreaming: false,
      agent: {},
    };

    runner.sessions = new Map([
      ['sess-rebuild', rebuildableSession],
      ['sess-streaming', streamingSession],
      ['sess-dormant', dormantSession],
    ]);

    const buildToolHandlersSpy = vi
      .spyOn(runner, 'buildToolHandlers')
      .mockReturnValue([]);
    const createDeepAgentSpy = vi
      .spyOn(runner, 'createDeepAgent')
      .mockResolvedValue({ invoke: vi.fn() });

    await runner.refreshIntegrationCapabilities('test');

    expect(buildToolHandlersSpy).toHaveBeenCalledTimes(1);
    expect(buildToolHandlersSpy).toHaveBeenCalledWith(rebuildableSession);
    expect(createDeepAgentSpy).toHaveBeenCalledTimes(1);
    expect(createDeepAgentSpy).toHaveBeenCalledWith(rebuildableSession, []);
    expect(rebuildableSession.agent).toBeDefined();
    expect(streamingSession.agent).toBeDefined();
    expect(dormantSession.agent).toEqual({});
  });
});
