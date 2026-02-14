// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner.js';

type MutableRunner = AgentRunner & {
  sessions: Map<string, any>;
  runs: Map<string, any>;
  runCheckpointRepository: any;
  sessionBranchRepository: any;
  activeRunBySession: Map<string, string>;
  executeMessage: (
    sessionId: string,
    content: string,
    attachments?: Array<Record<string, unknown>>,
    maxTurns?: number,
  ) => Promise<void>;
  processMessageQueue: (sessionId: string) => Promise<void>;
};

const BASE_RUN = {
  id: 'run-1',
  sessionId: 'session-1',
  status: 'failed',
  runOptions: { maxTurns: 9 },
  createdAt: 1,
  updatedAt: 1,
  checkpointCount: 0,
  timeline: [],
};

function createRunner(): MutableRunner {
  return new AgentRunner() as unknown as MutableRunner;
}

describe('agent-runner checkpoint resume', () => {
  it('replays dispatch payload from checkpoint state', async () => {
    const runner = createRunner();
    runner.sessions = new Map([
      [
        'session-1',
        {
          id: 'session-1',
          chatItems: [],
          lastError: null,
        },
      ],
    ]);
    runner.runs = new Map([['run-1', { ...BASE_RUN }]]);
    runner.activeRunBySession = new Map();
    const upsert = vi.fn();
    runner.runCheckpointRepository = {
      getLatestForRun: vi.fn().mockReturnValue({
        id: 'chk-2',
        runId: 'run-1',
        sessionId: 'session-1',
        checkpointIndex: 2,
        stage: 'tool_start',
        state: {
          runStatus: 'running',
          dispatch: {
            message: 'resume from checkpoint payload',
            attachments: [
              {
                type: 'text',
                mimeType: 'text/plain',
                data: 'note body',
                name: 'notes.txt',
              },
            ],
          },
        },
        createdAt: 2,
      }),
      upsert,
    };

    const executeSpy = vi.spyOn(runner, 'executeMessage').mockResolvedValue(undefined);
    const processQueueSpy = vi.spyOn(runner, 'processMessageQueue').mockResolvedValue(undefined);

    const result = await runner.resumeRunFromCheckpoint('session-1', 'run-1');

    expect(executeSpy).toHaveBeenCalledWith(
      'session-1',
      'resume from checkpoint payload',
      [
        {
          type: 'text',
          mimeType: 'text/plain',
          data: 'note body',
          name: 'notes.txt',
        },
      ],
      9,
    );
    expect(processQueueSpy).toHaveBeenCalledWith('session-1');
    expect(result).toEqual({
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'completed',
    });
    expect(
      upsert.mock.calls.map((call: unknown[]) => (call[0] as { stage: string }).stage),
    ).toEqual(['resume', 'after_send']);
  });

  it('treats terminal checkpoints as no-op resumes', async () => {
    const runner = createRunner();
    runner.sessions = new Map([
      [
        'session-1',
        {
          id: 'session-1',
          chatItems: [],
          lastError: null,
        },
      ],
    ]);
    runner.runs = new Map([['run-1', { ...BASE_RUN, status: 'completed' }]]);
    runner.activeRunBySession = new Map();
    const upsert = vi.fn();
    runner.runCheckpointRepository = {
      getLatestForRun: vi.fn().mockReturnValue({
        id: 'chk-10',
        runId: 'run-1',
        sessionId: 'session-1',
        checkpointIndex: 10,
        stage: 'after_send',
        state: { runStatus: 'completed' },
        createdAt: 10,
      }),
      upsert,
    };

    const executeSpy = vi.spyOn(runner, 'executeMessage').mockResolvedValue(undefined);

    const result = await runner.resumeRunFromCheckpoint('session-1', 'run-1');

    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect((upsert.mock.calls[0]?.[0] as { stage: string }).stage).toBe('resume_noop');
  });

  it('falls back to the latest user message when checkpoint payload is missing', async () => {
    const runner = createRunner();
    runner.sessions = new Map([
      [
        'session-1',
        {
          id: 'session-1',
          chatItems: [
            {
              id: 'u-1',
              kind: 'user_message',
              content: [{ type: 'text', text: 'recover from latest user message' }],
            },
          ],
          lastError: null,
        },
      ],
    ]);
    runner.runs = new Map([['run-1', { ...BASE_RUN }]]);
    runner.activeRunBySession = new Map();
    const upsert = vi.fn();
    runner.runCheckpointRepository = {
      getLatestForRun: vi.fn().mockReturnValue({
        id: 'chk-3',
        runId: 'run-1',
        sessionId: 'session-1',
        checkpointIndex: 3,
        stage: 'permission_request',
        state: { runStatus: 'running' },
        createdAt: 3,
      }),
      upsert,
    };

    const executeSpy = vi.spyOn(runner, 'executeMessage').mockResolvedValue(undefined);
    vi.spyOn(runner, 'processMessageQueue').mockResolvedValue(undefined);

    await runner.resumeRunFromCheckpoint('session-1', 'run-1');

    expect(executeSpy).toHaveBeenCalledWith(
      'session-1',
      'recover from latest user message',
      undefined,
      9,
    );
    const resumeCheckpoint = upsert.mock.calls[0]?.[0] as { state?: Record<string, unknown> };
    expect(resumeCheckpoint.state?.resumeSource).toBe('latest_user_message');
  });

  it('scopes run checkpoints to active branch context', async () => {
    const runner = createRunner();
    runner.sessions = new Map([
      [
        'session-1',
        {
          id: 'session-1',
          chatItems: [],
          lastError: null,
        },
      ],
    ]);
    const upsert = vi.fn();
    const createBranch = vi.fn();
    runner.runCheckpointRepository = {
      upsert,
      getLatestForRun: vi.fn(),
      listForRun: vi.fn().mockReturnValue([]),
    };
    runner.sessionBranchRepository = {
      listBranchesForSession: vi.fn().mockReturnValue([]),
      createBranch,
      updateBranchStatus: vi.fn(),
      recordMerge: vi.fn(),
    };

    const createdBranch = runner.createSessionBranch('session-1', 'feature-branch');
    vi.spyOn(runner, 'sendMessage').mockResolvedValue(undefined);

    await runner.runStartV2('session-1', 'hello from branch');

    expect(createBranch).toHaveBeenCalled();
    const branchIds = upsert.mock.calls.map(
      (call: unknown[]) => (call[0] as { branchId?: string }).branchId,
    );
    expect(branchIds.length).toBeGreaterThanOrEqual(2);
    for (const branchId of branchIds) {
      expect(branchId).toBe(createdBranch.id);
    }
  });

  it('allows switching to active branches and blocks merged branches', () => {
    const runner = createRunner();
    runner.sessions = new Map([
      [
        'session-1',
        {
          id: 'session-1',
          chatItems: [],
        },
      ],
    ]);
    runner.sessionBranchRepository = {
      listBranchesForSession: vi.fn().mockReturnValue([
        {
          id: 'branch-active',
          sessionId: 'session-1',
          name: 'active',
          status: 'active',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'branch-merged',
          sessionId: 'session-1',
          name: 'merged',
          status: 'merged',
          createdAt: 2,
          updatedAt: 2,
        },
      ]),
    };

    const result = runner.setActiveSessionBranch('session-1', 'branch-active');
    expect(result).toEqual({
      sessionId: 'session-1',
      activeBranchId: 'branch-active',
    });
    expect(() =>
      runner.setActiveSessionBranch('session-1', 'branch-merged'),
    ).toThrow('Branch is not active');
  });

  it('returns conflict for diverged branch parent under auto strategy', () => {
    const runner = createRunner();
    const updateBranchStatus = vi.fn();
    const recordMerge = vi.fn();
    runner.sessions = new Map([
      [
        'session-1',
        {
          id: 'session-1',
          chatItems: [],
        },
      ],
    ]);
    runner.sessionBranchRepository = {
      listBranchesForSession: vi.fn().mockReturnValue([
        {
          id: 'branch-main',
          sessionId: 'session-1',
          name: 'main',
          status: 'active',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'branch-feature',
          sessionId: 'session-1',
          parentBranchId: 'branch-base',
          name: 'feature',
          status: 'active',
          createdAt: 2,
          updatedAt: 2,
        },
      ]),
      updateBranchStatus,
      recordMerge,
    };

    const result = runner.mergeSessionBranch('session-1', 'branch-feature', 'branch-main', 'auto');

    expect(result.status).toBe('conflict');
    expect(result.conflictCount).toBe(1);
    expect(result.conflicts[0]?.path).toBe('branch_context');
    expect(updateBranchStatus).not.toHaveBeenCalled();
    expect(recordMerge).toHaveBeenCalledTimes(1);
  });

  it('resolves diverged branch parent with explicit strategy and switches active branch', () => {
    const runner = createRunner();
    const updateBranchStatus = vi.fn();
    const recordMerge = vi.fn();
    runner.sessions = new Map([
      [
        'session-1',
        {
          id: 'session-1',
          chatItems: [],
        },
      ],
    ]);
    runner.sessionBranchRepository = {
      listBranchesForSession: vi.fn().mockReturnValue([
        {
          id: 'branch-main',
          sessionId: 'session-1',
          name: 'main',
          status: 'active',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'branch-feature',
          sessionId: 'session-1',
          parentBranchId: 'branch-base',
          name: 'feature',
          status: 'active',
          createdAt: 2,
          updatedAt: 2,
        },
      ]),
      updateBranchStatus,
      recordMerge,
    };

    runner.setActiveSessionBranch('session-1', 'branch-feature');
    const result = runner.mergeSessionBranch('session-1', 'branch-feature', 'branch-main', 'ours');

    expect(result.status).toBe('merged');
    expect(result.conflictCount).toBe(1);
    expect(result.conflicts[0]?.resolution).toBe('ours');
    expect(updateBranchStatus).toHaveBeenCalledWith('branch-feature', 'merged');
    expect(runner.getActiveBranchIdForSession('session-1')).toBe('branch-main');
  });
});
