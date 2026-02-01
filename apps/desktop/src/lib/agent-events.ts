import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';
import type {
  AgentEvent,
  AgentEventHandler,
  TauriEventPayload,
  TAURI_EVENT_NAMES,
} from './event-types';

/**
 * Parse a Tauri event into an AgentEvent
 */
function parseTauriEvent(
  eventName: string,
  payload: TauriEventPayload
): AgentEvent | null {
  // Extract the event type from the full event name (e.g., 'agent:stream:chunk' -> 'stream:chunk')
  const type = eventName.replace('agent:', '') as AgentEvent['type'];
  const sessionId = payload.sessionId ?? '';
  const data = payload.data as Record<string, unknown>;

  switch (type) {
    case 'stream:start':
      return { type: 'stream:start', sessionId };

    case 'stream:chunk':
      return {
        type: 'stream:chunk',
        sessionId,
        content: (data.content as string) ?? '',
      };

    case 'stream:done':
      return {
        type: 'stream:done',
        sessionId,
        message: data.message as AgentEvent & { type: 'stream:done' } extends {
          message: infer M;
        }
          ? M
          : never,
      };

    case 'tool:start':
      return {
        type: 'tool:start',
        sessionId,
        toolCall: data.toolCall as AgentEvent & { type: 'tool:start' } extends {
          toolCall: infer T;
        }
          ? T
          : never,
      };

    case 'tool:result':
      return {
        type: 'tool:result',
        sessionId,
        toolCallId: (data.toolCallId as string) ?? '',
        result: data.result as AgentEvent & { type: 'tool:result' } extends {
          result: infer R;
        }
          ? R
          : never,
      };

    case 'permission:request':
      return {
        type: 'permission:request',
        sessionId,
        request: data.request as AgentEvent & {
          type: 'permission:request';
        } extends { request: infer R }
          ? R
          : never,
      };

    case 'permission:resolved':
      return {
        type: 'permission:resolved',
        sessionId,
        permissionId: (data.permissionId as string) ?? '',
        decision: (data.decision as 'allow' | 'deny') ?? 'deny',
      };

    case 'task:create':
      return {
        type: 'task:create',
        sessionId,
        task: data.task as AgentEvent & { type: 'task:create' } extends {
          task: infer T;
        }
          ? T
          : never,
      };

    case 'task:update':
      return {
        type: 'task:update',
        sessionId,
        task: data.task as AgentEvent & { type: 'task:update' } extends {
          task: infer T;
        }
          ? T
          : never,
      };

    case 'task:delete':
      return {
        type: 'task:delete',
        sessionId,
        taskId: (data.taskId as string) ?? '',
      };

    case 'artifact:created':
      return {
        type: 'artifact:created',
        sessionId,
        artifact: data.artifact as AgentEvent & {
          type: 'artifact:created';
        } extends { artifact: infer A }
          ? A
          : never,
      };

    case 'artifact:updated':
      return {
        type: 'artifact:updated',
        sessionId,
        artifact: data.artifact as AgentEvent & {
          type: 'artifact:updated';
        } extends { artifact: infer A }
          ? A
          : never,
      };

    case 'artifact:deleted':
      return {
        type: 'artifact:deleted',
        sessionId,
        artifactId: (data.artifactId as string) ?? '',
      };

    case 'context:update':
      return {
        type: 'context:update',
        sessionId,
        used: (data.used as number) ?? 0,
        total: (data.total as number) ?? 128000,
      };

    case 'error':
      return {
        type: 'error',
        sessionId,
        error: (data.error as string) ?? 'Unknown error',
        code: data.code as string | undefined,
        recoverable: data.recoverable as boolean | undefined,
      };

    case 'session:updated':
      return {
        type: 'session:updated',
        sessionId,
        title: data.title as string | undefined,
        messageCount: data.messageCount as number | undefined,
      };

    case 'agent:started':
      return { type: 'agent:started', sessionId };

    case 'agent:stopped':
      return { type: 'agent:stopped', sessionId };

    default:
      console.warn('Unknown event type:', type);
      return null;
  }
}

