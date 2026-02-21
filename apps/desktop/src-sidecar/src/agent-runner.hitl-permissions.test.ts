// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner.js';

type MutableRunner = AgentRunner & {
  sessions: Map<string, any>;
  convertDecisionToHitlResponse: (
    decision: 'allow' | 'allow_once' | 'allow_session' | 'deny',
    request: any,
    decisionCount?: number,
  ) => { decisions: Array<{ type: string; message?: string }> };
  processResumeStream: (session: any, stream: AsyncIterable<unknown>) => Promise<void>;
  persistRuntimeSnapshot: (session: any) => void;
  updatePermissionStatus: (session: any, permissionId: string, decision: string) => void;
  checkpointActiveRun: (...args: unknown[]) => void;
};

function createRunner(): MutableRunner {
  return new AgentRunner() as unknown as MutableRunner;
}

function createInterruptPermission(
  id: string,
  batchId: string | undefined,
  resource: string,
  hitlBatchSize = 3,
) {
  return {
    request: {
      type: 'file_write',
      resource,
      reason: 'test',
      toolName: 'write_file',
      toolCallId: id,
      id,
      riskLevel: 'medium',
      timestamp: Date.now(),
    },
    resolve: vi.fn(),
    interruptResumeRequired: true,
    hitlBatchId: batchId,
    hitlBatchSize,
  };
}

describe('agent-runner HITL permissions', () => {
  it('creates multiple HITL decisions when interrupt has multiple hanging tool calls', () => {
    const runner = createRunner();

    const response = runner.convertDecisionToHitlResponse(
      'allow_once',
      { toolName: 'write_file', resource: '/tmp/a.txt' },
      3,
    );

    expect(response.decisions).toHaveLength(3);
    expect(response.decisions.every((decision) => decision.type === 'approve')).toBe(true);
  });

  it('resolves an entire HITL batch from a single permission response', async () => {
    const runner = createRunner();
    const batchId = 'hitl-batch-1';

    const session = {
      id: 'session-1',
      threadId: 'thread-1',
      workingDirectory: '/Users/naresh/Work/Personal/geminicowork',
      chatItems: [],
      currentTurnId: 'turn-1',
      permissionCache: new Map(),
      permissionScopes: new Map(),
      transientPermissionGrants: new Map(),
      toolStartTimes: new Map(),
      activeTools: new Map(),
      pendingPermissions: new Map([
        ['perm-1', createInterruptPermission('perm-1', batchId, '/tmp/a.txt')],
        ['perm-2', createInterruptPermission('perm-2', batchId, '/tmp/b.txt')],
        ['perm-3', createInterruptPermission('perm-3', batchId, '/tmp/c.txt')],
      ]),
      pendingQuestions: new Map(),
      inFlightPermissions: new Map(),
      tasks: [],
      nextTaskId: 1,
      artifacts: [],
      activeAssistantSegmentText: '',
      lastRawAssistantChunkText: '',
      assistantSegmentIndex: 0,
      hasAssistantTextThisTurn: false,
      lastCompletedAssistantSegmentText: '',
      nextSequence: 0,
      isStreaming: false,
      isThinking: false,
      updatedAt: Date.now(),
      agent: {
        streamEvents: vi.fn().mockReturnValue((async function* () {})()),
      },
    };

    runner.sessions = new Map([[session.id, session]]);

    const convertSpy = vi.spyOn(runner, 'convertDecisionToHitlResponse');
    const processResumeSpy = vi.spyOn(runner, 'processResumeStream').mockResolvedValue(undefined);
    const persistSpy = vi.spyOn(runner, 'persistRuntimeSnapshot').mockImplementation(() => {});
    const updatePermissionStatusSpy = vi.spyOn(runner, 'updatePermissionStatus').mockImplementation(() => {});
    vi.spyOn(runner, 'checkpointActiveRun').mockImplementation(() => {});

    await runner.respondToPermission(session.id, 'perm-1', 'allow_once');

    expect(session.pendingPermissions.size).toBe(0);
    expect(convertSpy).toHaveBeenCalledWith(
      'allow_once',
      expect.objectContaining({ toolName: 'write_file' }),
      3,
    );
    expect(processResumeSpy).toHaveBeenCalledTimes(1);
    expect(updatePermissionStatusSpy).toHaveBeenCalledTimes(3);
    expect(persistSpy).toHaveBeenCalled();
  });

  it('uses live HITL hanging tool count when batch metadata is missing or stale', async () => {
    const runner = createRunner();

    const session = {
      id: 'session-1',
      threadId: 'thread-1',
      workingDirectory: '/Users/naresh/Work/Personal/geminicowork',
      chatItems: [],
      currentTurnId: 'turn-1',
      permissionCache: new Map(),
      permissionScopes: new Map(),
      transientPermissionGrants: new Map(),
      toolStartTimes: new Map(),
      activeTools: new Map(),
      pendingPermissions: new Map([
        ['perm-1', createInterruptPermission('perm-1', undefined, '/tmp/a.txt', 1)],
        ['perm-2', createInterruptPermission('perm-2', undefined, '/tmp/b.txt', 1)],
      ]),
      pendingQuestions: new Map(),
      inFlightPermissions: new Map(),
      tasks: [],
      nextTaskId: 1,
      artifacts: [],
      activeAssistantSegmentText: '',
      lastRawAssistantChunkText: '',
      assistantSegmentIndex: 0,
      hasAssistantTextThisTurn: false,
      lastCompletedAssistantSegmentText: '',
      nextSequence: 0,
      isStreaming: false,
      isThinking: false,
      updatedAt: Date.now(),
      agent: {
        getState: vi.fn().mockResolvedValue({
          tasks: [
            {
              interrupts: [
                {
                  value: {
                    actionRequests: [{ name: 'write_file' }, { name: 'write_file' }],
                  },
                },
              ],
            },
          ],
        }),
        streamEvents: vi.fn().mockReturnValue((async function* () {})()),
      },
    };

    runner.sessions = new Map([[session.id, session]]);

    const convertSpy = vi.spyOn(runner, 'convertDecisionToHitlResponse');
    const processResumeSpy = vi.spyOn(runner, 'processResumeStream').mockResolvedValue(undefined);
    const updatePermissionStatusSpy = vi.spyOn(runner, 'updatePermissionStatus').mockImplementation(() => {});
    vi.spyOn(runner, 'persistRuntimeSnapshot').mockImplementation(() => {});
    vi.spyOn(runner, 'checkpointActiveRun').mockImplementation(() => {});

    await runner.respondToPermission(session.id, 'perm-1', 'allow_once');

    expect(convertSpy).toHaveBeenCalledWith(
      'allow_once',
      expect.objectContaining({ toolName: 'write_file' }),
      2,
    );
    expect(processResumeSpy).toHaveBeenCalledTimes(1);
    expect(updatePermissionStatusSpy).toHaveBeenCalledTimes(2);
    expect(session.pendingPermissions.size).toBe(0);
  });
});
