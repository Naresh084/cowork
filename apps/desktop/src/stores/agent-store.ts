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

export interface ResearchProgress {
  status: string;
  progress: number;
}

interface AgentState {
  isRunning: boolean;
  tasks: Task[];
  artifacts: Artifact[];
  contextUsage: ContextUsage;
  currentModel: string;
  currentSessionId: string | null;
  previewArtifact: Artifact | null;
  researchProgress: ResearchProgress | null;
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

  // Research progress
  setResearchProgress: (progress: ResearchProgress | null) => void;
}

// Default context window (1M tokens for Gemini 3.0 models)
// This is updated dynamically when model info is fetched from the API
const DEFAULT_CONTEXT_WINDOW = 1048576;

const initialState: AgentState = {
  isRunning: false,
  tasks: [],
  artifacts: [],
  contextUsage: { used: 0, total: DEFAULT_CONTEXT_WINDOW, percentage: 0 },
  currentModel: 'gemini-3.0-flash-preview',
  currentSessionId: null,
  previewArtifact: null,
  researchProgress: null,
};

export const useAgentStore = create<AgentState & AgentActions>((set) => ({
  ...initialState,

  // Task management
  setTasks: (tasks: Task[]) => {
    set({ tasks });
  },

  updateTask: (task: Task) => {
    set((state) => {
      const existingIndex = state.tasks.findIndex((t) => t.id === task.id);
      if (existingIndex >= 0) {
        // Update existing task
        return {
          tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
        };
      } else {
        // Task doesn't exist, add it (for write_todos style updates)
        return {
          tasks: [...state.tasks, task],
        };
      }
    });
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
      // Silent failure for context usage - not critical to user experience
      // but log for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Failed to refresh context usage:', errorMessage);
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

  // Research progress
  setResearchProgress: (progress: ResearchProgress | null) => {
    set({ researchProgress: progress });
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

export const useResearchProgress = () =>
  useAgentStore((state) => state.researchProgress);
