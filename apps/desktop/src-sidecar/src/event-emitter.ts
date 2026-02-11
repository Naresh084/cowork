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

export interface SequencedSidecarEvent extends SidecarEvent {
  seq: number;
  timestamp: number;
}

export interface EventSink {
  id: string;
  emit(event: SequencedSidecarEvent): void;
  flush?(): void;
  flushSync?(): void;
  shutdown?(): Promise<void> | void;
}

export const STDOUT_EVENT_SINK_ID = 'stdout';

type EventListener = (event: SequencedSidecarEvent) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

class StdoutEventSink implements EventSink {
  readonly id = STDOUT_EVENT_SINK_ID;

  private stdoutQueue: string[] = [];
  private stdoutQueueOffset = 0;
  private stdoutBackpressured = false;
  private stdoutFlushing = false;

  emit(event: SequencedSidecarEvent): void {
    this.stdoutQueue.push(JSON.stringify(event) + '\n');
    this.flush();
  }

  flush(): void {
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
            this.flush();
          });
          break;
        }
      }

      if (this.stdoutQueueOffset >= this.stdoutQueue.length) {
        this.stdoutQueue = [];
        this.stdoutQueueOffset = 0;
        return;
      }

      if (this.stdoutQueueOffset >= 1024) {
        this.stdoutQueue = this.stdoutQueue.slice(this.stdoutQueueOffset);
        this.stdoutQueueOffset = 0;
      }
    } finally {
      this.stdoutFlushing = false;
    }
  }

  flushSync(): void {
    this.flush();
  }
}

/**
 * Emits events to one or more sinks (stdout, local IPC server, remote relays).
 * Keeps a replay buffer with monotonic sequence IDs for reconnect catch-up.
 */
export class EventEmitter {
  private eventBuffer: SequencedSidecarEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private flushIntervalMs = 10;
  private listeners = new Set<EventListener>();
  private sinks = new Map<string, EventSink>();
  private seqCounter = 0;
  private replayLimit: number;
  private replayBuffer: SequencedSidecarEvent[] = [];

  constructor(options?: { enableStdoutSink?: boolean; replayLimit?: number }) {
    this.replayLimit = Math.max(100, options?.replayLimit ?? 5000);
    if (options?.enableStdoutSink !== false) {
      this.addSink(new StdoutEventSink());
    }
  }

  /**
   * Attach an event sink.
   */
  addSink(sink: EventSink): void {
    this.sinks.set(sink.id, sink);
  }

  /**
   * Remove an event sink.
   */
  removeSink(sinkId: string): void {
    const sink = this.sinks.get(sinkId);
    if (!sink) return;

    this.sinks.delete(sinkId);
    try {
      const cleanup = sink.shutdown?.();
      if (cleanup && typeof (cleanup as Promise<void>).then === 'function') {
        void cleanup;
      }
    } catch {
      // Ignore sink cleanup failures.
    }
  }

  /**
   * Remove all sinks.
   */
  clearSinks(): void {
    for (const sinkId of Array.from(this.sinks.keys())) {
      this.removeSink(sinkId);
    }
  }

  hasSink(sinkId: string): boolean {
    return this.sinks.has(sinkId);
  }

  getCurrentSequence(): number {
    return this.seqCounter;
  }

  getReplayStartSequence(): number {
    if (this.replayBuffer.length === 0) return this.seqCounter;
    return this.replayBuffer[0]!.seq;
  }

  /**
   * Return sequenced events with seq > afterSeq.
   */
  getEventsSince(afterSeq: number, limit = 2000): SequencedSidecarEvent[] {
    const boundedLimit = Math.max(1, Math.min(10000, Math.floor(limit)));
    const result = this.replayBuffer.filter((event) => event.seq > afterSeq);
    if (result.length <= boundedLimit) {
      return result;
    }
    return result.slice(result.length - boundedLimit);
  }

  private nextEvent(type: AgentEventType, sessionId: string | undefined, data: unknown): SequencedSidecarEvent {
    const seq = this.seqCounter + 1;
    this.seqCounter = seq;
    return {
      seq,
      timestamp: Date.now(),
      type,
      sessionId: sessionId ?? null,
      data,
    };
  }

