import { create } from 'zustand';
import { getRemoteClient } from '@/lib/client';
import type {
  AttachmentPayload,
  ChatItem,
  RemoteEventEnvelope,
  SessionDetails,
  SessionSummary,
  SidecarEvent,
} from '@/types/remote';

interface ChatState {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  sessionDetails: Record<string, SessionDetails>;
  streamBuffers: Record<string, string>;
  isLoadingSessions: boolean;
  isLoadingSession: boolean;
  isSending: boolean;
  error: string | null;
}

interface ChatActions {
  reset: () => void;
  loadSessions: () => Promise<void>;
  createSession: (input?: {
    workingDirectory?: string;
    model?: string;
    provider?: string;
    executionMode?: 'execute' | 'plan';
    title?: string;
  }) => Promise<SessionSummary>;
  selectSession: (sessionId: string) => Promise<void>;
  refreshActiveSession: () => Promise<void>;
  sendMessage: (
    sessionId: string,
    content: string,
    attachments?: AttachmentPayload[],
  ) => Promise<void>;
  stopGeneration: (sessionId: string) => Promise<void>;
  respondPermission: (
    sessionId: string,
    permissionId: string,
    decision: 'allow' | 'deny' | 'allow_once' | 'allow_session',
  ) => Promise<void>;
  respondQuestion: (sessionId: string, questionId: string, answer: string | string[]) => Promise<void>;
  applyEventEnvelope: (envelope: RemoteEventEnvelope) => void;
  applySidecarEvent: (event: SidecarEvent) => void;
  clearError: () => void;
}

const initialState: ChatState = {
  sessions: [],
  activeSessionId: null,
  sessionDetails: {},
  streamBuffers: {},
  isLoadingSessions: false,
  isLoadingSession: false,
  isSending: false,
  error: null,
};

function upsertChatItem(details: SessionDetails, item: ChatItem): SessionDetails {
  const existing = details.chatItems || [];
  const idx = existing.findIndex((entry) => entry.id === item.id);
  if (idx >= 0) {
    const next = existing.slice();
    next[idx] = item;
    return { ...details, chatItems: next };
  }
  return { ...details, chatItems: [...existing, item] };
}

function updateChatItem(details: SessionDetails, itemId: string, updates: Record<string, unknown>): SessionDetails {
  const existing = details.chatItems || [];
  const idx = existing.findIndex((entry) => entry.id === itemId);
  if (idx < 0) return details;
  const next = existing.slice();
  next[idx] = {
    ...next[idx],
    ...updates,
  };
  return { ...details, chatItems: next };
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  ...initialState,

  reset: () => set({ ...initialState }),

  loadSessions: async () => {
    set({ isLoadingSessions: true, error: null });
    try {
      const sessions = await getRemoteClient().listSessions();
      set((state) => ({
        sessions,
        isLoadingSessions: false,
        activeSessionId: state.activeSessionId || sessions[0]?.id || null,
      }));

      const activeSessionId = get().activeSessionId;
      if (activeSessionId) {
        await get().selectSession(activeSessionId);
      }
    } catch (error) {
      set({
        isLoadingSessions: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  createSession: async (input) => {
    try {
      const session = await getRemoteClient().createSession(input || {});
      set((state) => ({
        sessions: [session, ...state.sessions.filter((entry) => entry.id !== session.id)],
        activeSessionId: session.id,
      }));
      await get().selectSession(session.id);
      return session;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  selectSession: async (sessionId) => {
    set({ activeSessionId: sessionId, isLoadingSession: true, error: null });
    try {
      const details = await getRemoteClient().getSession(sessionId);
      set((state) => ({
        sessionDetails: {
          ...state.sessionDetails,
          [sessionId]: details,
        },
        isLoadingSession: false,
      }));
    } catch (error) {
      set({
        isLoadingSession: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  refreshActiveSession: async () => {
    const activeSessionId = get().activeSessionId;
    if (!activeSessionId) return;
    await get().selectSession(activeSessionId);
  },

  sendMessage: async (sessionId, content, attachments = []) => {
    set({ isSending: true, error: null });
    try {
      await getRemoteClient().sendMessage(sessionId, content, attachments);
      set({ isSending: false });
    } catch (error) {
      set({
        isSending: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  stopGeneration: async (sessionId) => {
    try {
      await getRemoteClient().stopGeneration(sessionId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  respondPermission: async (sessionId, permissionId, decision) => {
    try {
      await getRemoteClient().respondPermission(sessionId, permissionId, decision);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  respondQuestion: async (sessionId, questionId, answer) => {
    try {
      await getRemoteClient().respondQuestion(sessionId, questionId, answer);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  applyEventEnvelope: (envelope) => {
    if (envelope.type === 'event' && envelope.event) {
      get().applySidecarEvent(envelope.event);
    }
    if (envelope.type === 'error') {
      const message = typeof envelope.error === 'string' ? envelope.error : 'Unknown websocket error';
      set({ error: message });
    }
  },

  applySidecarEvent: (event) => {
    const sessionId = event.sessionId || get().activeSessionId;
    if (!sessionId) return;

    if (event.type === 'stream:chunk') {
      const chunk = typeof (event.data as { content?: unknown })?.content === 'string'
        ? ((event.data as { content: string }).content)
        : '';
      if (!chunk) return;
      set((state) => ({
        streamBuffers: {
          ...state.streamBuffers,
          [sessionId]: `${state.streamBuffers[sessionId] || ''}${chunk}`,
        },
      }));
      return;
    }

    if (event.type === 'stream:done') {
      set((state) => {
        const { [sessionId]: _discard, ...rest } = state.streamBuffers;
        return { streamBuffers: rest };
      });
      return;
    }

    if (event.type === 'chat:item') {
      const item = (event.data as { item?: ChatItem })?.item;
      if (!item) return;
      set((state) => {
        const current = state.sessionDetails[sessionId];
        if (!current) return state;
        return {
          sessionDetails: {
            ...state.sessionDetails,
            [sessionId]: upsertChatItem(current, item),
          },
        };
      });
      return;
    }

    if (event.type === 'chat:update') {
      const payload = event.data as { itemId?: string; updates?: Record<string, unknown> };
      if (!payload.itemId || !payload.updates) return;
      set((state) => {
        const current = state.sessionDetails[sessionId];
        if (!current) return state;
        return {
          sessionDetails: {
            ...state.sessionDetails,
            [sessionId]: updateChatItem(current, payload.itemId!, payload.updates!),
          },
        };
      });
      return;
    }

    if (event.type === 'chat:items') {
      const items = (event.data as { items?: ChatItem[] })?.items;
      if (!items) return;
      set((state) => {
        const current = state.sessionDetails[sessionId];
        if (!current) return state;
        return {
          sessionDetails: {
            ...state.sessionDetails,
            [sessionId]: {
              ...current,
              chatItems: items,
            },
          },
        };
      });
      return;
    }

    if (event.type === 'session:updated') {
      const session = (event.data as { session?: SessionSummary })?.session;
      if (!session) return;
      set((state) => ({
        sessions: [session, ...state.sessions.filter((entry) => entry.id !== session.id)],
      }));
      return;
    }

    if (event.type === 'error') {
      const message = (event.data as { error?: unknown })?.error;
      if (typeof message === 'string') {
        set({ error: message });
      }
    }
  },

  clearError: () => set({ error: null }),
}));

export function useActiveSessionDetails(): SessionDetails | null {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  return useChatStore((state) =>
    activeSessionId ? state.sessionDetails[activeSessionId] || null : null,
  );
}