/**
 * Subscribe to agent events for a specific session
 * @param sessionId The session ID to filter events for
 * @param handler Callback function for handling events
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToAgentEvents(
  sessionId: string,
  handler: AgentEventHandler
): () => void {
  const unlisteners: UnlistenFn[] = [];
  let isActive = true;

  // Event buffer for batching rapid events
  let eventBuffer: AgentEvent[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;

  const flushEvents = () => {
    if (!isActive || eventBuffer.length === 0) return;

    // Process all buffered events
    for (const event of eventBuffer) {
      handler(event);
    }
    eventBuffer = [];
    flushTimeout = null;
  };

  const queueEvent = (event: AgentEvent) => {
    if (!isActive) return;

    // For stream chunks, batch them together
    if (event.type === 'stream:chunk') {
      eventBuffer.push(event);

      if (!flushTimeout) {
        // Flush after a short delay to batch rapid chunks
        flushTimeout = setTimeout(flushEvents, 16); // ~60fps
      }
    } else {
      // Flush any pending chunks first
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushEvents();
      }
      // Then handle this event immediately
      handler(event);
    }
  };

  // Subscribe to all agent event types
  const eventTypes: (typeof TAURI_EVENT_NAMES)[number][] = [
    'agent:stream:start',
    'agent:stream:chunk',
    'agent:stream:done',
    'agent:tool:start',
    'agent:tool:result',
    'agent:permission:request',
    'agent:permission:resolved',
    'agent:task:create',
    'agent:task:update',
    'agent:task:delete',
    'agent:artifact:created',
    'agent:artifact:updated',
    'agent:artifact:deleted',
    'agent:context:update',
    'agent:error',
    'agent:session:updated',
    'agent:started',
    'agent:stopped',
  ];

  // Set up listeners for each event type
  for (const eventType of eventTypes) {
    listen<TauriEventPayload>(eventType, (event: Event<TauriEventPayload>) => {
      // Filter by session ID
      if (event.payload.sessionId && event.payload.sessionId !== sessionId) {
        return;
      }

      const parsedEvent = parseTauriEvent(eventType, event.payload);
      if (parsedEvent) {
        queueEvent(parsedEvent);
      }
    })
      .then((unlisten) => {
        if (isActive) {
          unlisteners.push(unlisten);
        } else {
          unlisten();
        }
      })
      .catch((error) => {
        console.error(`Failed to subscribe to ${eventType}:`, error);
      });
  }

  // Return cleanup function
  return () => {
    isActive = false;

    if (flushTimeout) {
      clearTimeout(flushTimeout);
    }

    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}

/**
 * Subscribe to all agent events regardless of session
 * @param handler Callback function for handling events
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToAllEvents(handler: AgentEventHandler): () => void {
  const unlisteners: UnlistenFn[] = [];
  let isActive = true;

  const eventTypes: (typeof TAURI_EVENT_NAMES)[number][] = [
    'agent:stream:start',
    'agent:stream:chunk',
    'agent:stream:done',
    'agent:tool:start',
    'agent:tool:result',
    'agent:permission:request',
    'agent:permission:resolved',
    'agent:task:create',
    'agent:task:update',
    'agent:task:delete',
    'agent:artifact:created',
    'agent:artifact:updated',
    'agent:artifact:deleted',
    'agent:context:update',
    'agent:error',
    'agent:session:updated',
    'agent:started',
    'agent:stopped',
  ];

  for (const eventType of eventTypes) {
    listen<TauriEventPayload>(eventType, (event: Event<TauriEventPayload>) => {
      const parsedEvent = parseTauriEvent(eventType, event.payload);
      if (parsedEvent) {
        handler(parsedEvent);
      }
    })
      .then((unlisten) => {
        if (isActive) {
          unlisteners.push(unlisten);
        } else {
          unlisten();
        }
      })
      .catch((error) => {
        console.error(`Failed to subscribe to ${eventType}:`, error);
      });
  }

  return () => {
    isActive = false;
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}
