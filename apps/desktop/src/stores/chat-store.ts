import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Message, MessageContentPart, PermissionRequest as BasePermissionRequest } from '@gemini-cowork/shared';

export interface Attachment {
  type: 'file' | 'image' | 'text';
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

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingToolCalls: ToolExecution[];
  pendingPermissions: ExtendedPermissionRequest[];
  pendingQuestions: UserQuestion[];
  currentTool: ToolExecution | null;
  error: string | null;
  isLoadingMessages: boolean;
}

interface ChatActions {
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (
    sessionId: string,
    content: string,
    attachments?: Attachment[]
  ) => Promise<void>;
  respondToPermission: (
    sessionId: string,
    permissionId: string,
    decision: 'allow' | 'deny' | 'allow_session'
  ) => Promise<void>;
  stopGeneration: (sessionId: string) => Promise<void>;
  clearError: () => void;

  // Internal actions for event handling
  appendStreamChunk: (chunk: string) => void;
  setStreamingTool: (tool: ToolExecution | null) => void;
  addMessage: (message: Message) => void;
  updateToolExecution: (toolId: string, updates: Partial<ToolExecution>) => void;
  addPermissionRequest: (request: ExtendedPermissionRequest) => void;
  removePermissionRequest: (id: string) => void;
  addQuestion: (question: UserQuestion) => void;
  removeQuestion: (id: string) => void;
  respondToQuestion: (
    sessionId: string,
    questionId: string,
    answer: string | string[]
  ) => Promise<void>;
  setStreaming: (streaming: boolean) => void;
  clearStreamingContent: () => void;
  reset: () => void;
}

const initialState: ChatState = {
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingToolCalls: [],
  pendingPermissions: [],
  pendingQuestions: [],
  currentTool: null,
  error: null,
  isLoadingMessages: false,
};

export const useChatStore = create<ChatState & ChatActions>((set) => ({
  ...initialState,

  loadMessages: async (sessionId: string) => {
    set({ isLoadingMessages: true, error: null });
    try {
      const session = await invoke<{
        id: string;
        messages: Message[];
      }>('agent_get_session', { sessionId });

      set({
        messages: session.messages || [],
        isLoadingMessages: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's a "session not found" error - don't show error toast for this
      // as it's expected when the app restarts and the sidecar has no sessions
      if (errorMessage.toLowerCase().includes('session not found')) {
        console.warn('[ChatStore] Session not found, likely stale ID:', sessionId);
        set({
          messages: [],
          isLoadingMessages: false,
          error: null, // Don't set error for stale sessions
        });
        return;
      }

      set({
        isLoadingMessages: false,
        error: errorMessage,
      });
    }
  },

  sendMessage: async (
    sessionId: string,
    content: string,
    attachments?: Attachment[]
  ) => {
    // Add user message optimistically
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

        if (attachment.type === 'text' && attachment.data) {
          parts.push({
            type: 'text',
            text: `File: ${attachment.name}\n${attachment.data}`,
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

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      error: null,
    }));

    try {
      await invoke('agent_send_message', {
        sessionId,
        content,
        attachments,
      });
      // The response will come through events
    } catch (error) {
      set({
        isStreaming: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  respondToPermission: async (
    sessionId: string,
    permissionId: string,
    decision: 'allow' | 'deny' | 'allow_session'
  ) => {
    try {
      await invoke('agent_respond_permission', {
        sessionId,
        permissionId,
        decision,
      });

      // Remove from pending
      set((state) => ({
        pendingPermissions: state.pendingPermissions.filter(
          (p) => p.id !== permissionId
        ),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  stopGeneration: async (sessionId: string) => {
    try {
      await invoke('agent_stop_generation', { sessionId });
      set({ isStreaming: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  // Internal actions
  appendStreamChunk: (chunk: string) => {
    set((state) => ({
      streamingContent: state.streamingContent + chunk,
    }));
  },

  setStreamingTool: (tool: ToolExecution | null) => {
    set({ currentTool: tool });
  },

  addMessage: (message: Message) => {
    set((state) => {
      // Don't add duplicate messages (by ID or content for temp messages)
      const exists = state.messages.some(m =>
        m.id === message.id ||
        // Also check for temp messages that match content
        (m.id.startsWith('temp-') && message.role === 'user' && m.content === message.content)
      );

      if (exists) {
        // Message already exists, just clear streaming state
        return {
          streamingContent: '',
          isStreaming: false,
        };
      }

      return {
        messages: [...state.messages, message],
        streamingContent: '',
        isStreaming: false,
      };
    });
  },

  updateToolExecution: (toolId: string, updates: Partial<ToolExecution>) => {
    set((state) => ({
      streamingToolCalls: state.streamingToolCalls.map((t) =>
        t.id === toolId ? { ...t, ...updates } : t
      ),
      currentTool:
        state.currentTool?.id === toolId
          ? { ...state.currentTool, ...updates }
          : state.currentTool,
    }));
  },

  addPermissionRequest: (request: ExtendedPermissionRequest) => {
    set((state) => ({
      pendingPermissions: [...state.pendingPermissions, request],
    }));
  },

  removePermissionRequest: (id: string) => {
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter((p) => p.id !== id),
    }));
  },

  addQuestion: (question: UserQuestion) => {
    set((state) => ({
      pendingQuestions: [...state.pendingQuestions, question],
    }));
  },

  removeQuestion: (id: string) => {
    set((state) => ({
      pendingQuestions: state.pendingQuestions.filter((q) => q.id !== id),
    }));
  },

  respondToQuestion: async (
    sessionId: string,
    questionId: string,
    answer: string | string[]
  ) => {
    try {
      await invoke('agent_respond_question', {
        sessionId,
        questionId,
        answer,
      });

      // Remove from pending
      set((state) => ({
        pendingQuestions: state.pendingQuestions.filter(
          (q) => q.id !== questionId
        ),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setStreaming: (streaming: boolean) => {
    set({ isStreaming: streaming });
  },

  clearStreamingContent: () => {
    set({ streamingContent: '' });
  },

  reset: () => {
    set(initialState);
  },
}));

// Selector hooks
export const useMessages = () => useChatStore((state) => state.messages);
export const useIsStreaming = () => useChatStore((state) => state.isStreaming);
export const useStreamingContent = () =>
  useChatStore((state) => state.streamingContent);
export const usePendingPermissions = () =>
  useChatStore((state) => state.pendingPermissions);
export const usePendingQuestions = () =>
  useChatStore((state) => state.pendingQuestions);
export const useCurrentTool = () => useChatStore((state) => state.currentTool);
export const useChatError = () => useChatStore((state) => state.error);
