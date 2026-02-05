/**
 * Command Store - Marketplace-style command management
 *
 * Commands are prompt templates that expand when invoked. This store manages:
 * - Discovery of available commands (bundled and managed)
 * - Installation/uninstallation of commands
 * - Creation of custom commands
 * - Command palette UI state
 * - Prompt expansion for sending as normal messages
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './settings-store';
import type { InstalledCommandConfig } from './settings-store';

// =============================================================================
// Types
// =============================================================================

export type CommandCategory = 'setup' | 'memory' | 'utility' | 'workflow' | 'custom';

export interface CommandSource {
  type: 'bundled' | 'managed';
  path: string;
  priority: number;
}

export interface CommandMetadata {
  author?: string;
  version?: string;
  emoji?: string;
}

export interface CommandFrontmatter {
  name: string;
  displayName: string;
  description: string;
  aliases?: string[];
  category: CommandCategory;
  icon?: string;
  priority?: number;
  action?: 'clear_chat';
  metadata?: CommandMetadata;
}

export interface CommandManifest {
  id: string;
  source: CommandSource;
  frontmatter: CommandFrontmatter;
  commandPath: string;
  prompt: string | null;
}

// Legacy type for compatibility
export interface SlashCommand {
  name: string;
  displayName: string;
  description: string;
  aliases: string[];
  category: CommandCategory;
  icon?: string;
  prompt: string | null;
  action?: 'clear_chat';
  priority?: number;
}

interface CreateCommandParams {
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

// =============================================================================
// Store State
// =============================================================================

interface CommandState {
  // Available commands from all sources
  availableCommands: CommandManifest[];

  // UI State
  isDiscovering: boolean;
  isInstalling: Set<string>;

  // Filters
  searchQuery: string;
  selectedCategory: CommandCategory | 'all';
  activeTab: 'available' | 'installed';

  // Selected command for details panel
  selectedCommandId: string | null;

  // Palette state (for inline command selection in chat)
  isPaletteOpen: boolean;
  paletteQuery: string;
  selectedIndex: number;

  // Error state
  error: string | null;
}

interface CommandActions {
  // Discovery
  discoverCommands: () => Promise<void>;

  // Installation
  installCommand: (commandId: string) => Promise<void>;
  uninstallCommand: (commandId: string) => Promise<void>;

  // Creation
  createCommand: (params: CreateCommandParams) => Promise<string>;

  // UI Actions
  setSearchQuery: (query: string) => void;
  setCategory: (category: CommandCategory | 'all') => void;
  setActiveTab: (tab: 'available' | 'installed') => void;
  selectCommand: (commandId: string | null) => void;

  // Palette actions
  openPalette: () => void;
  closePalette: () => void;
  setPaletteQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;

  // Selectors (computed)
  getFilteredCommands: () => CommandManifest[];
  getInstalledCommands: () => CommandManifest[];
  getInstalledCount: () => number;
  isCommandInstalled: (commandId: string) => boolean;
  getCommandByAlias: (alias: string) => CommandManifest | undefined;
  expandCommand: (name: string, userAddition: string) => string | null;
  getPaletteCommands: () => SlashCommand[];

  // Legacy support
  commands: SlashCommand[];

  clearError: () => void;
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: CommandState = {
  availableCommands: [],
  isDiscovering: false,
  isInstalling: new Set(),
  searchQuery: '',
  selectedCategory: 'all',
  activeTab: 'available',
  selectedCommandId: null,
  isPaletteOpen: false,
  paletteQuery: '',
  selectedIndex: 0,
  error: null,
};

// =============================================================================
// Store
// =============================================================================

export const useCommandStore = create<CommandState & CommandActions>()(
  (set, get) => ({
    ...initialState,

    // Legacy computed property for backwards compatibility
    get commands(): SlashCommand[] {
      const { availableCommands } = get();
      const { installedCommandConfigs } = useSettingsStore.getState();
      const installedNames = new Set(installedCommandConfigs.map((c) => c.name));

      // Build a map of commands, preferring managed over bundled
      const commandMap = new Map<string, typeof availableCommands[0]>();

      for (const cmd of availableCommands) {
        // Only include commands that are tracked in installedCommandConfigs
        if (!installedNames.has(cmd.frontmatter.name)) continue;

        const existing = commandMap.get(cmd.frontmatter.name);
        // Prefer managed over bundled
        if (!existing || cmd.source.type === 'managed') {
          commandMap.set(cmd.frontmatter.name, cmd);
        }
      }

      // Convert to SlashCommand format
      return Array.from(commandMap.values())
        .map((cmd) => ({
          name: cmd.frontmatter.name,
          displayName: cmd.frontmatter.displayName,
          description: cmd.frontmatter.description,
          aliases: cmd.frontmatter.aliases || [],
          category: cmd.frontmatter.category,
          icon: cmd.frontmatter.icon,
          prompt: cmd.prompt,
          action: cmd.frontmatter.action,
          priority: cmd.frontmatter.priority,
        }))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    },

    // ========================================================================
    // Discovery
    // ========================================================================

    discoverCommands: async () => {
      set({ isDiscovering: true, error: null });

      try {
        const commands = await invoke<CommandManifest[]>('deep_command_list');
        set({ availableCommands: commands, isDiscovering: false });

        // Sync installed configs with actual managed commands
        const managedCommandNames = new Set(
          commands
            .filter((c) => c.source.type === 'managed')
            .map((c) => c.frontmatter.name)
        );
        const { installedCommandConfigs, removeInstalledCommandConfig } = useSettingsStore.getState();
        for (const config of installedCommandConfigs) {
          if (!managedCommandNames.has(config.name)) {
            removeInstalledCommandConfig(config.id);
          }
        }
      } catch (error) {
        set({
          isDiscovering: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    // ========================================================================
    // Installation
    // ========================================================================

    installCommand: async (commandId) => {
      set((state) => ({
        isInstalling: new Set([...state.isInstalling, commandId]),
        error: null,
      }));

      try {
        await invoke('deep_command_install', { commandId });

        // Find the command manifest
        const command = get().availableCommands.find((c) => c.id === commandId);
        if (command) {
          // After install, the command becomes managed with a new ID
          const managedCommandId = `managed:${command.frontmatter.name}`;

          // Add to installed configs in settings store
          const config: InstalledCommandConfig = {
            id: managedCommandId,
            name: command.frontmatter.name,
            installedAt: Date.now(),
            source: 'managed',
          };
          useSettingsStore.getState().addInstalledCommandConfig(config);
        }

        // Re-discover to update command list
        await get().discoverCommands();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set((state) => {
          const newInstalling = new Set(state.isInstalling);
          newInstalling.delete(commandId);
          return { isInstalling: newInstalling };
        });
      }
    },

    uninstallCommand: async (commandId) => {
      const { availableCommands } = get();

      // Find the command to get its name
      const command = availableCommands.find((c) => c.id === commandId);
      if (!command) {
        set({ error: `Command not found: ${commandId}` });
        return;
      }

      // Find the managed version of this command (for uninstall)
      const managedCommandId = `managed:${command.frontmatter.name}`;
      const managedCommand = availableCommands.find((c) => c.id === managedCommandId);

      set((state) => ({
        isInstalling: new Set([...state.isInstalling, commandId]),
        error: null,
      }));

      try {
        // Only call backend if managed command exists on disk
        if (managedCommand) {
          await invoke('deep_command_uninstall', { commandId: managedCommandId });
        }

        // Always clean up configs
        const settingsStore = useSettingsStore.getState();
        settingsStore.removeInstalledCommandConfig(commandId);
        settingsStore.removeInstalledCommandConfig(managedCommandId);

        // Close the details panel
        set({ selectedCommandId: null });

        // Re-discover to update command list
        await get().discoverCommands();
      } catch (error) {
        // Even if backend fails, try to clean up the config
        const settingsStore = useSettingsStore.getState();
        settingsStore.removeInstalledCommandConfig(commandId);
        settingsStore.removeInstalledCommandConfig(managedCommandId);

        set({
          error: error instanceof Error ? error.message : String(error),
        });

        // Re-discover to sync state
        await get().discoverCommands();
      } finally {
        set((state) => {
          const newInstalling = new Set(state.isInstalling);
          newInstalling.delete(commandId);
          return { isInstalling: newInstalling };
        });
      }
    },

    // ========================================================================
    // Creation
    // ========================================================================

    createCommand: async (params) => {
      set({ error: null });

      try {
        const commandId = await invoke<string>('deep_command_create', {
          input: {
            name: params.name,
            display_name: params.displayName,
            description: params.description,
            aliases: params.aliases,
            category: params.category,
            icon: params.icon,
            priority: params.priority,
            content: params.content,
            emoji: params.emoji,
          },
        });

        // Auto-install the created command by adding to settings
        const config: InstalledCommandConfig = {
          id: commandId,
          name: params.name,
          installedAt: Date.now(),
          source: 'managed',
        };
        useSettingsStore.getState().addInstalledCommandConfig(config);

        // Refresh command list to include the new command
        await get().discoverCommands();

        return commandId;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set({ error: errorMessage });
        throw error;
      }
    },

    // ========================================================================
    // UI Actions
    // ========================================================================

    setSearchQuery: (query) => {
      set({ searchQuery: query });
    },

    setCategory: (category) => {
      set({ selectedCategory: category });
    },

    setActiveTab: (tab) => {
      set({ activeTab: tab });
    },

    selectCommand: (commandId) => {
      set({ selectedCommandId: commandId });
    },

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

    // ========================================================================
    // Selectors
    // ========================================================================

    getFilteredCommands: () => {
      const { availableCommands, searchQuery, selectedCategory, activeTab } = get();
      const { installedCommandConfigs } = useSettingsStore.getState();
      const installedNames = new Set(installedCommandConfigs.map((c) => c.name));

      let commands = availableCommands;

      // Filter by tab
      if (activeTab === 'available') {
        // Show bundled commands (available for installation)
        // Exclude commands that are already installed (in installedCommandConfigs)
        commands = commands.filter((c) => {
          if (c.source.type === 'managed') return false;
          // Show bundled commands that are NOT yet installed
          return !installedNames.has(c.frontmatter.name);
        });
      } else if (activeTab === 'installed') {
        // Show only managed commands that are in installed configs
        commands = commands.filter(
          (c) => c.source.type === 'managed' && installedNames.has(c.frontmatter.name)
        );
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        commands = commands.filter(
          (c) =>
            c.frontmatter.name.toLowerCase().includes(query) ||
            c.frontmatter.displayName.toLowerCase().includes(query) ||
            c.frontmatter.description.toLowerCase().includes(query) ||
            c.frontmatter.aliases?.some((a) => a.toLowerCase().includes(query))
        );
      }

      // Filter by category
      if (selectedCategory !== 'all') {
        commands = commands.filter((c) => c.frontmatter.category === selectedCategory);
      }

      return commands;
    },

    getInstalledCommands: () => {
      const { availableCommands } = get();
      const { installedCommandConfigs } = useSettingsStore.getState();
      const installedNames = new Set(installedCommandConfigs.map((c) => c.name));

      return availableCommands.filter(
        (c) => c.source.type === 'managed' && installedNames.has(c.frontmatter.name)
      );
    },

    getInstalledCount: () => {
      // Count only managed commands that are in installedCommandConfigs
      return get().getInstalledCommands().length;
    },

    isCommandInstalled: (commandId) => {
      const { availableCommands } = get();
      const { installedCommandConfigs } = useSettingsStore.getState();
      const installedNames = new Set(installedCommandConfigs.map((c) => c.name));

      const command = availableCommands.find((c) => c.id === commandId);
      if (!command) return false;

      // A command is installed if:
      // 1. A managed version exists on disk AND
      // 2. It's tracked in installedCommandConfigs
      const managedCommandExists = availableCommands.some(
        (c) => c.source.type === 'managed' && c.frontmatter.name === command.frontmatter.name
      );

      return managedCommandExists && installedNames.has(command.frontmatter.name);
    },

    getCommandByAlias: (alias) => {
      const { availableCommands } = get();
      const { installedCommandConfigs } = useSettingsStore.getState();
      const installedNames = new Set(installedCommandConfigs.map((c) => c.name));

      const lowerAlias = alias.toLowerCase();

      // First try to find in installed/managed commands
      const installedMatch = availableCommands.find((cmd) => {
        if (cmd.source.type !== 'managed' && !installedNames.has(cmd.frontmatter.name)) {
          return false;
        }
        return (
          cmd.frontmatter.name.toLowerCase() === lowerAlias ||
          cmd.frontmatter.aliases?.some((a) => a.toLowerCase() === lowerAlias)
        );
      });

      if (installedMatch) return installedMatch;

      // Fallback to bundled commands (if no managed version)
      return availableCommands.find((cmd) => {
        if (cmd.source.type === 'managed') return false;
        return (
          cmd.frontmatter.name.toLowerCase() === lowerAlias ||
          cmd.frontmatter.aliases?.some((a) => a.toLowerCase() === lowerAlias)
        );
      });
    },

    expandCommand: (name, userAddition) => {
      const command = get().getCommandByAlias(name);
      if (!command || !command.prompt) return null;

      let expanded = command.prompt;
      if (userAddition.trim()) {
        expanded += `\n\nAdditional user instructions: ${userAddition.trim()}`;
      }
      return expanded;
    },

    getPaletteCommands: () => {
      const { paletteQuery, commands } = get();
      const q = paletteQuery.toLowerCase();

      if (!q) {
        return commands;
      }

      return commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(q) ||
          cmd.displayName.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q) ||
          cmd.aliases.some((a) => a.toLowerCase().includes(q))
      );
    },

    clearError: () => {
      set({ error: null });
    },

    reset: () => {
      set(initialState);
    },
  })
);

// =============================================================================
// Selector Hooks
// =============================================================================

export const useCommands = () => useCommandStore((state) => state.commands);

/**
 * React-safe hook that subscribes to both command store and settings store,
 * so changes to installedCommandConfigs properly trigger re-renders.
 */
