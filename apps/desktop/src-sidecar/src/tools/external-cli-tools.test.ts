import { describe, expect, it, vi } from 'vitest';
import { createExternalCliTools } from './external-cli-tools.js';
import type { ExternalCliRunManager } from '../external-cli/run-manager.js';

function createRunManagerMock(): ExternalCliRunManager {
  const now = Date.now();
  return {
    startRun: vi.fn(async (input: unknown) => ({
      runId: 'ext-run-test',
      sessionId: (input as { sessionId: string }).sessionId,
      provider: (input as { provider: 'codex' | 'claude' }).provider,
      status: 'running',
      startedAt: now,
      updatedAt: now,
      latestProgress: 'starting',
      progressCount: 1,
    })),
    getRun: vi.fn(() => null),
    getLatestRun: vi.fn(() => null),
    listRuns: vi.fn(() => []),
    respond: vi.fn(async () => ({
      runId: 'ext-run-test',
      sessionId: 'session-test',
      provider: 'codex',
      status: 'running',
      startedAt: now,
      updatedAt: now,
      latestProgress: 'ok',
      progressCount: 1,
    })),
    cancel: vi.fn(async () => ({
      runId: 'ext-run-test',
      sessionId: 'session-test',
      provider: 'codex',
      status: 'cancelled',
      startedAt: now,
      updatedAt: now,
      finishedAt: now,
      latestProgress: 'cancelled',
      progressCount: 1,
    })),
  } as unknown as ExternalCliRunManager;
}

describe('external-cli-tools', () => {
  it('requires explicit launch arguments and fails fast when bypass is missing', async () => {
    const runManager = createRunManagerMock();
    const tools = createExternalCliTools({
      runManager,
      getSessionOrigin: () => ({ source: 'desktop' }),
    });

    const tool = tools.find((item) => item.name === 'start_codex_cli_run');
    expect(tool).toBeDefined();

    const result = await tool!.execute(
      {
        prompt: 'Build site',
        working_directory: '/tmp/project',
        create_if_missing: true,
      },
      {
        sessionId: 'session-test',
        agentId: 'agent-test',
        workingDirectory: '/workspace/root',
      },
    );

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('bypassPermission is required');
    expect(runManager.startRun).not.toHaveBeenCalled();
  });

  it('normalizes legacy bypass alias and resolves relative working directory', async () => {
    const runManager = createRunManagerMock();
    const tools = createExternalCliTools({
      runManager,
      getSessionOrigin: () => ({ source: 'desktop' }),
    });

    const tool = tools.find((item) => item.name === 'start_claude_cli_run');
    expect(tool).toBeDefined();

    const result = await tool!.execute(
      {
        prompt: 'Build snack site',
        working_directory: 'projects/snack',
        create_if_missing: true,
        bypass_permission: true,
      },
      {
        sessionId: 'session-test',
        agentId: 'agent-test',
        workingDirectory: '/workspace/root',
      },
    );

    expect(result.success).toBe(true);
    expect(runManager.startRun).toHaveBeenCalledTimes(1);

    const startInput = vi.mocked(runManager.startRun).mock.calls[0]?.[0] as {
      workingDirectory: string;
      createIfMissing: boolean;
      requestedBypassPermission: boolean;
      bypassPermission: boolean;
    };
    expect(startInput.workingDirectory).toBe('/workspace/root/projects/snack');
    expect(startInput.createIfMissing).toBe(true);
    expect(startInput.requestedBypassPermission).toBe(true);
    expect(startInput.bypassPermission).toBe(true);
  });
});
