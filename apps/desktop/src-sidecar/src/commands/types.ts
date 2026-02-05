/**
 * Command System Types
 *
 * Custom slash commands framework (Built-in + Marketplace + Custom)
 */

import type { MemoryService } from '../memory/memory-service.js';
import type { AgentsMdService } from '../agents-md/agents-md-service.js';

/**
 * Command manifest stored in command.json
 */
export interface CommandManifest {
  /** Unique identifier (e.g., "init") */
  name: string;

  /** Human-readable name */
  displayName: string;

  /** Short description for auto-suggest */
  description: string;

  /** Semver version */
  version: string;

  /** Author name or email */
  author?: string;

  /** Alternative names (e.g., ["initialize", "setup"]) */
  aliases?: string[];

  /** Command category */
  category: CommandCategory;

  /** Icon name for UI */
  icon?: string;

  /** Command arguments */
  arguments?: CommandArgument[];

  /** Execution type */
  type: CommandType;

  /** Requires active agent session */
  requiresSession?: boolean;

  /** Requires working directory */
  requiresWorkingDir?: boolean;

  /** Show in auto-complete */
  autoSuggest: boolean;

  /** Sort order (higher = first) */
  priority?: number;

  /** Command source */
  source?: CommandSource;

  /** Repository URL (marketplace) */
  repository?: string;

  /** Homepage URL (marketplace) */
  homepage?: string;

  /** Search keywords (marketplace) */
  keywords?: string[];
}

/**
 * Command categories
 */
export type CommandCategory =
  | 'setup'
  | 'memory'
  | 'utility'
  | 'workflow'
  | 'custom';

/**
 * Command sources
 */
export type CommandSource =
  | 'built-in'
  | 'marketplace'
  | 'custom';

/**
 * Command execution types
 */
export type CommandType =
  /** Handled by system without agent */
  | 'system'
  /** Forwarded to agent as prompt */
  | 'agent'
  /** Combination of system + agent */
  | 'hybrid';

/**
 * Command argument definition
 */
export interface CommandArgument {
  /** Argument name */
  name: string;

  /** Argument type */
  type: 'string' | 'number' | 'boolean' | 'select' | 'path';

  /** Is required */
  required: boolean;

  /** Default value */
  default?: unknown;

  /** Description for help */
  description?: string;

  /** Options for select type */
  options?: CommandSelectOption[];

  /** Validation pattern (for string) */
  pattern?: string;

  /** Minimum value (for number) */
  min?: number;

  /** Maximum value (for number) */
  max?: number;
}

/**
 * Select option
 */
export interface CommandSelectOption {
  /** Option value */
  value: string;

  /** Display label */
  label: string;
}

/**
 * Context passed to command handler
 */
export interface CommandContext {
  /** Active session ID (if any) */
  sessionId?: string;

  /** Working directory */
  workingDirectory: string;

  /** App data directory */
  appDataDir: string;

  /** Parsed arguments */
  args: Record<string, unknown>;

  /** Raw input string */
  rawInput: string;

  /** Memory service instance */
  memoryService: MemoryService;

  /** AGENTS.md service instance */
  agentsMdService: AgentsMdService;

  /** Emit event to frontend */
  emit: (event: string, data: unknown) => void;

  /** Log message */
  log: (message: string, level?: 'info' | 'warn' | 'error') => void;

  /** Get user input (interactive) */
  prompt?: (question: string, options?: PromptOptions) => Promise<string>;
}

/**
 * Prompt options for interactive commands
 */
export interface PromptOptions {
  /** Input type */
  type?: 'text' | 'confirm' | 'select';

  /** Select options */
  choices?: string[];

  /** Default value */
  default?: string;

  /** Validation function */
  validate?: (input: string) => boolean | string;
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Execution succeeded */
  success: boolean;

  /** Display message to user */
  message?: string;

  /** Structured data */
  data?: unknown;

  /** Created files/outputs */
  artifacts?: CommandArtifact[];

