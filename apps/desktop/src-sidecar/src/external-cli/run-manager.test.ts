// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { mkdtemp, rm, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it, vi } from 'vitest';
import { ExternalCliRunManager } from './run-manager.js';
import type { ExternalCliDiscoveryService } from './discovery-service.js';
import type { ExternalCliAvailabilitySnapshot, ExternalCliRuntimeConfig } from './types.js';

vi.mock('./providers/codex-app-server-adapter.js', () => {
  class MockCodexAppServerAdapter {
    async start(): Promise<void> {}
    async respond(): Promise<void> {}
    async cancel(): Promise<void> {}
    async dispose(): Promise<void> {}
  }

  return { CodexAppServerAdapter: MockCodexAppServerAdapter };
});

vi.mock('./providers/claude-stream-adapter.js', () => {
  class MockClaudeStreamAdapter {
    constructor(_: unknown) {}
    async start(): Promise<void> {}
    async respond(): Promise<void> {}
    async cancel(): Promise<void> {}
    async dispose(): Promise<void> {}
  }

  return { ClaudeStreamAdapter: MockClaudeStreamAdapter };
});

function createAvailability(): ExternalCliAvailabilitySnapshot {
  const checkedAt = Date.now();
  return {
    codex: {
      provider: 'codex',
      installed: true,
      binaryPath: '/usr/local/bin/codex',
      binarySha256: '0'.repeat(64),
      binaryTrust: 'trusted',
      trustReason: 'trusted path',
      version: 'codex-cli test',
      authStatus: 'authenticated',
      authMessage: null,
      checkedAt,
    },
    claude: {
      provider: 'claude',
      installed: true,
      binaryPath: '/usr/local/bin/claude',
      binarySha256: '1'.repeat(64),
      binaryTrust: 'trusted',
      trustReason: 'trusted path',
      version: 'claude-cli test',
      authStatus: 'authenticated',
      authMessage: null,
      checkedAt,
    },
    checkedAt,
    ttlMs: 30_000,
  };
}

function createManager(
  appDataDir: string,
  runtimeConfig: ExternalCliRuntimeConfig,
): ExternalCliRunManager {
  const discovery = {
    getAvailability: vi.fn(async () => createAvailability()),
  } as unknown as ExternalCliDiscoveryService;

  return new ExternalCliRunManager({
    appDataDir,
    discoveryService: discovery,
    getRuntimeConfig: () => runtimeConfig,
  });
}

