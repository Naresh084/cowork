/**
 * Command Loader
 *
 * Loads commands from all sources:
 * - Built-in commands (bundled with app)
 * - Marketplace commands (installed in app data)
 * - Custom commands (project .cowork/commands/)
 */

import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type {
  CommandManifest,
  CommandHandler,
  CommandCategory,
  CommandType,
  CommandArgument,
} from './types.js';

/**
 * Command source type
 */
export type CommandSource = 'built-in' | 'marketplace' | 'custom';

/**
 * Loaded command with source metadata (flattened manifest + metadata)
 */
export interface LoadedCommand {
  name: string;
  displayName: string;
  description: string;
  version: string;
  author?: string;
  aliases: string[];
  category: CommandCategory;
  icon?: string;
  arguments: CommandArgument[];
  type: CommandType;
  requiresSession: boolean;
  requiresWorkingDir: boolean;
  autoSuggest: boolean;
  priority: number;
  handler?: CommandHandler;
  source: CommandSource;
  sourcePath: string;
}

/**
 * Command loader configuration
 */
interface CommandLoaderConfig {
  builtInDir?: string;
  marketplaceDir?: string;
  customDir?: string;
}

/**
 * CommandLoader class
 */
export class CommandLoader {
  private builtInDir: string | null;
  private marketplaceDir: string | null;
  private customDir: string | null;
  private loadedCommands: Map<string, LoadedCommand> = new Map();

  constructor(config: CommandLoaderConfig) {
    this.builtInDir = config.builtInDir || null;
    this.marketplaceDir = config.marketplaceDir || null;
    this.customDir = config.customDir || null;
  }

  /**
   * Load all commands from all sources
   */
  async loadAll(): Promise<LoadedCommand[]> {
    this.loadedCommands.clear();

    // Load in order of priority (custom > marketplace > built-in)
    // Later loads override earlier ones with same name
    await this.loadBuiltIn();
    await this.loadMarketplace();
    await this.loadCustom();

    return Array.from(this.loadedCommands.values());
  }

  /**
   * Load built-in commands
   */
  private async loadBuiltIn(): Promise<void> {
    if (!this.builtInDir || !existsSync(this.builtInDir)) {
      return;
    }

    try {
      const entries = await readdir(this.builtInDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const commandPath = join(this.builtInDir, entry.name);
        const command = await this.loadCommandFromDir(commandPath, 'built-in');
        if (command) {
          this.loadedCommands.set(command.name, command);
        }
      }
    } catch (error) {
      console.error('[CommandLoader] Failed to load built-in commands:', error);
    }
  }

  /**
   * Load marketplace installed commands
   */
  private async loadMarketplace(): Promise<void> {
    if (!this.marketplaceDir || !existsSync(this.marketplaceDir)) {
      return;
    }

    try {
      const entries = await readdir(this.marketplaceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const commandPath = join(this.marketplaceDir, entry.name);
        const command = await this.loadCommandFromDir(commandPath, 'marketplace');
        if (command) {
          this.loadedCommands.set(command.name, command);
        }
      }
    } catch (error) {
      console.error('[CommandLoader] Failed to load marketplace commands:', error);
    }
  }

  /**
   * Load custom project commands
   */
  private async loadCustom(): Promise<void> {
    if (!this.customDir || !existsSync(this.customDir)) {
      return;
    }

    try {
      const entries = await readdir(this.customDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const commandPath = join(this.customDir, entry.name);
        const command = await this.loadCommandFromDir(commandPath, 'custom');
        if (command) {
          this.loadedCommands.set(command.name, command);
        }
      }
    } catch (error) {
      console.error('[CommandLoader] Failed to load custom commands:', error);
    }
  }

