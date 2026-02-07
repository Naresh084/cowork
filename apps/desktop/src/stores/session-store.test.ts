import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from './session-store';
import { setMockInvokeResponse, clearMockInvokeResponses } from '../test/mocks/tauri-core';

describe('session-store', () => {
  beforeEach(() => {
    // Reset store state
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      error: null,
    });
    clearMockInvokeResponses();
  });

  describe('loadSessions', () => {
    it('should load sessions from backend', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          title: 'Test Session',
          firstMessage: null,
          workingDirectory: '/path/to/project',
          model: 'gemini-3-flash-preview',
          messageCount: 5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ];

      setMockInvokeResponse('agent_list_sessions', mockSessions);

      await useSessionStore.getState().loadSessions();

      const state = useSessionStore.getState();
      expect(state.sessions).toEqual([
        {
          ...mockSessions[0],
          executionMode: 'execute',
        },
      ]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle load errors', async () => {
      setMockInvokeResponse('agent_list_sessions', () => {
        throw new Error('Failed to load sessions');
      });

      await useSessionStore.getState().loadSessions();

      const state = useSessionStore.getState();
      expect(state.error).toBe('Failed to load sessions');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('createSession', () => {
    it('should create session and add to list', async () => {
      const mockSession = {
        id: 'new-session-1',
        title: null,
        firstMessage: null,
        workingDirectory: '/path/to/project',
        model: 'gemini-3-flash-preview',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setMockInvokeResponse('agent_create_session', mockSession);

      const sessionId = await useSessionStore.getState().createSession('/path/to/project');

      const state = useSessionStore.getState();
      expect(sessionId).toBe('new-session-1');
      expect(state.sessions).toHaveLength(1);
      expect(state.activeSessionId).toBe('new-session-1');
      expect(state.isLoading).toBe(false);
    });

    it('should handle create errors', async () => {
      setMockInvokeResponse('agent_create_session', () => {
        throw new Error('Failed to create session');
      });

      await expect(useSessionStore.getState().createSession('/path')).rejects.toThrow();

      const state = useSessionStore.getState();
      expect(state.error).toBe('Failed to create session');
    });
  });

  describe('selectSession', () => {
    it('should select existing session', async () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            title: 'Test',
            firstMessage: null,
            workingDirectory: '/path',
            model: 'gemini-3-flash-preview',
            messageCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastAccessedAt: Date.now(),
          },
        ],
      });

      await useSessionStore.getState().selectSession('session-1');

      expect(useSessionStore.getState().activeSessionId).toBe('session-1');
    });

    it('should set error for non-existent session', async () => {
      await useSessionStore.getState().selectSession('non-existent');

      expect(useSessionStore.getState().error).toBe('Session not found');
    });
  });

  describe('deleteSession', () => {
    it('should delete session optimistically', async () => {
      const sessions = [
        {
          id: 'session-1',
          title: 'Test',
          firstMessage: null,
          workingDirectory: '/path',
          model: 'gemini-3-flash-preview',
          messageCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
        {
          id: 'session-2',
          title: 'Test 2',
          firstMessage: null,
          workingDirectory: '/path2',
          model: 'gemini-3-flash-preview',
          messageCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ];

      useSessionStore.setState({ sessions, activeSessionId: 'session-1' });
      setMockInvokeResponse('agent_delete_session', undefined);

      await useSessionStore.getState().deleteSession('session-1');

      const state = useSessionStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe('session-2');
      expect(state.activeSessionId).toBeNull();
    });

    it('should rollback on delete error', async () => {
      const sessions = [
        {
          id: 'session-1',
          title: 'Test',
          firstMessage: null,
          workingDirectory: '/path',
          model: 'gemini-3-flash-preview',
          messageCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ];

      useSessionStore.setState({ sessions, activeSessionId: 'session-1' });
      setMockInvokeResponse('agent_delete_session', () => {
        throw new Error('Delete failed');
      });

      await expect(useSessionStore.getState().deleteSession('session-1')).rejects.toThrow();

      const state = useSessionStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.activeSessionId).toBe('session-1');
      expect(state.error).toBe('Delete failed');
    });
  });

  describe('updateSessionTitle', () => {
    it('should update session title optimistically', async () => {
      const sessions = [
        {
          id: 'session-1',
          title: 'Old Title',
          firstMessage: null,
          workingDirectory: '/path',
          model: 'gemini-3-flash-preview',
          messageCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ];

      useSessionStore.setState({ sessions });
      setMockInvokeResponse('agent_update_session_title', undefined);

      await useSessionStore.getState().updateSessionTitle('session-1', 'New Title');

      expect(useSessionStore.getState().sessions[0].title).toBe('New Title');
    });

    it('should rollback title on error', async () => {
      const sessions = [
        {
          id: 'session-1',
          title: 'Old Title',
          firstMessage: null,
          workingDirectory: '/path',
          model: 'gemini-3-flash-preview',
          messageCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ];

      useSessionStore.setState({ sessions });
      setMockInvokeResponse('agent_update_session_title', () => {
        throw new Error('Update failed');
      });

      await expect(
        useSessionStore.getState().updateSessionTitle('session-1', 'New Title')
      ).rejects.toThrow();

      expect(useSessionStore.getState().sessions[0].title).toBe('Old Title');
    });
  });

  describe('updateSessionWorkingDirectory', () => {
    it('should update working directory optimistically', async () => {
      const sessions = [
        {
          id: 'session-1',
          title: 'Test',
          firstMessage: null,
          workingDirectory: '/old/path',
          model: 'gemini-3-flash-preview',
          messageCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ];

      useSessionStore.setState({ sessions });
      setMockInvokeResponse('agent_update_session_working_directory', undefined);

      await useSessionStore.getState().updateSessionWorkingDirectory('session-1', '/new/path');

      expect(useSessionStore.getState().sessions[0].workingDirectory).toBe('/new/path');
    });
  });

  describe('setActiveSession', () => {
    it('should set active session directly', () => {
      useSessionStore.getState().setActiveSession('session-123');

      expect(useSessionStore.getState().activeSessionId).toBe('session-123');
    });

    it('should clear active session when null', () => {
      useSessionStore.setState({ activeSessionId: 'session-1' });
      useSessionStore.getState().setActiveSession(null);

      expect(useSessionStore.getState().activeSessionId).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error state', () => {
      useSessionStore.setState({ error: 'Some error' });
      useSessionStore.getState().clearError();

      expect(useSessionStore.getState().error).toBeNull();
    });
  });
});
