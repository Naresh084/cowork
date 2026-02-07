import { spawn } from 'child_process';
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

function createEmptyAvailability(provider: ExternalCliProvider, checkedAt: number): ExternalCliAvailabilityEntry {
  return {
    provider,
    installed: false,
    binaryPath: null,
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

    const versionResult = await runCommand('claude', ['--version']);
    const version = parseVersionLine(versionResult.stdout || versionResult.stderr);

    return {
      provider: 'claude',
      installed: true,
      binaryPath,
      version,
      authStatus: 'unknown',
      authMessage: null,
      checkedAt,
    };
  }
}
