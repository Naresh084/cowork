import { EventEmitter } from 'events';
import type { IncomingMessage, PlatformType } from './types.js';
import type { BaseAdapter } from './adapters/base-adapter.js';
import { eventEmitter } from '../event-emitter.js';

const INTEGRATION_SESSION_TITLE = 'Shared Session';
const LEGACY_INTEGRATION_SESSION_TITLE = 'Messaging Integration';
const THINKING_PLACEHOLDER_TEXT = 'Thinking...';

// ============================================================================
// Types
// ============================================================================

interface PendingOrigin {
  platform: PlatformType;
  chatId: string;
  senderName: string;
  thinkingHandle: unknown;
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
  private async getOrCreateSession(seedMessage?: IncomingMessage): Promise<string> {
    if (this.integrationSessionId) {
      // Verify session still exists
      try {
        await Promise.resolve(this.agentRunner.getSession(this.integrationSessionId));
        return this.integrationSessionId;
      } catch {
        this.integrationSessionId = null;
      }
    }

    const existingSessionId = await this.findExistingIntegrationSessionId();
    if (existingSessionId) {
      return existingSessionId;
    }

    // Prevent concurrent session creation - reuse in-flight promise
    if (this.sessionCreationPromise) {
      return this.sessionCreationPromise;
    }

    this.sessionCreationPromise = this.createNewSession(seedMessage);
    try {
      const id = await this.sessionCreationPromise;
      return id;
    } finally {
      this.sessionCreationPromise = null;
    }
  }

