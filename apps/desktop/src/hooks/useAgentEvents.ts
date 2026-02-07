import { useEffect, useRef } from 'react';
import { subscribeToAgentEvents } from '../lib/agent-events';
import type { AgentEvent } from '../lib/event-types';
import { useChatStore } from '../stores/chat-store';
import { useAgentStore, type Task } from '../stores/agent-store';
import { useSessionStore } from '../stores/session-store';
import { useAppStore } from '../stores/app-store';
import { useIntegrationStore } from '../stores/integration-store';
import { toast } from '../components/ui/Toast';
import type { PlatformType } from '@gemini-cowork/shared';

function isRecord(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function normalizeTodoStatus(value: unknown): 'pending' | 'in_progress' | 'completed' {
  const normalized = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'completed';
  if (normalized === 'in_progress') return 'in_progress';
  return 'pending';
}

function extractTodosFromToolResult(result: unknown): Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }> | null {
  if (!result) return null;
  if (Array.isArray(result)) {
    return result
      .filter((todo): todo is { content: string; status: 'pending' | 'in_progress' | 'completed' } =>
        !!todo && typeof (todo as { content?: unknown }).content === 'string'
      )
      .map((todo) => ({
        content: String((todo as { content: string }).content),
        status: normalizeTodoStatus((todo as { status?: string }).status),
      }));
  }

  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractTodosFromToolResult(parsed);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (typeof result === 'object') {
    const resultAny = result as { todos?: unknown; output?: unknown };
    if (Array.isArray(resultAny.todos)) {
      return extractTodosFromToolResult(resultAny.todos);
    }
    if (resultAny.output) {
      return extractTodosFromToolResult(resultAny.output);
    }
  }

  return null;
}

