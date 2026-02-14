// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

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
  type: 'created' | 'modified' | 'deleted' | 'touched';
  language?: string;
  content?: string;
  diff?: string;
  lineCount?: number;
  url?: string;
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

export interface SessionAgentState {
  isRunning: boolean;
  tasks: Task[];
  artifacts: Artifact[];
  contextFiles: Artifact[];
  contextUsage: ContextUsage;
  researchProgress: ResearchProgress | null;
}

interface AgentState {
  sessions: Record<string, SessionAgentState>;
  previewArtifact: Artifact | null;
}

interface AgentActions {
  // Session helpers
  getSessionState: (sessionId: string | null) => SessionAgentState;
  ensureSession: (sessionId: string) => void;
  resetSession: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;

  // Task management
  setTasks: (sessionId: string, tasks: Task[]) => void;
  updateTask: (sessionId: string, task: Task) => void;
  addTask: (sessionId: string, task: Task) => void;
  removeTask: (sessionId: string, id: string) => void;
  clearTasks: (sessionId: string) => void;

  // Artifact management
  setArtifacts: (sessionId: string, artifacts: Artifact[]) => void;
  addArtifact: (sessionId: string, artifact: Artifact) => void;
  updateArtifact: (sessionId: string, id: string, updates: Partial<Artifact>) => void;
  removeArtifact: (sessionId: string, id: string) => void;
  clearArtifacts: (sessionId: string) => void;
  setContextFiles: (sessionId: string, files: Artifact[]) => void;
  clearContextFiles: (sessionId: string) => void;

  // Context management
  setContextUsage: (sessionId: string, used: number, total: number) => void;
  refreshContextUsage: (sessionId: string) => Promise<void>;

  // State management
  setRunning: (sessionId: string, running: boolean) => void;

  // Preview management
  setPreviewArtifact: (artifact: Artifact | null) => void;
  clearPreviewArtifact: () => void;

  // Research progress
  setResearchProgress: (sessionId: string, progress: ResearchProgress | null) => void;
}

// Default context window (1M tokens for Gemini 3.0 models)
// This is updated dynamically when model info is fetched from the API
const DEFAULT_CONTEXT_WINDOW = 1048576;

const createSessionState = (): SessionAgentState => ({
  isRunning: false,
  tasks: [],
  artifacts: [],
  contextFiles: [],
  contextUsage: { used: 0, total: DEFAULT_CONTEXT_WINDOW, percentage: 0 },
  researchProgress: null,
});

const EMPTY_SESSION_STATE = createSessionState();

const updateSession = (
  state: AgentState,
  sessionId: string,
  updater: (session: SessionAgentState) => SessionAgentState
) => {
  const existing = state.sessions[sessionId] ?? createSessionState();
  return {
    sessions: {
      ...state.sessions,
      [sessionId]: updater(existing),
    },
  };
};

