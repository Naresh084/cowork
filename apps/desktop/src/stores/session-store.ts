import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export interface SessionSummary {
  id: string;
  title: string | null;
  workingDirectory: string | null;
  model: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionInfo {
  id: string;
  title: string | null;
  workingDirectory: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionState {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface SessionActions {
  loadSessions: () => Promise<void>;
  createSession: (workingDirectory: string, model?: string) => Promise<string>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      error: null,

      loadSessions: async () => {
        set({ isLoading: true, error: null });
        try {
          const sessions = await invoke<SessionSummary[]>('agent_list_sessions');
          set({ sessions, isLoading: false });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      createSession: async (workingDirectory: string, model?: string) => {
        set({ isLoading: true, error: null });
        try {
          const session = await invoke<SessionInfo>('agent_create_session', {
            workingDirectory,
            model,
          });

          // Add to sessions list
          const newSummary: SessionSummary = {
            id: session.id,
            title: session.title,
            workingDirectory: session.workingDirectory,
            model: session.model,
            messageCount: 0,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          };

          set((state) => ({
            sessions: [newSummary, ...state.sessions],
            activeSessionId: session.id,
            isLoading: false,
          }));

          return session.id;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },

      selectSession: async (sessionId: string) => {
        const { sessions } = get();
        const session = sessions.find((s) => s.id === sessionId);

        if (!session) {
          set({ error: 'Session not found' });
          return;
        }

        set({ activeSessionId: sessionId });
      },

      deleteSession: async (sessionId: string) => {
        // Optimistic update
        const previousSessions = get().sessions;
        const previousActiveId = get().activeSessionId;

        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          activeSessionId:
            state.activeSessionId === sessionId ? null : state.activeSessionId,
        }));

        try {
          await invoke('agent_delete_session', { sessionId });
        } catch (error) {
          // Rollback on error
          set({
            sessions: previousSessions,
            activeSessionId: previousActiveId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },

      updateSessionTitle: async (sessionId: string, title: string) => {
        // Optimistic update
        const previousSessions = get().sessions;

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, title } : s
          ),
        }));

        try {
          // Note: Backend command for updating title would be needed
          // For now, just persist locally
        } catch (error) {
          // Rollback on error
          set({
            sessions: previousSessions,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },

      updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, workingDirectory } : s
          ),
        }));
      },

      setActiveSession: (sessionId: string | null) => {
        set({ activeSessionId: sessionId });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'session-store',
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);

// Selector hooks for common use cases
export const useActiveSession = () => {
  return useSessionStore((state) => {
    if (!state.activeSessionId) return null;
    return state.sessions.find((s) => s.id === state.activeSessionId) || null;
  });
};

export const useSessions = () => {
  return useSessionStore((state) => state.sessions);
};

export const useIsLoadingSessions = () => {
  return useSessionStore((state) => state.isLoading);
};
