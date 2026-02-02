import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chat-store';
import { setMockInvokeResponse, clearMockInvokeResponses } from '../test/mocks/tauri-core';

describe('chat-store', () => {
  beforeEach(() => {
    // Reset store state
    useChatStore.setState({
      messages: [],
      isStreaming: false,
      streamingContent: '',
      streamingToolCalls: [],
      pendingPermissions: [],
      pendingQuestions: [],
      currentTool: null,
      error: null,
      isLoadingMessages: false,
    });
    clearMockInvokeResponses();
  });

  describe('loadMessages', () => {
    it('should load messages from the backend', async () => {
      const mockMessages = [
        { id: 'msg-1', role: 'user', content: 'Hello', createdAt: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', createdAt: Date.now() },
      ];

      setMockInvokeResponse('agent_get_session', {
        id: 'session-1',
        messages: mockMessages,
      });

      await useChatStore.getState().loadMessages('session-1');

      const state = useChatStore.getState();
      expect(state.messages).toEqual(mockMessages);
      expect(state.isLoadingMessages).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle load errors', async () => {
      setMockInvokeResponse('agent_get_session', () => {
        throw new Error('Failed to load session');
      });

      await useChatStore.getState().loadMessages('session-1');

      const state = useChatStore.getState();
      expect(state.error).toBe('Failed to load session');
      expect(state.isLoadingMessages).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should add user message optimistically', async () => {
      setMockInvokeResponse('agent_send_message', undefined);

      const promise = useChatStore.getState().sendMessage('session-1', 'Hello');

      // Check optimistic update
      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].content).toBe('Hello');
      expect(state.isStreaming).toBe(true);

      await promise;
    });

    it('should handle send errors', async () => {
      setMockInvokeResponse('agent_send_message', () => {
        throw new Error('Network error');
      });

      await useChatStore.getState().sendMessage('session-1', 'Hello');

      const state = useChatStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('appendStreamChunk', () => {
    it('should append content to streaming buffer', () => {
      useChatStore.getState().appendStreamChunk('Hello');
      useChatStore.getState().appendStreamChunk(' World');

      expect(useChatStore.getState().streamingContent).toBe('Hello World');
    });
  });

  describe('addMessage', () => {
    it('should add message and clear streaming content', () => {
      // Set up streaming state
      useChatStore.setState({ streamingContent: 'Partial content' });

      const newMessage = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: 'Complete message',
        createdAt: Date.now(),
      };

      useChatStore.getState().addMessage(newMessage);

      const state = useChatStore.getState();
      expect(state.messages).toContainEqual(newMessage);
      expect(state.streamingContent).toBe('');
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

      useChatStore.getState().addPermissionRequest(permission);

      expect(useChatStore.getState().pendingPermissions).toContainEqual(permission);
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

      useChatStore.setState({ pendingPermissions: [permission] });
      useChatStore.getState().removePermissionRequest('perm-1');

      expect(useChatStore.getState().pendingPermissions).toHaveLength(0);
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

      useChatStore.getState().addQuestion(question);

      expect(useChatStore.getState().pendingQuestions).toContainEqual(question);
    });

    it('should remove questions', () => {
      const question = {
        id: 'q-1',
        sessionId: 'session-1',
        question: 'Which option?',
        options: [],
        createdAt: Date.now(),
      };

      useChatStore.setState({ pendingQuestions: [question] });
      useChatStore.getState().removeQuestion('q-1');

      expect(useChatStore.getState().pendingQuestions).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('should reset store to initial state', () => {
      // Set some state
      useChatStore.setState({
        messages: [{ id: '1', role: 'user', content: 'test', createdAt: Date.now() }],
        isStreaming: true,
        streamingContent: 'content',
        error: 'error',
      });

      useChatStore.getState().reset();

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBe('');
      expect(state.error).toBeNull();
    });
  });
});
