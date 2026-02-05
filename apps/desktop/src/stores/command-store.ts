/**
 * Command Store - Manages slash commands state
 *
 * Handles:
 * - Loading commands from sidecar (built-in, marketplace, custom)
 * - Command execution
 * - UI state for command palette
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Command category
 */
export type CommandCategory = 'setup' | 'memory' | 'utility' | 'workflow' | 'custom';

/**
 * Command type determines execution behavior
 */
export type CommandType = 'system' | 'agent' | 'hybrid';

/**
 * Command source
 */
export type CommandSource = 'built-in' | 'marketplace' | 'custom';

/**
 * Command argument definition
 */
export interface CommandArgument {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required: boolean;
  default?: unknown;
  description?: string;
  options?: { value: string; label: string }[];
}

/**
 * Command definition
 */
export interface Command {
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
  source: CommandSource;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  artifacts?: Array<{
    type: 'file' | 'message' | 'action';
    path?: string;
    content?: string;
    action?: string;
  }>;
  actions?: Array<{
    type: 'open_file' | 'refresh_session' | 'show_modal' | 'navigate';
    payload: unknown;
  }>;
}

interface CommandStoreState {
  // Command data
  commands: Command[];

  // UI state
  isLoading: boolean;
  isExecuting: Set<string>;

  // Command palette state
  isPaletteOpen: boolean;
  paletteQuery: string;
  selectedIndex: number;

  // Selected command for argument input
  selectedCommand: Command | null;

  // Error state
  error: string | null;

  // Last execution result
  lastResult: CommandResult | null;
}

interface CommandStoreActions {
  // Loading
  loadCommands: (workingDirectory?: string) => Promise<void>;

  // Execution
  executeCommand: (
    name: string,
    args: Record<string, unknown>,
    workingDirectory?: string
  ) => Promise<CommandResult>;

  // UI Actions
  openPalette: () => void;
  closePalette: () => void;
  setPaletteQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  selectCommand: (command: Command | null) => void;

  // Selectors
  getFilteredCommands: () => Command[];
  getCommandByName: (name: string) => Command | undefined;
  getCommandByAlias: (alias: string) => Command | undefined;
  getCommandsByCategory: (category: CommandCategory) => Command[];

  // Utilities
  clearError: () => void;
  clearLastResult: () => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: CommandStoreState = {
  commands: [],
  isLoading: false,
  isExecuting: new Set(),
  isPaletteOpen: false,
  paletteQuery: '',
  selectedIndex: 0,
  selectedCommand: null,
  error: null,
  lastResult: null,
};

// ============================================================================
// Store
// ============================================================================

export const useCommandStore = create<CommandStoreState & CommandStoreActions>()(
  (set, get) => ({
    ...initialState,

    // ========================================================================
    // Loading
    // ========================================================================

    loadCommands: async (workingDirectory) => {
      set({ isLoading: true, error: null });

      try {
        const commands = await invoke<Command[]>('deep_command_list', {
          workingDirectory,
        });

        // Sort by priority (higher first) then by name
        const sortedCommands = commands.sort((a: Command, b: Command) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return a.displayName.localeCompare(b.displayName);
        });

        set({ commands: sortedCommands, isLoading: false });
      } catch (error) {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    // ========================================================================
    // Execution
    // ========================================================================

    executeCommand: async (name, args, workingDirectory) => {
      set((state) => ({
        isExecuting: new Set([...state.isExecuting, name]),
        error: null,
      }));

      try {
        const result = await invoke<CommandResult>('deep_command_execute', {
          name,
          args,
          workingDirectory,
        });

        set({ lastResult: result });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set({
          error: errorMessage,
          lastResult: {
            success: false,
            message: errorMessage,
          },
        });
        return { success: false, message: errorMessage };
      } finally {
        set((state) => {
          const newExecuting = new Set(state.isExecuting);
          newExecuting.delete(name);
          return { isExecuting: newExecuting };
        });
      }
    },

    // ========================================================================
    // UI Actions
    // ========================================================================

    openPalette: () => {
      set({
        isPaletteOpen: true,
        paletteQuery: '',
        selectedIndex: 0,
        selectedCommand: null,
      });
    },

    closePalette: () => {
      set({
        isPaletteOpen: false,
        paletteQuery: '',
        selectedIndex: 0,
        selectedCommand: null,
      });
    },

    setPaletteQuery: (query) => {
      set({ paletteQuery: query, selectedIndex: 0 });
    },

    setSelectedIndex: (index) => {
      set({ selectedIndex: index });
    },

    selectCommand: (command) => {
      set({ selectedCommand: command });
    },

    // ========================================================================
    // Selectors
    // ========================================================================

    getFilteredCommands: () => {
      const { commands, paletteQuery } = get();

      if (!paletteQuery.trim()) {
        // Return only auto-suggest commands when no query
        return commands.filter((cmd) => cmd.autoSuggest);
      }

      const query = paletteQuery.toLowerCase().replace(/^\//, '');

      return commands.filter((cmd) => {
        // Match against name
        if (cmd.name.toLowerCase().includes(query)) return true;

        // Match against display name
        if (cmd.displayName.toLowerCase().includes(query)) return true;

        // Match against aliases
        if (cmd.aliases.some((alias) => alias.toLowerCase().includes(query))) return true;

        // Match against description
        if (cmd.description.toLowerCase().includes(query)) return true;

        return false;
      });
    },

    getCommandByName: (name) => {
      const { commands } = get();
      return commands.find((cmd) => cmd.name === name);
    },

    getCommandByAlias: (alias) => {
      const { commands } = get();
      const lowerAlias = alias.toLowerCase();
      return commands.find(
        (cmd) =>
          cmd.name.toLowerCase() === lowerAlias ||
          cmd.aliases.some((a) => a.toLowerCase() === lowerAlias)
      );
    },

    getCommandsByCategory: (category) => {
      const { commands } = get();
      return commands.filter((cmd) => cmd.category === category);
    },

    // ========================================================================
    // Utilities
    // ========================================================================

    clearError: () => {
      set({ error: null });
    },

    clearLastResult: () => {
      set({ lastResult: null });
    },

    reset: () => {
      set(initialState);
    },
  })
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const useCommands = () => useCommandStore((state) => state.commands);
export const useIsLoadingCommands = () => useCommandStore((state) => state.isLoading);
export const useIsExecutingCommand = (name: string) =>
  useCommandStore((state) => state.isExecuting.has(name));
export const useIsPaletteOpen = () => useCommandStore((state) => state.isPaletteOpen);
export const usePaletteQuery = () => useCommandStore((state) => state.paletteQuery);
export const useSelectedCommand = () => useCommandStore((state) => state.selectedCommand);
export const useCommandError = () => useCommandStore((state) => state.error);
export const useLastCommandResult = () => useCommandStore((state) => state.lastResult);

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse command from input string
 * Returns { command, args } or null if not a valid command
 */
export function parseCommandInput(input: string): {
  command: string;
  args: string[];
} | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  if (!command) return null;

  return { command, args };
}

/**
 * Check if input is a command
 */
export function isCommandInput(input: string): boolean {
  return input.trim().startsWith('/');
}
