// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { spawn, spawnSync, type SpawnOptions } from 'child_process';
import { platform } from 'os';
import { resolve } from 'path';
import type {
  CommandPolicyEvaluation,
  ExecutionMode,
  ExecutionOptions,
  ExecutionResult,
  SandboxConfig,
} from './types.js';
import { DEFAULT_SANDBOX_CONFIG } from './types.js';
import { CommandValidator } from './validator.js';
import { PermissionError, ToolError } from '@cowork/shared';

let cachedSandboxExecAvailable: boolean | null = null;

function normalizeConfig(config: Partial<SandboxConfig> = {}): SandboxConfig {
  return {
    ...DEFAULT_SANDBOX_CONFIG,
    ...config,
    allowedPaths: Array.isArray(config.allowedPaths)
      ? config.allowedPaths
      : DEFAULT_SANDBOX_CONFIG.allowedPaths,
    deniedPaths: Array.isArray(config.deniedPaths)
      ? config.deniedPaths
      : DEFAULT_SANDBOX_CONFIG.deniedPaths,
    trustedCommands: Array.isArray(config.trustedCommands)
      ? config.trustedCommands
      : DEFAULT_SANDBOX_CONFIG.trustedCommands,
    maxExecutionTimeMs:
      typeof config.maxExecutionTimeMs === 'number'
        ? config.maxExecutionTimeMs
        : DEFAULT_SANDBOX_CONFIG.maxExecutionTimeMs,
    maxOutputBytes:
      typeof config.maxOutputBytes === 'number'
        ? config.maxOutputBytes
        : DEFAULT_SANDBOX_CONFIG.maxOutputBytes,
  };
}

export function isOsSandboxAvailable(): boolean {
  if (platform() !== 'darwin') {
    return false;
  }
  if (cachedSandboxExecAvailable !== null) {
    return cachedSandboxExecAvailable;
  }
  try {
    const result = spawnSync('sandbox-exec', ['-h'], {
      stdio: 'ignore',
    });
    cachedSandboxExecAvailable = result.status === 0 || result.status === 64;
    return cachedSandboxExecAvailable;
  } catch {
    cachedSandboxExecAvailable = false;
    return false;
  }
}

// ============================================================================
// Command Executor
// ============================================================================

