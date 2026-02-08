import type { AgentEventType } from './types.js';
import type { ChatItem } from '@gemini-cowork/shared';
import { sanitizeProviderErrorMessage } from '@gemini-cowork/shared';

/**
 * SidecarEvent format expected by Rust (camelCase due to serde rename_all)
 */
export interface SidecarEvent {
  type: string;
  sessionId: string | null;
  data: unknown;
}

type EventListener = (event: SidecarEvent) => void;

/**
 * Emits events to the Rust backend via stdout.
 * Events are JSON objects with a specific structure that Tauri can parse.
 */
export class EventEmitter {
  private eventBuffer: SidecarEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private flushIntervalMs = 10; // Batch events every 10ms for performance
  private stdoutQueue: string[] = [];
  private stdoutQueueOffset = 0;
  private stdoutBackpressured = false;
  private stdoutFlushing = false;
  private listeners = new Set<EventListener>();

  /**
   * Emit an event to the Rust backend.
   */
  emit(type: AgentEventType, sessionId: string | undefined, data: unknown): void {
    const event: SidecarEvent = {
      type,
      sessionId: sessionId ?? null,
      data,
    };

    if (this.listeners.size > 0) {
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch {
          // Listener failures should never break main IPC event delivery.
        }
      }
    }

    // Coalesce frequent chat:update events within the current flush window.
    if (type === 'chat:update' && event.sessionId) {
      const incoming = event.data as { itemId?: string } | null;
      const incomingItemId = incoming?.itemId;
      if (incomingItemId) {
        for (let i = this.eventBuffer.length - 1; i >= 0; i -= 1) {
          const buffered = this.eventBuffer[i];
          if (buffered?.type !== 'chat:update' || buffered.sessionId !== event.sessionId) {
            continue;
          }
          const bufferedData = buffered.data as { itemId?: string } | null;
          if (bufferedData?.itemId === incomingItemId) {
            this.eventBuffer[i] = event;
            this.scheduleFlush();
            return;
          }
        }
      }
    }

