/**
 * Subagent Store - Manages subagents state
 *
 * Handles:
 * - Loading subagents from sidecar (built-in, custom)
 * - Subagent installation/uninstallation
 * - UI state for subagent manager modal
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Subagent category
 */
export type SubagentCategory = 'research' | 'development' | 'analysis' | 'productivity' | 'custom';

/**
 * Subagent source
 */
export type SubagentSource = 'built-in' | 'custom' | 'platform';

/**
 * Subagent definition
 */
export interface Subagent {
  name: string;
  displayName: string;
  description: string;
  version: string;
  author?: string;
  category: SubagentCategory;
  icon?: string;
  tags?: string[];
  systemPrompt: string;
  tools?: string[];
  model?: string;
  priority: number;
  source: SubagentSource;
  installed: boolean;
}

/**
 * Category metadata for UI display
 */
export const SUBAGENT_CATEGORIES: Record<SubagentCategory, { name: string; icon: string; description: string }> = {
  research: {
    name: 'Research',
    icon: 'search',
    description: 'Web search, documentation lookup, and fact-finding',
  },
  development: {
    name: 'Development',
    icon: 'code',
    description: 'Code writing, architecture, and implementation',
  },
  analysis: {
    name: 'Analysis',
    icon: 'bar-chart-2',
    description: 'Code review, security auditing, and performance analysis',
  },
  productivity: {
    name: 'Productivity',
    icon: 'zap',
    description: 'Task planning, documentation, and workflow optimization',
  },
  custom: {
    name: 'Custom',
    icon: 'puzzle',
    description: 'User-created subagents',
  },
};

interface SubagentStoreState {
  // Subagent data
  subagents: Subagent[];

  // UI state
  isLoading: boolean;
  isInstalling: Set<string>;

  // Filters
  searchQuery: string;
  selectedCategory: SubagentCategory | 'all';
  activeTab: 'available' | 'installed';

  // Selected subagent for details panel
  selectedSubagentName: string | null;

  // Error state
  error: string | null;
}

interface SubagentStoreActions {
  // Loading
  loadSubagents: (workingDirectory?: string) => Promise<void>;

  // Install/Uninstall
  installSubagent: (name: string, workingDirectory?: string) => Promise<void>;
  uninstallSubagent: (name: string, workingDirectory?: string) => Promise<void>;
  isSubagentInstalling: (name: string) => boolean;

  // UI Actions
  setSearchQuery: (query: string) => void;
  setCategory: (category: SubagentCategory | 'all') => void;
  setActiveTab: (tab: 'available' | 'installed') => void;
  selectSubagent: (name: string | null) => void;

  // Selectors
  getFilteredSubagents: () => Subagent[];
  getInstalledSubagents: () => Subagent[];
  getInstalledCount: () => number;
  isSubagentInstalled: (name: string) => boolean;
  getSubagentByName: (name: string) => Subagent | undefined;
  getSubagentsByCategory: (category: SubagentCategory) => Subagent[];

