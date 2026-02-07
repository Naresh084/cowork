import { resolve, isAbsolute, normalize, sep } from 'path';
import { realpathSync, lstatSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import type { CommandAnalysis, CommandPolicyEvaluation, CommandRisk, SandboxConfig } from './types.js';
import { DEFAULT_SANDBOX_CONFIG, BLOCKED_COMMANDS, DANGEROUS_PATTERNS } from './types.js';

// ============================================================================
// Read-Only Safe Commands
// ============================================================================

const READ_ONLY_SAFE_COMMAND_PREFIXES = [
  'ls',
  'pwd',
  'find',
  'head',
  'tail',
  'wc',
  'cat',
  'grep',
  'rg',
  'git status',
  'git diff',
  'git log --oneline',
] as const;

const NETWORK_COMMANDS = [
  'curl',
  'wget',
  'nc',
  'netcat',
  'ssh',
  'scp',
  'sftp',
  'rsync',
  'ftp',
  'telnet',
  'ping',
  'traceroute',
  'nslookup',
  'dig',
  'host',
] as const;

let cachedSandboxExecAvailable: boolean | null = null;

function isOsSandboxAvailable(): boolean {
  if (process.platform !== 'darwin') {
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
// Command Validator
// ============================================================================

export class CommandValidator {
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  /**
   * Analyze a command for potential risks.
   */
  analyze(command: string, context: { cwd?: string } = {}): CommandAnalysis {
    const reasons: string[] = [];
    let risk: CommandRisk = 'safe';
    const cwd = context.cwd || process.cwd();

    // Check for blocked commands
    if (this.isBlockedCommand(command)) {
      return {
        command,
        risk: 'blocked',
        reasons: ['Command is explicitly blocked for security reasons'],
      };
    }

    // Check for dangerous patterns
    const dangerousMatch = this.matchesDangerousPattern(command);
    if (dangerousMatch) {
      risk = 'dangerous';
      reasons.push(`Matches dangerous pattern: ${dangerousMatch}`);
    }

    // Analyze path access
    const paths = this.extractPaths(command);
    const modifiedPaths: string[] = [];

    for (const path of paths) {
      const absolutePath = this.resolvePath(path, cwd);

      if (this.isDeniedPath(absolutePath, cwd)) {
        risk = this.escalateRisk(risk, 'dangerous');
        reasons.push(`Accesses denied path: ${absolutePath}`);
      } else if (!this.isAllowedPath(absolutePath, cwd)) {
        risk = this.escalateRisk(risk, 'moderate');
        reasons.push(`Accesses path outside allowed directories: ${absolutePath}`);
      }

      // Check if command modifies files
      if (this.isModifyingCommand(command, path)) {
        modifiedPaths.push(absolutePath);
      }
    }

    // Check for network access
    const networkAccess = this.hasNetworkAccess(command);
    if (networkAccess && !this.config.allowNetwork) {
      risk = this.escalateRisk(risk, 'moderate');
      reasons.push('Command may access network');
    }

    // Check for process spawning
    const processSpawn = this.spawnsProcesses(command);
    if (processSpawn && !this.config.allowProcessSpawn) {
      risk = this.escalateRisk(risk, 'moderate');
      reasons.push('Command may spawn child processes');
    }

    // Check for shell injection risks
    if (this.hasShellInjectionRisk(command)) {
      risk = this.escalateRisk(risk, 'moderate');
      reasons.push('Command contains potential shell injection patterns');
    }

    return {
      command,
      risk,
      reasons,
      modifiedPaths: modifiedPaths.length > 0 ? modifiedPaths : undefined,
      accessedPaths: paths.length > 0 ? paths.map((p) => this.resolvePath(p, cwd)) : undefined,
      networkAccess,
      processSpawn,
    };
  }

  /**
   * Evaluate command execution policy with deterministic allow/deny output.
   */
  evaluatePolicy(command: string, context: { cwd?: string } = {}): CommandPolicyEvaluation {
    const cwd = resolve(context.cwd || process.cwd());
    const analysis = this.analyze(command, { cwd });
    const violations: string[] = [];
    const segments = this.splitCommandSegments(command);
    const normalizedAllowed = this.normalizeAllowedPaths(cwd);

    if (analysis.risk === 'blocked') {
      violations.push('Command is explicitly blocked.');
    }

    if (analysis.risk === 'dangerous') {
      violations.push('Command matches dangerous shell patterns.');
    }

    if (this.config.mode === 'read-only' && !isReadOnlySafeCommand(command)) {
      violations.push('Sandbox mode is read-only; command is not read-only safe.');
    }

    if (!this.config.allowNetwork && analysis.networkAccess) {
      violations.push('Network access is disabled for shell commands.');
    }

    if (!this.config.allowProcessSpawn && analysis.processSpawn) {
      violations.push('Process spawning is disabled for shell commands.');
    }

    const paths = this.extractPaths(command);
    for (const path of paths) {
      const absolutePath = this.resolvePath(path, cwd);
      if (this.isDeniedPath(absolutePath, cwd)) {
        violations.push(`Path is denied: ${absolutePath}`);
      } else if (!this.isAllowedPath(absolutePath, cwd)) {
        violations.push(`Path is outside allowed roots: ${absolutePath}`);
      }
    }

    for (const segment of segments) {
      if (!segment.trim()) continue;
      if (this.config.mode === 'read-only' && this.isMutatingSegment(segment)) {
        violations.push(`Read-only mode blocks mutating segment: ${segment.trim()}`);
      }
    }

    const osEnforced =
      this.config.mode !== 'danger-full-access' &&
      isOsSandboxAvailable();

    return {
      allowed: violations.length === 0,
      violations: [...new Set(violations)],
      analysis,
      mode: this.config.mode,
      osEnforced,
      effectiveAllowedPaths: normalizedAllowed,
    };
  }

  /**
   * Check if a command should be allowed to execute.
   */
  isAllowed(command: string, context: { cwd?: string } = {}): boolean {
    return this.evaluatePolicy(command, context).allowed;
  }

  /**
   * Check if command is in the blocked list.
   */
  private isBlockedCommand(command: string): boolean {
    const normalized = command.toLowerCase().trim();

    for (const blocked of BLOCKED_COMMANDS) {
      if (blocked.includes('.*')) {
        // Treat as regex
        const regex = new RegExp(blocked, 'i');
        if (regex.test(normalized)) {
          return true;
        }
      } else {
        const escaped = blocked.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?:^|[;&|]\\s*)${escaped}`, 'i');
        if (pattern.test(normalized)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if command matches any dangerous pattern.
   */
  private matchesDangerousPattern(command: string): string | null {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return pattern.toString();
      }
    }
    return null;
  }

  /**
   * Extract file paths from a command.
   */
  extractPaths(command: string): string[] {
    const paths: string[] = [];

    // Match quoted strings
    const quotedMatches = command.match(/"[^"]+"|'[^']+'/g) || [];
    for (const match of quotedMatches) {
      const path = match.slice(1, -1);
      if (this.looksLikePath(path)) {
        paths.push(path);
      }
    }

    // Match unquoted paths
    const tokens = command.split(/\s+/);
    for (const token of tokens) {
      if (this.looksLikePath(token) && !token.startsWith('-')) {
        paths.push(token);
      }
    }

    return [...new Set(paths)];
  }

  /**
   * Check if a string looks like a file path.
   */
  private looksLikePath(str: string): boolean {
    return (
      str.startsWith('/') ||
      str.startsWith('./') ||
      str.startsWith('../') ||
      str.startsWith('~') ||
      /^[a-zA-Z]:[\\/]/.test(str)
    );
  }

  /**
   * Resolve a path to absolute.
   */
  private resolvePath(path: string, cwd: string): string {
    if (path.startsWith('~')) {
      const home = process.env.HOME || '';
      path = path.replace(/^~/, home);
    }
    return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
  }

  /**
   * Normalize configured allowed roots for comparisons.
   */
  private normalizeAllowedPaths(cwd: string): string[] {
    const normalized = new Set<string>();
    normalized.add(resolve(cwd));
    for (const allowed of this.config.allowedPaths) {
      normalized.add(this.resolvePath(allowed, cwd));
    }
    return Array.from(normalized);
  }

  /**
   * Check if a path is in the allowed list.
   * Also checks for symlink escapes.
   */
  private isAllowedPath(absolutePath: string, cwd: string): boolean {
    // Check for symlink escape
    const realPath = this.resolveSymlinks(absolutePath);
    const allowedPaths = this.normalizeAllowedPaths(cwd);

    return allowedPaths.some((allowed) => {
      return (
        absolutePath === allowed ||
        absolutePath.startsWith(`${allowed}${sep}`) ||
        realPath === allowed ||
        realPath.startsWith(`${allowed}${sep}`)
      );
    });
  }

  /**
   * Check if a path is in the denied list.
   * Also checks for symlink escapes.
   */
  private isDeniedPath(absolutePath: string, cwd: string): boolean {
    // Check for symlink escape
    const realPath = this.resolveSymlinks(absolutePath);

    return this.config.deniedPaths.some((denied) => {
      const resolvedDenied = this.resolvePath(denied, cwd);
      return (
        absolutePath === resolvedDenied ||
        absolutePath.startsWith(`${resolvedDenied}${sep}`) ||
        realPath === resolvedDenied ||
        realPath.startsWith(`${resolvedDenied}${sep}`)
      );
    });
  }

  /**
   * Resolve symlinks to get the real path.
   * Prevents symlink escape attacks where a symlink points outside allowed directories.
   */
  private resolveSymlinks(path: string): string {
    try {
      // Check if path exists
      if (!existsSync(path)) {
        return normalize(path);
      }

      // Check if it's a symlink
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) {
        // Resolve the symlink to its real path
        return realpathSync(path);
      }

      return normalize(path);
    } catch {
      // If we can't check, return the normalized path
      return normalize(path);
    }
  }

  /**
   * Check if command modifies the specified path.
   */
  private isModifyingCommand(command: string, path: string): boolean {
    const modifyingCommands = [
      'rm',
      'mv',
      'cp',
      'touch',
      'mkdir',
      'rmdir',
      'chmod',
      'chown',
      'ln',
      'unlink',
      'truncate',
      'dd',
      'tee',
    ];

    const subCommands = this.splitCommandSegments(command).map((c) => c.trim());
    for (const subCmd of subCommands) {
      const firstToken = subCmd.split(/\s+/)[0]?.toLowerCase();
      if (
        modifyingCommands.some(
          (cmd) => firstToken === cmd || firstToken?.endsWith(`/${cmd}`),
        ) &&
        subCmd.includes(path)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Split compound shell command into segments.
   */
  splitCommandSegments(command: string): string[] {
    return command
      .split(/(?:\|\||&&|[;|])/g)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  /**
   * Check if command segment appears mutating.
   */
  private isMutatingSegment(segment: string): boolean {
    const trimmed = segment.trim();
    if (!trimmed) return false;

    const mutatingPrefixes = [
      'rm',
      'mv',
      'cp',
      'touch',
      'mkdir',
      'rmdir',
      'chmod',
      'chown',
      'ln',
      'unlink',
      'truncate',
      'dd',
      'tee',
      'sed -i',
      'perl -i',
      'git add',
      'git commit',
      'git reset',
      'git clean',
      'npm install',
      'pnpm install',
      'yarn add',
    ];

    return mutatingPrefixes.some(
      (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `),
    );
  }

  /**
   * Check if command accesses network.
   */
  private hasNetworkAccess(command: string): boolean {
    const tokens = command.split(/\s+/);
    return tokens.some((token) =>
      NETWORK_COMMANDS.some((cmd) => token === cmd || token.endsWith(`/${cmd}`)),
    );
  }

  /**
   * Check if command spawns child processes.
   */
  private spawnsProcesses(command: string): boolean {
    return (
      command.includes('&') ||
      command.includes('|') ||
      command.includes('$(') ||
      command.includes('`') ||
      /;\s*[a-z]/i.test(command)
    );
  }

  /**
   * Check for shell injection risks.
   */
  private hasShellInjectionRisk(command: string): boolean {
    const injectionPatterns = [
      /\$\([^)]+\)/, // $(command)
      /`[^`]+`/, // `command`
      /\$\{[^}]+\}/, // ${var}
      /;\s*[a-z]/i, // ; command
      /\|\|/, // ||
      /&&/, // &&
    ];

    return injectionPatterns.some((pattern) => pattern.test(command));
  }

  /**
   * Escalate risk level.
   */
  private escalateRisk(current: CommandRisk, newRisk: CommandRisk): CommandRisk {
    const levels: CommandRisk[] = ['safe', 'moderate', 'dangerous', 'blocked'];
    const currentLevel = levels.indexOf(current);
    const newLevel = levels.indexOf(newRisk);
    return levels[Math.max(currentLevel, newLevel)];
  }
}

/**
 * Create a command validator with custom config.
 */
export function createValidator(config?: Partial<SandboxConfig>): CommandValidator {
  return new CommandValidator(config);
}

/**
 * Quick check if a command is safe to execute.
 */
export function isSafeCommand(command: string, config?: Partial<SandboxConfig>): boolean {
  const validator = new CommandValidator(config);
  const analysis = validator.analyze(command);
  return analysis.risk === 'safe';
}

/**
 * Evaluate a command against sandbox policy.
 */
export function evaluatePolicy(
  command: string,
  config?: Partial<SandboxConfig>,
  cwd?: string,
): CommandPolicyEvaluation {
  const validator = new CommandValidator(config);
  return validator.evaluatePolicy(command, { cwd });
}

/**
 * Read-only helper shared by plan mode and read-only sandbox mode.
 */
export function isReadOnlySafeCommand(command: string): boolean {
  const normalized = command.trim().replace(/\s+/g, ' ');
  if (!normalized) return false;

  return READ_ONLY_SAFE_COMMAND_PREFIXES.some(
    (safe) => normalized === safe || normalized.startsWith(`${safe} `),
  );
}
