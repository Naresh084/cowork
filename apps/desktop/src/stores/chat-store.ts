import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  Message,
  MessageContentPart,
  PermissionRequest as BasePermissionRequest,
  ChatItem,
  ContextUsage,
} from '@gemini-cowork/shared';
import type { Task, Artifact } from './agent-store';
import { useAgentStore } from './agent-store';
import { useSessionStore } from './session-store';

export interface Attachment {
  type: 'file' | 'image' | 'text' | 'audio' | 'video' | 'pdf';
  name: string;
  path?: string;
  mimeType?: string;
  data?: string; // base64 encoded
  size?: number;
}

export interface ToolExecution {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
  /** If set, this tool is a sub-tool executed within a parent task tool */
  parentToolId?: string;
}

export interface MediaActivityItem {
  kind: 'image' | 'video';
  path?: string;
  url?: string;
  mimeType?: string;
  data?: string; // base64 data for reliable display
}

export interface ReportActivityItem {
  title?: string;
  path?: string;
  snippet?: string;
}

export interface DesignActivityItem {
  title?: string;
  preview?: {
    name?: string;
    content?: string;
    url?: string;
    path?: string;
    mimeType?: string;
  };
}

export interface BrowserViewScreenshot {
  data: string;        // base64 PNG screenshot data
  mimeType: string;    // 'image/png'
  url: string;         // current browser URL
  timestamp: number;   // when captured (Date.now())
}

export interface TurnActivityItem {
  id: string;
  type: 'thinking' | 'tool' | 'permission' | 'question' | 'media' | 'report' | 'design' | 'assistant';
  status?: 'active' | 'done';
  toolId?: string;
  permissionId?: string;
  questionId?: string;
  messageId?: string;
  mediaItems?: MediaActivityItem[];
  report?: ReportActivityItem;
  design?: DesignActivityItem;
  createdAt: number;
}

export interface ExtendedPermissionRequest extends BasePermissionRequest {
  id: string;
  sessionId: string;
  toolName?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  createdAt: number;
}

export interface QuestionOption {
  label: string;
  description?: string;
  value?: string;
}

export interface UserQuestion {
  id: string;
  sessionId: string;
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
  allowCustom?: boolean;
  createdAt: number;
}

export interface SessionChatState {
  // ============================================================================
  // V2 Unified Storage (sole source of truth)
  // ============================================================================
  /** Unified chat items array - the single source of truth */
  chatItems: ChatItem[];
  /** Context usage info (persisted) */
  contextUsage: ContextUsage | null;

  // ============================================================================
  // Streaming State (temporary, not persisted)
  // ============================================================================
  isStreaming: boolean;
  isThinking: boolean;
  thinkingStartedAt?: number;
  thinkingContent: string;
  streamingContent: string;
  activeTurnId?: string;
  currentTool: ToolExecution | null;

  // ============================================================================
  // Interactive State (permissions, questions)
  // ============================================================================
  pendingPermissions: ExtendedPermissionRequest[];
  pendingQuestions: UserQuestion[];

  // ============================================================================
  // Message Queue State
  // ============================================================================
  messageQueue: Array<{ id: string; content: string; queuedAt: number }>;

  // ============================================================================
  // UI State
  // ============================================================================
  error: string | null;
  isLoadingMessages: boolean;
  lastUpdatedAt: number;
  hasLoaded: boolean;
  lastUserMessage?: {
    content: string;
    attachments?: Attachment[];
  };
  browserViewScreenshot: BrowserViewScreenshot | null;
}

interface ChatState {
  sessions: Record<string, SessionChatState>;
  error: string | null;
}

interface ChatActions {
  loadMessages: (sessionId: string, forceReload?: boolean) => Promise<SessionDetails | null>;
  sendMessage: (
    sessionId: string,
    content: string,
    attachments?: Attachment[]
  ) => Promise<void>;
  respondToPermission: (
    sessionId: string,
    permissionId: string,
    decision: 'allow' | 'deny' | 'allow_once' | 'allow_session'
  ) => Promise<void>;
  stopGeneration: (sessionId: string) => Promise<void>;
  clearError: () => void;

  // Session helpers
  getSessionState: (sessionId: string | null) => SessionChatState;
  ensureSession: (sessionId: string) => void;
  resetSession: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;

