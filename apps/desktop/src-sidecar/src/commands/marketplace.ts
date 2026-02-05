/**
 * CommandMarketplace - Marketplace Integration for Slash Commands
 *
 * Handles:
 * - Browsing available commands from registry
 * - Installing commands from marketplace or URLs
 * - Uninstalling installed commands
 * - Updating installed commands
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import type { CommandManifest, CommandCategory } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Marketplace command listing
 */
export interface MarketplaceCommand {
  id: string;
  manifest: CommandManifest;
  downloadUrl: string;
  checksum: string;
  downloads: number;
  rating: number;
  verified: boolean;
  author: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Installed command metadata
 */
export interface InstalledCommand {
  id: string;
  manifest: CommandManifest;
  installedAt: string;
  updatedAt: string;
  source: 'marketplace' | 'url' | 'local';
  sourceUrl?: string;
  version: string;
}

/**
 * Marketplace registry index
 */
export interface MarketplaceRegistry {
  version: string;
  lastUpdated: string;
  commands: MarketplaceCommand[];
}

/**
 * Installation result
 */
export interface InstallResult {
  success: boolean;
  commandId: string;
  message: string;
  installedCommand?: InstalledCommand;
}

/**
 * Marketplace search options
 */
export interface MarketplaceSearchOptions {
  query?: string;
  category?: CommandCategory;
  tags?: string[];
  verified?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Mock Registry Data (for demonstration)
// ============================================================================

const MOCK_REGISTRY: MarketplaceRegistry = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  commands: [
    {
      id: 'git-commit-ai',
      manifest: {
        name: 'commit',
        displayName: 'AI Commit',
        description: 'Generate intelligent commit messages using AI analysis of your changes',
        version: '1.0.0',
        author: 'Cowork Team',
        aliases: ['cm', 'commit-ai'],
        category: 'workflow',
        icon: 'git-commit',
        arguments: [
          {
            name: 'type',
            type: 'select',
            required: false,
            description: 'Commit type',
            options: [
              { value: 'feat', label: 'Feature' },
              { value: 'fix', label: 'Bug Fix' },
              { value: 'docs', label: 'Documentation' },
              { value: 'refactor', label: 'Refactor' },
            ],
          },
        ],
        type: 'agent',
        requiresSession: true,
        requiresWorkingDir: true,
        autoSuggest: true,
        priority: 80,
      },
      downloadUrl: 'https://marketplace.cowork.dev/commands/git-commit-ai/1.0.0.tar.gz',
      checksum: 'sha256:abc123...',
      downloads: 1250,
      rating: 4.8,
      verified: true,
      author: 'Cowork Team',
      description: 'Generate intelligent commit messages using AI analysis of your changes',
      tags: ['git', 'ai', 'productivity'],
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
    },
    {
      id: 'code-review',
      manifest: {
        name: 'review',
        displayName: 'Code Review',
        description: 'Perform AI-powered code review on staged changes or specific files',
        version: '1.2.0',
        author: 'Cowork Team',
        aliases: ['cr', 'code-review'],
        category: 'workflow',
        icon: 'search-code',
        arguments: [
          {
            name: 'path',
            type: 'string',
            required: false,
            description: 'File or directory to review',
          },
          {
            name: 'focus',
            type: 'select',
            required: false,
            description: 'Review focus area',
            options: [
              { value: 'security', label: 'Security' },
              { value: 'performance', label: 'Performance' },
              { value: 'style', label: 'Code Style' },
              { value: 'all', label: 'All Areas' },
            ],
          },
        ],
        type: 'agent',
        requiresSession: true,
        requiresWorkingDir: true,
        autoSuggest: true,
        priority: 75,
      },
      downloadUrl: 'https://marketplace.cowork.dev/commands/code-review/1.2.0.tar.gz',
      checksum: 'sha256:def456...',
      downloads: 890,
      rating: 4.6,
      verified: true,
      author: 'Cowork Team',
      description: 'Perform AI-powered code review on staged changes or specific files',
      tags: ['code-review', 'ai', 'quality'],
      createdAt: '2024-02-01T00:00:00Z',
      updatedAt: '2024-05-15T00:00:00Z',
    },
    {
      id: 'doc-generator',
      manifest: {
        name: 'docs',
        displayName: 'Doc Generator',
        description: 'Generate documentation for your code, APIs, or entire projects',
        version: '2.0.0',
        author: 'Community',
        aliases: ['doc', 'generate-docs'],
        category: 'utility',
        icon: 'file-text',
        arguments: [
          {
            name: 'type',
            type: 'select',
            required: true,
            description: 'Documentation type',
            options: [
              { value: 'readme', label: 'README' },
              { value: 'api', label: 'API Docs' },
              { value: 'jsdoc', label: 'JSDoc' },
              { value: 'changelog', label: 'Changelog' },
            ],
          },
        ],
        type: 'agent',
        requiresSession: true,
        requiresWorkingDir: true,
        autoSuggest: true,
        priority: 70,
      },
      downloadUrl: 'https://marketplace.cowork.dev/commands/doc-generator/2.0.0.tar.gz',
      checksum: 'sha256:ghi789...',
      downloads: 567,
      rating: 4.4,
      verified: false,
      author: 'Community',
      description: 'Generate documentation for your code, APIs, or entire projects',
      tags: ['documentation', 'ai', 'productivity'],
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-04-20T00:00:00Z',
    },
    {
      id: 'test-generator',
      manifest: {
        name: 'test',
        displayName: 'Test Generator',
        description: 'Generate unit tests for your code using AI',
        version: '1.1.0',
        author: 'Cowork Team',
        aliases: ['gen-test', 'create-test'],
        category: 'workflow',
        icon: 'flask',
        arguments: [
          {
            name: 'file',
            type: 'string',
            required: true,
            description: 'File to generate tests for',
          },
          {
            name: 'framework',
            type: 'select',
            required: false,
            description: 'Test framework',
            options: [
              { value: 'jest', label: 'Jest' },
              { value: 'vitest', label: 'Vitest' },
              { value: 'mocha', label: 'Mocha' },
              { value: 'pytest', label: 'Pytest' },
            ],
          },
        ],
        type: 'agent',
        requiresSession: true,
        requiresWorkingDir: true,
        autoSuggest: true,
        priority: 72,
      },
      downloadUrl: 'https://marketplace.cowork.dev/commands/test-generator/1.1.0.tar.gz',
      checksum: 'sha256:jkl012...',
      downloads: 423,
      rating: 4.5,
      verified: true,
      author: 'Cowork Team',
      description: 'Generate unit tests for your code using AI',
      tags: ['testing', 'ai', 'automation'],
      createdAt: '2024-02-15T00:00:00Z',
      updatedAt: '2024-05-01T00:00:00Z',
    },
  ],
};

// ============================================================================
// CommandMarketplace Class
// ============================================================================

export class CommandMarketplace {
  private marketplaceDir: string;
  private installedIndexPath: string;
  private installedCommands: Map<string, InstalledCommand> = new Map();
  private initialized = false;

