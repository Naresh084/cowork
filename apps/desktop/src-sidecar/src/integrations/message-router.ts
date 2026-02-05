import { EventEmitter } from 'events';
import type { IncomingMessage, PlatformType } from './types.js';
import type { BaseAdapter } from './adapters/base-adapter.js';
import { eventEmitter } from '../event-emitter.js';

// ============================================================================
// Types
// ============================================================================

interface PendingOrigin {
  platform: PlatformType;
  chatId: string;
  senderName: string;
}

interface SessionProcessingState {
  isProcessing: boolean;
  pendingOrigin: PendingOrigin | null;
  accumulatedResponse: string;
  messageQueue: IncomingMessage[];
}

// ============================================================================
// Message Router
// ============================================================================

/**
 * Routes messages between platform adapters and the agent runner.
 *
 * Responsibilities:
 * - Receives incoming messages from all registered adapters
 * - Tags messages with platform/sender info before sending to agent
 * - Manages a message queue when agent is busy processing
 * - Routes agent responses back to the originating platform
 * - Consolidates rapid-fire messages (5+ in queue)
 */
export class MessageRouter extends EventEmitter {
  private adapters: Map<PlatformType, BaseAdapter> = new Map();
  private sessionState: Map<string, SessionProcessingState> = new Map();
  private agentRunner: any = null;
  private integrationSessionId: string | null = null;
  private sessionCreationPromise: Promise<string> | null = null;

  /** Set the agent runner reference (called during initialization) */
  setAgentRunner(runner: any): void {
    this.agentRunner = runner;
  }

