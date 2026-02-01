import { spawn, type SpawnOptions } from 'child_process';
import { platform } from 'os';
import type { ExecutionOptions, ExecutionResult, SandboxConfig } from './types.js';
import { DEFAULT_SANDBOX_CONFIG } from './types.js';
import { CommandValidator } from './validator.js';
import { PermissionError, ToolError } from '@gemini-cowork/shared';

// ============================================================================
// Command Executor
// ============================================================================

export class CommandExecutor {
  private config: SandboxConfig;
  private validator: CommandValidator;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
    this.validator = new CommandValidator(this.config);
  }

  /**
   * Execute a shell command.
   */
  async execute(command: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    const {
      cwd = process.cwd(),
      env = {},
      timeout = this.config.maxExecutionTime,
      mode = 'normal',
      shell = true,
      stdin,
    } = options;

    // Validate command
    const analysis = this.validator.analyze(command);

    if (analysis.risk === 'blocked') {
      throw PermissionError.shellExecute(command);
    }

    // In dry run mode, just return the analysis
    if (mode === 'dry_run') {
      return {
        exitCode: 0,
        stdout: `[DRY RUN] Would execute: ${command}\nRisk: ${analysis.risk}\nReasons: ${analysis.reasons.join(', ') || 'None'}`,
        stderr: '',
        duration: 0,
      };
    }

    // Build spawn options
    const spawnOptions: SpawnOptions = {
      cwd,
      env: { ...process.env, ...env },
      shell: shell === true ? this.getDefaultShell() : shell,
      timeout,
    };

    // Apply sandboxing on macOS if requested
    if (mode === 'sandboxed' && platform() === 'darwin') {
      return this.executeSandboxed(command, spawnOptions, stdin);
    }

    return this.executeNormal(command, spawnOptions, stdin, timeout);
  }

  /**
   * Execute command normally.
   */
  private async executeNormal(
    command: string,
    options: SpawnOptions,
    stdin?: string,
    timeout?: number
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
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
        stdout += data.toString();
        if (stdout.length > this.config.maxOutputSize) {
          stdout = stdout.slice(0, this.config.maxOutputSize) + '\n[Output truncated]';
        }
      });

      // Collect stderr
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > this.config.maxOutputSize) {
          stderr = stderr.slice(0, this.config.maxOutputSize) + '\n[Output truncated]';
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

        resolve({
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

        reject(
          ToolError.executionFailed(
            'shell',
            error.message
          )
        );
      });
    });
  }

  /**
   * Execute command with macOS sandbox-exec.
   */
  private async executeSandboxed(
    command: string,
    options: SpawnOptions,
    stdin?: string
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
    const allowedPaths = this.config.allowedPaths
      .map((p) => `(subpath "${p}")`)
      .join(' ');

    return `
(version 1)
(deny default)
(allow process-fork process-exec)
(allow file-read* ${allowedPaths})
(allow file-write* ${allowedPaths})
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
    this.config = { ...this.config, ...config };
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
  analyze(command: string) {
    return this.validator.analyze(command);
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
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const executor = new CommandExecutor();
  return executor.execute(command, options);
}