  constructor(appDataDir: string) {
    this.marketplaceDir = join(appDataDir, 'marketplace');
    this.installedIndexPath = join(this.marketplaceDir, 'installed.json');
  }

  /**
   * Initialize the marketplace
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure marketplace directory exists
    if (!existsSync(this.marketplaceDir)) {
      mkdirSync(this.marketplaceDir, { recursive: true });
    }

    // Load installed commands index
    await this.loadInstalledIndex();
    this.initialized = true;
  }

  /**
   * Load the installed commands index
   */
  private async loadInstalledIndex(): Promise<void> {
    if (existsSync(this.installedIndexPath)) {
      try {
        const data = readFileSync(this.installedIndexPath, 'utf-8');
        const index = JSON.parse(data) as { commands: InstalledCommand[] };
        this.installedCommands.clear();
        for (const cmd of index.commands) {
          this.installedCommands.set(cmd.id, cmd);
        }
      } catch (error) {
        console.error('[Marketplace] Failed to load installed index:', error);
        this.installedCommands.clear();
      }
    }
  }

  /**
   * Save the installed commands index
   */
  private async saveInstalledIndex(): Promise<void> {
    const index = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      commands: Array.from(this.installedCommands.values()),
    };
    writeFileSync(this.installedIndexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Search the marketplace
   */
  async search(options: MarketplaceSearchOptions = {}): Promise<MarketplaceCommand[]> {
    await this.initialize();

    let results = [...MOCK_REGISTRY.commands];

    // Filter by query
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (cmd) =>
          cmd.manifest.name.toLowerCase().includes(query) ||
          cmd.manifest.displayName.toLowerCase().includes(query) ||
          cmd.description.toLowerCase().includes(query) ||
          cmd.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Filter by category
    if (options.category) {
      results = results.filter((cmd) => cmd.manifest.category === options.category);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter((cmd) =>
        options.tags!.some((tag) => cmd.tags.includes(tag))
      );
    }

    // Filter by verified status
    if (options.verified !== undefined) {
      results = results.filter((cmd) => cmd.verified === options.verified);
    }

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Get a specific command from the marketplace
   */
  async getCommand(commandId: string): Promise<MarketplaceCommand | null> {
    await this.initialize();
    return MOCK_REGISTRY.commands.find((cmd) => cmd.id === commandId) || null;
  }

  /**
   * Install a command from the marketplace
   */
  async install(commandId: string): Promise<InstallResult> {
    await this.initialize();

    // Check if already installed
    if (this.installedCommands.has(commandId)) {
      return {
        success: false,
        commandId,
        message: `Command "${commandId}" is already installed`,
      };
    }

    // Find command in registry
    const marketplaceCmd = MOCK_REGISTRY.commands.find((cmd) => cmd.id === commandId);
    if (!marketplaceCmd) {
      return {
        success: false,
        commandId,
        message: `Command "${commandId}" not found in marketplace`,
      };
    }

    // Create command directory
    const commandDir = join(this.marketplaceDir, 'installed', commandId);
    if (!existsSync(commandDir)) {
      mkdirSync(commandDir, { recursive: true });
    }

    // Write manifest
    const manifestPath = join(commandDir, 'command.json');
    writeFileSync(manifestPath, JSON.stringify(marketplaceCmd.manifest, null, 2));

    // Create a placeholder handler (in real implementation, would download from URL)
    const handlerPath = join(commandDir, 'handler.ts');
    const handlerContent = `/**
 * ${marketplaceCmd.manifest.displayName} Command Handler
 *
 * This is a marketplace-installed command.
 * ID: ${commandId}
 * Version: ${marketplaceCmd.manifest.version}
 */

import type { CommandHandler, CommandResult } from '../../types.js';

export const handler: CommandHandler = async (ctx): Promise<CommandResult> => {
  // This command requires an active agent session
  return {
    success: true,
    message: \`/${marketplaceCmd.manifest.name} command executed. This is a marketplace command that integrates with the AI agent.\`,
    data: {
      commandId: '${commandId}',
      version: '${marketplaceCmd.manifest.version}',
      description: '${marketplaceCmd.description}',
    },
  };
};

export default handler;
`;
    writeFileSync(handlerPath, handlerContent);

    // Add to installed index
    const installedCmd: InstalledCommand = {
      id: commandId,
      manifest: marketplaceCmd.manifest,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'marketplace',
      sourceUrl: marketplaceCmd.downloadUrl,
      version: marketplaceCmd.manifest.version,
    };
    this.installedCommands.set(commandId, installedCmd);
    await this.saveInstalledIndex();

    return {
      success: true,
      commandId,
      message: `Successfully installed "${marketplaceCmd.manifest.displayName}" v${marketplaceCmd.manifest.version}`,
      installedCommand: installedCmd,
    };
  }

  /**
   * Uninstall a command
   */
  async uninstall(commandId: string): Promise<InstallResult> {
    await this.initialize();

    // Check if installed
    if (!this.installedCommands.has(commandId)) {
      return {
        success: false,
        commandId,
        message: `Command "${commandId}" is not installed`,
      };
    }

    const installedCmd = this.installedCommands.get(commandId)!;

    // Remove command directory
    const commandDir = join(this.marketplaceDir, 'installed', commandId);
    if (existsSync(commandDir)) {
      rmSync(commandDir, { recursive: true, force: true });
    }

    // Remove from installed index
    this.installedCommands.delete(commandId);
    await this.saveInstalledIndex();

    return {
      success: true,
      commandId,
      message: `Successfully uninstalled "${installedCmd.manifest.displayName}"`,
    };
  }

  /**
   * Update an installed command
   */
  async update(commandId: string): Promise<InstallResult> {
    await this.initialize();

    // Check if installed
    if (!this.installedCommands.has(commandId)) {
      return {
        success: false,
        commandId,
        message: `Command "${commandId}" is not installed`,
      };
    }

    const installedCmd = this.installedCommands.get(commandId)!;

    // Find command in registry
    const marketplaceCmd = MOCK_REGISTRY.commands.find((cmd) => cmd.id === commandId);
    if (!marketplaceCmd) {
      return {
        success: false,
        commandId,
        message: `Command "${commandId}" not found in marketplace`,
      };
    }

    // Check if update is available
    if (installedCmd.version === marketplaceCmd.manifest.version) {
      return {
        success: true,
        commandId,
        message: `Command "${installedCmd.manifest.displayName}" is already up to date (v${installedCmd.version})`,
        installedCommand: installedCmd,
      };
    }

    // Uninstall and reinstall
    await this.uninstall(commandId);
    return this.install(commandId);
  }

  /**
   * List installed commands
   */
  async listInstalled(): Promise<InstalledCommand[]> {
    await this.initialize();
    return Array.from(this.installedCommands.values());
  }

  /**
   * Check if a command is installed
   */
  async isInstalled(commandId: string): Promise<boolean> {
    await this.initialize();
    return this.installedCommands.has(commandId);
  }

  /**
   * Get installed command info
   */
  async getInstalled(commandId: string): Promise<InstalledCommand | null> {
    await this.initialize();
    return this.installedCommands.get(commandId) || null;
  }

  /**
   * Check for updates for all installed commands
   */
  async checkForUpdates(): Promise<Array<{ commandId: string; currentVersion: string; latestVersion: string }>> {
    await this.initialize();

    const updates: Array<{ commandId: string; currentVersion: string; latestVersion: string }> = [];

    for (const [commandId, installed] of this.installedCommands) {
      const marketplaceCmd = MOCK_REGISTRY.commands.find((cmd) => cmd.id === commandId);
      if (marketplaceCmd && marketplaceCmd.manifest.version !== installed.version) {
        updates.push({
          commandId,
          currentVersion: installed.version,
          latestVersion: marketplaceCmd.manifest.version,
        });
      }
    }

    return updates;
  }

  /**
   * Get marketplace directory path
   */
  getMarketplaceDir(): string {
    return this.marketplaceDir;
  }

  /**
   * Get installed commands directory path
   */
  getInstalledDir(): string {
    return join(this.marketplaceDir, 'installed');
  }
}

/**
 * Create a new CommandMarketplace instance
 */
export function createCommandMarketplace(appDataDir: string): CommandMarketplace {
  return new CommandMarketplace(appDataDir);
}
