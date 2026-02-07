import { z } from 'zod';

// ============================================================================
// Execution Types
// ============================================================================

export const ExecutionModeSchema = z.enum(['normal', 'sandboxed', 'dry_run']);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export interface ExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  mode?: ExecutionMode;
  shell?: string | boolean;
  stdin?: string;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  killed?: boolean;
  signal?: string;
}

// ============================================================================
// Command Validation Types
// ============================================================================

export type CommandRisk = 'safe' | 'moderate' | 'dangerous' | 'blocked';

export interface CommandAnalysis {
  command: string;
  risk: CommandRisk;
  reasons: string[];
  modifiedPaths?: string[];
  accessedPaths?: string[];
  networkAccess?: boolean;
  processSpawn?: boolean;
}

// ============================================================================
// Sandbox Configuration
// ============================================================================

export const SandboxModeSchema = z.enum(['read-only', 'workspace-write', 'danger-full-access']);
export type SandboxMode = z.infer<typeof SandboxModeSchema>;

export interface CommandSandboxSettings {
  mode: SandboxMode;
  allowedPaths: string[];
  deniedPaths: string[];
  allowNetwork: boolean;
  allowProcessSpawn: boolean;
  trustedCommands: string[];
  maxExecutionTimeMs: number;
  maxOutputBytes: number;
}

export type SandboxConfig = CommandSandboxSettings;

export interface CommandPolicyEvaluation {
  allowed: boolean;
  violations: string[];
  analysis: CommandAnalysis;
  mode: SandboxMode;
  osEnforced: boolean;
  effectiveAllowedPaths: string[];
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  mode: 'workspace-write',
  allowedPaths: [
    process.cwd(),
    '/tmp',
    '/var/tmp',
  ],
  deniedPaths: [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/System',
    '/Library',
    '/Applications',
    '/private/etc',
    process.env.HOME ? `${process.env.HOME}/.ssh` : '~/.ssh',
    process.env.HOME ? `${process.env.HOME}/.gnupg` : '~/.gnupg',
    process.env.HOME ? `${process.env.HOME}/.aws` : '~/.aws',
    process.env.HOME ? `${process.env.HOME}/.config` : '~/.config',
  ],
  allowNetwork: false,
  allowProcessSpawn: true,
  trustedCommands: ['ls', 'pwd', 'git status', 'git diff'],
  maxExecutionTimeMs: 30000, // 30 seconds
  maxOutputBytes: 1024 * 1024, // 1MB
};

// ============================================================================
// Blocked Commands
// ============================================================================

export const BLOCKED_COMMANDS = [
  // System modification
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  ':(){ :|:& };:', // fork bomb

  // Security sensitive
  'chmod 777 /',
  'chown -R',
  'passwd',
  'sudo',
  'su',
  'doas',

  // Network attacks
  'nc -l',
  'netcat',
  'nmap',
  'masscan',

  // Data exfiltration
  'curl.*\\|.*sh',
  'wget.*\\|.*sh',
  'curl.*\\|.*bash',
  'wget.*\\|.*bash',

  // Crypto mining
  'xmrig',
  'minerd',
  'cpuminer',

  // Keychain/credential access
  'security dump-keychain',
  'security find-generic-password -w',
] as const;

// ============================================================================
// Dangerous Patterns
// ============================================================================

export const DANGEROUS_PATTERNS = [
  // File destruction
  /rm\s+(-[a-z]*r[a-z]*\s+)?(-[a-z]*f[a-z]*\s+)?[/~]/,
  /rm\s+(-[a-z]*f[a-z]*\s+)?(-[a-z]*r[a-z]*\s+)?[/~]/,

  // Permission escalation
  /chmod\s+[0-7]*7[0-7]*\s+\//,
  /chown\s+.*\s+\//,

  // Disk operations
  /dd\s+.*if=\/dev\/(zero|random|urandom)/,
  /mkfs/,

  // Background processes
  /&\s*$/,
  /nohup/,
  /disown/,

  // Network listeners
  /nc\s+.*-l/,
  /netcat\s+.*-l/,

  // Sensitive file access
  /cat\s+.*\/etc\/(passwd|shadow)/,
  /cat\s+.*\.ssh\/id_/,
  /cat\s+.*\.aws\/credentials/,
  /cat\s+.*\.env/,

  // Pipe to shell
  /\|\s*(ba)?sh/,
  /\|\s*zsh/,
  /\|\s*python/,
  /\|\s*ruby/,
  /\|\s*perl/,
] as const;
