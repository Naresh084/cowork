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
      const mockMessages = [
        { id: 'msg-1', role: 'user', content: 'Hello', createdAt: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', createdAt: Date.now() },
      ];

      setMockInvokeResponse('agent_get_session', {
        id: 'session-1',
        messages: mockMessages,
      });

      await useChatStore.getState().loadMessages('session-1');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.messages).toEqual(mockMessages);
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
    it('should add user message optimistically', async () => {
      setMockInvokeResponse('agent_send_message', undefined);

      const promise = useChatStore.getState().sendMessage('session-1', 'Hello');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].content).toBe('Hello');
      expect(state.isStreaming).toBe(true);

      await promise;
    });

    it('should include attachments in optimistic message content', async () => {
      setMockInvokeResponse('agent_send_message', undefined);

      const attachments = [
        { type: 'image' as const, name: 'img.png', mimeType: 'image/png', data: 'abc' },
        { type: 'text' as const, name: 'notes.txt', mimeType: 'text/plain', data: 'hello' },
      ];

      const promise = useChatStore.getState().sendMessage('session-1', 'Hello', attachments);

      const state = useChatStore.getState().getSessionState('session-1');
      const message = state.messages[0];
      expect(Array.isArray(message.content)).toBe(true);

      const parts = message.content as Array<{ type: string; [key: string]: unknown }>;
      expect(parts[0]).toMatchObject({ type: 'text', text: 'Hello' });
      expect(parts[1]).toMatchObject({ type: 'image', mimeType: 'image/png', data: 'abc' });
      expect(parts[2]).toMatchObject({ type: 'text', text: 'File: notes.txt\nhello' });

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

  describe('addMessage', () => {
    it('should add message and clear streaming content', () => {
      useChatStore.getState().setStreaming('session-1', true);
      useChatStore.getState().appendStreamChunk('session-1', 'Partial content');

      const newMessage = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: 'Complete message',
        createdAt: Date.now(),
      };

      useChatStore.getState().addMessage('session-1', newMessage);

      const state = useChatStore.getState().getSessionState('session-1');
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
      useChatStore.getState().addMessage('session-1', {
        id: '1',
        role: 'user',
        content: 'test',
        createdAt: Date.now(),
      });
      useChatStore.getState().setStreaming('session-1', true);
      useChatStore.getState().appendStreamChunk('session-1', 'content');

      useChatStore.getState().resetSession('session-1');

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.messages).toHaveLength(0);
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBe('');
      expect(state.error).toBeNull();
    });
  });
});
