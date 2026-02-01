import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface MemoryEntry {
  id: string;
  category: 'project' | 'preference' | 'pattern' | 'context' | 'custom';
  title: string;
  content: string;
  tags?: string[];
  createdAt: number;
  updatedAt?: number;
}

interface MemoryState {
  entries: MemoryEntry[];
  memoryFilePath: string | null;
  workingDirectory: string | null;
  isLoading: boolean;
  isDirty: boolean;
  error: string | null;
}

interface MemoryActions {
  loadMemory: (workingDirectory: string) => Promise<void>;
  saveMemory: () => Promise<void>;
  addEntry: (entry: Omit<MemoryEntry, 'id' | 'createdAt'>) => void;
  updateEntry: (id: string, updates: Partial<MemoryEntry>) => void;
  removeEntry: (id: string) => void;
  moveEntry: (id: string, direction: 'up' | 'down') => void;
  setDirty: (dirty: boolean) => void;
  clearError: () => void;
  reset: () => void;
}

const initialState: MemoryState = {
  entries: [],
  memoryFilePath: null,
  workingDirectory: null,
  isLoading: false,
  isDirty: false,
  error: null,
};

export const useMemoryStore = create<MemoryState & MemoryActions>((set, get) => ({
  ...initialState,

  loadMemory: async (workingDirectory: string) => {
    set({ isLoading: true, error: null, workingDirectory });

    try {
      const result = await invoke<{
        entries: MemoryEntry[];
        filePath: string;
      }>('agent_load_memory', { workingDirectory });

      set({
        entries: result.entries || [],
        memoryFilePath: result.filePath,
        isLoading: false,
        isDirty: false,
      });
    } catch (error) {
      // If file doesn't exist, start with empty entries
      set({
        entries: [],
        memoryFilePath: `${workingDirectory}/GEMINI.md`,
        isLoading: false,
        isDirty: false,
        error:
          error instanceof Error && !error.message.includes('not found')
            ? error.message
            : null,
      });
    }
  },

  saveMemory: async () => {
    const { entries, workingDirectory } = get();

    if (!workingDirectory) {
      set({ error: 'No working directory set' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      await invoke('agent_save_memory', {
        workingDirectory,
        entries: entries.map((e) => ({
          id: e.id,
          category: e.category,
          title: e.title,
          content: e.content,
          tags: e.tags,
        })),
      });

      set({ isLoading: false, isDirty: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  addEntry: (entry) => {
    const newEntry: MemoryEntry = {
      ...entry,
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };

    set((state) => ({
      entries: [...state.entries, newEntry],
      isDirty: true,
    }));
  },

  updateEntry: (id, updates) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id
          ? { ...e, ...updates, updatedAt: Date.now() }
          : e
      ),
      isDirty: true,
    }));
  },

  removeEntry: (id) => {
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      isDirty: true,
    }));
  },

  moveEntry: (id, direction) => {
    set((state) => {
      const entries = [...state.entries];
      const index = entries.findIndex((e) => e.id === id);

      if (index === -1) return state;

      const newIndex = direction === 'up' ? index - 1 : index + 1;

      if (newIndex < 0 || newIndex >= entries.length) return state;

      const [removed] = entries.splice(index, 1);
      entries.splice(newIndex, 0, removed);

      return { entries, isDirty: true };
    });
  },

  setDirty: (dirty) => {
    set({ isDirty: dirty });
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set(initialState);
  },
}));

// Selector hooks
export const useMemoryEntries = () =>
  useMemoryStore((state) => state.entries);

export const useMemoryEntriesByCategory = (
  category: MemoryEntry['category']
) =>
  useMemoryStore((state) =>
    state.entries.filter((e) => e.category === category)
  );

export const useIsMemoryDirty = () =>
  useMemoryStore((state) => state.isDirty);

export const useIsLoadingMemory = () =>
  useMemoryStore((state) => state.isLoading);

export const useMemoryError = () => useMemoryStore((state) => state.error);

// Helper to generate GEMINI.md content from entries
export function generateMemoryFileContent(entries: MemoryEntry[]): string {
  const lines: string[] = [
    '# GEMINI.md - Project Memory',
    '',
    'This file stores context and preferences for the AI assistant.',
    '',
  ];

  const categories: Record<MemoryEntry['category'], string> = {
    project: '## Project Context',
    preference: '## Preferences',
    pattern: '## Patterns & Conventions',
    context: '## Additional Context',
    custom: '## Custom Entries',
  };

  // Group by category
  const grouped = entries.reduce(
    (acc, entry) => {
      if (!acc[entry.category]) {
        acc[entry.category] = [];
      }
      acc[entry.category].push(entry);
      return acc;
    },
    {} as Record<MemoryEntry['category'], MemoryEntry[]>
  );

  // Output each category
  for (const [category, title] of Object.entries(categories)) {
    const categoryEntries = grouped[category as MemoryEntry['category']];
    if (!categoryEntries?.length) continue;

    lines.push(title);
    lines.push('');

    for (const entry of categoryEntries) {
      lines.push(`### ${entry.title}`);
      if (entry.tags?.length) {
        lines.push(`Tags: ${entry.tags.join(', ')}`);
      }
      lines.push('');
      lines.push(entry.content);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// Helper to parse GEMINI.md content into entries
export function parseMemoryFileContent(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = content.split('\n');

  let currentCategory: MemoryEntry['category'] | null = null;
  let currentTitle: string | null = null;
  let currentContent: string[] = [];
  let currentTags: string[] = [];

  const categoryMap: Record<string, MemoryEntry['category']> = {
    'project context': 'project',
    'preferences': 'preference',
    'patterns & conventions': 'pattern',
    'additional context': 'context',
    'custom entries': 'custom',
  };

  const saveEntry = () => {
    if (currentCategory && currentTitle && currentContent.length > 0) {
      entries.push({
        id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: currentCategory,
        title: currentTitle,
        content: currentContent.join('\n').trim(),
        tags: currentTags.length > 0 ? currentTags : undefined,
        createdAt: Date.now(),
      });
    }
    currentTitle = null;
    currentContent = [];
    currentTags = [];
  };

  for (const line of lines) {
    // Category header (##)
    if (line.startsWith('## ')) {
      saveEntry();
      const categoryName = line.slice(3).toLowerCase();
      currentCategory = categoryMap[categoryName] || 'custom';
      continue;
    }

    // Entry title (###)
    if (line.startsWith('### ')) {
      saveEntry();
      currentTitle = line.slice(4);
      continue;
    }

    // Tags line
    if (line.toLowerCase().startsWith('tags:')) {
      currentTags = line
        .slice(5)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      continue;
    }

    // Regular content
    if (currentTitle) {
      currentContent.push(line);
    }
  }

  // Save last entry
  saveEntry();

  return entries;
}
