import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '../components/ui/Toast';
import { useChatStore } from './chat-store';
import { useSettingsStore } from './settings-store';
import { type ProviderId } from './auth-store';
import { useAppStore } from './app-store';
import { createStartupIssue } from '../lib/startup-recovery';
import { reportTerminalDiagnostic } from '../lib/terminal-diagnostics';

export type SessionKind = 'main' | 'isolated' | 'cron' | 'ephemeral' | 'integration';
export type ExecutionMode = 'execute' | 'plan';

export interface SessionSummary {
  id: string;
  type?: SessionKind;
  provider?: ProviderId;
  executionMode?: ExecutionMode;
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
  executionMode?: ExecutionMode;
  title: string | null;
  firstMessage: string | null;
  workingDirectory: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

export interface SessionBranch {
  id: string;
  sessionId: string;
  name: string;
  status: 'active' | 'merged' | 'abandoned';
  fromTurnId?: string;
  parentBranchId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionBranchMergeResult {
  mergeId: string;
  sourceBranchId: string;
  targetBranchId: string;
  strategy: 'auto' | 'ours' | 'theirs' | 'manual';
  status: 'merged' | 'conflict' | 'failed';
  conflictCount: number;
  conflicts: Array<{ id: string; path: string; reason: string; resolution?: 'ours' | 'theirs' | 'manual' }>;
  mergedAt: number;
  activeBranchId?: string;
}

interface SessionListPageResult {
  sessions: SessionSummary[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
  nextOffset: number | null;
}

interface BootstrapStateResult {
  sessions: SessionSummary[];
  runtime: Record<string, unknown>;
  eventCursor: number;
  timestamp: number;
}

interface SessionState {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  backendInitialized: boolean;
  sessionsTotal: number;
  sessionsHasMore: boolean;
  sessionsOffset: number;
  sessionsQuery: string;
  bootstrapEventCursor: number;
  branchesBySession: Record<string, SessionBranch[]>;
  activeBranchBySession: Record<string, string | null>;
}

interface SessionActions {
  loadSessions: (options?: { reset?: boolean; query?: string }) => Promise<void>;
  loadMoreSessions: () => Promise<void>;
  setSessionSearchQuery: (query: string) => Promise<void>;
  createSession: (
    workingDirectory: string,
    model?: string,
    provider?: ProviderId,
    executionMode?: ExecutionMode
  ) => Promise<string>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  updateSessionWorkingDirectory: (sessionId: string, workingDirectory: string) => Promise<void>;
  setSessionExecutionMode: (sessionId: string, mode: ExecutionMode) => Promise<void>;
  createBranch: (sessionId: string, branchName: string, fromTurnId?: string) => Promise<SessionBranch>;
  mergeBranch: (
    sessionId: string,
    sourceBranchId: string,
    targetBranchId: string,
    strategy?: 'auto' | 'ours' | 'theirs' | 'manual'
  ) => Promise<SessionBranchMergeResult>;
  upsertBranch: (sessionId: string, branch: SessionBranch, makeActive?: boolean) => void;
  applyBranchMerge: (sessionId: string, merge: SessionBranchMergeResult) => void;
  getSessionBranches: (sessionId: string | null) => SessionBranch[];
  getActiveBranchId: (sessionId: string | null) => string | null;
  setActiveBranch: (sessionId: string, branchId: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
  clearError: () => void;
  waitForBackend: () => Promise<void>;
}

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set, get) => ({
      sessionsTotal: 0,
      sessionsHasMore: false,
      sessionsOffset: 0,
      sessionsQuery: '',
      bootstrapEventCursor: 0,
      sessions: [],
      branchesBySession: {},
      activeBranchBySession: {},
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
              useAppStore.getState().setStartupIssue(null);
              return;
            }
          } catch {
            // Sidecar may still be starting, continue polling
          }

          await new Promise(r => setTimeout(r, POLL_INTERVAL));
          elapsed += POLL_INTERVAL;
        }

        useAppStore
          .getState()
          .setStartupIssue(
            createStartupIssue(
              'Backend not ready',
              'Cowork services did not start in time. Open the highlighted recovery screen and retry.'
            )
          );
        const timeoutMessage = `Backend initialization timed out after ${MAX_WAIT}ms`;
        console.error('[SessionStore] waitForBackend timeout', {
          maxWaitMs: MAX_WAIT,
          pollIntervalMs: POLL_INTERVAL,
          elapsedMs: elapsed,
        });
        void reportTerminalDiagnostic(
          'error',
          'session-store.waitForBackend',
          timeoutMessage,
          undefined,
          JSON.stringify({
            maxWaitMs: MAX_WAIT,
            pollIntervalMs: POLL_INTERVAL,
            elapsedMs: elapsed,
          }),
        );
        throw new Error('Backend initialization timed out');
      },