  // Internal actions for event handling
  appendStreamChunk: (sessionId: string, chunk: string) => void;
  setStreamingTool: (sessionId: string, tool: ToolExecution | null) => void;
  addPermissionRequest: (sessionId: string, request: ExtendedPermissionRequest) => void;
  removePermissionRequest: (sessionId: string, id: string) => void;
  addQuestion: (sessionId: string, question: UserQuestion) => void;
  removeQuestion: (sessionId: string, id: string) => void;
  respondToQuestion: (
    sessionId: string,
    questionId: string,
    answer: string | string[]
  ) => Promise<void>;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setThinking: (sessionId: string, thinking: boolean) => void;
  appendThinkingChunk: (sessionId: string, chunk: string) => void;
  clearThinkingContent: (sessionId: string) => void;
  clearStreamingContent: (sessionId: string) => void;

  // V2 ChatItem actions
  appendChatItem: (sessionId: string, item: ChatItem) => void;
  updateChatItem: (sessionId: string, itemId: string, updates: Partial<ChatItem>) => void;
  setChatItems: (sessionId: string, items: ChatItem[]) => void;
  updateContextUsage: (sessionId: string, usage: ContextUsage) => void;

  // Message Queue
  updateMessageQueue: (sessionId: string, queue: Array<{ id: string; content: string; queuedAt: number }>) => void;
  removeFromQueue: (sessionId: string, messageId: string) => Promise<void>;
  sendQueuedImmediately: (sessionId: string, messageId: string) => Promise<void>;
  editQueuedMessage: (sessionId: string, messageId: string, newContent: string) => Promise<void>;

  // Browser View (Live View for computer_use)
  isComputerUseRunning: (sessionId: string | null) => boolean;
  updateBrowserScreenshot: (sessionId: string, screenshot: BrowserViewScreenshot) => void;
  clearBrowserScreenshot: (sessionId: string) => void;
}

export interface SessionDetails {
  id: string;
  messages: Message[];
  chatItems: ChatItem[];
  tasks: Task[];
  artifacts: Artifact[];
}

const createSessionState = (): SessionChatState => ({
  // V2 unified storage (sole source of truth)
  chatItems: [],
  contextUsage: null,

  // Streaming state
  isStreaming: false,
  isThinking: false,
  thinkingStartedAt: undefined,
  thinkingContent: '',
  streamingContent: '',
  activeTurnId: undefined,
  currentTool: null,

  // Interactive state
  pendingPermissions: [],
  pendingQuestions: [],

  // Message queue
  messageQueue: [],

  // UI state
  error: null,
  isLoadingMessages: false,
  lastUpdatedAt: Date.now(),
  hasLoaded: false,
  lastUserMessage: undefined,
  browserViewScreenshot: null,
});

const EMPTY_SESSION_STATE = createSessionState();

const updateSession = (
  state: ChatState,
  sessionId: string,
  updater: (session: SessionChatState) => SessionChatState
) => {
  const existing = state.sessions[sessionId] ?? createSessionState();
  const updated = updater(existing);
  return {
    sessions: {
      ...state.sessions,
      [sessionId]: {
        ...updated,
        lastUpdatedAt: Date.now(),
      },
    },
  };
};

// ============================================================================
// V2 Legacy Conversion - Convert old V1 data to V2 ChatItems
// ============================================================================

/**
 * Convert legacy V1 messages to V2 ChatItems for backward compatibility.
 * Used when loading old sessions that only have V1 messages and no chatItems.
 */
