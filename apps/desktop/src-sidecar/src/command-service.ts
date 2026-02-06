/**
 * Command Service
 *
 * Manages command discovery, installation, and loading from multiple sources.
 * Sources are prioritized: managed > bundled
 */

import { readFile, readdir, mkdir, cp, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type {
  CommandManifest,
  CommandSource,
  CommandSourceType,
  CommandCategory,
} from '@gemini-cowork/shared';
import { parseCommandMarkdown, buildCommandMarkdown } from './command-parser.js';

// Get the directory of this file for bundled commands path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default paths - bundled commands are in project root /commands/bundled/
const DEFAULT_BUNDLED_DIR = join(__dirname, '..', '..', '..', '..', 'commands', 'bundled');

/**
 * Parameters for creating a custom command
 */
export interface CreateCommandParams {
  name: string;
  displayName: string;
  description: string;
  aliases?: string[];
  category: CommandCategory;
  icon?: string;
  priority?: number;
  content: string;
  emoji?: string;
}

/**
 * Command Service for managing commands across multiple sources
 */
export class CommandService {
  private bundledCommandsDir: string;
  private managedCommandsDir: string;
  private commandCache: Map<string, CommandManifest> = new Map();
  private appDataDir: string;

  constructor(appDataDir?: string) {
    this.appDataDir = appDataDir || join(homedir(), '.cowork');
    this.bundledCommandsDir = DEFAULT_BUNDLED_DIR;
    this.managedCommandsDir = join(this.appDataDir, 'commands');
  }

  /**
   * Set bundled commands directory (for testing or custom bundles)
   */
  setBundledDir(dir: string): void {
    this.bundledCommandsDir = dir;
  }

  /**
   * Discover all commands from all sources
   * Returns both managed and bundled commands with unique IDs.
   * The frontend decides what to show based on source type and installed configs.
   */
  async discoverAll(): Promise<CommandManifest[]> {
    const allCommands: CommandManifest[] = [];

    // Discover managed commands (user-installed or custom)
    if (existsSync(this.managedCommandsDir)) {
      const commands = await this.discoverFromDirectory(this.managedCommandsDir, 'managed', 1);
      allCommands.push(...commands);
    }

    // Discover bundled commands (always available for installation)
    if (existsSync(this.bundledCommandsDir)) {
      const commands = await this.discoverFromDirectory(this.bundledCommandsDir, 'bundled', 100);
      allCommands.push(...commands);
    }

    // Update cache
    for (const command of allCommands) {
      this.commandCache.set(command.id, command);
    }

    return allCommands;
  }

  /**
   * Discover commands from a specific directory
   */
  async discoverFromDirectory(
    dir: string,
    sourceType: CommandSourceType,
    priority: number
  ): Promise<CommandManifest[]> {
    const commands: CommandManifest[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }

        const commandDir = join(dir, entry.name);
        const commandMdPath = join(commandDir, 'COMMAND.md');

        if (!existsSync(commandMdPath)) {
          continue;
        }

        try {
          const content = await readFile(commandMdPath, 'utf-8');
          const parsed = parseCommandMarkdown(content);

          if (!parsed) {
            continue;
          }

          const source: CommandSource = {
            type: sourceType,
            path: dir,
            priority,
          };

          // For action-only commands (like /clear), prompt is null
          const prompt = parsed.frontmatter.action ? null : parsed.body;

          const manifest: CommandManifest = {
            id: `${sourceType}:${parsed.frontmatter.name}`,
            source,
            frontmatter: parsed.frontmatter,
            commandPath: commandDir,
            prompt,
          };

          commands.push(manifest);
        } catch {
          // Skip commands that fail to parse
        }
      }
    } catch {
      // Directory scanning error - return empty array
    }

    return commands;
  }

  /**
   * Get a command by ID from cache or discover
   */
  async getCommand(commandId: string): Promise<CommandManifest | null> {
    // Check cache first
    if (this.commandCache.has(commandId)) {
      return this.commandCache.get(commandId)!;
    }

    // Try to discover
    await this.discoverAll();
    return this.commandCache.get(commandId) || null;
  }

  /**
   * Install a command from bundled to managed directory
   */
  async installCommand(commandId: string): Promise<void> {
    const command = await this.getCommand(commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    // Only install bundled commands
    if (command.source.type !== 'bundled') {
      throw new Error(`Can only install bundled commands. Command ${commandId} is ${command.source.type}`);
    }

    const targetDir = join(this.managedCommandsDir, command.frontmatter.name);

    // If managed folder doesn't exist, copy from bundled
    if (!existsSync(targetDir)) {
      // Ensure managed directory exists
      await mkdir(this.managedCommandsDir, { recursive: true });

      // Copy command directory
      await cp(command.commandPath, targetDir, { recursive: true });
    }
    // If folder already exists (orphaned from previous install), just use it

    // Clear cache to force re-discovery
    this.commandCache.clear();
  }

  /**
   * Uninstall a command from managed directory
   */
  async uninstallCommand(commandId: string): Promise<void> {
    const command = await this.getCommand(commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    // Only uninstall managed commands
    if (command.source.type !== 'managed') {
      throw new Error(`Can only uninstall managed commands. Command ${commandId} is ${command.source.type}`);
    }

    // Remove command directory
    await rm(command.commandPath, { recursive: true, force: true });

    // Clear cache
    this.commandCache.delete(commandId);
  }

  /**
   * Create a custom command in the managed directory
   */
  async createCommand(params: CreateCommandParams): Promise<string> {
    // Validate name (kebab-case, 1-64 chars)
    const nameRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!nameRegex.test(params.name)) {
      throw new Error('Name must be kebab-case (lowercase letters, numbers, hyphens only)');
    }
    if (params.name.length > 64) {
      throw new Error('Name must be 64 characters or less');
    }
    if (params.name.length < 1) {
      throw new Error('Name is required');
    }

    // Validate required fields
    if (!params.displayName?.trim()) {
      throw new Error('Display name is required');
    }
    if (!params.description?.trim()) {
      throw new Error('Description is required');
    }
    if (!params.content?.trim()) {
      throw new Error('Command content (prompt) is required');
    }

    // Create command directory in managed location
    const commandDir = join(this.managedCommandsDir, params.name);
    if (existsSync(commandDir)) {
      throw new Error(`Command "${params.name}" already exists`);
    }

    // Ensure managed directory exists
    await mkdir(this.managedCommandsDir, { recursive: true });
    await mkdir(commandDir, { recursive: true });

    // Build COMMAND.md content
    const commandMd = buildCommandMarkdown(params);

    // Write COMMAND.md
    const commandMdPath = join(commandDir, 'COMMAND.md');
    await writeFile(commandMdPath, commandMd, 'utf-8');

    // Clear cache and re-discover
    this.commandCache.clear();

    const commandId = `managed:${params.name}`;

    return commandId;
  }

  /**
   * Load command content (full COMMAND.md text)
   */
  async loadCommandContent(commandId: string): Promise<string> {
    const command = await this.getCommand(commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    const commandMdPath = join(command.commandPath, 'COMMAND.md');
    const content = await readFile(commandMdPath, 'utf-8');

    return content;
  }

  /**
   * Get list of managed (installed) command IDs
   */
  async getInstalledCommandIds(): Promise<string[]> {
    if (!existsSync(this.managedCommandsDir)) {
      return [];
    }

    const commands = await this.discoverFromDirectory(this.managedCommandsDir, 'managed', 1);
    return commands.map((c) => c.id);
  }

  /**
   * Check if a command is installed (in managed dir)
   */
  async isInstalled(commandName: string): Promise<boolean> {
    const targetDir = join(this.managedCommandsDir, commandName);
    return existsSync(targetDir);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.commandCache.clear();
  }

  /**
   * Get the managed commands directory path
   */
  getManagedCommandsDir(): string {
    return this.managedCommandsDir;
  }

  /**
   * Get the app data directory path
   */
  getAppDataDir(): string {
    return this.appDataDir;
  }
}

// Singleton instance
export const commandService = new CommandService();