      loadSessions: async (options) => {
        if (get().isLoading) {
          return;
        }
        const reset = options?.reset ?? true;
        const query = options?.query ?? get().sessionsQuery;
        const requestQuery = query;
        const offset = reset ? 0 : get().sessionsOffset;
        const limit = 20;

        set({ isLoading: true, error: null });
        try {
          // Wait for backend to be initialized first
          if (!get().backendInitialized) {
            await get().waitForBackend();
          }

          let bootstrap: BootstrapStateResult | null = null;
          if (reset && requestQuery.trim().length === 0) {
            try {
              bootstrap = await invoke<BootstrapStateResult>('agent_get_bootstrap_state');
              if (bootstrap?.runtime && typeof bootstrap.runtime === 'object') {
                const chatStore = useChatStore.getState();
                for (const [sessionId, runtime] of Object.entries(bootstrap.runtime)) {
                  if (!sessionId) continue;
                  if (!runtime || typeof runtime !== 'object') continue;
                  chatStore.ensureSession(sessionId);
                  chatStore.hydrateRuntimeSnapshot(sessionId, runtime as any);
                }
              }
            } catch {
              // Bootstrap is best effort. Fall back to normal list_sessions flow.
            }
          }

          const page = await invoke<SessionListPageResult>('agent_list_sessions_page', {
            limit,
            offset,
            query,
          });
          const incomingSessions = page.sessions.map((session) => ({
            ...session,
            executionMode: session.executionMode || 'execute',
          }));
          const bootstrapSessions = (bootstrap?.sessions || []).map((session) => ({
            ...session,
            executionMode: session.executionMode || 'execute',
          }));
          const sessions = reset
            ? (incomingSessions.length > 0 ? incomingSessions : bootstrapSessions)
            : [
                ...get().sessions,
                ...incomingSessions.filter(
                  (incoming) => !get().sessions.some((existing) => existing.id === incoming.id)
                ),
              ];

          // SAFETY: If backend returns 0 sessions but we have cached sessions,
          // this might indicate a timing issue - keep cached sessions
          const cachedSessions = get().sessions;
          if (reset && query.trim().length === 0 && sessions.length === 0 && cachedSessions.length > 0) {
            // Still mark as loaded to prevent infinite retries
            set({
              isLoading: false,
              hasLoaded: true,
              sessionsQuery: query,
              sessionsHasMore: false,
              sessionsOffset: 0,
              sessionsTotal: cachedSessions.length,
            });
            useAppStore.getState().setStartupIssue(null);
            return;
          }

          // Validate that activeSessionId still exists in the loaded sessions
          const currentActiveId = get().activeSessionId;
          let activeSessionExists = currentActiveId
            ? sessions.some((s) => s.id === currentActiveId)
            : false;

          let nextSessions = sessions;

          // Keep currently active session discoverable even when pagination doesn't include it yet.
          if (!activeSessionExists && currentActiveId && query.trim().length === 0) {
            try {
              const activeSession = await invoke<SessionInfo & {
                messageCount?: number;
                firstMessage?: string | null;
              }>('agent_get_session', { sessionId: currentActiveId });
              const activeSummary: SessionSummary = {
                id: activeSession.id,
                type: activeSession.type,
                provider: activeSession.provider,
                executionMode: activeSession.executionMode || 'execute',
                title: activeSession.title,
                firstMessage: activeSession.firstMessage || null,
                workingDirectory: activeSession.workingDirectory,
                model: activeSession.model,
                messageCount: activeSession.messageCount ?? 0,
                createdAt: activeSession.createdAt,
                updatedAt: activeSession.updatedAt,
                lastAccessedAt: activeSession.lastAccessedAt,
              };
              nextSessions = [activeSummary, ...sessions.filter((session) => session.id !== currentActiveId)];
              activeSessionExists = true;
            } catch {
              // Session truly doesn't exist
            }
          }

          set({
            sessions: nextSessions,
            isLoading: false,
            hasLoaded: true,
            sessionsQuery: query,
            sessionsTotal: Math.max(page.total, bootstrapSessions.length),
            sessionsHasMore: page.hasMore,
            sessionsOffset: page.nextOffset ?? offset + incomingSessions.length,
            bootstrapEventCursor: bootstrap?.eventCursor ?? get().bootstrapEventCursor,
            // Keep current selection when valid; otherwise select most recent session if available.
            activeSessionId: activeSessionExists
              ? currentActiveId
              : nextSessions.length > 0
                ? nextSessions[0].id
                : null,
          });
          if (get().sessionsQuery !== requestQuery) {
            void get().loadSessions({ reset: true, query: get().sessionsQuery });
            return;
          }
          useAppStore.getState().setStartupIssue(null);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[SessionStore] Failed to load sessions', {
            error: errorMessage,
            backendInitialized: get().backendInitialized,
            hasLoaded: get().hasLoaded,
            activeSessionId: get().activeSessionId,
            cachedSessionCount: get().sessions.length,
          });
          void reportTerminalDiagnostic(
            'error',
            'session-store.loadSessions',
            `Failed to load sessions: ${errorMessage}`,
            error instanceof Error ? error.stack : undefined,
            JSON.stringify({
              backendInitialized: get().backendInitialized,
              hasLoaded: get().hasLoaded,
              activeSessionId: get().activeSessionId,
              cachedSessionCount: get().sessions.length,
            }),
          );
          toast.error('Failed to load sessions', errorMessage);
          useAppStore
            .getState()
            .setStartupIssue(
              createStartupIssue(
                'Could not load workspace',
                `${errorMessage}. Open the highlighted recovery screen, then retry connection.`
              )
            );
          set({
            isLoading: false,
            hasLoaded: true,
            error: errorMessage,
          });
          if (get().sessionsQuery !== requestQuery) {
            void get().loadSessions({ reset: true, query: get().sessionsQuery });
          }
        }
      },

      loadMoreSessions: async () => {
        const state = get();
        if (state.isLoading || !state.sessionsHasMore) {
          return;
        }
        await state.loadSessions({ reset: false });
      },

      setSessionSearchQuery: async (query: string) => {
        const normalized = query.trim();
        if (normalized === get().sessionsQuery && get().hasLoaded) {
          return;
        }
        set({ sessionsQuery: normalized });
        await get().loadSessions({ reset: true, query: normalized });
      },

      createSession: async (
        workingDirectory: string,
        model?: string,
        provider?: ProviderId,
        executionMode: ExecutionMode = 'execute'
      ) => {
        set({ isLoading: true, error: null });
        try {
          const settingsState = useSettingsStore.getState();
          const activeProvider = provider || settingsState.activeProvider;
          const providerModel = model || settingsState.selectedModelByProvider[activeProvider] || settingsState.selectedModel;

          const session = await invoke<SessionInfo>('agent_create_session', {
            workingDirectory,
            model: providerModel,
            provider: activeProvider,
            executionMode,
          });

          // Add to sessions list (new sessions are most recently accessed)
          const newSummary: SessionSummary = {
            id: session.id,
            type: session.type,
            provider: session.provider || activeProvider,
            executionMode: session.executionMode || executionMode,
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
            sessionsTotal: state.sessionsTotal + 1,
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
            .sort((a, b) => {
              if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
              return b.lastAccessedAt - a.lastAccessedAt;
            }),
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
          branchesBySession: Object.fromEntries(
            Object.entries(state.branchesBySession).filter(([id]) => id !== sessionId),
          ),
          activeBranchBySession: Object.fromEntries(
            Object.entries(state.activeBranchBySession).filter(([id]) => id !== sessionId),
          ),
          activeSessionId:
            state.activeSessionId === sessionId ? null : state.activeSessionId,
          sessionsTotal: Math.max(0, state.sessionsTotal - 1),
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

      setSessionExecutionMode: async (sessionId: string, mode: ExecutionMode) => {
        const previousSessions = get().sessions;

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, executionMode: mode } : s
          ),
        }));

        try {
          await invoke('agent_set_execution_mode', { sessionId, mode });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to update execution mode', errorMessage);
          set({
            sessions: previousSessions,
            error: errorMessage,
          });
          throw error;
        }
      },

      createBranch: async (sessionId: string, branchName: string, fromTurnId?: string) => {
        try {
          const branch = await invoke<SessionBranch>('agent_branch_session', {
            sessionId,
            fromTurnId,
            branchName,
          });

          const normalizedBranch: SessionBranch = {
            ...branch,
            sessionId: branch.sessionId || sessionId,
            status:
              branch.status === 'active' || branch.status === 'merged' || branch.status === 'abandoned'
                ? branch.status
                : 'active',
            createdAt: branch.createdAt || Date.now(),
            updatedAt: branch.updatedAt || Date.now(),
          };
          get().upsertBranch(sessionId, normalizedBranch, true);
          return normalizedBranch;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to create branch', errorMessage);
          throw error;
        }
      },

      mergeBranch: async (
        sessionId: string,
        sourceBranchId: string,
        targetBranchId: string,
        strategy: 'auto' | 'ours' | 'theirs' | 'manual' = 'auto',
      ) => {
        try {
          const result = await invoke<SessionBranchMergeResult>('agent_merge_branch', {
            sessionId,
            sourceBranchId,
            targetBranchId,
            strategy,
          });
          get().applyBranchMerge(sessionId, result);
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to merge branch', errorMessage);
          throw error;
        }
      },

      upsertBranch: (sessionId: string, branch: SessionBranch, makeActive = false) => {
        set((state) => {
          const existing = state.branchesBySession[sessionId] || [];
          const next = existing.some((entry) => entry.id === branch.id)
            ? existing.map((entry) => (entry.id === branch.id ? { ...entry, ...branch } : entry))
            : [...existing, branch];
          const sorted = [...next].sort((a, b) => a.createdAt - b.createdAt);
          return {
            branchesBySession: {
              ...state.branchesBySession,
              [sessionId]: sorted,
            },
            activeBranchBySession: {
              ...state.activeBranchBySession,
              [sessionId]:
                makeActive || branch.status === 'active'
                  ? branch.id
                  : state.activeBranchBySession[sessionId] ?? null,
            },
          };
        });
      },

      applyBranchMerge: (sessionId: string, merge: SessionBranchMergeResult) => {
        set((state) => {
          const branches = state.branchesBySession[sessionId] || [];
          const nowTs = Date.now();
          const nextBranches = branches.map((branch) => {
            if (branch.id !== merge.sourceBranchId) return branch;
            if (merge.status !== 'merged') return branch;
            return {
              ...branch,
              status: 'merged' as const,
              updatedAt: nowTs,
            };
          });
          const previousActive = state.activeBranchBySession[sessionId] ?? null;
          const nextActive =
            merge.activeBranchId ||
            (previousActive === merge.sourceBranchId && merge.status === 'merged'
              ? merge.targetBranchId
              : previousActive);
          return {
            branchesBySession: {
              ...state.branchesBySession,
              [sessionId]: nextBranches,
            },
            activeBranchBySession: {
              ...state.activeBranchBySession,
              [sessionId]: nextActive,
            },
          };
        });
      },

      getSessionBranches: (sessionId: string | null) => {
        if (!sessionId) return [];
        return get().branchesBySession[sessionId] || [];
      },

      getActiveBranchId: (sessionId: string | null) => {
        if (!sessionId) return null;
        return get().activeBranchBySession[sessionId] ?? null;
      },

      setActiveBranch: async (sessionId: string, branchId: string) => {
        const previousActive = get().activeBranchBySession[sessionId] ?? null;
        set((state) => ({
          activeBranchBySession: {
            ...state.activeBranchBySession,
            [sessionId]: branchId,
          },
        }));
        try {
          const result = await invoke<{ activeBranchId?: string }>('agent_set_active_branch', {
            sessionId,
            branchId,
          });
          const confirmedActive = result?.activeBranchId || branchId;
          set((state) => ({
            activeBranchBySession: {
              ...state.activeBranchBySession,
              [sessionId]: confirmedActive,
            },
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error('Failed to switch branch', errorMessage);
          set((state) => ({
            activeBranchBySession: {
              ...state.activeBranchBySession,
              [sessionId]: previousActive,
            },
          }));
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
          executionMode: s.executionMode || 'execute',
          title: s.title,
          firstMessage: s.firstMessage,
          workingDirectory: s.workingDirectory,
          model: s.model,
          messageCount: s.messageCount,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          lastAccessedAt: s.lastAccessedAt,
        })),
        branchesBySession: state.branchesBySession,
        activeBranchBySession: state.activeBranchBySession,
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
