/**
 * Memory Store - Deep Agents Long-term Memory System
 *
 * Manages persistent memories stored in .cowork/memories/
 * Replaces the legacy GEMINI.md system
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Memory group (folder) type
 */
export type MemoryGroup = 'preferences' | 'learnings' | 'context' | 'instructions';

/**
 * Memory source - how was the memory created
 */
export type MemorySource = 'auto' | 'manual';

/**
 * Memory entry
 */
export interface Memory {
  id: string;
  title: string;
  content: string;
  group: MemoryGroup;
  tags: string[];
  source: MemorySource;
  confidence?: number;  // For auto-extracted memories (0-1)
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
  relatedSessionIds: string[];
  relatedMemoryIds: string[];
}

/**
 * Scored memory for relevance queries
 */
export interface ScoredMemory extends Memory {
  relevanceScore: number;
}

/**
 * Create memory input
 */
export interface CreateMemoryInput {
  title: string;
  content: string;
  group: MemoryGroup;
  tags?: string[];
  source?: MemorySource;
  confidence?: number;
}

/**
 * Update memory input
 */
export interface UpdateMemoryInput {
  title?: string;
  content?: string;
  group?: MemoryGroup;
  tags?: string[];
}

interface MemoryStoreState {
  // Data
  memories: Memory[];
  groups: MemoryGroup[];

  // UI state
  isLoading: boolean;
  isCreating: boolean;
  isDeleting: Set<string>;

  // Current working directory
  workingDirectory: string | null;

  // Filter state
  selectedGroup: MemoryGroup | 'all';
  searchQuery: string;

  // Selected memory for editing
  selectedMemoryId: string | null;

  // Error state
  error: string | null;
}

interface MemoryStoreActions {
  // Loading
  loadMemories: (workingDirectory: string) => Promise<void>;
  loadGroups: (workingDirectory: string) => Promise<void>;

  // CRUD
  createMemory: (input: CreateMemoryInput) => Promise<Memory | null>;
  updateMemory: (id: string, updates: UpdateMemoryInput) => Promise<Memory | null>;
  deleteMemory: (id: string) => Promise<boolean>;

  // Groups
  createGroup: (name: string) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;

  // Search
  searchMemories: (query: string) => Promise<Memory[]>;
  getRelevantMemories: (context: string, limit?: number) => Promise<ScoredMemory[]>;

  // UI Actions
  setSelectedGroup: (group: MemoryGroup | 'all') => void;
  setSearchQuery: (query: string) => void;
  selectMemory: (id: string | null) => void;

  // Selectors
  getFilteredMemories: () => Memory[];
  getMemoryById: (id: string) => Memory | undefined;
  getMemoriesByGroup: (group: MemoryGroup) => Memory[];

