import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '../components/ui/Toast';
import { useChatStore } from './chat-store';
import { useSettingsStore } from './settings-store';
import { type ProviderId } from './auth-store';
import { useAppStore } from './app-store';

export type SessionKind = 'main' | 'isolated' | 'cron' | 'ephemeral' | 'integration';

export interface SessionSummary {
  id: string;
  type?: SessionKind;
  provider?: ProviderId;
  title: string | null;
  firstMessage: string | null;
  workingDirectory: string | null;
  model: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

export interface SessionInfo {
  id: string;
  type?: SessionKind;
  provider?: ProviderId;
  title: string | null;
  firstMessage: string | null;
  workingDirectory: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

interface SessionState {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  backendInitialized: boolean;
}

interface SessionActions {
  loadSessions: () => Promise<void>;
  createSession: (workingDirectory: string, model?: string, provider?: ProviderId) => Promise<string>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
  clearError: () => void;
  waitForBackend: () => Promise<void>;
}

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      hasLoaded: false,
      error: null,
      backendInitialized: false,

      waitForBackend: async () => {
        const MAX_WAIT = 30000; // 30 seconds
        const POLL_INTERVAL = 500; // 500ms
        let elapsed = 0;

        while (elapsed < MAX_WAIT) {
          try {
            const status = await invoke<{ initialized: boolean; sessionCount: number }>('agent_get_initialization_status');
            if (status.initialized) {
              set({ backendInitialized: true });
              return;
            }
          } catch {
            // Sidecar may still be starting, continue polling
          }

          await new Promise(r => setTimeout(r, POLL_INTERVAL));
          elapsed += POLL_INTERVAL;
        }

        throw new Error('Backend initialization timed out');
      },

      loadSessions: async () => {
        if (get().isLoading) {
          return;
        }

        // Wait for backend to be initialized first
        if (!get().backendInitialized) {
          await get().waitForBackend();
        }

        set({ isLoading: true, error: null });
        try {
          const sessions = await invoke<SessionSummary[]>('agent_list_sessions');

          // SAFETY: If backend returns 0 sessions but we have cached sessions,
          // this might indicate a timing issue - keep cached sessions
          const cachedSessions = get().sessions;
          if (sessions.length === 0 && cachedSessions.length > 0) {
            // Still mark as loaded to prevent infinite retries
            set({ isLoading: false, hasLoaded: true });
            return;
          }

          // Validate that activeSessionId still exists in the loaded sessions
          const currentActiveId = get().activeSessionId;
          let activeSessionExists = currentActiveId
            ? sessions.some((s) => s.id === currentActiveId)
            : false;

          // If not found in list, double-check with get_session before clearing
          // This handles race conditions where the session exists but wasn't in the list yet
          if (!activeSessionExists && currentActiveId) {
            try {
              await invoke('agent_get_session', { sessionId: currentActiveId });
              activeSessionExists = true; // Session exists, just not in list yet
            } catch {
              // Session truly doesn't exist
            }
          }

          set({
            sessions,
            isLoading: false,
            hasLoaded: true,
            // Keep current selection when valid; otherwise select most recent session if available.
            activeSessionId: activeSessionExists
              ? currentActiveId
              : sessions.length > 0
                ? sessions[0].id
                : null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to load sessions', errorMessage);
          set({
            isLoading: false,
            hasLoaded: true,
            error: errorMessage,
          });
        }
      },

      createSession: async (workingDirectory: string, model?: string, provider?: ProviderId) => {
        set({ isLoading: true, error: null });
        try {
          const settingsState = useSettingsStore.getState();
          const activeProvider = provider || settingsState.activeProvider;
          const providerModel = model || settingsState.selectedModelByProvider[activeProvider] || settingsState.selectedModel;

          const session = await invoke<SessionInfo>('agent_create_session', {
            workingDirectory,
            model: providerModel,
            provider: activeProvider,
          });

          // Add to sessions list (new sessions are most recently accessed)
          const newSummary: SessionSummary = {
            id: session.id,
            type: session.type,
            provider: session.provider || activeProvider,
            title: session.title,
            firstMessage: null,
            workingDirectory: session.workingDirectory,
            model: session.model,
            messageCount: 0,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            lastAccessedAt: session.lastAccessedAt,
          };

          set((state) => ({
            sessions: [newSummary, ...state.sessions],
            activeSessionId: session.id,
            isLoading: false,
          }));
          useAppStore.getState().setRuntimeConfigNotice(null);

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

        const now = Date.now();

        // Update lastAccessedAt in backend
        try {
          await invoke('agent_update_session_last_accessed', { sessionId });
        } catch {
          // Continue - this is not critical
        }

        // Optimistic update in frontend state and sort by lastAccessedAt
        set((state) => ({
          activeSessionId: sessionId,
          sessions: state.sessions
            .map((s) => s.id === sessionId ? { ...s, lastAccessedAt: now } : s)
            .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt),
        }));
      },

      deleteSession: async (sessionId: string) => {
        // Clear from chat store to prevent stale state
        useChatStore.getState().removeSession(sessionId);

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
        // Get current sessions for rollback
        const previousSessions = get().sessions;

        // Optimistic update - add or update the session title
        set((state) => {
          const exists = state.sessions.some((s) => s.id === sessionId);
          if (exists) {
            // Update existing session
            return {
              sessions: state.sessions.map((s) =>
                s.id === sessionId ? { ...s, title } : s
              ),
            };
          } else {
            // Session not in list yet - this can happen due to timing
            // Just proceed - backend will handle it
            return state;
          }
        });

        try {
          // Persist to backend
          await invoke('agent_update_session_title', { sessionId, title });

          // Ensure we have the latest session list
          await get().loadSessions();
        } catch (error) {
          // Rollback on error
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Check if it's a "session not found" error from the backend
          if (errorMessage.toLowerCase().includes('session not found')) {
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
        // Cache session list for faster startup
        sessions: state.sessions.map(s => ({
          id: s.id,
          provider: s.provider,
          title: s.title,
          firstMessage: s.firstMessage,
          workingDirectory: s.workingDirectory,
          model: s.model,
          messageCount: s.messageCount,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          lastAccessedAt: s.lastAccessedAt,
        })),
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