  private async findExistingIntegrationSessionId(): Promise<string | null> {
    if (!this.agentRunner || typeof this.agentRunner.listSessions !== 'function') {
      return null;
    }

    try {
      const sessions = await Promise.resolve(this.agentRunner.listSessions());
      if (!Array.isArray(sessions) || sessions.length === 0) {
        return null;
      }

      const integrationSession = sessions.find((session: unknown) => {
        const sessionAny = session as { type?: string; title?: string };
        if (sessionAny?.type === 'integration') {
          return true;
        }
        return (
          sessionAny?.title === INTEGRATION_SESSION_TITLE ||
          sessionAny?.title === LEGACY_INTEGRATION_SESSION_TITLE
        );
      }) as { id?: string; title?: string; messageCount?: number } | undefined;

      if (!integrationSession?.id) {
        return null;
      }

      await Promise.resolve(this.agentRunner.getSession(integrationSession.id));

      this.integrationSessionId = integrationSession.id;

      eventEmitter.sessionUpdated({
        id: integrationSession.id,
        title: integrationSession.title ?? undefined,
        messageCount:
          typeof integrationSession.messageCount === 'number'
            ? integrationSession.messageCount
            : undefined,
      });

      return integrationSession.id;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[message-router] Failed to restore integration session: ${errMsg}\n`,
      );
      return null;
    }
  }

  /** Actually create the session (called only once even with concurrent requests) */
  private async createNewSession(seedMessage?: IncomingMessage): Promise<string> {
    const initialTitle = this.buildSessionTitleFromMessage(seedMessage?.content);
    const session = await Promise.resolve(
      this.agentRunner.createSession(
        process.cwd(),
        null,
        initialTitle,
        'integration',
      ),
    );
    const sessionId = (session as { id?: string } | null)?.id;
    if (!sessionId) {
      throw new Error('Failed to create shared integration session');
    }

    eventEmitter.sessionUpdated({
      id: sessionId,
      title:
        (session as { title?: string | null } | null)?.title ?? initialTitle,
      messageCount:
        (session as { messageCount?: number } | null)?.messageCount ?? 0,
    });

    this.integrationSessionId = sessionId;
    return sessionId;
  }

  onStreamChunk(sessionId: string, chunk: string): void {
    if (sessionId !== this.integrationSessionId) return;
    if (!chunk) return;

    const state = this.getState(sessionId);
    if (!state.pendingOrigin) return;

    state.accumulatedResponse += chunk;
    if (state.accumulatedResponse.length > 16000) {
      state.accumulatedResponse = state.accumulatedResponse.slice(-16000);
    }
  }

  private getFallbackResponseText(): string {
    return 'I received your message, but I could not generate a text reply. Please try again.';
  }

  private buildSessionTitleFromMessage(content: string | undefined): string {
    const normalized = (content ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return INTEGRATION_SESSION_TITLE;
    }
    if (normalized.length <= 80) {
      return normalized;
    }
    return `${normalized.slice(0, 77).trimEnd()}...`;
  }

  private async maybeNameSessionFromFirstMessage(
    sessionId: string,
    content: string,
  ): Promise<void> {
    if (
      !this.agentRunner ||
      typeof this.agentRunner.getSession !== 'function' ||
      typeof this.agentRunner.updateSessionTitle !== 'function'
    ) {
      return;
    }

    try {
      const session = (await Promise.resolve(
        this.agentRunner.getSession(sessionId),
      )) as
        | {
            title?: string | null;
            messages?: unknown[];
            messageCount?: number;
          }
        | null;
      if (!session) return;

      const messageCount = Array.isArray(session.messages)
        ? session.messages.length
        : typeof session.messageCount === 'number'
          ? session.messageCount
          : 0;

      if (messageCount > 0) {
        return;
      }

      const existingTitle = session.title?.trim() ?? '';
      const hasCustomTitle =
        existingTitle.length > 0 &&
        existingTitle !== INTEGRATION_SESSION_TITLE &&
        existingTitle !== LEGACY_INTEGRATION_SESSION_TITLE;

      if (hasCustomTitle) {
        return;
      }

      const newTitle = this.buildSessionTitleFromMessage(content);
      if (!newTitle || newTitle === existingTitle) {
        return;
      }

      await Promise.resolve(this.agentRunner.updateSessionTitle(sessionId, newTitle));
      eventEmitter.sessionUpdated({
        id: sessionId,
        title: newTitle,
      });
    } catch {
      // Best-effort title update only.
    }
  }

  private async sendPlatformReply(
    adapter: BaseAdapter | undefined,
    platform: PlatformType,
    chatId: string,
    thinkingHandle: unknown,
    text: string,
  ): Promise<void> {
    if (!adapter) {
      return;
    }

    const cleanText = this.formatForPlatform(text, platform);
    await adapter.replaceProcessingPlaceholder(chatId, thinkingHandle, cleanText);
    eventEmitter.integrationMessageOut(platform, chatId);
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

    const sessionId = await this.getOrCreateSession(msg);
    const state = this.getState(sessionId);
    process.stderr.write(
      `[message-router] incoming platform=${msg.platform} chatId=${msg.chatId} session=${sessionId}\n`,
    );

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
      thinkingHandle: null,
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

    if (adapter) {
      try {
        const handle = await adapter.sendProcessingPlaceholder(
          msg.chatId,
          THINKING_PLACEHOLDER_TEXT,
        );
        if (state.pendingOrigin) {
          state.pendingOrigin.thinkingHandle = handle;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[message-router] Failed to send thinking placeholder: ${errMsg}\n`,
        );
      }
    }

    await this.maybeNameSessionFromFirstMessage(sessionId, msg.content);

    // Tag message with platform info
    const platformLabel =
      msg.platform.charAt(0).toUpperCase() + msg.platform.slice(1);
    const taggedContent = `[${platformLabel} | ${msg.senderName}]: ${msg.content}`;

    try {
      await this.agentRunner.sendMessage(sessionId, taggedContent);
    } catch (err) {
      if (adapter && state.pendingOrigin) {
        try {
          await adapter.replaceProcessingPlaceholder(
            msg.chatId,
            state.pendingOrigin.thinkingHandle,
            'Sorry, there was an error while processing your message.',
          );
          eventEmitter.integrationMessageOut(msg.platform, msg.chatId);
        } catch {
          // Best-effort error reply.
        }
      }
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

    const { platform, chatId, thinkingHandle } = state.pendingOrigin;
    const adapter = this.adapters.get(platform);
    const responseText = finalText.trim() || state.accumulatedResponse.trim();

    try {
      if (responseText) {
        await this.sendPlatformReply(
          adapter,
          platform,
          chatId,
          thinkingHandle,
          responseText,
        );
      } else {
        process.stderr.write(
          `[message-router] Empty final response for session=${sessionId}, sending fallback text\n`,
        );
        await this.sendPlatformReply(
          adapter,
          platform,
          chatId,
          thinkingHandle,
          this.getFallbackResponseText(),
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      eventEmitter.error(
        undefined,
        `Failed to send to ${platform}: ${errorMsg}`,
        'INTEGRATION_SEND_ERROR',
      );
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
