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
        toolCallId: (data.toolCallId as string) ?? (data.toolCall as { id?: string })?.id ?? '',
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
        decision: (data.decision as 'allow' | 'deny' | 'allow_once' | 'allow_session') ?? 'deny',
      };

    case 'question:ask':
      return {
        type: 'question:ask',
        sessionId,
        request: data.request as AgentEvent & { type: 'question:ask' } extends {
          request: infer R;
        }
          ? R
          : never,
      };

    case 'question:answered':
      return {
        type: 'question:answered',
        sessionId,
        questionId: (data.questionId as string) ?? '',
        answer: data.answer as string | string[],
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

    case 'task:set':
      return {
        type: 'task:set',
        sessionId,
        tasks: (data.tasks as AgentEvent & { type: 'task:set' } extends {
          tasks: infer T;
        }
          ? T
          : never) ?? [],
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
      // Default to 1M token context window (Gemini 3.0 models)
      // The actual value comes from the sidecar based on the model's API response
      return {
        type: 'context:update',
        sessionId,
        used: (data.used as number) ?? 0,
        total: (data.total as number) ?? 1048576,
      };

    case 'research:progress':
      return {
        type: 'research:progress',
        sessionId,
        status: (data.status as string) ?? 'running',
        progress: (data.progress as number) ?? 0,
      };

    case 'error':
      return {
        type: 'error',
        sessionId,
        error: (data.error as string) ?? 'Unknown error',
        code: data.code as string | undefined,
        recoverable: data.recoverable as boolean | undefined,
        details: data.details as { retryAfterSeconds?: number; quotaMetric?: string; model?: string; docsUrl?: string } | undefined,
      };

    case 'session:updated':
      return {
        type: 'session:updated',
        sessionId,
        title: (data.title as string | undefined) ?? (data.session as { title?: string })?.title,
        messageCount: (data.messageCount as number | undefined) ?? (data.session as { messageCount?: number })?.messageCount,
      };

    case 'agent:started':
      return { type: 'agent:started', sessionId };

    case 'agent:stopped':
      return { type: 'agent:stopped', sessionId };

    case 'browserView:screenshot':
      return {
        type: 'browserView:screenshot',
        sessionId,
        data: (data.data as string) ?? '',
        mimeType: (data.mimeType as string) ?? 'image/png',
        url: (data.url as string) ?? '',
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    // Integration events
    case 'integration:status':
      return {
        type: 'integration:status',
        sessionId,
        platform: (data.platform as string) ?? '',
        connected: (data.connected as boolean) ?? false,
        displayName: data.displayName as string | undefined,
        identityPhone: data.identityPhone as string | undefined,
        identityName: data.identityName as string | undefined,
        error: data.error as string | undefined,
        connectedAt: data.connectedAt as number | undefined,
        lastMessageAt: data.lastMessageAt as number | undefined,
      };

    case 'integration:qr':
      return {
        type: 'integration:qr',
        sessionId,
        qrDataUrl: (data.qrDataUrl as string) ?? '',
      };

    case 'integration:message_in':
      return {
        type: 'integration:message_in',
        sessionId,
        platform: (data.platform as string) ?? '',
        sender: (data.sender as string) ?? '',
        content: (data.content as string) ?? '',
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'integration:message_out':
      return {
        type: 'integration:message_out',
        sessionId,
        platform: (data.platform as string) ?? '',
        chatId: (data.chatId as string) ?? '',
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'integration:queued':
      return {
        type: 'integration:queued',
        sessionId,
        platform: (data.platform as string) ?? '',
        queueSize: (data.queueSize as number) ?? 0,
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'queue:update':
      return {
        type: 'queue:update',
        sessionId,
        queue: (data.queue as Array<{ id: string; content: string; queuedAt: number }>) ?? [],
      };

    // V2 unified chat item events
    case 'chat:item':
      return {
        type: 'chat:item',
        sessionId,
        item: data.item as AgentEvent & { type: 'chat:item' } extends { item: infer I } ? I : never,
      };

    case 'chat:update':
      return {
        type: 'chat:update',
        sessionId,
        itemId: (data.itemId as string) ?? '',
        updates: (data.updates as Record<string, unknown>) ?? {},
      };

    case 'chat:items':
      return {
        type: 'chat:items',
        sessionId,
        items: (data.items as AgentEvent & { type: 'chat:items' } extends { items: infer I } ? I : never) ?? [],
      };

    // Thinking events
    case 'thinking:start':
      return { type: 'thinking:start', sessionId };

    case 'thinking:chunk':
      return {
        type: 'thinking:chunk',
        sessionId,
        content: (data.content as string) ?? '',
      };

    case 'thinking:done':
      return { type: 'thinking:done', sessionId };

    // Context usage
    case 'context:usage':
      return {
        type: 'context:usage',
        sessionId,
        usedTokens: (data.usedTokens as number) ?? 0,
        maxTokens: (data.maxTokens as number) ?? 1048576,
        percentUsed: (data.percentUsed as number) ?? 0,
      };

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
  sessionId: string | null,
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
    'agent:thinking:start',
    'agent:thinking:chunk',
    'agent:thinking:done',
    'agent:tool:start',
    'agent:tool:result',
    'agent:permission:request',
    'agent:permission:resolved',
    'agent:question:ask',
    'agent:question:answered',
    'agent:task:create',
    'agent:task:update',
    'agent:task:delete',
    'agent:task:set',
    'agent:artifact:created',
    'agent:artifact:updated',
    'agent:artifact:deleted',
    'agent:context:update',
    'agent:context:usage',
    'agent:research:progress',
    'agent:error',
    'agent:session:updated',
    'agent:started',
    'agent:stopped',
    'agent:browserView:screenshot',
    'agent:chat:item',
    'agent:chat:update',
    'agent:chat:items',
    'agent:integration:status',
    'agent:integration:qr',
    'agent:integration:message_in',
    'agent:integration:message_out',
    'agent:integration:queued',
    'agent:queue:update',
  ];

  // Set up listeners for each event type
  for (const eventType of eventTypes) {
    listen<TauriEventPayload>(eventType, (event: Event<TauriEventPayload>) => {
      // Filter by session ID
      if (sessionId && event.payload.sessionId && event.payload.sessionId !== sessionId) {
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
      flushTimeout = null;
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
    'agent:thinking:start',
    'agent:thinking:chunk',
    'agent:thinking:done',
    'agent:tool:start',
    'agent:tool:result',
    'agent:permission:request',
    'agent:permission:resolved',
    'agent:question:ask',
    'agent:question:answered',
    'agent:task:create',
    'agent:task:update',
    'agent:task:delete',
    'agent:task:set',
    'agent:artifact:created',
    'agent:artifact:updated',
    'agent:artifact:deleted',
    'agent:context:update',
    'agent:context:usage',
    'agent:research:progress',
    'agent:error',
    'agent:session:updated',
    'agent:started',
    'agent:stopped',
    'agent:browserView:screenshot',
    'agent:chat:item',
    'agent:chat:update',
    'agent:chat:items',
    'agent:integration:status',
    'agent:integration:qr',
    'agent:integration:message_in',
    'agent:integration:message_out',
    'agent:integration:queued',
    'agent:queue:update',
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
