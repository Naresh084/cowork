// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

export interface DaemonPaths {
  appDataDir: string;
  endpoint: string;
  tokenFile: string;
  lockFile: string;
}

function sanitizeSegment(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return normalized || 'user';
}

function deriveTcpPort(): number {
  try {
    const user = sanitizeSegment(userInfo().username || process.env.USER || process.env.USERNAME || 'user');
    let hash = 0;
    for (let i = 0; i < user.length; i += 1) {
      hash = ((hash << 5) - hash) + user.charCodeAt(i);
      hash |= 0;
    }
    const offset = Math.abs(hash) % 1000;
    return 39100 + offset;
  } catch {
    return 39100;
  }
}

export function resolveDefaultAppDataDir(): string {
  return join(homedir(), '.cowork');
}

export function resolveDaemonPaths(appDataDir = resolveDefaultAppDataDir()): DaemonPaths {
  const daemonDir = join(appDataDir, 'daemon');
  const endpoint = process.platform === 'win32'
    ? `tcp://127.0.0.1:${deriveTcpPort()}`
    : join(daemonDir, 'agentd.sock');

  return {
    appDataDir,
    endpoint,
    tokenFile: join(daemonDir, 'auth.token'),
    lockFile: join(daemonDir, 'agentd.lock'),
  };
}
