// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteAccessService } from './service.js';
import type { RemoteAccessConfig } from './types.js';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tempDirs: string[] = [];

async function createTempAppDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cowork-remote-test-'));
  tempDirs.push(dir);
  return dir;
}

function configWithMode(mode: string): Partial<RemoteAccessConfig> {
  const now = Date.now();
  return {
    enabled: false,
    bindHost: '127.0.0.1',
    bindPort: 0,
    publicBaseUrl: 'https://example.test',
    tunnelMode: mode as RemoteAccessConfig['tunnelMode'],
    tunnelName: 'Cowork',
    tunnelDomain: 'cowork.example.test',
    tunnelVisibility: 'public',
    devices: [],
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('remote-access initialize', () => {
  it('does not block on tunnel health refresh scheduling', async () => {
    const service = new RemoteAccessService() as unknown as {
      initialize: (appDataDir: string) => Promise<void>;
      loadConfig: () => Promise<void>;
      tunnelHealthRefreshPromise: Promise<void> | null;
    };

    const deferred = createDeferred<void>();
    service.tunnelHealthRefreshPromise = deferred.promise;
    const loadConfigSpy = vi.spyOn(service, 'loadConfig').mockImplementation(async () => undefined);

    const initializePromise = service.initialize('/tmp/cowork-sidecar-test');
    const resolution = await Promise.race([
      initializePromise.then(() => 'initialized'),
      new Promise<'timed_out'>((resolve) => {
        setTimeout(() => resolve('timed_out'), 25);
      }),
    ]);

    expect(loadConfigSpy).toHaveBeenCalledTimes(1);
    expect(resolution).toBe('initialized');

    deferred.resolve();
    await initializePromise;
  });

  it('restores from backup when primary config has invalid tunnel mode', async () => {
    const appDir = await createTempAppDir();
    const remoteDir = join(appDir, 'remote-access');
    await mkdir(remoteDir, { recursive: true });

    await writeFile(join(remoteDir, 'config.json'), JSON.stringify(configWithMode('invalid-mode'), null, 2), 'utf8');
    await writeFile(join(remoteDir, 'config.json.bak'), JSON.stringify(configWithMode('cloudflare'), null, 2), 'utf8');

    const service = new RemoteAccessService();
    await service.initialize(appDir);

    const status = service.getStatus();
    expect(status.tunnelMode).toBe('cloudflare');
    expect(status.configHealth).toBe('repair_required');
    expect(status.configRepairReason).toContain('Recovered remote setup from backup');

    const persisted = JSON.parse(await readFile(join(remoteDir, 'config.json'), 'utf8')) as RemoteAccessConfig;
    expect(persisted.tunnelMode).toBe('cloudflare');
  });

  it('marks config as repair_required when tunnel mode is invalid and no backup exists', async () => {
    const appDir = await createTempAppDir();
    const remoteDir = join(appDir, 'remote-access');
    await mkdir(remoteDir, { recursive: true });

    await writeFile(join(remoteDir, 'config.json'), JSON.stringify(configWithMode('broken-mode'), null, 2), 'utf8');

    const service = new RemoteAccessService();
    await service.initialize(appDir);

    const status = service.getStatus();
    expect(status.tunnelMode).toBe('tailscale');
    expect(status.configHealth).toBe('repair_required');
    expect(status.configRepairReason).toContain('Remote setup config was reset');
  });

  it('records tunnel refresh failures in status diagnostics', async () => {
    const appDir = await createTempAppDir();
    const service = new RemoteAccessService() as unknown as {
      initialize: (appDataDir: string) => Promise<void>;
      refreshTunnelHealth: () => Promise<void>;
      getStatus: () => { tunnelLastError: string | null; diagnostics: Array<{ step: string; level: string }> };
    };

    vi.spyOn(service, 'refreshTunnelHealth').mockRejectedValueOnce(new Error('health-check failed'));

    await service.initialize(appDir);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const status = service.getStatus();
    expect(status.tunnelLastError).toContain('Tunnel check failed');
    expect(status.diagnostics.some((entry) => entry.step === 'refresh' && entry.level === 'error')).toBe(true);
  });
});

describe('remote-access stop and delete flows', () => {
  it('surfaces stopTunnel failures and appends diagnostics', async () => {
    const service = new RemoteAccessService() as unknown as {
      initialized: boolean;
      configPath: string | null;
      config: RemoteAccessConfig;
      tunnelBinaryPath: string | null;
      runCommand: (command: string, args: string[], timeoutMs: number) => Promise<unknown>;
      refreshTunnelHealthWithCooldown: (force: boolean) => Promise<void>;
      stopTunnel: () => Promise<unknown>;
      getStatus: () => { tunnelState: string; tunnelLastError: string | null; diagnostics: Array<{ step: string; level: string }> };
    };

    service.initialized = true;
    service.configPath = '/tmp/remote-config.json';
    service.config = {
      enabled: true,
      bindHost: '127.0.0.1',
      bindPort: 58995,
      publicBaseUrl: 'https://example.test',
      tunnelMode: 'tailscale',
      tunnelName: 'Cowork',
      tunnelDomain: null,
      tunnelVisibility: 'public',
      devices: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    service.tunnelBinaryPath = '/opt/homebrew/bin/tailscale';

    vi.spyOn(service, 'runCommand').mockRejectedValue(new Error('permission denied'));
    vi.spyOn(service, 'refreshTunnelHealthWithCooldown').mockResolvedValue(undefined);

    await expect(service.stopTunnel()).rejects.toThrow('Failed to stop tailscale tunnel cleanly');

    const status = service.getStatus();
    expect(status.tunnelState).toBe('error');
    expect(status.tunnelLastError).toContain('Failed to stop tailscale tunnel cleanly');
    expect(status.diagnostics.some((entry) => entry.step === 'stop' && entry.level === 'error')).toBe(true);
  });

  it('deleteAll clears config and paired devices', async () => {
    const appDir = await createTempAppDir();
    const remoteDir = join(appDir, 'remote-access');
    await mkdir(remoteDir, { recursive: true });
    await writeFile(join(remoteDir, 'config.json'), JSON.stringify(configWithMode('cloudflare'), null, 2), 'utf8');

    const service = new RemoteAccessService();
    await service.initialize(appDir);

    const internals = service as unknown as {
      config: RemoteAccessConfig;
      stopTunnel: () => Promise<unknown>;
      deleteAll: () => Promise<ReturnType<RemoteAccessService['getStatus']>>;
    };

    internals.config.devices.push({
      id: 'device_1',
      name: 'My iPhone',
      platform: 'ios',
      tokenHash: 'abc',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      expiresAt: Date.now() + 1000,
    });

    vi.spyOn(internals, 'stopTunnel').mockResolvedValue(service.getStatus());

    const status = await internals.deleteAll();

    expect(status.enabled).toBe(false);
    expect(status.deviceCount).toBe(0);
    expect(status.tunnelMode).toBe('tailscale');
    expect(status.configHealth).toBe('valid');
  });
});