function mapTodosToTasks(sessionId: string, todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }>): Task[] {
  const now = Date.now();
  return todos.map((todo, index) => ({
    id: `task-${sessionId}-${index}-${Math.abs(todo.content.length + index)}`,
    subject: todo.content,
    description: '',
    status: todo.status,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Hook to subscribe to agent events for the current session
 * and automatically update the relevant stores
 */
export function useAgentEvents(sessionId: string | null): void {
  const chatStoreRef = useRef(useChatStore.getState());
  const agentStoreRef = useRef(useAgentStore.getState());
  const sessionStoreRef = useRef(useSessionStore.getState());
  const activeSessionRef = useRef<string | null>(sessionId);
  const sessionReloadTimerRef = useRef<number | null>(null);

  // Keep refs up to date
  useEffect(() => {
    const unsubChat = useChatStore.subscribe(
      (state) => (chatStoreRef.current = state)
    );
    const unsubAgent = useAgentStore.subscribe(
      (state) => (agentStoreRef.current = state)
    );
    const unsubSession = useSessionStore.subscribe(
      (state) => (sessionStoreRef.current = state)
    );
    const unsubActive = useSessionStore.subscribe((state) => {
      activeSessionRef.current = state.activeSessionId;
    });

    return () => {
      unsubChat();
      unsubAgent();
      unsubSession();
      unsubActive();
    };
  }, []);

  useEffect(() => {
    activeSessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const handleEvent = (event: AgentEvent) => {
      try {
      const chat = chatStoreRef.current;
      const agent = agentStoreRef.current;
      const activeId = activeSessionRef.current;
      const eventSessionId = event.sessionId;

      // Handle events that don't require a sessionId first
      if (event.type === 'session:updated') {
        // Debounce reloads to avoid repeated sidebar refreshes during startup bursts.
        if (sessionReloadTimerRef.current !== null) {
          return;
        }
        sessionReloadTimerRef.current = window.setTimeout(() => {
          sessionReloadTimerRef.current = null;
          const sessionStore = sessionStoreRef.current;
          if (!sessionStore.isLoading) {
            sessionStore.loadSessions();
          }
        }, 150);
        return;
      }

      // Integration events are emitted without a sessionId; handle them before
      // per-session guards so status/QR updates are not dropped.
      if (event.type === 'integration:status') {
        const statusEvent = event as unknown as {
          platform: string;
          connected: boolean;
          displayName?: string;
          identityPhone?: string;
          identityName?: string;
          error?: string;
          connectedAt?: number;
          lastMessageAt?: number;
        };
        useIntegrationStore.getState().updatePlatformStatus({
          platform: statusEvent.platform as PlatformType,
          connected: statusEvent.connected,
          displayName: statusEvent.displayName,
          identityPhone: statusEvent.identityPhone,
          identityName: statusEvent.identityName,
          error: statusEvent.error,
          connectedAt: statusEvent.connectedAt,
          lastMessageAt: statusEvent.lastMessageAt,
        });
        return;
      }

      if (event.type === 'integration:qr') {
        const qrEvent = event as unknown as { qrDataUrl: string };
        useIntegrationStore.getState().setQRCode(qrEvent.qrDataUrl);
        return;
      }

      if (event.type === 'integration:message_in') {
        const msgEvent = event as unknown as { platform: string; sender: string; content: string };
        const platformNames: Record<string, string> = {
          whatsapp: 'WhatsApp',
          slack: 'Slack',
          telegram: 'Telegram',
          discord: 'Discord',
          imessage: 'iMessage',
          teams: 'Microsoft Teams',
        };
        toast.info(
          `${platformNames[msgEvent.platform] || msgEvent.platform}`,
          `${msgEvent.sender}: ${msgEvent.content}`,
          5000
        );
        return;
      }

      if (event.type === 'integration:message_out') {
        const outEvent = event as unknown as { platform: string; timestamp: number };
        const currentStatus = useIntegrationStore.getState().platforms[outEvent.platform as PlatformType];
        if (currentStatus) {
          useIntegrationStore.getState().updatePlatformStatus({
            ...currentStatus,
            lastMessageAt: outEvent.timestamp || Date.now(),
          });
        }
        return;
      }

      if (event.type === 'integration:queued') {
        const queuedEvent = event as unknown as { platform: string; queueSize: number };
        const queuePlatformNames: Record<string, string> = {
          whatsapp: 'WhatsApp',
          slack: 'Slack',
          telegram: 'Telegram',
          discord: 'Discord',
          imessage: 'iMessage',
          teams: 'Microsoft Teams',
        };
        toast.info(
          `${queuePlatformNames[queuedEvent.platform] || queuedEvent.platform}`,
          `Message queued (${queuedEvent.queueSize} waiting)`,
          3000
        );
        return;
      }

      if (!eventSessionId) return;
      chat.ensureSession(eventSessionId);
      agent.ensureSession(eventSessionId);

      switch (event.type) {
        // Streaming events
        case 'stream:start':
          chat.setStreaming(eventSessionId, true);
          chat.setThinking(eventSessionId, true);
          chat.clearStreamingContent(eventSessionId);
          agent.setRunning(eventSessionId, true);
          break;

        case 'stream:chunk':
          // Assistant text now comes from persisted chat:item/chat:update events.
          break;

        case 'stream:done':
          chat.setStreaming(eventSessionId, false);
          chat.setThinking(eventSessionId, false);
          chat.clearStreamingContent(eventSessionId);
          chat.clearThinkingContent(eventSessionId);
          agent.setRunning(eventSessionId, false);
          break;

        // Thinking events (agent's internal reasoning)
        case 'thinking:start':
          chat.setThinking(eventSessionId, true);
          chat.clearThinkingContent(eventSessionId);
          break;

        case 'thinking:chunk':
          chat.appendThinkingChunk(eventSessionId, event.content);
          break;

        case 'thinking:done':
          // Keep thinking content visible but mark thinking as done
          // Content will be cleared when stream:done is received
          break;

        // Tool execution events
        case 'tool:start': {
          const parentToolId = event.parentToolId || event.toolCall.parentToolId;
          chat.setStreamingTool(eventSessionId, {
            id: event.toolCall.id,
            name: event.toolCall.name,
            args: event.toolCall.args,
            status: 'running',
            startedAt: Date.now(),
            parentToolId,
          });
          chat.setThinking(eventSessionId, false);
          break;
        }

        case 'tool:result': {
          const result = event.result;
          const toolCallId = event.toolCallId || (result as { toolCallId?: string })?.toolCallId || '';

          // Resolve tool name from chatItems (V2 source)
          const sessionSnapshot = chat.getSessionState(eventSessionId);
          const toolStartItem = sessionSnapshot.chatItems.find(
            (ci) => ci.kind === 'tool_start' && ci.toolId === toolCallId
          );
          const toolName = toolStartItem && toolStartItem.kind === 'tool_start' ? toolStartItem.name : '';

          if (result.success && toolName) {
            const lower = toolName.toLowerCase();

            // Resolve tool args for write_todos from chatItems
            if (lower === 'write_todos') {
              const toolArgs = toolStartItem && toolStartItem.kind === 'tool_start' ? toolStartItem.args : undefined;
              const todos = extractTodosFromToolResult(result.result) ?? (toolArgs ? extractTodosFromToolResult(toolArgs) : null);
              if (todos && todos.length > 0) {
                agent.setTasks(eventSessionId, mapTodosToTasks(eventSessionId, todos));
              }
            }
          }

          chat.setStreamingTool(eventSessionId, null);
          break;
        }

        // Permission events
        case 'permission:request': {
          const requestAny = event.request as {
            createdAt?: number;
            timestamp?: number;
            sessionId?: string;
          };
          chat.addPermissionRequest(eventSessionId, {
            ...event.request,
            sessionId: eventSessionId,
            createdAt:
              requestAny.createdAt ??
              requestAny.timestamp ??
              Date.now(),
          });
          break;
        }

        case 'permission:resolved':
          chat.removePermissionRequest(eventSessionId, event.permissionId);
          break;

        // Question events (agent asking user questions)
        case 'question:ask':
          chat.addQuestion(eventSessionId, {
            id: event.request.id,
            sessionId: eventSessionId,
            question: event.request.question,
            header: event.request.header,
            options: event.request.options?.map(opt => ({
              label: opt.label,
              description: opt.description,
              value: opt.value,
            })) || [],
            multiSelect: event.request.multiSelect,
            allowCustom: event.request.allowCustom,
            createdAt: event.request.timestamp || Date.now(),
          });
          break;

        case 'question:answered':
          chat.removeQuestion(eventSessionId, event.questionId);
          break;

        // Task events
        case 'task:create':
          agent.addTask(eventSessionId, event.task);
          break;

        case 'task:update':
          agent.updateTask(eventSessionId, event.task);
          break;

        case 'task:delete':
          agent.removeTask(eventSessionId, event.taskId);
          break;

        case 'task:set':
          agent.setTasks(eventSessionId, event.tasks);
          break;

        // Artifact events
        case 'artifact:created':
        case 'artifact:updated':
          agent.addArtifact(eventSessionId, event.artifact);
          break;

        case 'artifact:deleted':
          agent.removeArtifact(eventSessionId, event.artifactId);
          break;

        // Context events
        case 'context:update':
          agent.setContextUsage(eventSessionId, event.used, event.total);
          break;

        case 'research:progress':
          agent.setResearchProgress(eventSessionId, { status: event.status, progress: event.progress });
          break;

        // Error events
        case 'error': {
          chat.setStreaming(eventSessionId, false);
          chat.setThinking(eventSessionId, false);
          agent.setRunning(eventSessionId, false);

          // Safely convert event.error to string
          const errorMsg = typeof event.error === 'string'
            ? event.error
            : (isRecord(event.error) ? String((event.error as Record<string, unknown>).message || event.error) : String(event.error));

          // Check if it's an auth/API key error
          const isAuthError =
            event.code === 'INVALID_API_KEY' ||
            errorMsg.toLowerCase().includes('api key') ||
            errorMsg.includes('401') ||
            errorMsg.toLowerCase().includes('authentication') ||
            errorMsg.toLowerCase().includes('unauthorized');

          if (isAuthError) {
            // Show API key modal for auth errors
            useAppStore.getState().setShowApiKeyModal(true, errorMsg);
          } else {
            // Show error toast for other errors
            if (event.code === 'RATE_LIMIT') {
              const retry = event.details?.retryAfterSeconds;
              const message = retry ? `Retry in ${Math.ceil(retry)}s` : 'Please retry shortly';
              toast.warning('Rate limit exceeded', message, 8000);
            } else {
              toast.error('Agent Error', errorMsg, 8000);
            }
          }

          // V2: Error is also emitted as chat:item by sidecar, but create one
          // if the sidecar doesn't emit it (e.g. frontend-only errors)
          chat.appendChatItem(eventSessionId, {
            id: `error-${Date.now()}`,
            kind: 'error',
            message: errorMsg,
            code: event.code,
            details: event.details,
            turnId: chat.getSessionState(eventSessionId).activeTurnId,
            timestamp: Date.now(),
          } as import('@gemini-cowork/shared').ChatItem);
          break;
        }

        // Agent state events
        case 'agent:started':
          agent.setRunning(eventSessionId, true);
          break;

        case 'agent:stopped':
          agent.setRunning(eventSessionId, false);
          if (activeId) {
            chat.setStreaming(activeId, false);
            chat.setThinking(activeId, false);
          }
          break;

        // ============================================================================
        // V2 Unified ChatItem Events
        // ============================================================================

        case 'chat:item': {
          // Append new chat item to the unified timeline
          chat.appendChatItem(eventSessionId, event.item);
          break;
        }

        case 'chat:update': {
          // Update an existing chat item (e.g., status change)
          chat.updateChatItem(eventSessionId, event.itemId, event.updates);
          break;
        }

        case 'chat:items': {
          // Batch set chat items (e.g., on session load)
          chat.setChatItems(eventSessionId, event.items);
          break;
        }

        case 'context:usage': {
          // Update context usage stats
          chat.updateContextUsage(eventSessionId, {
            usedTokens: event.usedTokens,
            maxTokens: event.maxTokens,
            percentUsed: event.percentUsed,
          });
          break;
        }

        // Message Queue events
        case 'queue:update': {
          chat.updateMessageQueue(eventSessionId, event.queue);
          break;
        }

        // Browser View events (live screenshot streaming)
        case 'browserView:screenshot': {
          const screenshotEvent = event as {
            type: 'browserView:screenshot';
            sessionId: string;
            data: string;
            mimeType: string;
            url: string;
            timestamp: number;
          };
          chat.updateBrowserScreenshot(eventSessionId, {
            data: screenshotEvent.data,
            mimeType: screenshotEvent.mimeType,
            url: screenshotEvent.url,
            timestamp: screenshotEvent.timestamp,
          });
          break;
        }

      }
      } catch (error) {
        console.error('[useAgentEvents] Event handler error:', error);
      }
    };

    const unsubscribe = subscribeToAgentEvents(null, handleEvent);

    return () => {
      if (sessionReloadTimerRef.current !== null) {
        window.clearTimeout(sessionReloadTimerRef.current);
        sessionReloadTimerRef.current = null;
      }
      unsubscribe();
    };
  }, []);
}

/**
 * Hook to get the current streaming state
 */
export function useStreamingState(sessionId: string | null) {
  return useChatStore((state) => {
    const session = sessionId ? state.sessions[sessionId] : undefined;
    return {
      isStreaming: session?.isStreaming ?? false,
      isThinking: session?.isThinking ?? false,
      streamingContent: session?.streamingContent ?? '',
      currentTool: session?.currentTool ?? null,
    };
  });
}

/**
 * Hook to get pending permissions that need user action
 */
export function usePendingPermissionsCount() {
  return useChatStore((state) =>
    Object.values(state.sessions).reduce(
      (count, session) => count + session.pendingPermissions.length,
      0
    )
  );
}
