/**
 * CommandService - Command Registry and Execution
 *
 * Manages slash commands from all sources (built-in, marketplace, custom)
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MemoryService } from '../memory/memory-service.js';
import type { AgentsMdService } from '../agents-md/agents-md-service.js';
import type {
  CommandManifest,
  CommandHandler,
  CommandContext,
  CommandResult,
  CommandRegistry,
  LoadedCommand,
  CommandSearchOptions,
  CommandExecutionOptions,
  CommandCategory,
  CommandSource,
} from './types.js';

/**
 * Built-in command names
 */
const BUILT_IN = ['init', 'help', 'clear', 'memory'] as const;

/**
 * CommandService class
 */
export class CommandService {
  private registry: CommandRegistry;
  private builtInDir: string;
  private marketplaceDir: string;
  private memoryService: MemoryService | null = null;
  private agentsMdService: AgentsMdService | null = null;
  private appDataDir: string;
  private eventEmitter: ((event: string, data: unknown) => void) | null = null;

  constructor(appDataDir: string) {
    this.appDataDir = appDataDir;
    this.marketplaceDir = join(appDataDir, 'commands');

    // Get built-in commands directory (relative to this file)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    this.builtInDir = join(__dirname, 'built-in');

    // Initialize empty registry
    this.registry = {
      commands: new Map(),
      aliases: new Map(),
      byCategory: new Map(),
      bySource: new Map(),
    };
  }

  /**
   * Initialize the command service
   */
  async initialize(
    memoryService: MemoryService,
    agentsMdService: AgentsMdService,
    eventEmitter?: (event: string, data: unknown) => void
  ): Promise<void> {
    this.memoryService = memoryService;
    this.agentsMdService = agentsMdService;
    this.eventEmitter = eventEmitter || null;

    // Load commands from all sources
    await this.loadBuiltInCommands();
    await this.loadMarketplaceCommands();
  }

  /**
   * Load built-in commands
   */
  private async loadBuiltInCommands(): Promise<void> {
    for (const name of BUILT_IN) {
      try {
        const command = await this.loadCommand(
          join(this.builtInDir, name),
          'built-in'
        );
        if (command) {
          this.registerCommand(command);
        }
      } catch (error) {
        console.error(`Failed to load built-in command "${name}":`, error);
      }
    }
  }

