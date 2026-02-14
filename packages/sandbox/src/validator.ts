// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { resolve, isAbsolute, normalize, sep } from 'path';
import { realpathSync, lstatSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import type {
  CommandAnalysis,
  CommandIntent,
  CommandIntentClassification,
  CommandPolicyEvaluation,
  CommandRisk,
  CommandTrustAssessment,
  SandboxConfig,
} from './types.js';
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

const DELETE_INTENT_PREFIXES = [
  'rm',
  'rmdir',
  'unlink',
  'git clean',
  'git reset --hard',
  'shred',
] as const;

const WRITE_INTENT_PREFIXES = [
  'mv',
  'cp',
  'touch',
  'mkdir',
  'chmod',
  'chown',
  'ln',
  'truncate',
  'tee',
  'sed -i',
  'perl -i',
  'npm install',
  'npm update',
  'pnpm install',
  'pnpm add',
  'yarn add',
  'pip install',
  'cargo add',
] as const;

const VERSION_CONTROL_PREFIXES = [
  'git status',
  'git diff',
  'git log',
  'git show',
  'git branch',
  'git checkout',
  'git switch',
  'git add',
  'git commit',
  'git reset',
  'git clean',
  'git push',
  'git pull',
  'git fetch',
  'git merge',
  'git rebase',
] as const;

const PACKAGE_MANAGER_PREFIXES = [
  'npm',
  'pnpm',
  'yarn',
  'pip',
  'pip3',
  'uv',
  'cargo',
  'brew',
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
    const segments = this.splitCommandSegments(command);
    let deniedPathCount = 0;
    let outsideAllowedPathCount = 0;

    // Check for blocked commands
    const blockedCommand = this.isBlockedCommand(command);
    if (blockedCommand) {
      risk = 'blocked';
      reasons.push('Command is explicitly blocked for security reasons');
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
    const accessedPaths: string[] = [];

    for (const path of paths) {
      const absolutePath = this.resolvePath(path, cwd);
      accessedPaths.push(absolutePath);

      if (this.isDeniedPath(absolutePath, cwd)) {
        risk = this.escalateRisk(risk, 'dangerous');
        reasons.push(`Accesses denied path: ${absolutePath}`);
        deniedPathCount += 1;
      } else if (!this.isAllowedPath(absolutePath, cwd)) {
        risk = this.escalateRisk(risk, 'moderate');
        reasons.push(`Accesses path outside allowed directories: ${absolutePath}`);
        outsideAllowedPathCount += 1;
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
    const shellInjectionRisk = this.hasShellInjectionRisk(command);
    if (shellInjectionRisk) {
      risk = this.escalateRisk(risk, 'moderate');
      reasons.push('Command contains potential shell injection patterns');
    }

    const intent = this.classifyIntent(command, segments, networkAccess);
    const trust = this.assessTrust({
      command,
      risk,
      networkAccess,
      processSpawn,
      modifiedPathCount: modifiedPaths.length,
      deniedPathCount,
      outsideAllowedPathCount,
      shellInjectionRisk,
      intent,
    });

    return {
      command,
      risk,
      reasons,
      intent,
      trust,
      modifiedPaths: modifiedPaths.length > 0 ? modifiedPaths : undefined,
      accessedPaths: accessedPaths.length > 0 ? accessedPaths : undefined,
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

  private classifyIntent(
    command: string,
    segments: string[],
    networkAccess: boolean,
  ): CommandIntentClassification {
    const intents = new Set<CommandIntent>();
    const reasons: string[] = [];
    const normalizedSegments = segments.map((segment) =>
      segment.trim().replace(/\s+/g, ' ').toLowerCase(),
    );

    if (networkAccess) {
      intents.add('network');
      reasons.push('Network utility detected in command tokens.');
    }

    for (const segment of normalizedSegments) {
      if (!segment) continue;
      if (/(^|\s)(>>?|1>|2>|&>)(\s|$)/.test(segment)) {
        intents.add('write');
        reasons.push(`Shell redirection indicates write intent: "${segment}"`);
      }
      if (this.matchesAnyPrefix(segment, DELETE_INTENT_PREFIXES)) {
        intents.add('delete');
        reasons.push(`Delete-oriented segment detected: "${segment}"`);
      }
      if (this.matchesAnyPrefix(segment, WRITE_INTENT_PREFIXES)) {
        intents.add('write');
        reasons.push(`Write-oriented segment detected: "${segment}"`);
      }
      if (this.matchesAnyPrefix(segment, READ_ONLY_SAFE_COMMAND_PREFIXES)) {
        intents.add('read');
        reasons.push(`Read-oriented segment detected: "${segment}"`);
      }
      if (this.matchesAnyPrefix(segment, VERSION_CONTROL_PREFIXES)) {
        intents.add('version_control');
        reasons.push(`Version-control segment detected: "${segment}"`);
      }
      if (this.matchesAnyPrefix(segment, PACKAGE_MANAGER_PREFIXES)) {
        intents.add('package_management');
        reasons.push(`Package-management segment detected: "${segment}"`);
      }
    }

    if (intents.size === 0) {
      const normalized = command.trim().replace(/\s+/g, ' ').toLowerCase();
      if (normalized.length === 0) {
        intents.add('unknown');
        reasons.push('Command is empty after normalization.');
      } else {
        intents.add('execute');
        reasons.push('Command intent defaults to generic execute.');
      }
    }

    const priority: CommandIntent[] = [
      'delete',
      'write',
      'network',
      'version_control',
      'package_management',
      'read',
      'execute',
      'unknown',
    ];
    const primary =
      priority.find((candidate) => intents.has(candidate)) || 'unknown';

    let confidence = 0.55;
    if (intents.size === 1 && primary !== 'unknown') confidence += 0.25;
    if (intents.has('unknown')) confidence -= 0.2;
    if (intents.size > 2) confidence -= 0.08;
    confidence = Math.max(0.2, Math.min(0.98, confidence));

    return {
      primary,
      intents: Array.from(intents),
      confidence: Number(confidence.toFixed(3)),
      reasons: reasons.length > 0 ? reasons : ['No explicit intent patterns matched.'],
    };
  }

  private assessTrust(input: {
    command: string;
    risk: CommandRisk;
    networkAccess: boolean;
    processSpawn: boolean;
    modifiedPathCount: number;
    deniedPathCount: number;
    outsideAllowedPathCount: number;
    shellInjectionRisk: boolean;
    intent: CommandIntentClassification;
  }): CommandTrustAssessment {
    let score = 0.5;
    const factors: string[] = [];

    if (isReadOnlySafeCommand(input.command)) {
      score += 0.2;
      factors.push('Matches read-only safe command profile.');
    }

    if (this.commandMatchesTrustedPrefix(input.command)) {
      score += 0.2;
      factors.push('Matches configured trusted command prefixes.');
    } else {
      factors.push('Does not match configured trusted command prefixes.');
    }

    if (input.networkAccess) {
      score -= 0.15;
      factors.push('Network access detected.');
    } else {
      score += 0.08;
      factors.push('No network access detected.');
    }

    if (input.processSpawn) {
      score -= 0.12;
      factors.push('Process chaining/spawn pattern detected.');
    } else {
      score += 0.07;
      factors.push('No process chaining/spawn pattern detected.');
    }

    if (input.modifiedPathCount > 0) {
      score -= 0.18;
      factors.push(`Modifies ${input.modifiedPathCount} path(s).`);
    } else {
      score += 0.08;
      factors.push('No file modifications detected.');
    }

    if (input.outsideAllowedPathCount > 0) {
      score -= 0.2;
      factors.push(`${input.outsideAllowedPathCount} path(s) outside allowed roots.`);
    }
    if (input.deniedPathCount > 0) {
      score -= 0.35;
      factors.push(`${input.deniedPathCount} path(s) in denied roots.`);
    }

    if (input.shellInjectionRisk) {
      score -= 0.18;
      factors.push('Shell injection pattern detected.');
    }

    if (input.intent.primary === 'read') score += 0.07;
    if (input.intent.primary === 'delete') score -= 0.2;
    if (input.intent.primary === 'network') score -= 0.08;
    if (input.intent.primary === 'package_management') score -= 0.05;

    switch (input.risk) {
      case 'safe':
        score += 0.05;
        break;
      case 'moderate':
        score -= 0.2;
        break;
      case 'dangerous':
        score -= 0.4;
        break;
      case 'blocked':
        score -= 0.6;
        break;
    }

    score = Math.max(0, Math.min(1, score));
    const level = score >= 0.75 ? 'high' : score >= 0.45 ? 'medium' : 'low';

    return {
      score: Number(score.toFixed(3)),
      level,
      factors,
    };
  }

  private commandMatchesTrustedPrefix(command: string): boolean {
    const normalized = command.trim().replace(/\s+/g, ' ').toLowerCase();
    return this.config.trustedCommands.some((trusted) => {
      const normalizedTrusted = trusted.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!normalizedTrusted) return false;
      return (
        normalized === normalizedTrusted ||
        normalized.startsWith(`${normalizedTrusted} `)
      );
    });
  }

  private matchesAnyPrefix(command: string, prefixes: readonly string[]): boolean {
    return prefixes.some((prefix) => {
      const normalizedPrefix = prefix.trim().toLowerCase();
      return (
        command === normalizedPrefix ||
        command.startsWith(`${normalizedPrefix} `)
      );
    });
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