function convertLegacyToV2(messages: Message[], toolExecutions?: ToolExecution[]): ChatItem[] {
  const items: ChatItem[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      items.push({
        id: msg.id,
        kind: 'user_message',
        content: msg.content,
        turnId: msg.id,
        timestamp: msg.createdAt,
      } as ChatItem);
    } else if (msg.role === 'assistant') {
      // Find the preceding user message to set as turnId
      const precedingUser = [...messages]
        .filter(m => m.role === 'user' && m.createdAt <= msg.createdAt)
        .pop();
      items.push({
        id: msg.id,
        kind: 'assistant_message',
        content: msg.content,
        metadata: msg.metadata,
        turnId: precedingUser?.id,
        timestamp: msg.createdAt,
      } as ChatItem);
    } else if (msg.role === 'system') {
      const errMeta = msg.metadata as { kind?: string; code?: string; raw?: string; details?: Record<string, unknown> } | undefined;
      if (errMeta?.kind === 'error') {
        items.push({
          id: msg.id,
          kind: 'error',
          message: errMeta.raw || (typeof msg.content === 'string' ? msg.content : 'Error'),
          code: errMeta.code,
          details: errMeta.details,
          timestamp: msg.createdAt,
        } as ChatItem);
      } else {
        items.push({
          id: msg.id,
          kind: 'system_message',
          content: typeof msg.content === 'string' ? msg.content : 'System message',
          metadata: msg.metadata,
          timestamp: msg.createdAt,
        } as ChatItem);
      }
    }
  }

  // Convert tool executions to tool_start + tool_result pairs
  if (toolExecutions) {
    for (const tool of toolExecutions) {
      // Find the user message that preceded this tool
      const precedingUser = messages
        .filter(m => m.role === 'user' && m.createdAt <= tool.startedAt)
        .pop();
      const turnId = precedingUser?.id;

      items.push({
        id: `ts-${tool.id}`,
        kind: 'tool_start',
        toolId: tool.id,
        name: tool.name,
        args: tool.args,
        status: tool.status === 'running' ? 'running' : tool.status === 'error' ? 'error' : 'completed',
        parentToolId: tool.parentToolId,
        turnId,
        timestamp: tool.startedAt,
      } as ChatItem);

      if (tool.status !== 'running' && tool.status !== 'pending') {
        items.push({
          id: `tr-${tool.id}`,
          kind: 'tool_result',
          toolId: tool.id,
          name: tool.name,
          status: tool.status === 'error' ? 'error' : 'success',
          result: tool.result,
          error: tool.error,
          parentToolId: tool.parentToolId,
          turnId,
          timestamp: tool.completedAt || tool.startedAt,
        } as ChatItem);
      }
    }
  }

  // Sort by timestamp
  items.sort((a, b) => a.timestamp - b.timestamp);
  return items;
}

// ============================================================================
// V2 Derivation Functions - Derive V1-shaped structures from chatItems
// ============================================================================

/**
 * Derive Message[] from chatItems for rendering.
 * Extracts user_message, assistant_message, and system_message items.
 */
export function deriveMessagesFromItems(chatItems: ChatItem[]): Message[] {
  const messages: Message[] = [];
  for (const item of chatItems) {
    if (item.kind === 'user_message') {
      messages.push({
        id: item.turnId || item.id,
        role: 'user',
        content: item.content,
        createdAt: item.timestamp,
      });
    } else if (item.kind === 'assistant_message') {
      messages.push({
        id: item.id,
        role: 'assistant',
        content: item.content,
        createdAt: item.timestamp,
        metadata: item.metadata,
      });
    } else if (item.kind === 'system_message') {
      messages.push({
        id: item.id,
        role: 'system',
        content: item.content,
        createdAt: item.timestamp,
        metadata: item.metadata,
      });
    } else if (item.kind === 'error') {
      messages.push({
        id: item.id,
        role: 'system',
        content: item.message,
        createdAt: item.timestamp,
        metadata: {
          kind: 'error',
          code: item.code,
          details: item.details,
          raw: item.message,
        },
      });
    }
  }
  return messages;
}

/**
 * Derive Map<toolId, ToolExecution> from chatItems.
 * Merges tool_start and tool_result items into ToolExecution objects.
 */
export function deriveToolMapFromItems(chatItems: ChatItem[]): Map<string, ToolExecution> {
  const map = new Map<string, ToolExecution>();

  for (const item of chatItems) {
    if (item.kind === 'tool_start') {
      map.set(item.toolId, {
        id: item.toolId,
        name: item.name,
        args: item.args as Record<string, unknown>,
        status: item.status === 'running' ? 'running' : item.status === 'error' ? 'error' : 'success',
        startedAt: item.timestamp,
        parentToolId: item.parentToolId,
      });
    } else if (item.kind === 'tool_result') {
      const existing = map.get(item.toolId);
      if (existing) {
        existing.status = item.status === 'success' ? 'success' : 'error';
        existing.result = item.result;
        existing.error = item.error;
        existing.completedAt = item.timestamp;
      } else {
        // tool_result arrived without tool_start (edge case)
        map.set(item.toolId, {
          id: item.toolId,
          name: item.name,
          args: {},
          status: item.status === 'success' ? 'success' : 'error',
          result: item.result,
          error: item.error,
          startedAt: item.timestamp,
          completedAt: item.timestamp,
          parentToolId: item.parentToolId,
        });
      }
    }
  }

  return map;
}