describe('external-cli run-manager working directory handling', () => {
  it('starts successfully for existing directory', async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), 'ext-cli-run-manager-existing-'));
    const workingDirectory = await mkdtemp(join(tmpdir(), 'ext-cli-existing-dir-'));
    const manager = createManager(appDataDir, {
      codex: { enabled: true, allowBypassPermissions: true },
      claude: { enabled: true, allowBypassPermissions: true },
    });

    await manager.initialize();

    const summary = await manager.startRun({
      sessionId: 'session-existing',
      provider: 'codex',
      prompt: 'test',
      workingDirectory,
      createIfMissing: false,
      requestedBypassPermission: false,
      bypassPermission: false,
      origin: { source: 'desktop' },
    });

    expect(summary.status).toBe('running');
    const run = manager.getRun(summary.runId);
    expect(run?.workingDirectory).toBe(resolve(workingDirectory));
    expect(run?.resolvedWorkingDirectory).toBe(resolve(workingDirectory));

    await manager.shutdown();
    await rm(appDataDir, { recursive: true, force: true });
    await rm(workingDirectory, { recursive: true, force: true });
  });

  it('fails with actionable error when directory is missing and create_if_missing is false', async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), 'ext-cli-run-manager-missing-'));
    const manager = createManager(appDataDir, {
      codex: { enabled: true, allowBypassPermissions: true },
      claude: { enabled: true, allowBypassPermissions: true },
    });

    await manager.initialize();

    const missingDirectory = join(tmpdir(), `ext-cli-missing-${Date.now()}-no-create`);
    await expect(
      manager.startRun({
        sessionId: 'session-missing',
        provider: 'claude',
        prompt: 'test',
        workingDirectory: missingDirectory,
        createIfMissing: false,
        requestedBypassPermission: false,
        bypassPermission: false,
        origin: { source: 'desktop' },
      }),
    ).rejects.toMatchObject({
      code: 'CLI_PROTOCOL_ERROR',
    });

    await expect(stat(missingDirectory)).rejects.toBeTruthy();
    await manager.shutdown();
    await rm(appDataDir, { recursive: true, force: true });
  });

  it('creates missing directory when create_if_missing is true', async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), 'ext-cli-run-manager-create-'));
    const manager = createManager(appDataDir, {
      codex: { enabled: true, allowBypassPermissions: true },
      claude: { enabled: true, allowBypassPermissions: true },
    });

    await manager.initialize();

    const missingDirectory = join(tmpdir(), `ext-cli-missing-${Date.now()}-create`);
    const summary = await manager.startRun({
      sessionId: 'session-create',
      provider: 'claude',
      prompt: 'test',
      workingDirectory: missingDirectory,
      createIfMissing: true,
      requestedBypassPermission: false,
      bypassPermission: false,
      origin: { source: 'desktop' },
    });

    expect(summary.status).toBe('running');
    const dirStats = await stat(missingDirectory);
    expect(dirStats.isDirectory()).toBe(true);

    await manager.shutdown();
    await rm(appDataDir, { recursive: true, force: true });
    await rm(missingDirectory, { recursive: true, force: true });
  });

  it('downgrades bypass when provider bypass setting is disabled', async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), 'ext-cli-run-manager-bypass-'));
    const manager = createManager(appDataDir, {
      codex: { enabled: true, allowBypassPermissions: false },
      claude: { enabled: true, allowBypassPermissions: true },
    });

    await manager.initialize();

    const summary = await manager.startRun({
      sessionId: 'session-bypass',
      provider: 'codex',
      prompt: 'test',
      workingDirectory: resolve(tmpdir()),
      createIfMissing: false,
      requestedBypassPermission: true,
      bypassPermission: true,
      origin: { source: 'desktop' },
    });

    expect(summary.status).toBe('running');
    const run = manager.getRun(summary.runId);
    expect(run?.requestedBypassPermission).toBe(true);
    expect(run?.effectiveBypassPermission).toBe(false);
    expect(run?.bypassPermission).toBe(false);
    expect(
      run?.progress.some((entry) =>
        entry.message.includes('Bypass was requested but is disabled in settings'),
      ),
    ).toBe(true);

    await manager.shutdown();
    await rm(appDataDir, { recursive: true, force: true });
  });

  it('blocks runs when provider binary trust checks fail', async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), 'ext-cli-run-manager-untrusted-'));
    const discovery = {
      getAvailability: vi.fn(async () => {
        const snapshot = createAvailability();
        snapshot.codex.binaryTrust = 'untrusted';
        snapshot.codex.trustReason = 'Binary path is outside trusted allowlist directories.';
        return snapshot;
      }),
    } as unknown as ExternalCliDiscoveryService;

    const manager = new ExternalCliRunManager({
      appDataDir,
      discoveryService: discovery,
      getRuntimeConfig: () => ({
        codex: { enabled: true, allowBypassPermissions: true },
        claude: { enabled: true, allowBypassPermissions: true },
      }),
    });

    await manager.initialize();

    await expect(
      manager.startRun({
        sessionId: 'session-untrusted',
        provider: 'codex',
        prompt: 'test',
        workingDirectory: resolve(tmpdir()),
        createIfMissing: false,
        requestedBypassPermission: false,
        bypassPermission: false,
        origin: { source: 'desktop' },
      }),
    ).rejects.toMatchObject({
      code: 'CLI_PROVIDER_BLOCKED',
    });

    await manager.shutdown();
    await rm(appDataDir, { recursive: true, force: true });
  });
});
