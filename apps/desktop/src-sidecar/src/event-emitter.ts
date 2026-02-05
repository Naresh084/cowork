import type { AgentEventType } from './types.js';

/**
 * SidecarEvent format expected by Rust (camelCase due to serde rename_all)
 */
interface SidecarEvent {
  type: string;
  sessionId: string | null;
  data: unknown;
}

/**
 * Emits events to the Rust backend via stdout.
 * Events are JSON objects with a specific structure that Tauri can parse.
 */
export class EventEmitter {
  private eventBuffer: SidecarEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private flushIntervalMs = 10; // Batch events every 10ms for performance

  /**
   * Emit an event to the Rust backend.
   */
  emit(type: AgentEventType, sessionId: string | undefined, data: unknown): void {
    const event: SidecarEvent = {
      type,
      sessionId: sessionId ?? null,
      data,
    };

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

  /**
   * Emit error event.
   */
  error(sessionId: string | undefined, errorMessage: string, code?: string, details?: unknown): void {
    this.emit('error', sessionId, { error: errorMessage, code, details });
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
      // Write event directly as JSON followed by newline
      // The Rust side expects SidecarEvent format: { type, session_id, data }
      const line = JSON.stringify(event) + '\n';
      process.stdout.write(line);
    }
  }

  /**
   * Flush all pending events immediately and synchronously.
   * This ensures all events are written before the function returns.
   * CRITICAL: Call this at the end of sendMessage to prevent lost events.
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
      const line = JSON.stringify(event) + '\n';
      // Use synchronous write to ensure event is sent before continuing
      // process.stdout.write returns boolean indicating if more writes can be done
      // If buffer is full (returns false), the data is still queued by Node.js
      const written = process.stdout.write(line);
      if (!written) {
        // Buffer is full, but data is queued. In a synchronous context,
        // we can't truly wait, but the data will be written.
        // For critical scenarios, we log this condition.
        process.stderr.write(`[event-emitter] stdout buffer full, event queued: ${event.type}\n`);
      }
    }
  }
}

// Singleton instance
export const eventEmitter = new EventEmitter();