  // Utilities
  clearError: () => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: SubagentStoreState = {
  subagents: [],
  isLoading: false,
  isInstalling: new Set(),
  searchQuery: '',
  selectedCategory: 'all',
  activeTab: 'available',
  selectedSubagentName: null,
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useSubagentStore = create<SubagentStoreState & SubagentStoreActions>()(
  (set, get) => ({
    ...initialState,

    // ========================================================================
    // Loading
    // ========================================================================

    loadSubagents: async (workingDirectory) => {
      set({ isLoading: true, error: null });

      try {
        const subagents = await invoke<Subagent[]>('deep_subagent_list', {
          workingDirectory,
        });

        // Sort by priority (higher first) then by name
        const sortedSubagents = subagents.sort((a: Subagent, b: Subagent) => {
          if ((a.priority ?? 0) !== (b.priority ?? 0)) {
            return (b.priority ?? 0) - (a.priority ?? 0);
          }
          return a.displayName.localeCompare(b.displayName);
        });

        set({
          subagents: sortedSubagents,
          isLoading: false
        });
      } catch (error) {
        console.error('Failed to load subagents:', error);
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    // ========================================================================
    // Install/Uninstall
    // ========================================================================

    installSubagent: async (name, workingDirectory) => {
      set((state) => ({
        isInstalling: new Set([...state.isInstalling, name]),
        error: null,
      }));

      try {
        await invoke('deep_subagent_install', {
          subagentName: name,
          workingDirectory,
        });

        // Update the subagent's installed status in state
        set((state) => ({
          subagents: state.subagents.map((sub) =>
            sub.name === name ? { ...sub, installed: true } : sub
          ),
        }));
      } catch (error) {
        console.error('Failed to install subagent:', error);
        set({
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set((state) => {
          const newInstalling = new Set(state.isInstalling);
          newInstalling.delete(name);
          return { isInstalling: newInstalling };
        });
      }
    },

    uninstallSubagent: async (name, workingDirectory) => {
      // Platform subagents cannot be uninstalled (they live in external folders)
      const sub = get().subagents.find((s) => s.name === name);
      if (sub?.source === 'platform') {
        set({ error: 'Platform subagents cannot be uninstalled. Disable them instead.' });
        return;
      }

      set((state) => ({
        isInstalling: new Set([...state.isInstalling, name]),
        error: null,
      }));

      try {
        await invoke('deep_subagent_uninstall', {
          subagentName: name,
          workingDirectory,
        });

        // Update the subagent's installed status in state
        set((state) => ({
          subagents: state.subagents.map((sub) =>
            sub.name === name ? { ...sub, installed: false } : sub
          ),
        }));
      } catch (error) {
        console.error('Failed to uninstall subagent:', error);
        set({
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set((state) => {
          const newInstalling = new Set(state.isInstalling);
          newInstalling.delete(name);
          return { isInstalling: newInstalling };
        });
      }
    },

    isSubagentInstalling: (name) => {
      return get().isInstalling.has(name);
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

    selectSubagent: (name) => {
      set({ selectedSubagentName: name });
    },

    // ========================================================================
    // Selectors
    // ========================================================================

    getFilteredSubagents: () => {
      const { subagents, searchQuery, selectedCategory, activeTab } = get();

      let filtered = subagents;

      // Filter by tab - installed tab shows only installed subagents
      if (activeTab === 'installed') {
        filtered = filtered.filter((sub) => sub.installed);
      }

      // Filter by category
      if (selectedCategory !== 'all') {
        filtered = filtered.filter((sub) => sub.category === selectedCategory);
      }

      // Filter by search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (sub) =>
            sub.name.toLowerCase().includes(query) ||
            sub.displayName.toLowerCase().includes(query) ||
            sub.description.toLowerCase().includes(query) ||
            (sub.tags && sub.tags.some((t) => t.toLowerCase().includes(query)))
        );
      }

      return filtered;
    },

    getInstalledSubagents: () => {
      const { subagents } = get();
      return subagents.filter((sub) => sub.installed);
    },

    getInstalledCount: () => {
      const { subagents } = get();
      return subagents.filter((sub) => sub.installed).length;
    },

    isSubagentInstalled: (name) => {
      const sub = get().subagents.find((s) => s.name === name);
      return sub?.installed ?? false;
    },

    getSubagentByName: (name) => {
      const { subagents } = get();
      return subagents.find((sub) => sub.name === name);
    },

    getSubagentsByCategory: (category) => {
      const { subagents } = get();
      return subagents.filter((sub) => sub.category === category);
    },

    // ========================================================================
    // Utilities
    // ========================================================================

    clearError: () => {
      set({ error: null });
    },

    reset: () => {
      set(initialState);
    },
  })
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const useSubagents = () => useSubagentStore((state) => state.subagents);
export const useIsLoadingSubagents = () => useSubagentStore((state) => state.isLoading);
export const useSelectedSubagent = () => useSubagentStore((state) => state.selectedSubagentName);
export const useSubagentError = () => useSubagentStore((state) => state.error);
export const useActiveSubagentTab = () => useSubagentStore((state) => state.activeTab);