/**
 * Derive turnActivities from chatItems for rendering.
 * Groups items by turnId and builds TurnActivityItem[] for each turn.
 */
export function deriveTurnActivitiesFromItems(
  chatItems: ChatItem[],
  pendingPermissions: ExtendedPermissionRequest[],
  pendingQuestions: UserQuestion[]
): Record<string, TurnActivityItem[]> {
  const turnActivities: Record<string, TurnActivityItem[]> = {};
  const pendingPermissionIds = new Set(pendingPermissions.map(p => p.id));
  const pendingQuestionIds = new Set(pendingQuestions.map(q => q.id));

  // Collect all user message turn IDs to ensure every turn has an entry
  for (const item of chatItems) {
    if (item.kind === 'user_message') {
      const turnId = item.turnId || item.id;
      if (!turnActivities[turnId]) {
        turnActivities[turnId] = [];
      }
    }
  }

  for (const item of chatItems) {
    const turnId = item.turnId || (item.kind === 'user_message' ? item.id : undefined);
    if (!turnId) continue;
    if (!turnActivities[turnId]) {
      turnActivities[turnId] = [];
    }
    const activities = turnActivities[turnId];

    switch (item.kind) {
      case 'tool_start': {
        // Skip sub-tools - they render inside their parent task card
        if (item.parentToolId) break;
        activities.push({
          id: `act-tool-${item.toolId}`,
          type: 'tool',
          status: item.status === 'running' ? 'active' : 'done',
          toolId: item.toolId,
          createdAt: item.timestamp,
        });
        break;
      }
      case 'media': {
        activities.push({
          id: `act-media-${item.id}`,
          type: 'media',
          status: 'done',
          mediaItems: [{
            kind: item.mediaType,
            path: item.path,
            url: item.url,
            mimeType: item.mimeType,
            data: item.data,
          }],
          createdAt: item.timestamp,
        });
        break;
      }
      case 'report': {
        activities.push({
          id: `act-report-${item.id}`,
          type: 'report',
          status: 'done',
          report: {
            title: item.title,
            path: item.path,
            snippet: item.snippet,
          },
          createdAt: item.timestamp,
        });
        break;
      }
      case 'design': {
        activities.push({
          id: `act-design-${item.id}`,
          type: 'design',
          status: 'done',
          design: {
            title: item.title,
            preview: item.preview,
          },
          createdAt: item.timestamp,
        });
        break;
      }
      case 'permission': {
        // Only show if still pending
        if (item.status === 'pending' || pendingPermissionIds.has(item.permissionId)) {
          activities.push({
            id: `act-perm-${item.id}`,
            type: 'permission',
            status: item.status === 'pending' ? 'active' : 'done',
            permissionId: item.permissionId,
            createdAt: item.timestamp,
          });
        }
        break;
      }
      case 'question': {
        // Only show if still pending
        if (item.status === 'pending' || pendingQuestionIds.has(item.questionId)) {
          activities.push({
            id: `act-question-${item.id}`,
            type: 'question',
            status: item.status === 'pending' ? 'active' : 'done',
            questionId: item.questionId,
            createdAt: item.timestamp,
          });
        }
        break;
      }
      case 'assistant_message': {
        activities.push({
          id: `act-assistant-${item.id}`,
          type: 'assistant',
          status: 'done',
          messageId: item.id,
          createdAt: item.timestamp,
        });
        break;
      }
      // user_message, thinking, tool_result, error, system_message: skip (not rendered as activities)
    }
  }

  return turnActivities;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  sessions: {},
  error: null,

  getSessionState: (sessionId: string | null) => {
    if (!sessionId) return EMPTY_SESSION_STATE;
    const state = get();
    return state.sessions[sessionId] ?? EMPTY_SESSION_STATE;
  },

  isComputerUseRunning: (sessionId: string | null) => {
    if (!sessionId) return false;
    const state = get();
    const session = state.sessions[sessionId];
    if (!session) return false;
    return session.chatItems.some(
      (ci) => ci.kind === 'tool_start' && ci.name.toLowerCase() === 'computer_use' && ci.status === 'running'
    );
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

  loadMessages: async (sessionId: string, forceReload = false) => {
    if (!sessionId) return null;

    // CRITICAL: Wait for backend to be initialized before attempting to load
    // This prevents "session not found" errors during app startup
    const sessionStore = useSessionStore.getState();
    if (!sessionStore.backendInitialized) {
      await sessionStore.waitForBackend();
    }

    // Check if already loaded or currently loading (prevents duplicate concurrent loads)
    const sessionState = get().sessions[sessionId];
    if (!forceReload && (sessionState?.hasLoaded || sessionState?.isLoadingMessages)) {
      return null;
    }

    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      isLoadingMessages: true,
      error: null,
    })));

    const attemptLoad = async (retry = 0): Promise<SessionDetails | null> => {
      try {
        const session = await invoke<SessionDetails>('agent_get_session', { sessionId });
        const agentStore = useAgentStore.getState();

        set((state) => updateSession(state, sessionId, (existing) => {
          // V2: Merge chatItems as sole source of truth
          const existingChatItems = existing.chatItems || [];
          let incomingChatItems = session.chatItems || [];

          // Backward compat: if backend has V1 messages but no chatItems, convert
          if (incomingChatItems.length === 0 && session.messages && session.messages.length > 0) {
            incomingChatItems = convertLegacyToV2(session.messages);
          }

          const mergedChatItems = [...existingChatItems];
          for (const item of incomingChatItems) {
            if (!mergedChatItems.some((ci) => ci.id === item.id)) {
              mergedChatItems.push(item);
            }
          }

          return {
            ...existing,
            chatItems: mergedChatItems,
            isLoadingMessages: false,
            hasLoaded: true,
          };
        }));

        if (session.tasks) {
          agentStore.setTasks(sessionId, session.tasks);
        }

        if (session.artifacts) {
          agentStore.setArtifacts(sessionId, session.artifacts);
        }

        return session;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const msgLower = errorMessage.toLowerCase();

        // Check if it's a transient error that should be retried
        const isTransient = msgLower.includes('timeout') ||
          msgLower.includes('connection') ||
          msgLower.includes('network');

        if (isTransient && retry < 3) {
          await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
          return attemptLoad(retry + 1);
        }

        // Session not found - mark as loaded but empty
        if (msgLower.includes('session not found')) {
          set((state) => updateSession(state, sessionId, (existing) => ({
            ...existing,
            chatItems: [],
            isLoadingMessages: false,
            error: null,
            hasLoaded: true,
          })));
          return null;
        }

        // Other error - keep hasLoaded as false so it can be retried
        console.error('[ChatStore] Failed to load messages:', errorMessage);
        set((state) => updateSession(state, sessionId, (existing) => ({
          ...existing,
          isLoadingMessages: false,
          error: errorMessage,
          hasLoaded: false,
        })));
        return null;
      }
    };

    return attemptLoad();
  },

  sendMessage: async (
    sessionId: string,
    content: string,
    attachments?: Attachment[]
  ) => {
    if (!sessionId) return;
    let userContent: Message['content'] = content;

    if (attachments && attachments.length > 0) {
      const parts: MessageContentPart[] = [];

      if (content.trim()) {
        parts.push({
          type: 'text',
          text: content,
        });
      }

      for (const attachment of attachments) {
        if (attachment.type === 'image' && attachment.data) {
          parts.push({
            type: 'image',
            mimeType: attachment.mimeType || 'image/png',
            data: attachment.data,
          });
        }

        if (attachment.type === 'audio' && attachment.data) {
          parts.push({
            type: 'audio',
            mimeType: attachment.mimeType || 'audio/mpeg',
            data: attachment.data,
          });
        }

        if (attachment.type === 'video' && attachment.data) {
          parts.push({
            type: 'video',
            mimeType: attachment.mimeType || 'video/mp4',
            data: attachment.data,
          });
        }

        if ((attachment.type === 'file' || attachment.type === 'pdf') && attachment.data) {
          parts.push({
            type: 'file',
            name: attachment.name,
            mimeType: attachment.mimeType,
            data: attachment.data,
          });
        }

        if (attachment.type === 'text' && attachment.data) {
          parts.push({
            type: 'text',
            text: `File: ${attachment.name}
${attachment.data}`,
          });
        }

        if ((attachment.type === 'file' || attachment.type === 'pdf') && !attachment.data) {
          parts.push({
            type: 'text',
            text: `File: ${attachment.name}`,
          });
        }
      }

      if (parts.length > 0) {
        userContent = parts;
      }
    }

    const tempId = `temp-${Date.now()}`;

    // V2: Create UserMessageItem as the sole data entry
    const userChatItem: ChatItem = {
      id: tempId,
      kind: 'user_message',
      content: userContent,
      turnId: tempId,
      timestamp: Date.now(),
      attachments: attachments?.map(a => ({
        type: a.type,
        name: a.name,
        path: a.path,
        mimeType: a.mimeType,
        data: a.data,
        size: a.size,
      })),
    };

    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      chatItems: [...session.chatItems, userChatItem],
      isStreaming: true,
      isThinking: true,
      thinkingStartedAt: Date.now(),
      streamingContent: '',
      error: null,
      lastUserMessage: {
        content,
        attachments,
      },
      activeTurnId: tempId,
    })));

    try {
      await invoke('agent_send_message', {
        sessionId,
        content,
        attachments,
      });
    } catch (error) {
      set((state) => updateSession(state, sessionId, (session) => ({
        ...session,
        isStreaming: false,
        isThinking: false,
        error: error instanceof Error ? error.message : String(error),
      })));
    }
  },

  respondToPermission: async (
    sessionId: string,
    permissionId: string,
    decision: 'allow' | 'deny' | 'allow_once' | 'allow_session'
  ) => {
    if (!sessionId) return;
    try {
      await invoke('agent_respond_permission', {
        sessionId,
        permissionId,
        decision,
      });

      set((state) => updateSession(state, sessionId, (session) => ({
        ...session,
        pendingPermissions: session.pendingPermissions.filter(
          (p) => p.id !== permissionId
        ),
      })));
    } catch (error) {
      set((state) => updateSession(state, sessionId, (session) => ({
        ...session,
        error: error instanceof Error ? error.message : String(error),
      })));
    }
  },

  stopGeneration: async (sessionId: string) => {
    if (!sessionId) return;
    try {
      await invoke('agent_stop_generation', { sessionId });
      set((state) => updateSession(state, sessionId, (session) => ({
        ...session,
        isStreaming: false,
        isThinking: false,
      })));
    } catch (error) {
      set((state) => updateSession(state, sessionId, (session) => ({
        ...session,
        error: error instanceof Error ? error.message : String(error),
      })));
    }
  },

  clearError: () => {
    set({ error: null });
  },

  appendStreamChunk: (sessionId: string, chunk: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      streamingContent: session.streamingContent + chunk,
      isThinking: false,
    })));
  },

  setStreamingTool: (sessionId: string, tool: ToolExecution | null) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      currentTool: tool,
    })));
  },

  addPermissionRequest: (sessionId: string, request: ExtendedPermissionRequest) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      pendingPermissions: [...session.pendingPermissions, request],
    })));
  },

  removePermissionRequest: (sessionId: string, id: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      pendingPermissions: session.pendingPermissions.filter((p) => p.id !== id),
    })));
  },

  addQuestion: (sessionId: string, question: UserQuestion) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      pendingQuestions: [...session.pendingQuestions, question],
    })));
  },

  removeQuestion: (sessionId: string, id: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      pendingQuestions: session.pendingQuestions.filter((q) => q.id !== id),
    })));
  },

  respondToQuestion: async (
    sessionId: string,
    questionId: string,
    answer: string | string[]
  ) => {
    if (!sessionId) return;
    try {
      await invoke('agent_respond_question', {
        sessionId,
        questionId,
        answer,
      });
      set((state) => updateSession(state, sessionId, (session) => ({
        ...session,
        pendingQuestions: session.pendingQuestions.filter((q) => q.id !== questionId),
      })));
    } catch (error) {
      set((state) => updateSession(state, sessionId, (session) => ({
        ...session,
        error: error instanceof Error ? error.message : String(error),
      })));
    }
  },

  setStreaming: (sessionId: string, streaming: boolean) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      isStreaming: streaming,
    })));
  },

  setThinking: (sessionId: string, thinking: boolean) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      isThinking: thinking,
      thinkingStartedAt: thinking ? (session.thinkingStartedAt || Date.now()) : undefined,
    })));
  },

  appendThinkingChunk: (sessionId: string, chunk: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      thinkingContent: session.thinkingContent + chunk,
      lastUpdatedAt: Date.now(),
    })));
  },

  clearThinkingContent: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      thinkingContent: '',
    })));
  },

  clearStreamingContent: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      streamingContent: '',
    })));
  },

  // ============================================================================
  // V2 ChatItem Actions
  // ============================================================================

  appendChatItem: (sessionId: string, item: ChatItem) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => {
      // Dedup: if incoming user_message matches a temp- item by content, replace it
      if (item.kind === 'user_message') {
        const tempIdx = session.chatItems.findIndex(
          (ci) => ci.kind === 'user_message' && ci.id.startsWith('temp-') &&
                  JSON.stringify(ci.content) === JSON.stringify(item.content)
        );
        if (tempIdx !== -1) {
          const oldItem = session.chatItems[tempIdx];
          const updated = [...session.chatItems];
          updated[tempIdx] = item;
          // Update activeTurnId if it was pointing to the temp item's turnId
          const newTurnId = item.turnId || item.id;
          const oldTurnId = oldItem.kind === 'user_message' ? (oldItem.turnId || oldItem.id) : undefined;
          const newActiveTurnId = (session.activeTurnId && oldTurnId && session.activeTurnId === oldTurnId)
            ? newTurnId
            : session.activeTurnId;
          return { ...session, chatItems: updated, activeTurnId: newActiveTurnId };
        }
      }
      // Dedup: skip if item with same ID already exists
      if (session.chatItems.some((ci) => ci.id === item.id)) {
        return session;
      }
      return { ...session, chatItems: [...session.chatItems, item] };
    }));
  },

  updateChatItem: (sessionId: string, itemId: string, updates: Partial<ChatItem>) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      chatItems: session.chatItems.map((item) =>
        item.id === itemId ? { ...item, ...updates } as ChatItem : item
      ),
    })));
  },

  setChatItems: (sessionId: string, items: ChatItem[]) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      chatItems: items,
      hasLoaded: true,
    })));
  },

  updateContextUsage: (sessionId: string, usage: ContextUsage) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      contextUsage: usage,
    })));
  },

  // Message Queue
  updateMessageQueue: (sessionId: string, queue: Array<{ id: string; content: string; queuedAt: number }>) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      messageQueue: queue,
    })));
  },

  removeFromQueue: async (sessionId: string, messageId: string) => {
    if (!sessionId) return;
    try {
      await invoke('agent_remove_from_queue', { sessionId, messageId });
    } catch (error) {
      console.error('[ChatStore] Failed to remove from queue:', error);
    }
  },

  sendQueuedImmediately: async (sessionId: string, messageId: string) => {
    if (!sessionId) return;
    try {
      await invoke('agent_send_queued_immediately', { sessionId, messageId });
    } catch (error) {
      console.error('[ChatStore] Failed to send queued message:', error);
    }
  },

  editQueuedMessage: async (sessionId: string, messageId: string, newContent: string) => {
    if (!sessionId) return;
    try {
      await invoke('agent_edit_queued_message', { sessionId, messageId, content: newContent });
    } catch (error) {
      console.error('[ChatStore] Failed to edit queued message:', error);
    }
  },

  // Browser View (Live View for computer_use)
  updateBrowserScreenshot: (sessionId: string, screenshot: BrowserViewScreenshot) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      browserViewScreenshot: screenshot,
    })));
  },

  clearBrowserScreenshot: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      browserViewScreenshot: null,
    })));
  },
}));