  /** Register an adapter to receive messages from */
  registerAdapter(adapter: BaseAdapter): void {
    const platform = adapter.getStatus().platform;
    this.adapters.set(platform, adapter);

    adapter.on('message', (msg: IncomingMessage) => {
      this.handleIncoming(msg).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        eventEmitter.error(undefined, `Message routing error: ${errMsg}`, 'INTEGRATION_ERROR');
      });
    });
  }

  /** Unregister adapter */
  unregisterAdapter(platform: PlatformType): void {
    this.adapters.delete(platform);
  }

  /** Get or create the shared integration session (with lock to prevent duplicates) */
  private async getOrCreateSession(): Promise<string> {
    if (this.integrationSessionId) {
      // Verify session still exists
      try {
        await this.agentRunner.getSession(this.integrationSessionId);
        return this.integrationSessionId;
      } catch {
        this.integrationSessionId = null;
      }
    }

    // Prevent concurrent session creation - reuse in-flight promise
    if (this.sessionCreationPromise) {
      return this.sessionCreationPromise;
    }

    this.sessionCreationPromise = this.createNewSession();
    try {
      const id = await this.sessionCreationPromise;
      return id;
    } finally {
      this.sessionCreationPromise = null;
    }
  }

  /** Actually create the session (called only once even with concurrent requests) */
  private async createNewSession(): Promise<string> {
    const session = await this.agentRunner.createSession({
      workingDirectory: process.cwd(),
      title: 'Messaging Integration',
      type: 'integration',
    });
    this.integrationSessionId = session.id;
    return session.id;
  }

  /** Get or create processing state for a session */
  private getState(sessionId: string): SessionProcessingState {
    let state = this.sessionState.get(sessionId);
    if (!state) {
      state = {
        isProcessing: false,
        pendingOrigin: null,
        accumulatedResponse: '',
        messageQueue: [],
      };
      this.sessionState.set(sessionId, state);
    }
    return state;
  }

  /** Handle an incoming message from any platform */
  async handleIncoming(msg: IncomingMessage): Promise<void> {
    if (!this.agentRunner) {
      process.stderr.write('[message-router] Agent runner not set, dropping message\n');
      return;
    }

    const sessionId = await this.getOrCreateSession();
    const state = this.getState(sessionId);

    // Emit event for desktop UI
    eventEmitter.integrationMessageIn(msg.platform, msg.senderName, msg.content);

    if (state.isProcessing) {
      // Agent is busy - queue the message
      state.messageQueue.push(msg);

      // Emit queued event
      eventEmitter.integrationQueued(msg.platform, state.messageQueue.length);

      // Send acknowledgment to platform
      const adapter = this.adapters.get(msg.platform);
      if (adapter) {
        try {
          await adapter.sendMessage(
            msg.chatId,
            `Message received. Processing previous request... (${state.messageQueue.length} in queue)`,
          );
        } catch {
          /* ignore ack errors */
        }
      }
      return;
    }

    await this.processMessage(sessionId, state, msg);
  }

  /** Process a single message through the agent */
  private async processMessage(
    sessionId: string,
    state: SessionProcessingState,
    msg: IncomingMessage,
  ): Promise<void> {
    state.isProcessing = true;
    state.pendingOrigin = {
      platform: msg.platform,
      chatId: msg.chatId,
      senderName: msg.senderName,
    };
    state.accumulatedResponse = '';

    // Send typing indicator
    const adapter = this.adapters.get(msg.platform);
    if (adapter) {
      try {
        await adapter.sendTypingIndicator(msg.chatId);
      } catch {
        /* ignore typing errors */
      }
    }

    // Tag message with platform info
    const platformLabel =
      msg.platform.charAt(0).toUpperCase() + msg.platform.slice(1);
    const taggedContent = `[${platformLabel} | ${msg.senderName}]: ${msg.content}`;

    try {
      await this.agentRunner.sendMessage(sessionId, taggedContent);
    } catch (err) {
      state.isProcessing = false;
      state.pendingOrigin = null;
      throw err;
    }
  }

  /**
   * Called when agent finishes streaming a response (stream:done event).
   * Routes the final clean response text back to the originating platform.
   */
  async onStreamDone(sessionId: string, finalText: string): Promise<void> {
    if (sessionId !== this.integrationSessionId) return;

    const state = this.getState(sessionId);
    if (!state.pendingOrigin) return;

    const { platform, chatId } = state.pendingOrigin;
    const adapter = this.adapters.get(platform);

    if (adapter && finalText) {
      try {
        // Send clean response text (no thinking, no tools, just final text)
        const cleanText = this.formatForPlatform(finalText, platform);
        await adapter.sendMessage(chatId, cleanText);

        // Emit outgoing event
        eventEmitter.integrationMessageOut(platform, chatId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        eventEmitter.error(
          undefined,
          `Failed to send to ${platform}: ${errorMsg}`,
          'INTEGRATION_SEND_ERROR',
        );
      }
    }

    // Clear processing state
    state.isProcessing = false;
    state.pendingOrigin = null;
    state.accumulatedResponse = '';

    // Process next queued message
    await this.processNextInQueue(sessionId, state);
  }

  /** Process the next message in the queue, if any */
  private async processNextInQueue(
    sessionId: string,
    state: SessionProcessingState,
  ): Promise<void> {
    if (state.messageQueue.length === 0) return;

    let nextMsg: IncomingMessage;

    // If 5+ messages queued, consolidate them
    if (state.messageQueue.length >= 5) {
      nextMsg = this.consolidateQueue(state.messageQueue);
      state.messageQueue = [];
    } else {
      nextMsg = state.messageQueue.shift()!;
    }

    try {
      await this.processMessage(sessionId, state, nextMsg);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[message-router] Queue processing error: ${errMsg}\n`);
      // Reset processing state so next messages aren't permanently stuck
      state.isProcessing = false;
      state.pendingOrigin = null;
      // Try to process remaining queued messages
      if (state.messageQueue.length > 0) {
        await this.processNextInQueue(sessionId, state);
      }
    }
  }

  /** Consolidate multiple queued messages into one */
  private consolidateQueue(messages: IncomingMessage[]): IncomingMessage {
    const first = messages[0];
    const combined = messages
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join('\n');
    return {
      ...first,
      content: `Multiple messages received:\n${combined}`,
    };
  }

  /** Format agent response for specific platform (truncate if needed) */
  private formatForPlatform(text: string, platform: PlatformType): string {
    const maxLength =
      platform === 'whatsapp' ? 4000 : platform === 'telegram' ? 4096 : 8000;

    if (text.length > maxLength) {
      return (
        text.substring(0, maxLength - 60) +
        '\n\n...(truncated, see desktop for full response)'
      );
    }
    return text;
  }

  /** Get adapter for a platform */
  getAdapter(platform: PlatformType): BaseAdapter | undefined {
    return this.adapters.get(platform);
  }

  /** Get the integration session ID */
  getSessionId(): string | null {
    return this.integrationSessionId;
  }
}
