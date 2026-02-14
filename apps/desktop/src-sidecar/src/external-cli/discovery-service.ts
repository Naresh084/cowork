// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { basename, join, normalize } from 'path';
import type {
  ExternalCliAuthStatus,
  ExternalCliAvailabilityEntry,
  ExternalCliAvailabilitySnapshot,
  ExternalCliProvider,
} from './types.js';

interface CachedSnapshot {
  snapshot: ExternalCliAvailabilitySnapshot;
  createdAt: number;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface BinaryTrustDecision {
  trust: 'trusted' | 'untrusted';
  reason: string;
}

function trim(value: string): string {
  return value.trim();
}

function parseVersionLine(input: string): string | null {
  const line = input
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return line || null;
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}\n${String(error)}`,
      });
    });

    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function resolveBinary(binary: string): Promise<string | null> {
  const result = await runCommand('which', [binary]);
  if (result.code !== 0) {
    return null;
  }
  const line = trim(result.stdout);
  return line || null;
}

function normalizeFilePath(value: string): string {
  return normalize(value).replace(/\\/g, '/');
}

function trustedBinaryDirectories(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const base: string[] = process.platform === 'win32'
    ? [
        'C:/Program Files',
        'C:/Program Files (x86)',
        home ? join(home, 'AppData', 'Local', 'Programs') : '',
        home ? join(home, 'scoop', 'shims') : '',
      ]
    : [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        home ? join(home, '.local', 'bin') : '',
        home ? join(home, '.cargo', 'bin') : '',
        home ? join(home, 'bin') : '',
      ];
  return base
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(normalizeFilePath);
}

function parseDigestAllowlist(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[a-f0-9]{64}$/.test(entry));
  return new Set(entries);
}

function digestAllowlist(provider: ExternalCliProvider): Set<string> {
  return provider === 'codex'
    ? parseDigestAllowlist(process.env.COWORK_CODEX_SHA256_ALLOWLIST)
    : parseDigestAllowlist(process.env.COWORK_CLAUDE_SHA256_ALLOWLIST);
}

function isProviderBinaryNameAllowed(provider: ExternalCliProvider, binaryPath: string): boolean {
  const base = basename(binaryPath).toLowerCase();
  if (provider === 'codex') {
    return base === 'codex' || base === 'codex.exe';
  }
  return base === 'claude' || base === 'claude.exe';
}

function isPathAllowlisted(binaryPath: string): boolean {
  const normalizedBinaryPath = normalizeFilePath(binaryPath);
  return trustedBinaryDirectories().some((directory) => {
    if (normalizedBinaryPath === directory) {
      return true;
    }
    return normalizedBinaryPath.startsWith(`${directory}/`);
  });
}

function evaluateBinaryTrust(
  provider: ExternalCliProvider,
  binaryPath: string,
  binarySha256: string | null,
): BinaryTrustDecision {
  if (!isProviderBinaryNameAllowed(provider, binaryPath)) {
    return {
      trust: 'untrusted',
      reason: 'Binary basename does not match provider allowlist.',
    };
  }

  if (!isPathAllowlisted(binaryPath)) {
    return {
      trust: 'untrusted',
      reason: 'Binary path is outside trusted allowlist directories.',
    };
  }

  const allowlist = digestAllowlist(provider);
  if (allowlist.size > 0) {
    if (!binarySha256) {
      return {
        trust: 'untrusted',
        reason: 'Binary digest unavailable while digest allowlist is enforced.',
      };
    }
    if (!allowlist.has(binarySha256.toLowerCase())) {
      return {
        trust: 'untrusted',
        reason: 'Binary digest is not in configured provider digest allowlist.',
      };
    }
  }

  return {
    trust: 'trusted',
    reason: allowlist.size > 0
      ? 'Binary path and digest match allowlist policy.'
      : 'Binary path matches trusted allowlist directories.',
  };
}

async function computeBinarySha256(binaryPath: string): Promise<string | null> {
  try {
    const data = await readFile(binaryPath);
    return createHash('sha256').update(data).digest('hex');
  } catch {
    return null;
  }
}

function createEmptyAvailability(provider: ExternalCliProvider, checkedAt: number): ExternalCliAvailabilityEntry {
  return {
    provider,
    installed: false,
    binaryPath: null,
    binarySha256: null,
    binaryTrust: 'unknown',
    trustReason: null,
    version: null,
    authStatus: 'unknown',
    authMessage: null,
    checkedAt,
  };
}

export class ExternalCliDiscoveryService {
  private readonly ttlMs: number;
  private cache: CachedSnapshot | null = null;

  constructor(ttlMs = 30_000) {
    this.ttlMs = ttlMs;
  }

  invalidate(): void {
    this.cache = null;
  }

  getCachedAvailability(): ExternalCliAvailabilitySnapshot | null {
    return this.cache?.snapshot || null;
  }

  async getAvailability(forceRefresh = false): Promise<ExternalCliAvailabilitySnapshot> {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.cache.createdAt < this.ttlMs) {
      return this.cache.snapshot;
    }

    const codex = await this.checkCodex(now);
    const claude = await this.checkClaude(now);

    const snapshot: ExternalCliAvailabilitySnapshot = {
      codex,
      claude,
      checkedAt: now,
      ttlMs: this.ttlMs,
    };

    this.cache = {
      snapshot,
      createdAt: now,
    };

    return snapshot;
  }

  private async checkCodex(checkedAt: number): Promise<ExternalCliAvailabilityEntry> {
    const base = createEmptyAvailability('codex', checkedAt);
    const binaryPath = await resolveBinary('codex');
    if (!binaryPath) {
      return base;
    }

    const binarySha256 = await computeBinarySha256(binaryPath);
    const trust = evaluateBinaryTrust('codex', binaryPath, binarySha256);

    const versionResult = await runCommand('codex', ['--version']);
    const version = parseVersionLine(versionResult.stdout || versionResult.stderr);

    const loginStatus = await runCommand('codex', ['login', 'status']);
    const loginOutput = `${loginStatus.stdout}\n${loginStatus.stderr}`.toLowerCase();

    let authStatus: ExternalCliAuthStatus = 'unknown';
    let authMessage: string | null = null;

    if (loginStatus.code === 0 && /logged in/.test(loginOutput)) {
      authStatus = 'authenticated';
    } else if (/not logged in|unauthenticated|login/.test(loginOutput)) {
      authStatus = 'unauthenticated';
      authMessage = 'Codex is installed but not authenticated. Run `codex login`.';
    }

    return {
      provider: 'codex',
      installed: true,
      binaryPath,
      binarySha256,
      binaryTrust: trust.trust,
      trustReason: trust.reason,
      version,
      authStatus,
      authMessage,
      checkedAt,
    };
  }

  private async checkClaude(checkedAt: number): Promise<ExternalCliAvailabilityEntry> {
    const base = createEmptyAvailability('claude', checkedAt);
    const binaryPath = await resolveBinary('claude');
    if (!binaryPath) {
      return base;
    }

    const binarySha256 = await computeBinarySha256(binaryPath);
    const trust = evaluateBinaryTrust('claude', binaryPath, binarySha256);

    const versionResult = await runCommand('claude', ['--version']);
    const version = parseVersionLine(versionResult.stdout || versionResult.stderr);

    return {
      provider: 'claude',
      installed: true,
      binaryPath,
      binarySha256,
      binaryTrust: trust.trust,
      trustReason: trust.reason,
      version,
      authStatus: 'unknown',
      authMessage: null,
      checkedAt,
    };
  }
}