  /**
   * Load marketplace (installed) commands
   */
  private async loadMarketplaceCommands(): Promise<void> {
    if (!existsSync(this.marketplaceDir)) {
      return;
    }

    try {
      const dirs = readdirSync(this.marketplaceDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        try {
          const command = await this.loadCommand(
            join(this.marketplaceDir, dir.name),
            'marketplace'
          );
          if (command) {
            this.registerCommand(command);
          }
        } catch (error) {
          console.error(`Failed to load marketplace command "${dir.name}":`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load marketplace commands:', error);
    }
  }

  /**
   * Load custom commands from a working directory
   */
  async loadCustomCommands(workingDir: string): Promise<void> {
    const customDir = join(workingDir, '.cowork', 'commands');
    if (!existsSync(customDir)) {
      return;
    }

    try {
      const dirs = readdirSync(customDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        try {
          const command = await this.loadCommand(
            join(customDir, dir.name),
            'custom'
          );
          if (command) {
            this.registerCommand(command);
          }
        } catch (error) {
          console.error(`Failed to load custom command "${dir.name}":`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load custom commands:', error);
    }
  }

  /**
   * Load a single command from a directory
   */
  private async loadCommand(
    dir: string,
    source: CommandSource
  ): Promise<LoadedCommand | null> {
    const manifestPath = join(dir, 'command.json');
    const handlerPath = join(dir, 'handler.js');

    // Check if manifest exists
    if (!existsSync(manifestPath)) {
      return null;
    }

    // Load manifest
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    const manifest: CommandManifest = JSON.parse(manifestContent);
    manifest.source = source;

    // Load handler
    let handler: CommandHandler;
    if (existsSync(handlerPath)) {
      try {
        const module = await import(handlerPath);
        handler = module.default || module.handler;
      } catch (error) {
        console.error(`Failed to load handler for "${manifest.name}":`, error);
        // Create a placeholder handler
        handler = async () => ({
          success: false,
          error: {
            code: 'HANDLER_LOAD_FAILED',
            message: `Failed to load command handler: ${error}`,
          },
        });
      }
    } else {
      // Create default handler based on type
      handler = this.createDefaultHandler(manifest);
    }

    return {
      manifest,
      handler,
      loadPath: dir,
    };
  }

  /**
   * Create a default handler for a command
   */
  private createDefaultHandler(manifest: CommandManifest): CommandHandler {
    return async (ctx) => {
      if (manifest.type === 'agent') {
        // For agent commands, return a message to send to the agent
        return {
          success: true,
          message: `Running /${manifest.name}...`,
          actions: [
            {
              type: 'send_message',
              payload: {
                content: `/${manifest.name} ${ctx.rawInput}`,
                isCommand: true,
              },
            },
          ],
        };
      }

      return {
        success: false,
        error: {
          code: 'NO_HANDLER',
          message: `Command "${manifest.name}" has no handler implementation`,
        },
      };
    };
  }

  /**
   * Register a command in the registry
   */
  private registerCommand(command: LoadedCommand): void {
    const { manifest } = command;

    // Add to main registry
    this.registry.commands.set(manifest.name, command);

    // Add aliases
    if (manifest.aliases) {
      for (const alias of manifest.aliases) {
        this.registry.aliases.set(alias, manifest.name);
      }
    }

    // Add to category index
    const category = manifest.category;
    if (!this.registry.byCategory.has(category)) {
      this.registry.byCategory.set(category, []);
    }
    this.registry.byCategory.get(category)!.push(manifest.name);

    // Add to source index
    const source = manifest.source || 'built-in';
    if (!this.registry.bySource.has(source)) {
      this.registry.bySource.set(source, []);
    }
    this.registry.bySource.get(source)!.push(manifest.name);
  }

  /**
   * Execute a command
   */
  async execute(
    commandInput: string,
    workingDirectory: string,
    options?: CommandExecutionOptions
  ): Promise<CommandResult> {
    // Parse command input
    const { name, args, rawInput } = this.parseCommandInput(commandInput);

    // Resolve alias
    const commandName = this.registry.aliases.get(name) || name;

    // Get command
    const command = this.registry.commands.get(commandName);
    if (!command) {
      return {
        success: false,
        error: {
          code: 'COMMAND_NOT_FOUND',
          message: `Unknown command: /${name}`,
          suggestion: this.suggestSimilarCommand(name),
        },
      };
    }

    // Check requirements
    if (command.manifest.requiresWorkingDir && !workingDirectory) {
      return {
        success: false,
        error: {
          code: 'REQUIRES_WORKING_DIR',
          message: `Command /${name} requires a working directory`,
        },
      };
    }

    // Build context
    const ctx: CommandContext = {
      sessionId: options?.sessionId,
      workingDirectory: options?.workingDirectory || workingDirectory,
      appDataDir: this.appDataDir,
      args,
      rawInput,
      memoryService: this.memoryService!,
      agentsMdService: this.agentsMdService!,
      emit: this.eventEmitter || (() => {}),
      log: (message, level = 'info') => {
        console.error(`[${level}] ${message}`);
      },
    };

    // Execute with timeout
    const timeout = options?.timeout || 30000;
    try {
      const result = await Promise.race([
        command.handler(ctx),
        new Promise<CommandResult>((_, reject) =>
          setTimeout(() => reject(new Error('Command timeout')), timeout)
        ),
      ]);

      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Parse command input into name and arguments
   */
  private parseCommandInput(input: string): {
    name: string;
    args: Record<string, unknown>;
    rawInput: string;
  } {
    // Remove leading slash if present
    const cleanInput = input.startsWith('/') ? input.slice(1) : input;
    const parts = cleanInput.split(/\s+/);
    const name = parts[0]?.toLowerCase() || '';
    const rawInput = parts.slice(1).join(' ');

    // Parse arguments (basic key=value or flags)
    const args: Record<string, unknown> = {};
    let i = 1;
    while (i < parts.length) {
      const part = parts[i];

      // Flag: --name or -n
      if (part.startsWith('--')) {
        const key = part.slice(2);
        // Check if next part is a value
        if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
          args[key] = parts[i + 1];
          i += 2;
        } else {
          args[key] = true;
          i++;
        }
      } else if (part.startsWith('-')) {
        const key = part.slice(1);
        args[key] = true;
        i++;
      } else if (part.includes('=')) {
        const [key, ...valueParts] = part.split('=');
        args[key] = valueParts.join('=');
        i++;
      } else {
        // Positional argument
        if (!args._positional) {
          args._positional = [];
        }
        (args._positional as string[]).push(part);
        i++;
      }
    }

    return { name, args, rawInput };
  }

  /**
   * Suggest similar command name
   */
  private suggestSimilarCommand(name: string): string | undefined {
    const allNames = [
      ...this.registry.commands.keys(),
      ...this.registry.aliases.keys(),
    ];

    // Simple Levenshtein-based suggestion
    let bestMatch: string | undefined;
    let bestDistance = Infinity;

    for (const candidate of allNames) {
      const distance = this.levenshteinDistance(name, candidate);
      if (distance < bestDistance && distance <= 2) {
        bestDistance = distance;
        bestMatch = candidate;
      }
    }

    return bestMatch ? `Did you mean "/${bestMatch}"?` : undefined;
  }

  /**
   * Levenshtein distance for string similarity
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Search commands
   */
  search(options?: CommandSearchOptions): CommandManifest[] {
    let commands = [...this.registry.commands.values()].map(c => c.manifest);

    // Filter by category
    if (options?.category) {
      commands = commands.filter(c => c.category === options.category);
    }

    // Filter by source
    if (options?.source) {
      commands = commands.filter(c => c.source === options.source);
    }

    // Filter by auto-suggest
    if (options?.autoSuggestOnly) {
      commands = commands.filter(c => c.autoSuggest);
    }

    // Search by query
    if (options?.query) {
      const query = options.query.toLowerCase();
      commands = commands.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.displayName.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query) ||
        c.aliases?.some(a => a.toLowerCase().includes(query)) ||
        c.keywords?.some(k => k.toLowerCase().includes(query))
      );
    }

    // Sort by priority
    commands.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Limit results
    if (options?.limit) {
      commands = commands.slice(0, options.limit);
    }

    return commands;
  }

  /**
   * Get a specific command
   */
  getCommand(name: string): LoadedCommand | undefined {
    const resolved = this.registry.aliases.get(name) || name;
    return this.registry.commands.get(resolved);
  }

  /**
   * Get all commands
   */
  getAllCommands(): CommandManifest[] {
    return [...this.registry.commands.values()].map(c => c.manifest);
  }

  /**
   * Get commands by category
   */
  getByCategory(category: CommandCategory): CommandManifest[] {
    const names = this.registry.byCategory.get(category) || [];
    return names
      .map(n => this.registry.commands.get(n)?.manifest)
      .filter((m): m is CommandManifest => m !== undefined);
  }

  /**
   * Get commands by source
   */
  getBySource(source: CommandSource): CommandManifest[] {
    const names = this.registry.bySource.get(source) || [];
    return names
      .map(n => this.registry.commands.get(n)?.manifest)
      .filter((m): m is CommandManifest => m !== undefined);
  }

  /**
   * Check if a command exists
   */
  hasCommand(name: string): boolean {
    const resolved = this.registry.aliases.get(name) || name;
    return this.registry.commands.has(resolved);
  }

  /**
   * Get command count
   */
  getCommandCount(): number {
    return this.registry.commands.size;
  }

  /**
   * Unload custom commands (when changing working directory)
   */
  unloadCustomCommands(): void {
    const customNames = this.registry.bySource.get('custom') || [];
    for (const name of customNames) {
      this.registry.commands.delete(name);
    }
    this.registry.bySource.delete('custom');

    // Rebuild category index
    for (const [category, names] of this.registry.byCategory) {
      this.registry.byCategory.set(
        category,
        names.filter(n => this.registry.commands.has(n))
      );
    }

    // Clean up aliases
    for (const [alias, target] of this.registry.aliases) {
      if (!this.registry.commands.has(target)) {
        this.registry.aliases.delete(alias);
      }
    }
  }
}

/**
 * Create a CommandService instance
 */
export function createCommandService(appDataDir: string): CommandService {
  return new CommandService(appDataDir);
}
