/**
 * Command Store - Simple frontend-only store for slash commands
 *
 * Commands are pure prompt templates. This store manages:
 * - Command palette UI state (open/close, query, selection)
 * - Command lookup and filtering
 * - Prompt expansion
 *
 * NO backend calls, NO installation, NO execution - just UI state.
 */

import { create } from 'zustand';
import {
  BUILT_IN_COMMANDS,
  findCommandByAlias,
  expandCommandPrompt,
  parseCommandInput,
  type SlashCommand,
  type CommandCategory,
} from '../lib/commands';

// Re-export types for convenience
export type { SlashCommand, CommandCategory };
export { parseCommandInput, isCommandInput } from '../lib/commands';

// =============================================================================
// Store Types
// =============================================================================

interface CommandState {
  /** All available commands */
  commands: SlashCommand[];

  /** Whether command palette is open */
  isPaletteOpen: boolean;

  /** Current search query in palette */
  paletteQuery: string;

  /** Currently selected index in palette */
  selectedIndex: number;
}

interface CommandActions {
  /** Open the command palette */
  openPalette: () => void;

  /** Close the command palette */
  closePalette: () => void;

  /** Update palette search query */
  setPaletteQuery: (query: string) => void;

  /** Update selected index in palette */
  setSelectedIndex: (index: number) => void;

  /** Get commands filtered by current palette query */
  getFilteredCommands: () => SlashCommand[];

  /** Find command by name or alias */
  getCommandByAlias: (alias: string) => SlashCommand | undefined;

  /** Expand command prompt with user addition */
  expandCommand: (name: string, userAddition: string) => string | null;
}

// =============================================================================
// Store
// =============================================================================

export const useCommandStore = create<CommandState & CommandActions>()(
  (set, get) => ({
    // Initial state
    commands: BUILT_IN_COMMANDS,
    isPaletteOpen: false,
    paletteQuery: '',
    selectedIndex: 0,

    // Actions
    openPalette: () =>
      set({
        isPaletteOpen: true,
        paletteQuery: '',
        selectedIndex: 0,
      }),

    closePalette: () =>
      set({
        isPaletteOpen: false,
        paletteQuery: '',
        selectedIndex: 0,
      }),

    setPaletteQuery: (query) =>
      set({
        paletteQuery: query,
        selectedIndex: 0,
      }),

    setSelectedIndex: (index) =>
      set({
        selectedIndex: index,
      }),

    getFilteredCommands: () => {
      const { commands, paletteQuery } = get();
      const q = paletteQuery.toLowerCase();

      if (!q) {
        // Return all commands sorted by priority
        return [...commands].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      }

      // Filter and sort
      return commands
        .filter(
          (cmd) =>
            cmd.name.toLowerCase().includes(q) ||
            cmd.displayName.toLowerCase().includes(q) ||
            cmd.description.toLowerCase().includes(q) ||
            cmd.aliases.some((a) => a.toLowerCase().includes(q))
        )
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    },

    getCommandByAlias: (alias) => {
      return findCommandByAlias(alias);
    },

    expandCommand: (name, userAddition) => {
      const command = findCommandByAlias(name);
      if (!command) return null;
      return expandCommandPrompt(command, userAddition);
    },
  })
);

// =============================================================================
// Selector Hooks
// =============================================================================

export const useCommands = () => useCommandStore((state) => state.commands);
export const useIsPaletteOpen = () => useCommandStore((state) => state.isPaletteOpen);
export const usePaletteQuery = () => useCommandStore((state) => state.paletteQuery);
