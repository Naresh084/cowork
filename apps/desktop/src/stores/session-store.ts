import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '../components/ui/Toast';

export interface SessionSummary {
  id: string;
  title: string | null;
  firstMessage: string | null;
  workingDirectory: string | null;
  model: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionInfo {
  id: string;
  title: string | null;
  firstMessage: string | null;
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
  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string) => Promise<void>;
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

          // Validate that activeSessionId still exists in the loaded sessions
          // This handles the case where the sidecar restarted and lost in-memory sessions
          const currentActiveId = get().activeSessionId;
          const activeSessionExists = currentActiveId
            ? sessions.some((s) => s.id === currentActiveId)
            : false;

          set({
            sessions,
            isLoading: false,
            // Clear stale activeSessionId if session no longer exists
            activeSessionId: activeSessionExists ? currentActiveId : null,
          });
        } catch (error) {
          console.error('[SessionStore] loadSessions error:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to load sessions', errorMessage);
          set({
            isLoading: false,
            error: errorMessage,
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
            firstMessage: null,
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
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to create session', errorMessage);
          set({
            isLoading: false,
            error: errorMessage,
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
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to delete session', errorMessage);
          set({
            sessions: previousSessions,
            activeSessionId: previousActiveId,
            error: errorMessage,
          });
          throw error;
        }
      },

      updateSessionTitle: async (sessionId: string, title: string) => {
        // First verify the session exists locally
        const { sessions } = get();
        const sessionExists = sessions.some((s) => s.id === sessionId);

        if (!sessionExists) {
          console.warn('[SessionStore] Attempted to update title of non-existent session:', sessionId);
          return;
        }

        // Optimistic update
        const previousSessions = sessions;

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, title } : s
          ),
        }));

        try {
          // Persist to backend
          await invoke('agent_update_session_title', { sessionId, title });
        } catch (error) {
          // Rollback on error
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Check if it's a "session not found" error from the backend
          if (errorMessage.toLowerCase().includes('session not found')) {
            console.warn('[SessionStore] Session not found in backend, clearing:', sessionId);
            set({
              sessions: previousSessions.filter((s) => s.id !== sessionId),
              activeSessionId: get().activeSessionId === sessionId ? null : get().activeSessionId,
            });
            return;
          }

          toast.error('Failed to update session title', errorMessage);
          set({
            sessions: previousSessions,
            error: errorMessage,
          });
          throw error;
        }
      },

      updateSessionWorkingDirectory: async (sessionId: string, workingDirectory: string) => {
        // First verify the session exists locally
        const { sessions } = get();
        const sessionExists = sessions.some((s) => s.id === sessionId);

        if (!sessionExists) {
          // Session doesn't exist locally - likely a stale ID
          // Just clear the active session and don't throw an error
          console.warn('[SessionStore] Attempted to update non-existent session:', sessionId);
          set({ activeSessionId: null });
          return;
        }

        // Optimistic update
        const previousSessions = sessions;

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, workingDirectory } : s
          ),
        }));

        try {
          // Persist to backend
          await invoke('agent_update_session_working_directory', { sessionId, workingDirectory });
        } catch (error) {
          // Rollback on error
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Check if it's a "session not found" error from the backend
          if (errorMessage.toLowerCase().includes('session not found')) {
            // Session was removed from backend - clear it locally
            console.warn('[SessionStore] Session not found in backend, clearing:', sessionId);
            set({
              sessions: previousSessions.filter((s) => s.id !== sessionId),
              activeSessionId: get().activeSessionId === sessionId ? null : get().activeSessionId,
            });
            return;
          }

          toast.error('Failed to update working directory', errorMessage);
          set({
            sessions: previousSessions,
            error: errorMessage,
          });
          throw error;
        }
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