    this.eventBuffer.push(event);
    this.scheduleFlush();
  }

  /**
   * Emit stream chunk event.
   */
  streamStart(sessionId: string): void {
    this.emit('stream:start', sessionId, { timestamp: Date.now() });
  }

  /**
   * Emit stream chunk event.
   */
  streamChunk(sessionId: string, content: string): void {
    this.emit('stream:chunk', sessionId, { content });
  }

  /**
   * Emit stream done event.
   */
  streamDone(sessionId: string, message: unknown): void {
    this.emit('stream:done', sessionId, { message });
  }

  /**
   * Emit thinking start event.
   */
  thinkingStart(sessionId: string): void {
    this.emit('thinking:start', sessionId, { timestamp: Date.now() });
  }

  /**
   * Emit thinking chunk event (agent's internal reasoning).
   */
  thinkingChunk(sessionId: string, content: string): void {
    this.emit('thinking:chunk', sessionId, { content });
  }

  /**
   * Emit thinking done event.
   */
  thinkingDone(sessionId: string): void {
    this.emit('thinking:done', sessionId, { timestamp: Date.now() });
  }

  /**
   * Emit tool start event.
   */
  toolStart(sessionId: string, toolCall: unknown): void {
    const toolCallAny = toolCall as { parentToolId?: string };
    this.emit('tool:start', sessionId, {
      toolCall,
      startTime: Date.now(),
      parentToolId: toolCallAny?.parentToolId,
    });
  }

  /**
   * Emit tool result event.
   */
  toolResult(sessionId: string, toolCall: unknown, result: unknown): void {
    const toolCallAny = toolCall as { id?: string; parentToolId?: string };
    const resultAny = result as { parentToolId?: string } | null;
    this.emit('tool:result', sessionId, {
      toolCallId: toolCallAny?.id ?? '',
      toolCall,
      result,
      parentToolId: resultAny?.parentToolId ?? toolCallAny?.parentToolId,
    });
  }

  /**
   * Emit permission request event.
   */
  permissionRequest(sessionId: string, request: unknown): void {
    this.emit('permission:request', sessionId, { request });
  }

  /**
   * Emit permission resolved event.
   */
  permissionResolved(sessionId: string, permissionId: string, decision: string): void {
    this.emit('permission:resolved', sessionId, { permissionId, decision });
  }

  /**
   * Emit question ask event.
   */
  questionAsk(sessionId: string, request: unknown): void {
    this.emit('question:ask', sessionId, { request });
  }

  /**
   * Emit question answered event.
   */
  questionAnswered(sessionId: string, questionId: string, answer: string | string[]): void {
    this.emit('question:answered', sessionId, { questionId, answer });
  }

  /**
   * Emit task create event.
   */
  taskCreate(sessionId: string, task: unknown): void {
    this.emit('task:create', sessionId, { task });
  }

  /**
   * Emit task update event.
   */
  taskUpdate(sessionId: string, task: unknown): void {
    this.emit('task:update', sessionId, { task });
  }

  /**
   * Replace all tasks for a session.
   */
  taskSet(sessionId: string, tasks: unknown[]): void {
    this.emit('task:set', sessionId, { tasks });
  }

  /**
   * Emit artifact created event.
   */
  artifactCreated(sessionId: string, artifact: unknown): void {
    this.emit('artifact:created', sessionId, { artifact });
  }

  /**
   * Emit artifact event for file preview (convenience wrapper).
   */
  artifact(sessionId: string, artifact: {
    id: string;
    path: string;
    type: 'touched' | 'created' | 'modified' | 'deleted';
    url?: string;
    mimeType?: string;
    content?: string;
    timestamp?: number;
  }): void {
    this.emit('artifact:created', sessionId, { artifact: { ...artifact, timestamp: artifact.timestamp || Date.now() } });
  }

  /**
   * Emit context update event.
   */
  contextUpdate(sessionId: string, used: number, total: number): void {
    this.emit('context:update', sessionId, { used, total });
  }

  /**
   * Emit research progress event.
   */
  researchProgress(sessionId: string, status: string, progress: number): void {
    this.emit('research:progress', sessionId, { status, progress, timestamp: Date.now() });
  }

  /**
   * Emit browser view screenshot event for live view display.
   * Called during computer_use tool execution after each action.
   */
  browserViewScreenshot(
    sessionId: string,
    screenshot: {
      data: string;      // base64 PNG
      mimeType: string;  // 'image/png'
      url: string;       // current browser URL
      timestamp: number; // Date.now()
    }
  ): void {
    this.emit('browserView:screenshot', sessionId, {
      data: screenshot.data,
      mimeType: screenshot.mimeType,
      url: screenshot.url,
      timestamp: screenshot.timestamp,
    });
  }

  /**
   * Emit session updated event.
   */
  sessionUpdated(session: unknown): void {
    const sessionAny = session as { id?: string; title?: string | null; messageCount?: number };
    this.emit('session:updated', undefined, {
      session,
      title: sessionAny.title ?? undefined,
      messageCount: sessionAny.messageCount ?? undefined,
    });
  }

  // ============================================================================
  // Unified Chat Item Events (V2 architecture)
  // ============================================================================

  /**
   * Emit a new chat item to be appended to the chat timeline.
   * This is the primary event for the unified chat storage architecture.
   */
  chatItem(sessionId: string, item: ChatItem): void {
    this.emit('chat:item', sessionId, { item });
  }

  /**
   * Emit an update to an existing chat item.
   * Used to update status (e.g., tool running -> completed, thinking active -> done).
   */
  chatItemUpdate(sessionId: string, itemId: string, updates: Partial<ChatItem>): void {
    this.emit('chat:update', sessionId, { itemId, updates });
  }

  /**
   * Emit multiple chat items at once (for batch operations like load).
   */
  chatItemsBatch(sessionId: string, items: ChatItem[]): void {
    this.emit('chat:items', sessionId, { items });
  }

  /**
   * Emit message queue update for a session.
   */
  queueUpdate(sessionId: string, queue: Array<{ id: string; content: string; queuedAt: number }>): void {
    this.emit('queue:update', sessionId, { queue });
  }

  /**
   * Emit context usage update.
   */
  contextUsageUpdate(sessionId: string, contextUsage: {
    usedTokens: number;
    maxTokens: number;
    percentUsed: number;
  }): void {
    this.emit('context:usage', sessionId, contextUsage);
  }

  // ============================================================================
  // Integration Events
  // ============================================================================

  /**
   * Emit platform connection status change.
   */
  integrationStatus(status: {
    platform: string;
    connected: boolean;
    displayName?: string;
    identityPhone?: string;
    identityName?: string;
    error?: string;
    connectedAt?: number;
    lastMessageAt?: number;
    health?: 'healthy' | 'degraded' | 'unhealthy';
    healthMessage?: string;
    requiresReconnect?: boolean;
    lastHealthCheckAt?: number;
  }): void {
    this.emit('integration:status', undefined, status);
  }

  /**
   * Emit WhatsApp QR code for scanning.
   */
  integrationQR(qrDataUrl: string): void {
    this.emit('integration:qr', undefined, { qrDataUrl });
  }

  /**
   * Emit incoming message notification from platform.
   */
  integrationMessageIn(platform: string, sender: string, content: string): void {
    this.emit('integration:message_in', undefined, {
      platform,
      sender,
      content: content.substring(0, 100),
      timestamp: Date.now(),
    });
  }

  /**
   * Emit outgoing message sent to platform.
   */
  integrationMessageOut(platform: string, chatId: string): void {
    this.emit('integration:message_out', undefined, {
      platform,
      chatId,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit message queued notification.
   */
  integrationQueued(platform: string, queueSize: number): void {
    this.emit('integration:queued', undefined, {
      platform,
      queueSize,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit error event.
   */
  error(sessionId: string | undefined, errorMessage: string, code?: string, details?: unknown): void {
    this.emit('error', sessionId, {
      error: sanitizeProviderErrorMessage(errorMessage),
      code,
      details,
    });
  }

  /**
   * Subscribe to all sidecar events.
   * Returns an unsubscribe function.
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Schedule a flush of the event buffer.
   */
  private scheduleFlush(): void {
    if (this.flushTimeout) return;

    this.flushTimeout = setTimeout(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  /**
   * Flush the event buffer to stdout.
   */
  flush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.eventBuffer.length === 0) return;

    const events = this.eventBuffer;
    this.eventBuffer = [];

    for (const event of events) {
      // Queue serialized events, then flush with backpressure-aware writes.
      // The Rust side expects SidecarEvent format: { type, sessionId, data }.
      this.stdoutQueue.push(JSON.stringify(event) + '\n');
    }

    this.flushStdoutQueue();
  }

  /**
   * Flush all pending events immediately (best effort).
   * If stdout is backpressured, remaining events stay queued and are resumed
   * on the next `drain` event.
   */
  flushSync(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.eventBuffer.length === 0) return;

    const events = this.eventBuffer;
    this.eventBuffer = [];

    for (const event of events) {
      this.stdoutQueue.push(JSON.stringify(event) + '\n');
    }

    this.flushStdoutQueue();
  }

  private flushStdoutQueue(): void {
    if (this.stdoutFlushing || this.stdoutBackpressured) {
      return;
    }

    this.stdoutFlushing = true;
    try {
      while (this.stdoutQueueOffset < this.stdoutQueue.length) {
        const line = this.stdoutQueue[this.stdoutQueueOffset]!;
        const canContinue = process.stdout.write(line);
        this.stdoutQueueOffset += 1;

        if (!canContinue) {
          this.stdoutBackpressured = true;
          process.stdout.once('drain', () => {
            this.stdoutBackpressured = false;
            this.flushStdoutQueue();
          });
          break;
        }
      }

      // Fully drained.
      if (this.stdoutQueueOffset >= this.stdoutQueue.length) {
        this.stdoutQueue = [];
        this.stdoutQueueOffset = 0;
        return;
      }

      // Compact written prefix occasionally to avoid unbounded array growth.
      if (this.stdoutQueueOffset >= 1024) {
        this.stdoutQueue = this.stdoutQueue.slice(this.stdoutQueueOffset);
        this.stdoutQueueOffset = 0;
      }
    } finally {
      this.stdoutFlushing = false;
    }
  }
}

// Singleton instance
export const eventEmitter = new EventEmitter();