  // Utilities
  clearError: () => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const DEFAULT_GROUPS: MemoryGroup[] = ['preferences', 'learnings', 'context', 'instructions'];

const initialState: MemoryStoreState = {
  memories: [],
  groups: DEFAULT_GROUPS,
  isLoading: false,
  isCreating: false,
  isDeleting: new Set(),
  workingDirectory: null,
  selectedGroup: 'all',
  searchQuery: '',
  selectedMemoryId: null,
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useMemoryStore = create<MemoryStoreState & MemoryStoreActions>()(
  (set, get) => ({
    ...initialState,

    // ========================================================================
    // Loading
    // ========================================================================

    loadMemories: async (workingDirectory) => {
      set({ isLoading: true, error: null, workingDirectory });

      try {
        const memories = await invoke<Memory[]>('deep_memory_list', {
          workingDirectory,
        });

        set({ memories, isLoading: false });
      } catch (error) {
        set({
          memories: [],
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    loadGroups: async (workingDirectory) => {
      try {
        const groups = await invoke<MemoryGroup[]>('deep_memory_list_groups', {
          workingDirectory,
        });

        set({ groups: groups.length > 0 ? groups : DEFAULT_GROUPS });
      } catch (error) {
        console.warn('[MemoryStore] Failed to load groups:', error);
        set({ groups: DEFAULT_GROUPS });
      }
    },

    // ========================================================================
    // CRUD
    // ========================================================================

    createMemory: async (input) => {
      const { workingDirectory } = get();
      if (!workingDirectory) {
        set({ error: 'No working directory set' });
        return null;
      }

      set({ isCreating: true, error: null });

      try {
        const memory = await invoke<Memory>('deep_memory_create', {
          workingDirectory,
          title: input.title,
          content: input.content,
          group: input.group,
          tags: input.tags || [],
          source: input.source || 'manual',
          confidence: input.confidence,
        });

        set((state) => ({
          memories: [...state.memories, memory],
          isCreating: false,
        }));

        return memory;
      } catch (error) {
        set({
          isCreating: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },

    updateMemory: async (id, updates) => {
      const { workingDirectory } = get();
      if (!workingDirectory) {
        set({ error: 'No working directory set' });
        return null;
      }

      try {
        const memory = await invoke<Memory>('deep_memory_update', {
          workingDirectory,
          id,
          ...updates,
        });

        set((state) => ({
          memories: state.memories.map((m) => (m.id === id ? memory : m)),
        }));

        return memory;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    },

    deleteMemory: async (id) => {
      const { workingDirectory } = get();
      if (!workingDirectory) {
        set({ error: 'No working directory set' });
        return false;
      }

      set((state) => ({
        isDeleting: new Set([...state.isDeleting, id]),
        error: null,
      }));

      try {
        await invoke('deep_memory_delete', {
          workingDirectory,
          id,
        });

        set((state) => {
          const newDeleting = new Set(state.isDeleting);
          newDeleting.delete(id);
          return {
            memories: state.memories.filter((m) => m.id !== id),
            isDeleting: newDeleting,
            selectedMemoryId: state.selectedMemoryId === id ? null : state.selectedMemoryId,
          };
        });

        return true;
      } catch (error) {
        set((state) => {
          const newDeleting = new Set(state.isDeleting);
          newDeleting.delete(id);
          return {
            isDeleting: newDeleting,
            error: error instanceof Error ? error.message : String(error),
          };
        });
        return false;
      }
    },

    // ========================================================================
    // Groups
    // ========================================================================

    createGroup: async (name) => {
      const { workingDirectory, groups } = get();
      if (!workingDirectory) {
        set({ error: 'No working directory set' });
        return;
      }

      try {
        await invoke('deep_memory_create_group', {
          workingDirectory,
          name,
        });

        set({ groups: [...groups, name as MemoryGroup] });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    deleteGroup: async (name) => {
      const { workingDirectory, groups } = get();
      if (!workingDirectory) {
        set({ error: 'No working directory set' });
        return;
      }

      try {
        await invoke('deep_memory_delete_group', {
          workingDirectory,
          name,
        });

        set({
          groups: groups.filter((g) => g !== name),
          selectedGroup: get().selectedGroup === name ? 'all' : get().selectedGroup,
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    // ========================================================================
    // Search
    // ========================================================================

    searchMemories: async (query) => {
      const { workingDirectory } = get();
      if (!workingDirectory) return [];

      try {
        const memories = await invoke<Memory[]>('deep_memory_search', {
          workingDirectory,
          query,
        });

        return memories;
      } catch (error) {
        console.warn('[MemoryStore] Search failed:', error);
        return [];
      }
    },

    getRelevantMemories: async (context, limit = 5) => {
      const { workingDirectory } = get();
      if (!workingDirectory) return [];

      try {
        const memories = await invoke<ScoredMemory[]>('deep_memory_get_relevant', {
          workingDirectory,
          context,
          limit,
        });

        return memories;
      } catch (error) {
        console.warn('[MemoryStore] Get relevant failed:', error);
        return [];
      }
    },

    // ========================================================================
    // UI Actions
    // ========================================================================

    setSelectedGroup: (group) => {
      set({ selectedGroup: group });
    },

    setSearchQuery: (query) => {
      set({ searchQuery: query });
    },

    selectMemory: (id) => {
      set({ selectedMemoryId: id });
    },

    // ========================================================================
    // Selectors
    // ========================================================================

    getFilteredMemories: () => {
      const { memories, selectedGroup, searchQuery } = get();

      let filtered = memories;

      // Filter by group
      if (selectedGroup !== 'all') {
        filtered = filtered.filter((m) => m.group === selectedGroup);
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            m.title.toLowerCase().includes(query) ||
            m.content.toLowerCase().includes(query) ||
            m.tags.some((t) => t.toLowerCase().includes(query))
        );
      }

      // Sort by updated date (most recent first)
      return filtered.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    },

    getMemoryById: (id) => {
      return get().memories.find((m) => m.id === id);
    },

    getMemoriesByGroup: (group) => {
      return get().memories.filter((m) => m.group === group);
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

export const useMemories = () => useMemoryStore((state) => state.memories);
export const useMemoryGroups = () => useMemoryStore((state) => state.groups);
export const useIsLoadingMemory = () => useMemoryStore((state) => state.isLoading);
export const useIsCreatingMemory = () => useMemoryStore((state) => state.isCreating);
export const useIsDeletingMemory = (id: string) =>
  useMemoryStore((state) => state.isDeleting.has(id));
export const useSelectedGroup = () => useMemoryStore((state) => state.selectedGroup);
export const useMemorySearchQuery = () => useMemoryStore((state) => state.searchQuery);
export const useSelectedMemoryId = () => useMemoryStore((state) => state.selectedMemoryId);
export const useMemoryError = () => useMemoryStore((state) => state.error);

// ============================================================================
// Legacy Compatibility
// ============================================================================

// Re-export with legacy names for backward compatibility
export type MemoryEntry = Memory;

export const useMemoryEntries = () => useMemoryStore((state) => state.memories);

export const useMemoryEntriesByCategory = (category: string) =>
  useMemoryStore((state) => {
    // Map legacy categories to groups
    const groupMap: Record<string, MemoryGroup> = {
      project: 'context',
      preference: 'preferences',
      pattern: 'learnings',
      context: 'context',
      custom: 'instructions',
    };
    const group = groupMap[category] || (category as MemoryGroup);
    return state.memories.filter((m) => m.group === group);
  });

export const useIsMemoryDirty = () => false; // New system auto-saves
