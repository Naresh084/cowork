import { describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner.js';

type MutableRunner = AgentRunner & {
  sessions: Map<string, any>;
  runs: Map<string, any>;
  activeRunBySession: Map<string, string>;
  writeRunCheckpoint: (...args: unknown[]) => void;
  appendRunTimelineEvent: (...args: unknown[]) => void;
  getSessionRunState: (session: any) => string;
};

function createRunner(): MutableRunner {
  return new AgentRunner() as unknown as MutableRunner;
}

function createSession(id = 'session-1', overrides: Record<string, unknown> = {}) {
  return {
    id,
    stopRequested: false,
    pendingPermissions: new Map(),
    pendingQuestions: new Map(),
    isRetrying: false,
    activeTools: new Map(),
    abortController: undefined,
    isStreaming: false,
    isThinking: false,
    messageQueue: [],
    lastError: null,
    inFlightPermissions: new Map(),
    pendingPlanProposal: undefined,
    agent: {
      abort: vi.fn(),
    },
    ...overrides,
  };
}

describe('agent-runner run state machine', () => {
  it('surfaces paused when stop is requested for an active run', () => {
    const runner = createRunner();
    const session = createSession();
    runner.sessions = new Map([[session.id, session]]);
    runner.runs = new Map([
      [
        'run-1',
        {
          id: 'run-1',
          sessionId: session.id,
          status: 'running',
          updatedAt: Date.now(),
        },
      ],
    ]);
    runner.activeRunBySession = new Map([[session.id, 'run-1']]);
    session.stopRequested = true;

    const state = runner.getSessionRunState(session);
    expect(state).toBe('paused');
  });

  it('surfaces retrying when transient retry mode is active', () => {
    const runner = createRunner();
    const session = createSession('session-2', {
      isRetrying: true,
    });
    runner.sessions = new Map([[session.id, session]]);
    runner.runs = new Map();
    runner.activeRunBySession = new Map();

    const state = runner.getSessionRunState(session);
    expect(state).toBe('retrying');
  });

  it('surfaces latest terminal run state when session is idle', () => {
    const runner = createRunner();
    const session = createSession('session-3');
    runner.sessions = new Map([[session.id, session]]);

    runner.runs = new Map([
      [
        'run-old',
        {
          id: 'run-old',
          sessionId: session.id,
          status: 'failed',
          updatedAt: 100,
        },
      ],
      [
        'run-new',
        {
          id: 'run-new',
          sessionId: session.id,
          status: 'completed',
          updatedAt: 200,
        },
      ],
    ]);
    runner.activeRunBySession = new Map();

    expect(runner.getSessionRunState(session)).toBe('completed');

    (runner.runs.get('run-new') as { status: string }).status = 'cancelled';
    expect(runner.getSessionRunState(session)).toBe('cancelled');
  });

  it('prioritizes waiting states over terminal run snapshots', () => {
    const runner = createRunner();
    const session = createSession('session-4');
    session.pendingPermissions.set('perm-1', { request: { id: 'perm-1' }, resolve: vi.fn() });
    runner.sessions = new Map([[session.id, session]]);
    runner.runs = new Map([
      [
        'run-terminal',
        {
          id: 'run-terminal',
          sessionId: session.id,
          status: 'completed',
          updatedAt: Date.now(),
        },
      ],
    ]);
    runner.activeRunBySession = new Map();

    expect(runner.getSessionRunState(session)).toBe('waiting_permission');
  });

  it('marks active run cancelled when stopGeneration is requested', () => {
    const runner = createRunner();
    const session = createSession('session-5');
    runner.sessions = new Map([[session.id, session]]);
    runner.runs = new Map([
      [
        'run-active',
        {
          id: 'run-active',
          sessionId: session.id,
          status: 'running',
          branchId: undefined,
          updatedAt: Date.now(),
          timeline: [],
        },
      ],
    ]);
    runner.activeRunBySession = new Map([[session.id, 'run-active']]);
    runner.writeRunCheckpoint = vi.fn();
    runner.appendRunTimelineEvent = vi.fn();

    runner.stopGeneration(session.id);

    const run = runner.runs.get('run-active') as { status: string };
    expect(run.status).toBe('cancelled');
    expect(runner.activeRunBySession.has(session.id)).toBe(false);
    expect(runner.writeRunCheckpoint).toHaveBeenCalled();
    expect(runner.appendRunTimelineEvent).toHaveBeenCalled();
  });
});
