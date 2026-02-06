import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from './chat-store';
import { setMockInvokeResponse, clearMockInvokeResponses } from '../test/mocks/tauri-core';
import { invoke } from '@tauri-apps/api/core';

describe('chat-store', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: {},
      error: null,
    });
    clearMockInvokeResponses();
    vi.clearAllMocks();
  });

  describe('loadMessages', () => {
    it('should load messages from the backend', async () => {
      const mockChatItems = [
        { id: 'msg-1', kind: 'user_message', content: 'Hello', turnId: 'turn-1', timestamp: Date.now() },
        { id: 'msg-2', kind: 'assistant_message', content: 'Hi there!', turnId: 'turn-1', timestamp: Date.now() },
      ];

      setMockInvokeResponse('agent_get_session', {
        id: 'session-1',
        messages: [],
        chatItems: mockChatItems,
      });

      await useChatStore.getState().loadMessages('session-1');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.chatItems.length).toBeGreaterThanOrEqual(2);
      expect(state.isLoadingMessages).toBe(false);
      expect(state.error).toBeNull();
      expect(state.hasLoaded).toBe(true);
    });

    it('should handle load errors', async () => {
      setMockInvokeResponse('agent_get_session', () => {
        throw new Error('Failed to load session');
      });

      await useChatStore.getState().loadMessages('session-1');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.error).toBe('Failed to load session');
      expect(state.isLoadingMessages).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should add user chatItem optimistically', async () => {
      setMockInvokeResponse('agent_send_message', undefined);

      const promise = useChatStore.getState().sendMessage('session-1', 'Hello');

      const state = useChatStore.getState().getSessionState('session-1');
      // Should have a user_message chatItem
      const userItems = state.chatItems.filter(ci => ci.kind === 'user_message');
      expect(userItems).toHaveLength(1);
      expect(userItems[0].content).toBe('Hello');
      expect(state.isStreaming).toBe(true);

      await promise;
    });

    it('should handle send errors', async () => {
      setMockInvokeResponse('agent_send_message', () => {
        throw new Error('Network error');
      });

      await useChatStore.getState().sendMessage('session-1', 'Hello');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.error).toBe('Network error');
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('respondToPermission', () => {
    it('should send permission decision string to backend', async () => {
      setMockInvokeResponse('agent_respond_permission', undefined);

      await useChatStore.getState().respondToPermission('session-1', 'perm-1', 'allow_session');

      expect(invoke).toHaveBeenCalledWith('agent_respond_permission', {
        sessionId: 'session-1',
        permissionId: 'perm-1',
        decision: 'allow_session',
      });
    });
  });

  describe('appendStreamChunk', () => {
    it('should append content to streaming buffer', () => {
      useChatStore.getState().appendStreamChunk('session-1', 'Hello');
      useChatStore.getState().appendStreamChunk('session-1', ' World');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.streamingContent).toBe('Hello World');
    });
  });

  describe('appendChatItem', () => {
    it('should append a chat item to the session', () => {
      useChatStore.getState().ensureSession('session-1');

      useChatStore.getState().appendChatItem('session-1', {
        id: 'msg-1',
        kind: 'assistant_message',
        content: 'Hello from assistant',
        turnId: 'turn-1',
        timestamp: Date.now(),
      } as any);

      const state = useChatStore.getState().getSessionState('session-1');
      const assistantItems = state.chatItems.filter(ci => ci.kind === 'assistant_message');
      expect(assistantItems).toHaveLength(1);
    });

    it('should dedup user messages with temp- prefix', () => {
      useChatStore.getState().ensureSession('session-1');

      // Add a temp user message (simulating optimistic UI)
      useChatStore.getState().appendChatItem('session-1', {
        id: 'temp-123',
        kind: 'user_message',
        content: 'Hello',
        turnId: 'turn-1',
        timestamp: Date.now(),
      } as any);

      // Add real user message from sidecar with same content
      useChatStore.getState().appendChatItem('session-1', {
        id: 'real-456',
        kind: 'user_message',
        content: 'Hello',
        turnId: 'turn-1',
        timestamp: Date.now(),
      } as any);

      const state = useChatStore.getState().getSessionState('session-1');
      const userItems = state.chatItems.filter(ci => ci.kind === 'user_message');
      expect(userItems).toHaveLength(1);
      expect(userItems[0].id).toBe('real-456'); // temp replaced by real
    });
  });

  describe('permission handling', () => {
    it('should add permission requests', () => {
      const permission = {
        id: 'perm-1',
        sessionId: 'session-1',
        type: 'file_read' as const,
        resource: '/path/to/file',
        riskLevel: 'low' as const,
        createdAt: Date.now(),
      };

      useChatStore.getState().addPermissionRequest('session-1', permission);

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.pendingPermissions).toContainEqual(permission);
    });

    it('should remove permission requests', () => {
      const permission = {
        id: 'perm-1',
        sessionId: 'session-1',
        type: 'file_read' as const,
        resource: '/path/to/file',
        riskLevel: 'low' as const,
        createdAt: Date.now(),
      };

      useChatStore.getState().addPermissionRequest('session-1', permission);
      useChatStore.getState().removePermissionRequest('session-1', 'perm-1');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.pendingPermissions).toHaveLength(0);
    });
  });

  describe('question handling', () => {
    it('should add questions', () => {
      const question = {
        id: 'q-1',
        sessionId: 'session-1',
        question: 'Which option?',
        options: [
          { label: 'Option A', value: 'a' },
          { label: 'Option B', value: 'b' },
        ],
        createdAt: Date.now(),
      };

      useChatStore.getState().addQuestion('session-1', question);

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.pendingQuestions).toContainEqual(question);
    });

    it('should remove questions', () => {
      const question = {
        id: 'q-1',
        sessionId: 'session-1',
        question: 'Which option?',
        options: [],
        createdAt: Date.now(),
      };

      useChatStore.getState().addQuestion('session-1', question);
      useChatStore.getState().removeQuestion('session-1', 'q-1');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.pendingQuestions).toHaveLength(0);
    });
  });

  describe('resetSession', () => {
    it('should reset a session to initial state', () => {
      useChatStore.getState().ensureSession('session-1');
      useChatStore.getState().setStreaming('session-1', true);
      useChatStore.getState().appendStreamChunk('session-1', 'content');

      useChatStore.getState().resetSession('session-1');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.chatItems).toHaveLength(0);
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBe('');
      expect(state.error).toBeNull();
    });
  });
});