  private appendToReplay(event: SequencedSidecarEvent): void {
    this.replayBuffer.push(event);
    if (this.replayBuffer.length > this.replayLimit) {
      this.replayBuffer.splice(0, this.replayBuffer.length - this.replayLimit);
    }
  }

  /**
   * Emit an event to all registered sinks.
   */
  emit(type: AgentEventType, sessionId: string | undefined, data: unknown): void {
    // Coalesce frequent chat:update events within the current flush window.
    if (type === 'chat:update' && sessionId) {
      const incoming = data as { itemId?: string; updates?: Record<string, unknown> } | null;
      const incomingItemId = incoming?.itemId;
      if (incomingItemId) {
        for (let i = this.eventBuffer.length - 1; i >= 0; i -= 1) {
          const buffered = this.eventBuffer[i];
          if (buffered?.type !== 'chat:update' || buffered.sessionId !== sessionId) {
            continue;
          }
          const bufferedData = buffered.data as {
            itemId?: string;
            updates?: Record<string, unknown>;
          } | null;
          if (bufferedData?.itemId === incomingItemId) {
            const mergedUpdates = {
              ...(isRecord(bufferedData.updates) ? bufferedData.updates : {}),
              ...(isRecord(incoming.updates) ? incoming.updates : {}),
            };

            const merged = {
              ...buffered,
              timestamp: Date.now(),
              data: {
                ...bufferedData,
                ...incoming,
                itemId: incomingItemId,
                updates: mergedUpdates,
              },
            } satisfies SequencedSidecarEvent;

            this.eventBuffer[i] = merged;

            for (const listener of this.listeners) {
              try {
                listener(merged);
              } catch {
                // Listener failures should never break main event delivery.
              }
            }

            const replayIndex = this.replayBuffer.findIndex((entry) => entry.seq === merged.seq);
            if (replayIndex >= 0) {
              this.replayBuffer[replayIndex] = merged;
            } else {
              this.appendToReplay(merged);
            }
            this.scheduleFlush();
            return;
          }
        }
      }
    }

    const event = this.nextEvent(type, sessionId, data);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures should never break main event delivery.
      }
    }

    this.appendToReplay(event);
    this.eventBuffer.push(event);
    this.scheduleFlush();
  }

  streamStart(sessionId: string): void {
    this.emit('stream:start', sessionId, { timestamp: Date.now() });
  }

  streamChunk(sessionId: string, content: string): void {
    this.emit('stream:chunk', sessionId, { content });
  }

  streamDone(sessionId: string, message: unknown): void {
    this.emit('stream:done', sessionId, { message });
  }

  thinkingStart(sessionId: string): void {
    this.emit('thinking:start', sessionId, { timestamp: Date.now() });
  }

  thinkingChunk(sessionId: string, content: string): void {
    this.emit('thinking:chunk', sessionId, { content });
  }

  thinkingDone(sessionId: string): void {
    this.emit('thinking:done', sessionId, { timestamp: Date.now() });
  }

  toolStart(sessionId: string, toolCall: unknown): void {
    const toolCallAny = toolCall as { parentToolId?: string };
    this.emit('tool:start', sessionId, {
      toolCall,
      startTime: Date.now(),
      parentToolId: toolCallAny?.parentToolId,
    });
  }

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

  permissionRequest(sessionId: string, request: unknown): void {
    this.emit('permission:request', sessionId, { request });
  }

  permissionResolved(sessionId: string, permissionId: string, decision: string): void {
    this.emit('permission:resolved', sessionId, { permissionId, decision });
  }

  questionAsk(sessionId: string, request: unknown): void {
    this.emit('question:ask', sessionId, { request });
  }

  questionAnswered(sessionId: string, questionId: string, answer: string | string[]): void {
    this.emit('question:answered', sessionId, { questionId, answer });
  }

  taskCreate(sessionId: string, task: unknown): void {
    this.emit('task:create', sessionId, { task });
  }

  taskUpdate(sessionId: string, task: unknown): void {
    this.emit('task:update', sessionId, { task });
  }

  taskSet(sessionId: string, tasks: unknown[]): void {
    this.emit('task:set', sessionId, { tasks });
  }

  artifactCreated(sessionId: string, artifact: unknown): void {
    this.emit('artifact:created', sessionId, { artifact });
  }

  artifact(sessionId: string, artifact: {
    id: string;
    path: string;
    type: 'touched' | 'created' | 'modified' | 'deleted';
    url?: string;
    mimeType?: string;
    content?: string;
    timestamp?: number;
  }): void {
    this.emit('artifact:created', sessionId, {
      artifact: {
        ...artifact,
        timestamp: artifact.timestamp || Date.now(),
      },
    });
  }

  contextUpdate(sessionId: string, used: number, total: number): void {
    this.emit('context:update', sessionId, { used, total });
  }

  researchProgress(sessionId: string, status: string, progress: number): void {
    this.emit('research:progress', sessionId, { status, progress, timestamp: Date.now() });
  }

  browserViewScreenshot(
    sessionId: string,
    screenshot: {
      data: string;
      mimeType: string;
      url: string;
      timestamp: number;
    }
  ): void {
    this.emit('browserView:screenshot', sessionId, {
      data: screenshot.data,
      mimeType: screenshot.mimeType,
      url: screenshot.url,
      timestamp: screenshot.timestamp,
    });
  }

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

  chatItem(sessionId: string, item: ChatItem): void {
    this.emit('chat:item', sessionId, { item });
  }

  chatItemUpdate(sessionId: string, itemId: string, updates: Partial<ChatItem>): void {
    this.emit('chat:update', sessionId, { itemId, updates });
  }

  chatItemsBatch(sessionId: string, items: ChatItem[]): void {
    this.emit('chat:items', sessionId, { items });
  }

  queueUpdate(sessionId: string, queue: Array<{ id: string; content: string; queuedAt: number }>): void {
    this.emit('queue:update', sessionId, { queue });
  }

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

  integrationQR(qrDataUrl: string): void {
    this.emit('integration:qr', undefined, { qrDataUrl });
  }

  integrationMessageIn(platform: string, sender: string, content: string): void {
    this.emit('integration:message_in', undefined, {
      platform,
      sender,
      content: content.substring(0, 100),
      timestamp: Date.now(),
    });
  }

  integrationMessageOut(platform: string, chatId: string): void {
    this.emit('integration:message_out', undefined, {
      platform,
      chatId,
      timestamp: Date.now(),
    });
  }

  integrationQueued(platform: string, queueSize: number): void {
    this.emit('integration:queued', undefined, {
      platform,
      queueSize,
      timestamp: Date.now(),
    });
  }

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

  private scheduleFlush(): void {
    if (this.flushTimeout) return;

    this.flushTimeout = setTimeout(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  flush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.eventBuffer.length === 0) return;

    const events = this.eventBuffer;
    this.eventBuffer = [];

    for (const event of events) {
      for (const sink of this.sinks.values()) {
        try {
          sink.emit(event);
        } catch {
          // Sink failures should not break other sinks.
        }
      }
    }

    for (const sink of this.sinks.values()) {
      try {
        sink.flush?.();
      } catch {
        // ignore sink flush errors
      }
    }
  }

  flushSync(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.eventBuffer.length === 0) {
      for (const sink of this.sinks.values()) {
        try {
          sink.flushSync?.();
        } catch {
          // ignore sink flush errors
        }
      }
      return;
    }

    const events = this.eventBuffer;
    this.eventBuffer = [];

    for (const event of events) {
      for (const sink of this.sinks.values()) {
        try {
          sink.emit(event);
        } catch {
          // Sink failures should not break other sinks.
        }
      }
    }

    for (const sink of this.sinks.values()) {
      try {
        if (sink.flushSync) {
          sink.flushSync();
        } else {
          sink.flush?.();
        }
      } catch {
        // ignore sink flush errors
      }
    }
  }
}

// Singleton instance
export const eventEmitter = new EventEmitter();