export const useAgentStore = create<AgentState & AgentActions>((set, get) => ({
  sessions: {},
  previewArtifact: null,

  getSessionState: (sessionId: string | null) => {
    if (!sessionId) return EMPTY_SESSION_STATE;
    return get().sessions[sessionId] ?? EMPTY_SESSION_STATE;
  },

  ensureSession: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => {
      if (state.sessions[sessionId]) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: createSessionState(),
        },
      };
    });
  },

  resetSession: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: createSessionState(),
      },
    }));
  },

  removeSession: (sessionId: string) => {
    set((state) => {
      if (!state.sessions[sessionId]) return state;
      const next = { ...state.sessions };
      delete next[sessionId];
      return { sessions: next };
    });
  },

  // Task management
  setTasks: (sessionId: string, tasks: Task[]) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      tasks,
    })));
  },

  updateTask: (sessionId: string, task: Task) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => {
      const existingIndex = session.tasks.findIndex((t) => t.id === task.id);
      if (existingIndex >= 0) {
        return {
          ...session,
          tasks: session.tasks.map((t) => (t.id === task.id ? task : t)),
        };
      }
      return {
        ...session,
        tasks: [...session.tasks, task],
      };
    }));
  },

  addTask: (sessionId: string, task: Task) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      tasks: [...session.tasks, task],
    })));
  },

  removeTask: (sessionId: string, id: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      tasks: session.tasks.filter((t) => t.id !== id),
    })));
  },

  clearTasks: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      tasks: [],
    })));
  },

  // Artifact management
  setArtifacts: (sessionId: string, artifacts: Artifact[]) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      artifacts,
      contextFiles: artifacts,
    })));
  },

  addArtifact: (sessionId: string, artifact: Artifact) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => {
      const existing = session.artifacts.find((a) => a.path === artifact.path);
      const existingContext = session.contextFiles.find((a) => a.path === artifact.path);

      const contextFiles = existingContext
        ? session.contextFiles.map((a) =>
            a.path === artifact.path ? { ...artifact, id: existingContext.id } : a
          )
        : [...session.contextFiles, artifact];

      if (existing) {
        return {
          ...session,
          artifacts: session.artifacts.map((a) =>
            a.path === artifact.path ? { ...artifact, id: existing.id } : a
          ),
          contextFiles,
        };
      }
      return { ...session, artifacts: [...session.artifacts, artifact], contextFiles };
    }));
  },

  updateArtifact: (sessionId: string, id: string, updates: Partial<Artifact>) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      artifacts: session.artifacts.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })));
  },

  removeArtifact: (sessionId: string, id: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      artifacts: session.artifacts.filter((a) => a.id !== id),
      contextFiles: session.contextFiles.filter((a) => a.id !== id),
    })));
  },

  clearArtifacts: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      artifacts: [],
      contextFiles: [],
    })));
  },

  setContextFiles: (sessionId: string, files: Artifact[]) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      contextFiles: files,
    })));
  },

  clearContextFiles: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      contextFiles: [],
    })));
  },

  // Context management
  setContextUsage: (sessionId: string, used: number, total: number) => {
    if (!sessionId) return;
    const percentage = total > 0 ? Math.round((used / total) * 100) : 0;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      contextUsage: { used, total, percentage },
    })));
  },

  refreshContextUsage: async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const result = await invoke<{ used: number; total: number }>(
        'agent_get_context_usage',
        { sessionId }
      );
      const percentage =
        result.total > 0
          ? Math.round((result.used / result.total) * 100)
          : 0;
      set((state) => updateSession(state, sessionId, (session) => ({
        ...session,
        contextUsage: {
          used: result.used,
          total: result.total,
          percentage,
        },
      })));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Failed to refresh context usage:', errorMessage);
    }
  },

  // State management
  setRunning: (sessionId: string, running: boolean) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      isRunning: running,
    })));
  },

  // Preview management
  setPreviewArtifact: (artifact: Artifact | null) => {
    set({ previewArtifact: artifact });
  },

  clearPreviewArtifact: () => {
    set({ previewArtifact: null });
  },

  // Research progress
  setResearchProgress: (sessionId: string, progress: ResearchProgress | null) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      researchProgress: progress,
    })));
  },
}));

// Selector hooks (session-scoped)
export const useSessionTasks = (sessionId: string | null) =>
  useAgentStore((state) => state.getSessionState(sessionId).tasks);

export const useActiveTasks = (sessionId: string | null) =>
  useAgentStore((state) =>
    state.getSessionState(sessionId).tasks.filter((t) => t.status !== 'completed')
  );

export const useCompletedTasks = (sessionId: string | null) =>
  useAgentStore((state) =>
    state.getSessionState(sessionId).tasks.filter((t) => t.status === 'completed')
  );

export const useSessionArtifacts = (sessionId: string | null) =>
  useAgentStore((state) => state.getSessionState(sessionId).artifacts);

export const useSessionContextUsage = (sessionId: string | null) =>
  useAgentStore((state) => state.getSessionState(sessionId).contextUsage);

export const useSessionResearchProgress = (sessionId: string | null) =>
  useAgentStore((state) => state.getSessionState(sessionId).researchProgress);

export const useSessionIsRunning = (sessionId: string | null) =>
  useAgentStore((state) => state.getSessionState(sessionId).isRunning);
