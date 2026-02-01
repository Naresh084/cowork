import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  owner?: string;
  blockedBy?: string[];
  blocks?: string[];
  createdAt: number;
  updatedAt?: number;
}

export interface Artifact {
  id: string;
  path: string;
  type: 'created' | 'modified' | 'deleted';
  language?: string;
  content?: string;
  diff?: string;
  lineCount?: number;
  timestamp: number;
}

export interface ContextUsage {
  used: number;
  total: number;
  percentage: number;
}

interface AgentState {
  isRunning: boolean;
  tasks: Task[];
  artifacts: Artifact[];
  contextUsage: ContextUsage;
  currentModel: string;
  currentSessionId: string | null;
  previewArtifact: Artifact | null;
}

interface AgentActions {
  // Task management
  setTasks: (tasks: Task[]) => void;
  updateTask: (task: Task) => void;
  addTask: (task: Task) => void;
  removeTask: (id: string) => void;
  clearTasks: () => void;

  // Artifact management
  addArtifact: (artifact: Artifact) => void;
  updateArtifact: (id: string, updates: Partial<Artifact>) => void;
  removeArtifact: (id: string) => void;
  clearArtifacts: () => void;

  // Context management
  setContextUsage: (used: number, total: number) => void;
  refreshContextUsage: (sessionId: string) => Promise<void>;

  // State management
  setRunning: (running: boolean) => void;
  setCurrentModel: (model: string) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  reset: () => void;

  // Preview management
  setPreviewArtifact: (artifact: Artifact | null) => void;
  clearPreviewArtifact: () => void;
}

const initialState: AgentState = {
  isRunning: false,
  tasks: [],
  artifacts: [],
  contextUsage: { used: 0, total: 128000, percentage: 0 },
  currentModel: 'gemini-2.0-flash',
  currentSessionId: null,
  previewArtifact: null,
};

export const useAgentStore = create<AgentState & AgentActions>((set) => ({
  ...initialState,

  // Task management
  setTasks: (tasks: Task[]) => {
    set({ tasks });
  },

  updateTask: (task: Task) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },

  addTask: (task: Task) => {
    set((state) => ({
      tasks: [...state.tasks, task],
    }));
  },

  removeTask: (id: string) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
  },

  clearTasks: () => {
    set({ tasks: [] });
  },

  // Artifact management
  addArtifact: (artifact: Artifact) => {
    set((state) => {
      // Update existing artifact for same path or add new
      const existing = state.artifacts.find((a) => a.path === artifact.path);
      if (existing) {
        return {
          artifacts: state.artifacts.map((a) =>
            a.path === artifact.path
              ? { ...artifact, id: existing.id }
              : a
          ),
        };
      }
      return { artifacts: [...state.artifacts, artifact] };
    });
  },

  updateArtifact: (id: string, updates: Partial<Artifact>) => {
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    }));
  },

  removeArtifact: (id: string) => {
    set((state) => ({
      artifacts: state.artifacts.filter((a) => a.id !== id),
    }));
  },

  clearArtifacts: () => {
    set({ artifacts: [] });
  },

  // Context management
  setContextUsage: (used: number, total: number) => {
    const percentage = total > 0 ? Math.round((used / total) * 100) : 0;
    set({ contextUsage: { used, total, percentage } });
  },

  refreshContextUsage: async (sessionId: string) => {
    try {
      const result = await invoke<{ used: number; total: number }>(
        'agent_get_context_usage',
        { sessionId }
      );
      const percentage =
        result.total > 0
          ? Math.round((result.used / result.total) * 100)
          : 0;
      set({
        contextUsage: {
          used: result.used,
          total: result.total,
          percentage,
        },
      });
    } catch (error) {
      console.error('Failed to refresh context usage:', error);
    }
  },

  // State management
  setRunning: (running: boolean) => {
    set({ isRunning: running });
  },

  setCurrentModel: (model: string) => {
    set({ currentModel: model });
  },

  setCurrentSessionId: (sessionId: string | null) => {
    set({ currentSessionId: sessionId });
  },

  reset: () => {
    set(initialState);
  },

  // Preview management
  setPreviewArtifact: (artifact: Artifact | null) => {
    set({ previewArtifact: artifact });
  },

  clearPreviewArtifact: () => {
    set({ previewArtifact: null });
  },
}));

// Selector hooks
export const useIsAgentRunning = () =>
  useAgentStore((state) => state.isRunning);

export const useTasks = () => useAgentStore((state) => state.tasks);

export const useActiveTasks = () =>
  useAgentStore((state) =>
    state.tasks.filter((t) => t.status !== 'completed')
  );

export const useCompletedTasks = () =>
  useAgentStore((state) =>
    state.tasks.filter((t) => t.status === 'completed')
  );

export const useArtifacts = () => useAgentStore((state) => state.artifacts);

export const useContextUsage = () =>
  useAgentStore((state) => state.contextUsage);

export const useCurrentModel = () =>
  useAgentStore((state) => state.currentModel);
