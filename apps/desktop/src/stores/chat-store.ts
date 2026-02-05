import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Message, MessageContentPart, PermissionRequest as BasePermissionRequest } from '@gemini-cowork/shared';
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

// Extended types for persistence
interface PersistedMessage extends Message {
  toolExecutionIds?: string[];
}

interface PersistedToolExecution extends ToolExecution {
  turnMessageId?: string;
  turnOrder?: number;
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
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  thinkingStartedAt?: number;
  thinkingContent: string;
  streamingContent: string;
  streamingToolCalls: ToolExecution[];
  turnActivities: Record<string, TurnActivityItem[]>;
  activeTurnId?: string;
  pendingPermissions: ExtendedPermissionRequest[];
  pendingQuestions: UserQuestion[];
  currentTool: ToolExecution | null;
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
  addMessage: (sessionId: string, message: Message) => void;
  updateToolExecution: (sessionId: string, toolId: string, updates: Partial<ToolExecution>) => void;
  addToolExecution: (sessionId: string, tool: ToolExecution) => void;
  resetToolExecutions: (sessionId: string) => void;
  startTurn: (sessionId: string, userMessageId: string) => void;
  addTurnActivity: (sessionId: string, activity: Omit<TurnActivityItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => void;
  completeTurnThinking: (sessionId: string) => void;
  endTurn: (sessionId: string) => void;
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

  // Browser View (Live View for computer_use)
  isComputerUseRunning: (sessionId: string | null) => boolean;
  updateBrowserScreenshot: (sessionId: string, screenshot: BrowserViewScreenshot) => void;
  clearBrowserScreenshot: (sessionId: string) => void;
}

export interface SessionDetails {
  id: string;
  messages: Message[];
  tasks?: Task[];
  artifacts?: Artifact[];
  toolExecutions?: ToolExecution[];
}

const createSessionState = (): SessionChatState => ({
  messages: [],
  isStreaming: false,
  isThinking: false,
  thinkingStartedAt: undefined,
  thinkingContent: '',
  streamingContent: '',
  streamingToolCalls: [],
  turnActivities: {},
  activeTurnId: undefined,
  pendingPermissions: [],
  pendingQuestions: [],
  currentTool: null,
  error: null,
  isLoadingMessages: false,
  lastUpdatedAt: Date.now(),
  hasLoaded: false,
  lastUserMessage: undefined,
  browserViewScreenshot: null,
});

// Helper functions for extracting activity data from tool results
function extractMediaFromToolResult(result: unknown): MediaActivityItem[] {
  const items: MediaActivityItem[] = [];
  const r = result as Record<string, unknown> | null;

  if (r?.images && Array.isArray(r.images)) {
    for (const img of r.images) {
      if (img?.path || img?.url) {
        items.push({ kind: 'image', path: img.path, url: img.url, mimeType: img.mimeType });
      }
    }
  }

  if (r?.videos && Array.isArray(r.videos)) {
    for (const vid of r.videos) {
      if (vid?.path || vid?.url) {
        items.push({ kind: 'video', path: vid.path, url: vid.url, mimeType: vid.mimeType });
      }
    }
  }

  return items;
}

function extractReportFromToolResult(result: unknown): ReportActivityItem | null {
  const r = result as Record<string, unknown> | null;
  if (!r?.reportPath && !r?.report) return null;

  return {
    title: 'Research Report',
    path: r.reportPath as string | undefined,
    snippet: r.report ? String(r.report).slice(0, 240) : undefined,
  };
}

function extractDesignFromToolResult(result: unknown, toolName: string): DesignActivityItem | null {
  const r = result as Record<string, unknown> | null;
  if (!r) return null;

  const html = r.html as string | undefined;
  const css = r.css as string | undefined;
  const svg = r.svg as string | undefined;

  if (!html && !css && !svg) return null;

  const content = html || (css ? `<style>${css}</style>` : svg);

  return {
    title: 'Design Preview',
    preview: { name: `${toolName}-preview.html`, content },
  };
}

/**
 * Reconstructs turnActivities from persisted messages and tool executions.
 * Called when loading a session from disk to restore the activity timeline.
 * Note: Tools with parentToolId are sub-tools rendered inside their parent TaskToolCard,
 * so we skip adding them as top-level activities.
 */
function reconstructTurnActivities(
  messages: PersistedMessage[],
  toolExecutions: PersistedToolExecution[]
): Record<string, TurnActivityItem[]> {
  const turnActivities: Record<string, TurnActivityItem[]> = {};

  // Get user messages sorted by createdAt for fallback association
  const userMessages = messages
    .filter(m => m.role === 'user')
    .sort((a, b) => a.createdAt - b.createdAt);

  console.log('[reconstructTurnActivities] Processing', messages.length, 'messages and', toolExecutions.length, 'tool executions');

  // Group tool executions by turn message ID
  const toolsByTurn = new Map<string, PersistedToolExecution[]>();
  let orphanedTools = 0;

  for (const tool of toolExecutions) {
    // Skip sub-tools - they render inside their parent
    if (tool.parentToolId) continue;

    let turnId = tool.turnMessageId;

    // Fallback: find user message that precedes this tool by timestamp
    if (!turnId) {
      const preceding = [...userMessages].reverse().find(m => m.createdAt <= tool.startedAt);
      turnId = preceding?.id;
      if (turnId) {
        orphanedTools++;
        console.log('[reconstructTurnActivities] Associated orphaned tool', tool.id, 'with message', turnId);
      }
    }

    // Last resort: use the last user message
    if (!turnId && userMessages.length > 0) {
      turnId = userMessages[userMessages.length - 1].id;
      orphanedTools++;
      console.log('[reconstructTurnActivities] Fallback: Associated tool', tool.id, 'with last user message');
    }

    if (turnId) {
      const tools = toolsByTurn.get(turnId) || [];
      tools.push(tool);
      toolsByTurn.set(turnId, tools);
    }
  }

  if (orphanedTools > 0) {
    console.log('[reconstructTurnActivities] Fixed', orphanedTools, 'orphaned tools');
  }

  // Build activities for each user message (turn)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;

    const activities: TurnActivityItem[] = [];

    // Get tool executions for this turn, sorted by order
    const turnTools = (toolsByTurn.get(msg.id) || [])
      .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));

    // Add tool activities
    for (const tool of turnTools) {
      activities.push({
        id: `act-tool-${tool.id}`,
        type: 'tool',
        status: 'done',
        toolId: tool.id,
        createdAt: tool.startedAt,
      });

      // Check for media activities (images/videos from tool results)
      const mediaItems = extractMediaFromToolResult(tool.result);
      if (mediaItems.length > 0) {
        activities.push({
          id: `act-media-${tool.id}`,
          type: 'media',
          status: 'done',
          mediaItems,
          createdAt: tool.completedAt || tool.startedAt,
        });
      }

      // Check for report activities
      const report = extractReportFromToolResult(tool.result);
      if (report) {
        activities.push({
          id: `act-report-${tool.id}`,
          type: 'report',
          status: 'done',
          report,
          createdAt: tool.completedAt || tool.startedAt,
        });
      }

      // Check for design activities
      const design = extractDesignFromToolResult(tool.result, tool.name);
      if (design) {
        activities.push({
          id: `act-design-${tool.id}`,
          type: 'design',
          status: 'done',
          design,
          createdAt: tool.completedAt || tool.startedAt,
        });
      }
    }

    // Find the assistant message that follows this user message
    const assistantMsg = messages.slice(i + 1).find(m => m.role === 'assistant');
    if (assistantMsg) {
      activities.push({
        id: `act-assistant-${assistantMsg.id}`,
        type: 'assistant',
        status: 'done',
        messageId: assistantMsg.id,
        createdAt: assistantMsg.createdAt,
      });
    }

    // ALWAYS add turn activities, even if empty (prevents messages from being hidden)
    turnActivities[msg.id] = activities;
  }

  console.log('[reconstructTurnActivities] Built activities for', Object.keys(turnActivities).length, 'turns');
  return turnActivities;
}

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
    return session.streamingToolCalls.some(
      (t) => t.name.toLowerCase() === 'computer_use' && t.status === 'running'
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
      console.log('[ChatStore] Waiting for backend initialization before loading messages...');
      await sessionStore.waitForBackend();
    }

    // Check if already loaded and not forcing reload
    const sessionState = get().sessions[sessionId];
    if (sessionState?.hasLoaded && !forceReload) {
      console.log('[ChatStore] Messages already loaded for session:', sessionId);
      return null;
    }

    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      isLoadingMessages: true,
      error: null,
    })));

    const attemptLoad = async (retry = 0): Promise<SessionDetails | null> => {
      try {
        console.log('[ChatStore] Loading messages for session', sessionId, 'retry:', retry);
        const session = await invoke<SessionDetails>('agent_get_session', { sessionId });
        console.log('[ChatStore] Got session from backend:', {
          sessionId,
          messageCount: session.messages?.length || 0,
          toolExecutionCount: session.toolExecutions?.length || 0,
          hasMessages: !!session.messages,
          firstMessage: session.messages?.[0],
        });
        const agentStore = useAgentStore.getState();

        // Reconstruct turn activities from persisted data
        const reconstructedActivities = reconstructTurnActivities(
          (session.messages || []) as PersistedMessage[],
          (session.toolExecutions || []) as PersistedToolExecution[]
        );

        set((state) => updateSession(state, sessionId, (existing) => {
          const existingMessages = existing.messages;
          const incoming = session.messages || [];
          const merged = [...existingMessages];
          for (const msg of incoming) {
            if (!merged.some((m) => m.id === msg.id)) {
              merged.push(msg);
            }
          }

          console.log('[ChatStore] Merge result:', {
            sessionId,
            existingCount: existingMessages.length,
            incomingCount: incoming.length,
            mergedCount: merged.length,
          });

          return {
            ...existing,
            messages: merged,
            streamingToolCalls: session.toolExecutions || [],
            turnActivities: reconstructedActivities,
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

        console.log('[ChatStore] Loaded', session.messages?.length || 0, 'messages for session:', sessionId);
        return session;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const msgLower = errorMessage.toLowerCase();

        // Check if it's a transient error that should be retried
        const isTransient = msgLower.includes('timeout') ||
          msgLower.includes('connection') ||
          msgLower.includes('network');

        if (isTransient && retry < 3) {
          console.log('[ChatStore] Transient error, retrying:', errorMessage);
          await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
          return attemptLoad(retry + 1);
        }

        // Session not found - mark as loaded but empty
        if (msgLower.includes('session not found')) {
          console.log('[ChatStore] Session not found:', sessionId);
          set((state) => updateSession(state, sessionId, (existing) => ({
            ...existing,
            messages: [],
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

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userContent,
      createdAt: Date.now(),
    };

    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      messages: [...session.messages, userMessage],
      isStreaming: true,
      isThinking: true,
      thinkingStartedAt: Date.now(),
      streamingContent: '',
      error: null,
      lastUserMessage: {
        content,
        attachments,
      },
      activeTurnId: userMessage.id,
      turnActivities: {
        ...session.turnActivities,
        [userMessage.id]: [],
      },
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

  addMessage: (sessionId: string, message: Message) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => {
      const exists = session.messages.some(
        (m) =>
          m.id === message.id ||
          (m.id.startsWith('temp-') && message.role === 'user' && m.content === message.content)
      );

      if (exists) {
        return {
          ...session,
          streamingContent: '',
          isStreaming: false,
          isThinking: false,
        };
      }

      return {
        ...session,
        messages: [...session.messages, message],
        streamingContent: '',
        isStreaming: false,
        isThinking: false,
      };
    }));
  },

  updateToolExecution: (sessionId: string, toolId: string, updates: Partial<ToolExecution>) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => {
      const exists = session.streamingToolCalls.some((t) => t.id === toolId);
      const updatedList = exists
        ? session.streamingToolCalls.map((t) =>
            t.id === toolId ? { ...t, ...updates } : t
          )
        : [
            ...session.streamingToolCalls,
            {
              id: toolId,
              name: updates.name || 'Tool',
              args: (updates as { args?: Record<string, unknown> }).args || {},
              status: updates.status || 'running',
              startedAt: updates.startedAt || Date.now(),
              completedAt: updates.completedAt,
              result: updates.result,
              error: updates.error,
            },
          ];

      return {
        ...session,
        streamingToolCalls: updatedList,
        currentTool:
          session.currentTool?.id === toolId
            ? { ...session.currentTool, ...updates }
            : session.currentTool,
      };
    }));
  },

  addToolExecution: (sessionId: string, tool: ToolExecution) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      streamingToolCalls: [...session.streamingToolCalls, tool],
      isThinking: false,
    })));
  },

  resetToolExecutions: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      streamingToolCalls: [],
      currentTool: null,
    })));
  },

  startTurn: (sessionId: string, userMessageId: string) => {
    if (!sessionId || !userMessageId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      activeTurnId: userMessageId,
      turnActivities: {
        ...session.turnActivities,
        [userMessageId]: session.turnActivities[userMessageId] || [],
      },
    })));
  },

  addTurnActivity: (
    sessionId: string,
    activity: Omit<TurnActivityItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
  ) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => {
      const turnId = session.activeTurnId;
      if (!turnId) return session;
      const nextActivity: TurnActivityItem = {
        id: activity.id || `act-${Date.now()}`,
        type: activity.type,
        status: activity.status,
        toolId: activity.toolId,
        permissionId: activity.permissionId,
        questionId: activity.questionId,
        messageId: activity.messageId,
        mediaItems: activity.mediaItems,
        report: activity.report,
        design: activity.design,
        createdAt: activity.createdAt || Date.now(),
      };
      return {
        ...session,
        turnActivities: {
          ...session.turnActivities,
          [turnId]: [...(session.turnActivities[turnId] || []), nextActivity],
        },
      };
    }));
  },

  completeTurnThinking: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => {
      const turnId = session.activeTurnId;
      if (!turnId) return session;
      const activities = session.turnActivities[turnId] || [];
      const index = [...activities].reverse().findIndex((item) => item.type === 'thinking' && item.status === 'active');
      if (index === -1) return session;
      const actualIndex = activities.length - 1 - index;
      const nextActivities: TurnActivityItem[] = activities.map((item, i) =>
        i === actualIndex ? { ...item, status: 'done' as const } : item
      );
      return {
        ...session,
        turnActivities: {
          ...session.turnActivities,
          [turnId]: nextActivities,
        },
      };
    }));
  },

  endTurn: (sessionId: string) => {
    if (!sessionId) return;
    set((state) => updateSession(state, sessionId, (session) => ({
      ...session,
      activeTurnId: undefined,
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