  /** Follow-up actions */
  actions?: CommandAction[];

  /** Error details (if failed) */
  error?: CommandError;
}

/**
 * Command artifact
 */
export interface CommandArtifact {
  /** Artifact type */
  type: 'file' | 'directory' | 'memory' | 'output';

  /** Path or identifier */
  path: string;

  /** Description */
  description?: string;
}

/**
 * Command follow-up action
 */
export interface CommandAction {
  /** Action type */
  type: CommandActionType;

  /** Action payload */
  payload: unknown;
}

/**
 * Action types
 */
export type CommandActionType =
  | 'open_file'
  | 'refresh_session'
  | 'show_modal'
  | 'navigate'
  | 'send_message'
  | 'clear_chat';

/**
 * Command error
 */
export interface CommandError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Stack trace (development only) */
  stack?: string;

  /** Suggestion for fixing */
  suggestion?: string;
}

/**
 * Command handler function
 */
export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult>;

/**
 * Loaded command (manifest + handler)
 */
export interface LoadedCommand {
  /** Command manifest */
  manifest: CommandManifest;

  /** Handler function */
  handler: CommandHandler;

  /** Load path (for debugging) */
  loadPath: string;
}

/**
 * Command registry state
 */
export interface CommandRegistry {
  /** All registered commands */
  commands: Map<string, LoadedCommand>;

  /** Alias to command name mapping */
  aliases: Map<string, string>;

  /** Commands by category */
  byCategory: Map<CommandCategory, string[]>;

  /** Commands by source */
  bySource: Map<CommandSource, string[]>;
}

/**
 * Command search options
 */
export interface CommandSearchOptions {
  /** Search query */
  query?: string;

  /** Filter by category */
  category?: CommandCategory;

  /** Filter by source */
  source?: CommandSource;

  /** Only auto-suggest commands */
  autoSuggestOnly?: boolean;

  /** Maximum results */
  limit?: number;
}

/**
 * Command execution options
 */
export interface CommandExecutionOptions {
  /** Session ID to use */
  sessionId?: string;

  /** Working directory override */
  workingDirectory?: string;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Silent mode (no output) */
  silent?: boolean;
}

/**
 * Marketplace command info
 */
export interface MarketplaceCommand {
  /** Unique identifier */
  id: string;

  /** Command manifest */
  manifest: CommandManifest;

  /** Download URL */
  downloadUrl: string;

  /** SHA256 checksum */
  checksum: string;

  /** Download count */
  downloads: number;

  /** Rating (0-5) */
  rating: number;

  /** Verified by marketplace */
  verified: boolean;

  /** Published date */
  publishedAt: string;

  /** Last updated */
  updatedAt: string;
}

/**
 * Installed command record
 */
export interface InstalledCommand {
  /** Command name */
  name: string;

  /** Version installed */
  version: string;

  /** Install date */
  installedAt: string;

  /** Install path */
  installPath: string;

  /** Source */
  source: 'marketplace' | 'custom';

  /** Auto-update enabled */
  autoUpdate: boolean;
}

/**
 * Command registry file
 */
export interface CommandRegistryFile {
  /** Schema version */
  version: string;

  /** Installed commands */
  installed: InstalledCommand[];

  /** Last updated */
  updatedAt: string;
}

/**
 * Built-in command names
 */
export const BUILT_IN_COMMANDS = [
  'init',
  'help',
  'clear',
  'memory',
] as const;

export type BuiltInCommandName = typeof BUILT_IN_COMMANDS[number];

/**
 * Command categories with display names
 */
export const COMMAND_CATEGORIES: Record<CommandCategory, { name: string; icon: string }> = {
  setup: { name: 'Setup', icon: 'settings' },
  memory: { name: 'Memory', icon: 'brain' },
  utility: { name: 'Utility', icon: 'wrench' },
  workflow: { name: 'Workflow', icon: 'git-branch' },
  custom: { name: 'Custom', icon: 'code' },
};
