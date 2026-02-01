import { useEffect, useRef } from 'react';
import { subscribeToAgentEvents } from '../lib/agent-events';
import type { AgentEvent } from '../lib/event-types';
import { useChatStore } from '../stores/chat-store';
import { useAgentStore } from '../stores/agent-store';
import { useSessionStore } from '../stores/session-store';
import type { Message } from '@gemini-cowork/shared';

/**
 * Hook to subscribe to agent events for the current session
 * and automatically update the relevant stores
 */
export function useAgentEvents(sessionId: string | null): void {
  const chatStoreRef = useRef(useChatStore.getState());
  const agentStoreRef = useRef(useAgentStore.getState());
  const sessionStoreRef = useRef(useSessionStore.getState());

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

    return () => {
      unsubChat();
      unsubAgent();
      unsubSession();
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const handleEvent = (event: AgentEvent) => {
      const chat = chatStoreRef.current;
      const agent = agentStoreRef.current;

      switch (event.type) {
        // Streaming events
        case 'stream:start':
          chat.setStreaming(true);
          chat.clearStreamingContent();
          agent.setRunning(true);
          break;

        case 'stream:chunk':
          chat.appendStreamChunk(event.content);
          break;

        case 'stream:done':
          chat.addMessage(event.message as Message);
          chat.setStreaming(false);
          chat.clearStreamingContent();
          break;

        // Tool execution events
        case 'tool:start':
          chat.setStreamingTool({
            id: event.toolCall.id,
            name: event.toolCall.name,
            args: event.toolCall.args,
            status: 'running',
            startedAt: Date.now(),
          });
          break;

        case 'tool:result': {
          const result = event.result;
          chat.updateToolExecution(event.toolCallId, {
            status: result.success ? 'success' : 'error',
            result: result.result,
            error: result.error,
            completedAt: Date.now(),
          });
          chat.setStreamingTool(null);
          break;
        }

        // Permission events
        case 'permission:request':
          chat.addPermissionRequest(event.request);
          break;

        case 'permission:resolved':
          chat.removePermissionRequest(event.permissionId);
          break;

        // Task events
        case 'task:create':
          agent.addTask(event.task);
          break;

        case 'task:update':
          agent.updateTask(event.task);
          break;

        case 'task:delete':
          agent.removeTask(event.taskId);
          break;

        // Artifact events
        case 'artifact:created':
        case 'artifact:updated':
          agent.addArtifact(event.artifact);
          break;

        case 'artifact:deleted':
          agent.removeArtifact(event.artifactId);
          break;

        // Context events
        case 'context:update':
          agent.setContextUsage(event.used, event.total);
          break;

        // Error events
        case 'error':
          chat.setStreaming(false);
          agent.setRunning(false);
          // Note: Error is set in chat store via setError which doesn't exist
          // We should handle this through a different mechanism
          console.error('Agent error:', event.error, event.code);
          break;

        // Session events
        case 'session:updated':
          // Trigger a reload of sessions to get updated data
          sessionStoreRef.current.loadSessions();
          break;

        // Agent state events
        case 'agent:started':
          agent.setRunning(true);
          break;

        case 'agent:stopped':
          agent.setRunning(false);
          chat.setStreaming(false);
          break;
      }
    };

    const unsubscribe = subscribeToAgentEvents(sessionId, handleEvent);

    return () => {
      unsubscribe();
    };
  }, [sessionId]);
}

/**
 * Hook to get the current streaming state
 */
export function useStreamingState() {
  const isStreaming = useChatStore((state) => state.isStreaming);
  const streamingContent = useChatStore((state) => state.streamingContent);
  const currentTool = useChatStore((state) => state.currentTool);

  return {
    isStreaming,
    streamingContent,
    currentTool,
  };
}

/**
 * Hook to get pending permissions that need user action
 */
export function usePendingPermissionsCount() {
  return useChatStore((state) => state.pendingPermissions.length);
}
