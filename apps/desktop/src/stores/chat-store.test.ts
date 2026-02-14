// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useChatStore,
  buildDurableSessionSnapshot,
  hydrateSessionFromSnapshot,
  mergePersistedChatState,
  deriveTurnActivitiesFromItems,
} from './chat-store';
import { setMockInvokeResponse, clearMockInvokeResponses } from '../test/mocks/tauri-core';
import { invoke } from '@tauri-apps/api/core';

describe('chat-store', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('chat-runtime-state-v1');
    }
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

    it('should not add optimistic user chatItem when session is already busy', async () => {
      setMockInvokeResponse('agent_send_message', undefined);
      useChatStore.getState().ensureSession('session-1');
      useChatStore.getState().setStreaming('session-1', true);

      await useChatStore.getState().sendMessage('session-1', 'Queued while busy');

      const state = useChatStore.getState().getSessionState('session-1');
      const userItems = state.chatItems.filter(ci => ci.kind === 'user_message');
      expect(userItems).toHaveLength(0);
      expect(invoke).toHaveBeenCalledWith('agent_send_message', {
        sessionId: 'session-1',
        content: 'Queued while busy',
        attachments: undefined,
      });
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

  describe('deriveTurnActivitiesFromItems', () => {
    it('should include memory lifecycle system messages in turn activities', () => {
      const turnId = 'turn-memory-1';
      const now = Date.now();
      const activities = deriveTurnActivitiesFromItems(
        [
          {
            id: turnId,
            kind: 'user_message',
            content: 'remember this',
            turnId,
            timestamp: now,
          } as any,
          {
            id: 'memory-event-1',
            kind: 'system_message',
            content: 'Retrieved relevant memory evidence.',
            metadata: {
              eventType: 'memory:retrieved',
              query: 'remember',
              count: 4,
              limit: 8,
            },
            turnId,
            timestamp: now + 5,
          } as any,
        ],
        [],
        [],
      );

      const memoryActivity = activities[turnId]?.find((activity) => activity.type === 'memory');
      expect(memoryActivity).toBeDefined();
      expect(memoryActivity?.memory?.eventType).toBe('memory:retrieved');
      expect(memoryActivity?.memory?.summary).toContain('Retrieved');
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

  describe('stream stall recovery', () => {
    it('should mark a run as stalled with recoverable metadata', () => {
      useChatStore.getState().ensureSession('session-1');

      useChatStore.getState().markRunStalled('session-1', {
        runId: 'run-123',
        reason: 'No stream updates for 20s',
        stalledAt: Date.now(),
        recoverable: true,
      });

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.streamStall.isStalled).toBe(true);
      expect(state.streamStall.runId).toBe('run-123');
      expect(state.streamStall.reason).toContain('No stream updates');
      expect(state.streamStall.recoverable).toBe(true);
    });

    it('should recover stalled runs with one command', async () => {
      useChatStore.getState().ensureSession('session-1');
      useChatStore.getState().markRunStalled('session-1', {
        runId: 'run-123',
        reason: 'stalled',
        recoverable: true,
      });

      setMockInvokeResponse('agent_resume_run', { ok: true });

      const recovered = await useChatStore.getState().recoverStalledRun('session-1');

      expect(recovered).toBe(true);
      expect(invoke).toHaveBeenCalledWith('agent_resume_run', {
        sessionId: 'session-1',
        runId: 'run-123',
      });

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.streamStall.isStalled).toBe(false);
      expect(state.streamStall.reason).toBeNull();
      expect(state.isStreaming).toBe(true);
      expect(state.isThinking).toBe(true);
    });

    it('should fail recovery when no stalled run id exists', async () => {
      useChatStore.getState().ensureSession('session-1');

      const recovered = await useChatStore.getState().recoverStalledRun('session-1');

      expect(recovered).toBe(false);
      expect(useChatStore.getState().getSessionState('session-1').error).toContain(
        'No recoverable stalled run',
      );
    });
  });

  describe('durable pending-work persistence', () => {
    it('should reconcile optimistic temp user items when matching queue updates arrive', () => {
      useChatStore.getState().ensureSession('session-1');
      useChatStore.getState().appendChatItem('session-1', {
        id: 'temp-queued',
        kind: 'user_message',
        content: 'gagaga',
        turnId: 'temp-queued',
        timestamp: Date.now(),
      } as any);

      useChatStore.setState((state) => ({
        ...state,
        sessions: {
          ...state.sessions,
          'session-1': {
            ...state.sessions['session-1'],
            activeTurnId: 'temp-queued',
          },
        },
      }));

      useChatStore.getState().updateMessageQueue('session-1', [
        { id: 'q-1', content: 'gagaga', queuedAt: Date.now() },
      ]);

      const state = useChatStore.getState().getSessionState('session-1');
      expect(state.chatItems.filter((item) => item.kind === 'user_message')).toHaveLength(0);
      expect(state.activeTurnId).toBeUndefined();
      expect(state.messageQueue).toHaveLength(1);
    });

    it('should build and hydrate a durable snapshot preserving queue and pending items', () => {
      useChatStore.getState().ensureSession('session-1');
      const now = Date.now();

      useChatStore.getState().addPermissionRequest('session-1', {
        id: 'perm-1',
        sessionId: 'session-1',
        type: 'file_read',
        resource: '/tmp/a',
        reason: 'check file',
        createdAt: now,
      } as any);
      useChatStore.getState().addQuestion('session-1', {
        id: 'q-1',
        sessionId: 'session-1',
        question: 'Proceed?',
        options: [{ label: 'Yes' }, { label: 'No' }],
        createdAt: now,
      });
      useChatStore
        .getState()
        .updateMessageQueue('session-1', [{ id: 'mq-1', content: 'queued', queuedAt: now }]);
      useChatStore.getState().markRunStalled('session-1', {
        runId: 'run-1',
        reason: 'stalled',
        recoverable: true,
      });

      const session = useChatStore.getState().getSessionState('session-1');
      const snapshot = buildDurableSessionSnapshot(session);
      const hydrated = hydrateSessionFromSnapshot(snapshot);

      expect(hydrated.pendingPermissions).toHaveLength(1);
      expect(hydrated.pendingQuestions).toHaveLength(1);
      expect(hydrated.messageQueue).toHaveLength(1);
      expect(hydrated.streamStall.runId).toBe('run-1');
      expect(hydrated.streamStall.isStalled).toBe(true);
    });

    it('should merge persisted durable sessions into current state defaults', () => {
      const merged = mergePersistedChatState(
        {
          sessions: {
            'session-restore': {
              pendingPermissions: [
                {
                  id: 'perm-restore',
                  sessionId: 'session-restore',
                  type: 'file_write',
                  resource: '/tmp/r',
                  createdAt: Date.now(),
                },
              ],
              pendingQuestions: [],
              messageQueue: [{ id: 'q-restore', content: 'queued', queuedAt: Date.now() }],
              streamStall: {
                isStalled: true,
                stalledAt: Date.now(),
                runId: 'run-restore',
                reason: 'restore',
                recoverable: true,
                lastActivityAt: Date.now(),
              },
              lastUpdatedAt: Date.now(),
            },
          },
        },
        useChatStore.getState(),
      );

      expect(merged.sessions['session-restore']).toBeDefined();
      expect(merged.sessions['session-restore']?.pendingPermissions).toHaveLength(1);
      expect(merged.sessions['session-restore']?.messageQueue).toHaveLength(1);
      expect(merged.sessions['session-restore']?.streamStall.runId).toBe('run-restore');
      expect(merged.sessions['session-restore']?.isStreaming).toBe(false);
      expect(merged.sessions['session-restore']?.chatItems).toEqual([]);
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