export class CommandExecutor {
  private config: SandboxConfig;
  private validator: CommandValidator;
  private readonly idempotencyResults = new Map<string, ExecutionResult>();

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = normalizeConfig(config);
    this.validator = new CommandValidator(this.config);
  }

  /**
   * Execute a shell command.
   */
  async execute(command: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    const {
      cwd = process.cwd(),
      env = {},
      timeout = this.config.maxExecutionTimeMs,
      mode = 'normal',
      shell = true,
      stdin,
      idempotencyKey,
      idempotencyStrategy = 'return_cached',
    } = options;

    // Validate command using deterministic policy gate.
    const policy = this.validator.evaluatePolicy(command, { cwd });
    if (!policy.allowed) {
      throw PermissionError.shellExecute(`${command}\n${policy.violations.join(' ')}`);
    }

    const guardByIdempotency = this.requiresIdempotencyGuard(policy);
    const idempotencyMarker =
      idempotencyKey && guardByIdempotency
        ? this.buildIdempotencyMarker(command, cwd, idempotencyKey)
        : null;

    if (idempotencyMarker) {
      const existing = this.idempotencyResults.get(idempotencyMarker);
      if (existing) {
        if (idempotencyStrategy === 'reject') {
          throw PermissionError.shellExecute(
            `${command}\nRetry blocked by idempotency marker ${idempotencyKey}.`,
          );
        }
        return {
          ...existing,
          stderr: existing.stderr
            ? `${existing.stderr}\n[Idempotency replay: execution skipped]`
            : '[Idempotency replay: execution skipped]',
          idempotencyReused: true,
          idempotencyKey,
        };
      }
    }

    // In dry run mode, just return the analysis
    if (mode === 'dry_run') {
      return {
        exitCode: 0,
        stdout: `[DRY RUN] Would execute: ${command}\nAllowed: ${policy.allowed}\nViolations: ${policy.violations.join(', ') || 'None'}\nRisk: ${policy.analysis.risk}`,
        stderr: '',
        duration: 0,
        idempotencyKey,
      };
    }

    const executionMode = this.resolveExecutionMode(mode);

    // Build spawn options
    const spawnOptions: SpawnOptions = {
      cwd,
      env: { ...process.env, ...env },
      shell: shell === true ? this.getDefaultShell() : shell,
      timeout,
    };

    // Apply sandboxing on macOS if requested and available
    let result: ExecutionResult;
    if (executionMode === 'sandboxed' && isOsSandboxAvailable()) {
      result = await this.executeSandboxed(command, spawnOptions, stdin);
    } else {
      result = await this.executeNormal(command, spawnOptions, stdin, timeout);
    }
    const enrichedResult: ExecutionResult = {
      ...result,
      idempotencyKey,
    };

    if (idempotencyMarker) {
      this.cacheIdempotencyResult(idempotencyMarker, enrichedResult);
    }

    return enrichedResult;
  }

  /**
   * Resolve runtime execution mode.
   */
  private resolveExecutionMode(mode: ExecutionMode): ExecutionMode {
    if (mode === 'dry_run') return mode;
    if (mode === 'sandboxed') return mode;
    if (this.config.mode === 'danger-full-access') {
      return 'normal';
    }
    return isOsSandboxAvailable() ? 'sandboxed' : 'normal';
  }

  private requiresIdempotencyGuard(policy: CommandPolicyEvaluation): boolean {
    const primaryIntent = policy.analysis.intent.primary;
    if (primaryIntent === 'write' || primaryIntent === 'delete') return true;
    if (policy.analysis.modifiedPaths && policy.analysis.modifiedPaths.length > 0) return true;
    return policy.analysis.risk !== 'safe';
  }

  private buildIdempotencyMarker(command: string, cwd: string, key: string): string {
    const normalizedCommand = command.trim().replace(/\s+/g, ' ');
    return `${resolve(cwd)}::${normalizedCommand}::${key}`;
  }

  private cacheIdempotencyResult(marker: string, result: ExecutionResult): void {
    this.idempotencyResults.set(marker, result);
    if (this.idempotencyResults.size <= 200) return;
    const oldestKey = this.idempotencyResults.keys().next().value;
    if (typeof oldestKey === 'string') {
      this.idempotencyResults.delete(oldestKey);
    }
  }

  /**
   * Execute command normally.
   */
  private async executeNormal(
    command: string,
    options: SpawnOptions,
    stdin?: string,
    timeout?: number,
  ): Promise<ExecutionResult> {
    return new Promise((resolvePromise, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let killed = false;

      const child = spawn(command, [], {
        ...options,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up timeout
      const timeoutId = timeout
        ? setTimeout(() => {
            killed = true;
            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            }, 1000);
          }, timeout)
        : undefined;

      // Collect stdout
      child.stdout?.on('data', (data) => {
        if (stdoutTruncated) return;
        stdout += data.toString();
        if (stdout.length > this.config.maxOutputBytes) {
          stdout = stdout.slice(0, this.config.maxOutputBytes) + '\n[Output truncated]';
          stdoutTruncated = true;
        }
      });

      // Collect stderr
      child.stderr?.on('data', (data) => {
        if (stderrTruncated) return;
        stderr += data.toString();
        if (stderr.length > this.config.maxOutputBytes) {
          stderr = stderr.slice(0, this.config.maxOutputBytes) + '\n[Output truncated]';
          stderrTruncated = true;
        }
      });

      // Send stdin if provided
      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }

      // Handle completion
      child.on('close', (code, signal) => {
        if (timeoutId) clearTimeout(timeoutId);

        resolvePromise({
          exitCode: code ?? (killed ? 124 : 1),
          stdout,
          stderr,
          duration: Date.now() - startTime,
          killed,
          signal: signal || undefined,
        });
      });

      // Handle errors
      child.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);

        reject(ToolError.executionFailed('shell', error.message));
      });
    });
  }

  /**
   * Execute command with macOS sandbox-exec.
   */
  private async executeSandboxed(
    command: string,
    options: SpawnOptions,
    stdin?: string,
  ): Promise<ExecutionResult> {
    // Build a seatbelt profile for the sandbox
    const profile = this.buildSeatbeltProfile();

    // Wrap command with sandbox-exec
    const sandboxedCommand = `sandbox-exec -p '${profile}' /bin/sh -c '${command.replace(/'/g, "'\\''")}'`;

    return this.executeNormal(sandboxedCommand, options, stdin, options.timeout as number);
  }

  /**
   * Build a seatbelt profile for macOS sandbox.
   */
  private buildSeatbeltProfile(): string {
    const allowedPaths = this.config.allowedPaths.map((p) => `(subpath "${p}")`).join(' ');
    const allowWriteClause =
      this.config.mode === 'read-only' ? '' : `(allow file-write* ${allowedPaths})`;

    return `
(version 1)
(deny default)
(allow process-fork process-exec)
(allow file-read* ${allowedPaths})
${allowWriteClause}
(allow file-read-metadata)
(allow file-read-data (literal "/dev/null"))
(allow file-read-data (literal "/dev/urandom"))
(allow file-write-data (literal "/dev/null"))
(allow sysctl-read)
${this.config.allowNetwork ? '(allow network*)' : '(deny network*)'}
    `.trim();
  }

  /**
   * Get the default shell for the current platform.
   */
  private getDefaultShell(): string {
    if (platform() === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/sh';
  }

  /**
   * Update the sandbox configuration.
   */
  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = normalizeConfig({ ...this.config, ...config });
    this.validator = new CommandValidator(this.config);
  }

  /**
   * Get the current configuration.
   */
  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  /**
   * Analyze a command without executing it.
   */
  analyze(command: string, cwd?: string) {
    return this.validator.analyze(command, { cwd });
  }

  /**
   * Evaluate command against current sandbox policy.
   */
  evaluatePolicy(command: string, cwd?: string): CommandPolicyEvaluation {
    return this.validator.evaluatePolicy(command, { cwd });
  }
}

/**
 * Create a command executor with custom config.
 */
export function createExecutor(config?: Partial<SandboxConfig>): CommandExecutor {
  return new CommandExecutor(config);
}

/**
 * Execute a command with default settings.
 */
export async function executeCommand(
  command: string,
  options?: ExecutionOptions,
): Promise<ExecutionResult> {
  const executor = new CommandExecutor();
  return executor.execute(command, options);
}
