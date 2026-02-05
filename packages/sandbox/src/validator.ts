import { resolve, isAbsolute, normalize } from 'path';
import { realpathSync, lstatSync, existsSync } from 'fs';
import type { CommandAnalysis, CommandRisk, SandboxConfig } from './types.js';
import { DEFAULT_SANDBOX_CONFIG, BLOCKED_COMMANDS, DANGEROUS_PATTERNS } from './types.js';

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
  analyze(command: string): CommandAnalysis {
    const reasons: string[] = [];
    let risk: CommandRisk = 'safe';

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
      const absolutePath = this.resolvePath(path);

      if (this.isDeniedPath(absolutePath)) {
        risk = this.escalateRisk(risk, 'dangerous');
        reasons.push(`Accesses denied path: ${absolutePath}`);
      } else if (!this.isAllowedPath(absolutePath)) {
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
      networkAccess,
      processSpawn,
    };
  }

  /**
   * Check if a command should be allowed to execute.
   */
  isAllowed(command: string): boolean {
    const analysis = this.analyze(command);
    return analysis.risk !== 'blocked';
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
  private extractPaths(command: string): string[] {
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
  private resolvePath(path: string): string {
    if (path.startsWith('~')) {
      const home = process.env.HOME || '';
      path = path.replace(/^~/, home);
    }
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }

  /**
   * Check if a path is in the allowed list.
   * Also checks for symlink escapes.
   */
  private isAllowedPath(absolutePath: string): boolean {
    // Check for symlink escape
    const realPath = this.resolveSymlinks(absolutePath);

    return this.config.allowedPaths.some((allowed) => {
      const resolvedAllowed = this.resolvePath(allowed);
      // Both the requested path and the real path (after symlink resolution) must be within allowed paths
      return absolutePath.startsWith(resolvedAllowed) && realPath.startsWith(resolvedAllowed);
    });
  }

  /**
   * Check if a path is in the denied list.
   * Also checks for symlink escapes.
   */
  private isDeniedPath(absolutePath: string): boolean {
    // Check for symlink escape
    const realPath = this.resolveSymlinks(absolutePath);

    return this.config.deniedPaths.some((denied) => {
      const resolvedDenied = this.resolvePath(denied);
      // Block if either the requested path or the real path is in denied list
      return absolutePath.startsWith(resolvedDenied) || realPath.startsWith(resolvedDenied);
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
   * Check if a path is a symlink that escapes allowed directories.
   */
  isSymlinkEscape(path: string): boolean {
    try {
      if (!existsSync(path)) {
        return false;
      }

      const stats = lstatSync(path);
      if (!stats.isSymbolicLink()) {
        return false;
      }

      const realPath = realpathSync(path);

      // Check if the symlink target is in a different directory tree
      return !this.config.allowedPaths.some((allowed) => {
        const resolvedAllowed = this.resolvePath(allowed);
        return realPath.startsWith(resolvedAllowed);
      });
    } catch {
      return false;
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

    const subCommands = command.split(/[;&|]+/).map(c => c.trim());
    for (const subCmd of subCommands) {
      const firstToken = subCmd.split(/\s+/)[0]?.toLowerCase();
      if (modifyingCommands.some(
        (cmd) => firstToken === cmd || firstToken?.endsWith(`/${cmd}`)
      ) && subCmd.includes(path)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if command accesses network.
   */
  private hasNetworkAccess(command: string): boolean {
    const networkCommands = [
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
    ];

    const tokens = command.split(/\s+/);
    return tokens.some((token) =>
      networkCommands.some(
        (cmd) => token === cmd || token.endsWith(`/${cmd}`)
      )
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
      /;\s*[a-z]/.test(command)
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
  return analysis.risk === 'safe' || analysis.risk === 'moderate';
}
