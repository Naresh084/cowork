// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

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

  it('returns adaptive monitoring guidance on start based on prompt complexity', async () => {
    const runManager = createRunManagerMock();
    const tools = createExternalCliTools({
      runManager,
      getSessionOrigin: () => ({ source: 'desktop' }),
    });

    const tool = tools.find((item) => item.name === 'start_codex_cli_run');
    expect(tool).toBeDefined();

    const quick = await tool!.execute(
      {
        prompt: 'Create a small hello-world html page',
        working_directory: '/tmp/project',
        create_if_missing: true,
        bypassPermission: false,
      },
      {
        sessionId: 'session-test',
        agentId: 'agent-test',
        workingDirectory: '/workspace/root',
      },
    );

    expect(quick.success).toBe(true);
    const quickMonitoring = (quick.data as { monitoring?: { nextPollSeconds?: number } }).monitoring;
    expect(quickMonitoring?.nextPollSeconds).toBe(5);

    const complex = await tool!.execute(
      {
        prompt:
          'Run a full-stack architecture refactor and migration plan with end-to-end test updates, deployment checks, and multi-step validation. Produce a detailed phased plan, execute migration steps, update integration tests, update e2e tests, verify deployment manifests, validate rollback strategy, and provide post-deploy verification checklists for frontend, backend, and database changes with explicit risk controls.',
        working_directory: '/tmp/project',
        create_if_missing: true,
        bypassPermission: false,
      },
      {
        sessionId: 'session-test',
        agentId: 'agent-test',
        workingDirectory: '/workspace/root',
      },
    );

    expect(complex.success).toBe(true);
    const complexMonitoring = (complex.data as { monitoring?: { nextPollSeconds?: number } }).monitoring;
    expect(complexMonitoring?.nextPollSeconds).toBe(60);
  });

  it('forces fast polling and response hint when progress is waiting_user', async () => {
    const runManager = createRunManagerMock();
    vi.mocked(runManager.getLatestRun).mockReturnValue({
      runId: 'ext-run-waiting',
      sessionId: 'session-test',
      provider: 'claude',
      prompt: 'Build a website with multiple integrations and refactor architecture',
      workingDirectory: '/workspace/root',
      bypassPermission: false,
      status: 'waiting_user',
      startedAt: Date.now() - 10_000,
      updatedAt: Date.now(),
      origin: { source: 'desktop' },
      progress: [
        { timestamp: Date.now() - 8_000, kind: 'status', message: 'Started run' },
        { timestamp: Date.now() - 1_000, kind: 'status', message: 'Need approval for file write' },
      ],
      pendingInteraction: {
        interactionId: 'ext-int-1',
        runId: 'ext-run-waiting',
        sessionId: 'session-test',
        provider: 'claude',
        type: 'permission',
        prompt: 'Approve file write?',
        requestedAt: Date.now() - 1_000,
        origin: { source: 'desktop' },
      },
    } as any);

    const tools = createExternalCliTools({
      runManager,
      getSessionOrigin: () => ({ source: 'desktop' }),
    });
    const progressTool = tools.find((item) => item.name === 'external_cli_get_progress');
    expect(progressTool).toBeDefined();

    const result = await progressTool!.execute(
      {},
      {
        sessionId: 'session-test',
        agentId: 'agent-test',
        workingDirectory: '/workspace/root',
      },
    );

    expect(result.success).toBe(true);
    const monitoring = (result.data as { monitoring?: { nextPollSeconds?: number; shouldRespond?: boolean } }).monitoring;
    expect(monitoring?.nextPollSeconds).toBe(5);
    expect(monitoring?.shouldRespond).toBe(true);
  });
});