export const useInstalledCommands = (): SlashCommand[] => {
  const availableCommands = useCommandStore((s) => s.availableCommands);
  const configs = useSettingsStore((s) => s.installedCommandConfigs);
  return useMemo(() => {
    const installedNames = new Set(configs.map((c) => c.name));
    const commandMap = new Map<string, typeof availableCommands[0]>();
    for (const cmd of availableCommands) {
      if (!installedNames.has(cmd.frontmatter.name)) continue;
      const existing = commandMap.get(cmd.frontmatter.name);
      if (!existing || cmd.source.type === 'managed') {
        commandMap.set(cmd.frontmatter.name, cmd);
      }
    }
    return Array.from(commandMap.values())
      .map((cmd) => ({
        name: cmd.frontmatter.name,
        displayName: cmd.frontmatter.displayName,
        description: cmd.frontmatter.description,
        aliases: cmd.frontmatter.aliases || [],
        category: cmd.frontmatter.category,
        icon: cmd.frontmatter.icon,
        prompt: cmd.prompt,
        action: cmd.frontmatter.action,
        priority: cmd.frontmatter.priority,
      }))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [availableCommands, configs]);
};

export const useAvailableCommands = () => useCommandStore((state) => state.availableCommands);
export const useIsDiscoveringCommands = () => useCommandStore((state) => state.isDiscovering);
export const useIsPaletteOpen = () => useCommandStore((state) => state.isPaletteOpen);
export const usePaletteQuery = () => useCommandStore((state) => state.paletteQuery);
export const useCommandSearchQuery = () => useCommandStore((state) => state.searchQuery);
export const useCommandCategory = () => useCommandStore((state) => state.selectedCategory);
export const useCommandActiveTab = () => useCommandStore((state) => state.activeTab);
export const useSelectedCommandId = () => useCommandStore((state) => state.selectedCommandId);
export const useCommandError = () => useCommandStore((state) => state.error);

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse command input string
 * Returns { commandName, userAddition } or null if not a command
 */
export function parseCommandInput(input: string): {
  commandName: string;
  userAddition: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex > 0) {
    return {
      commandName: trimmed.slice(1, spaceIndex),
      userAddition: trimmed.slice(spaceIndex + 1),
    };
  }

  return {
    commandName: trimmed.slice(1),
    userAddition: '',
  };
}

/**
 * Check if input is a command
 */
export function isCommandInput(input: string): boolean {
  return input.trim().startsWith('/');
}