  /**
   * Load a single command from a directory
   */
  private async loadCommandFromDir(
    commandDir: string,
    source: CommandSource
  ): Promise<LoadedCommand | null> {
    try {
      // Check for command.json manifest
      const manifestPath = join(commandDir, 'command.json');
      if (!existsSync(manifestPath)) {
        console.warn(`[CommandLoader] No command.json found in ${commandDir}`);
        return null;
      }

      // Load manifest
      const manifestContent = await readFile(manifestPath, 'utf-8');
      const manifest: CommandManifest = JSON.parse(manifestContent);

      // Validate manifest
      if (!manifest.name || !manifest.displayName) {
        console.warn(`[CommandLoader] Invalid manifest in ${commandDir}: missing name or displayName`);
        return null;
      }

      // Load handler if it exists
      const handler = await this.loadHandler(commandDir, source);

      return {
        name: manifest.name,
        displayName: manifest.displayName,
        description: manifest.description || '',
        version: manifest.version || '1.0.0',
        author: manifest.author,
        aliases: manifest.aliases || [],
        category: manifest.category || 'custom',
        icon: manifest.icon,
        arguments: manifest.arguments || [],
        type: manifest.type || 'system',
        requiresSession: manifest.requiresSession ?? false,
        requiresWorkingDir: manifest.requiresWorkingDir ?? true,
        autoSuggest: manifest.autoSuggest ?? true,
        priority: manifest.priority ?? 0,
        handler,
        source,
        sourcePath: commandDir,
      };
    } catch (error) {
      console.error(`[CommandLoader] Failed to load command from ${commandDir}:`, error);
      return null;
    }
  }

  /**
   * Load command handler
   */
  private async loadHandler(
    commandDir: string,
    _source: CommandSource
  ): Promise<CommandHandler | undefined> {
    // For built-in commands, we use dynamic imports
    // For marketplace/custom, we could support a sandboxed execution environment
    // _source could be used in future for sandboxing marketplace commands

    // Check for handler.js (compiled TypeScript)
    const jsHandlerPath = join(commandDir, 'handler.js');
    if (existsSync(jsHandlerPath)) {
      try {
        // Dynamic import for JS handlers
        const module = await import(jsHandlerPath);
        if (typeof module.default === 'function') {
          return module.default;
        }
        if (typeof module.handler === 'function') {
          return module.handler;
        }
      } catch (error) {
        console.error(`[CommandLoader] Failed to load handler from ${jsHandlerPath}:`, error);
      }
    }

    // Return undefined if no handler found (command may be agent-based)
    return undefined;
  }

  /**
   * Reload commands from a specific source
   */
  async reloadSource(source: CommandSource): Promise<void> {
    // Remove commands from this source
    for (const [name, command] of this.loadedCommands) {
      if (command.source === source) {
        this.loadedCommands.delete(name);
      }
    }

    // Reload
    switch (source) {
      case 'built-in':
        await this.loadBuiltIn();
        break;
      case 'marketplace':
        await this.loadMarketplace();
        break;
      case 'custom':
        await this.loadCustom();
        break;
    }
  }

  /**
   * Get loaded command by name
   */
  getCommand(name: string): LoadedCommand | undefined {
    return this.loadedCommands.get(name);
  }

  /**
   * Get all loaded commands
   */
  getAllCommands(): LoadedCommand[] {
    return Array.from(this.loadedCommands.values());
  }

  /**
   * Get commands by source
   */
  getCommandsBySource(source: CommandSource): LoadedCommand[] {
    return this.getAllCommands().filter(cmd => cmd.source === source);
  }

  /**
   * Get commands by category
   */
  getCommandsByCategory(category: string): LoadedCommand[] {
    return this.getAllCommands().filter(cmd => cmd.category === category);
  }

  /**
   * Check if command exists
   */
  hasCommand(name: string): boolean {
    return this.loadedCommands.has(name);
  }

  /**
   * Update directories
   */
  setDirectories(config: Partial<CommandLoaderConfig>): void {
    if (config.builtInDir !== undefined) {
      this.builtInDir = config.builtInDir;
    }
    if (config.marketplaceDir !== undefined) {
      this.marketplaceDir = config.marketplaceDir;
    }
    if (config.customDir !== undefined) {
      this.customDir = config.customDir;
    }
  }

  /**
   * Set custom directory (for project-specific commands)
   */
  setCustomDir(dir: string | null): void {
    this.customDir = dir;
  }
}

/**
 * Create a CommandLoader instance
 */
export function createCommandLoader(config: CommandLoaderConfig = {}): CommandLoader {
  return new CommandLoader(config);
}
