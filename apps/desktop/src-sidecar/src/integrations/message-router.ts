import { EventEmitter } from 'events';
import { stat } from 'fs/promises';
import { existsSync } from 'fs';
import type { ChatItem } from '@gemini-cowork/shared';
import type {
  IncomingMessage,
  IntegrationMediaPayload,
  PlatformMessageAttachment,
  PlatformType,
} from './types.js';
import type { Attachment } from '../types.js';
import type { BaseAdapter } from './adapters/base-adapter.js';
import { eventEmitter } from '../event-emitter.js';
import { formatIntegrationText } from './formatters/index.js';

const INTEGRATION_SESSION_TITLE = 'Shared Session';
const LEGACY_INTEGRATION_SESSION_TITLE = 'Messaging Integration';
const THINKING_PLACEHOLDER_TEXT = 'Thinking...';
const DEFAULT_MEDIA_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;

interface PendingOrigin {
  requestId: number;
  platform: PlatformType;
  chatId: string;
  senderName: string;
  thinkingHandle: unknown;
}

interface OutboundSegmentState {
  segmentIndex: number;
  handle: unknown;
  lastHash: string;
}

interface SessionProcessingState {
  isProcessing: boolean;
  pendingOrigin: PendingOrigin | null;
  messageQueue: IncomingMessage[];
  turnId: string | null;
  requestMarker: string | null;
  placeholderReplaced: boolean;
  hasDeliveredContent: boolean;
  segmentStateByItemId: Map<string, OutboundSegmentState>;
  sentMediaItemIds: Set<string>;
  outboundChain: Promise<void>;
}

/**
 * Routes messages between platform adapters and the agent runner.
 *
 * Responsibilities:
 * - Receives incoming messages from all registered adapters
 * - Tags messages with platform/sender info before sending to agent
 * - Manages a message queue when agent is busy processing
 * - Routes agent timeline updates back to the originating platform
 */
export class MessageRouter extends EventEmitter {
  private adapters: Map<PlatformType, BaseAdapter> = new Map();
  private sessionState: Map<string, SessionProcessingState> = new Map();
  private agentRunner: any = null;
  private integrationSessionId: string | null = null;
  private sessionCreationPromise: Promise<string> | null = null;
  private requestCounter = 0;
  private readonly maxMediaBytes: number;

  constructor() {
    super();
    const rawLimit = Number(process.env.COWORK_INTEGRATION_MAX_MEDIA_BYTES ?? DEFAULT_MEDIA_SIZE_LIMIT_BYTES);
    this.maxMediaBytes = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_MEDIA_SIZE_LIMIT_BYTES;
  }

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

    if (this.sessionCreationPromise) {
      return this.sessionCreationPromise;
    }

    this.sessionCreationPromise = this.createNewSession(seedMessage);
    try {
      return await this.sessionCreationPromise;
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

  private normalizeIncomingContent(content: string | undefined): string {
    return (content ?? '').replace(/\s+/g, ' ').trim();
  }

  private mapIncomingAttachments(
    attachments: PlatformMessageAttachment[] | undefined,
  ): Attachment[] {
    if (!attachments || attachments.length === 0) {
      return [];
    }

    const mapped: Attachment[] = [];

    for (const item of attachments) {
      const hasData = typeof item.data === 'string' && item.data.length > 0;
      let normalizedType: Attachment['type'] =
        item.type === 'pdf' ? 'pdf' : item.type;

      // Ensure metadata-only media is still represented as a file placeholder.
      if (!hasData && (normalizedType === 'image' || normalizedType === 'audio' || normalizedType === 'video')) {
        normalizedType = 'file';
      }

      const mimeType =
        item.mimeType ||
        (normalizedType === 'image'
          ? 'image/png'
          : normalizedType === 'audio'
            ? 'audio/mpeg'
            : normalizedType === 'video'
              ? 'video/mp4'
              : normalizedType === 'pdf'
                ? 'application/pdf'
                : normalizedType === 'text'
                  ? 'text/plain'
                  : 'application/octet-stream');

      mapped.push({
        type: normalizedType,
        name: item.name || `${normalizedType}-${Date.now()}`,
        mimeType,
        data: hasData ? item.data! : '',
      });
    }

    return mapped;
  }

  private buildTaggedInboundContent(msg: IncomingMessage): string {
    const platformLabel =
      msg.platform.charAt(0).toUpperCase() + msg.platform.slice(1);
    const normalizedContent = this.normalizeIncomingContent(msg.content);
    const hasAttachments = Boolean(msg.attachments && msg.attachments.length > 0);

    if (normalizedContent) {
      return `[${platformLabel} | ${msg.senderName}]: ${normalizedContent}`;
    }

    if (hasAttachments) {
      const count = msg.attachments!.length;
      const descriptor = count === 1 ? 'attachment' : `${count} attachments`;
      return `[${platformLabel} | ${msg.senderName}]: sent ${descriptor}.`;
    }

    return `[${platformLabel} | ${msg.senderName}]: (empty message)`;
  }

  private buildSessionSeedText(msg: IncomingMessage): string {
    const normalizedContent = this.normalizeIncomingContent(msg.content);
    if (normalizedContent) {
      return normalizedContent;
    }

    if (msg.attachments && msg.attachments.length > 0) {
      const count = msg.attachments.length;
      return count === 1 ? `Attachment from ${msg.senderName}` : `${count} attachments from ${msg.senderName}`;
    }

    return '';
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
            messageCount?: number;
            chatItems?: unknown[];
          }
        | null;
      if (!session) return;

      const messageCount = typeof session.messageCount === 'number'
        ? session.messageCount
        : Array.isArray(session.chatItems)
          ? session.chatItems.length
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

  /** Get or create processing state for a session */
  private getState(sessionId: string): SessionProcessingState {
    let state = this.sessionState.get(sessionId);
    if (!state) {
      state = {
        isProcessing: false,
        pendingOrigin: null,
        messageQueue: [],
        turnId: null,
        requestMarker: null,
        placeholderReplaced: false,
        hasDeliveredContent: false,
        segmentStateByItemId: new Map(),
        sentMediaItemIds: new Set(),
        outboundChain: Promise.resolve(),
      };
      this.sessionState.set(sessionId, state);
    }
    return state;
  }

  private resetStateForNextRequest(state: SessionProcessingState): void {
    state.isProcessing = false;
    state.pendingOrigin = null;
    state.turnId = null;
    state.requestMarker = null;
    state.placeholderReplaced = false;
    state.hasDeliveredContent = false;
    state.segmentStateByItemId.clear();
    state.sentMediaItemIds.clear();
    state.outboundChain = Promise.resolve();
  }

  private enqueueOutbound(state: SessionProcessingState, action: () => Promise<void>): void {
    state.outboundChain = state.outboundChain
      .then(action)
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        eventEmitter.error(undefined, `Integration outbound step failed: ${errMsg}`, 'INTEGRATION_SEND_ERROR');
      });
  }

  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (!part || typeof part !== 'object') return '';
          const partAny = part as { type?: string; text?: string };
          if (partAny.type === 'text' && typeof partAny.text === 'string') {
            return partAny.text;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    return '';
  }

  private hashText(input: string): string {
    return `${input.length}:${input}`;
  }

  private async ensurePlaceholderReplaced(
    state: SessionProcessingState,
    adapter: BaseAdapter,
    platform: PlatformType,
    chatId: string,
    replacementText: string,
  ): Promise<void> {
    if (!state.pendingOrigin || state.placeholderReplaced) {
      return;
    }

    await adapter.replaceProcessingPlaceholder(
      chatId,
      state.pendingOrigin.thinkingHandle,
      replacementText,
    );
    state.placeholderReplaced = true;
    state.hasDeliveredContent = true;
    eventEmitter.integrationMessageOut(platform, chatId);
  }

  private async sendAssistantText(
    state: SessionProcessingState,
    itemId: string,
    segmentIndex: number,
    text: string,
  ): Promise<void> {
    if (!state.pendingOrigin) return;

    const { platform, chatId } = state.pendingOrigin;
    const adapter = this.adapters.get(platform);
    if (!adapter) return;

    const cleanText = formatIntegrationText(platform, text);
    if (!cleanText.trim()) return;

    const current = state.segmentStateByItemId.get(itemId);
    const nextHash = this.hashText(cleanText);
    if (current?.lastHash === nextHash) {
      return;
    }

    if (!state.placeholderReplaced) {
      await this.ensurePlaceholderReplaced(state, adapter, platform, chatId, cleanText);
      state.segmentStateByItemId.set(itemId, {
        segmentIndex,
        handle: state.pendingOrigin.thinkingHandle,
        lastHash: nextHash,
      });
      return;
    }

    const handle = await adapter.updateStreamingMessage(chatId, current?.handle, cleanText);
    state.segmentStateByItemId.set(itemId, {
      segmentIndex,
      handle,
      lastHash: nextHash,
    });
    state.hasDeliveredContent = true;
    eventEmitter.integrationMessageOut(platform, chatId);
  }

  private async sendMediaItem(state: SessionProcessingState, item: ChatItem): Promise<void> {
    if (!state.pendingOrigin) return;
    if (item.kind !== 'media') return;
    if (state.sentMediaItemIds.has(item.id)) return;

    const { platform, chatId } = state.pendingOrigin;
    const adapter = this.adapters.get(platform);
    if (!adapter) return;

    const media: IntegrationMediaPayload = {
      mediaType: item.mediaType,
      path: item.path,
      url: item.url,
      mimeType: item.mimeType,
      data: item.data,
      caption: item.mediaType === 'image' ? 'Generated image' : 'Generated video',
      itemId: item.id,
    };

    const size = await this.getMediaSizeBytes(media);
    if (size !== null && size > this.maxMediaBytes) {
      const msg = formatIntegrationText(
        platform,
        `Generated ${media.mediaType} is too large to send (${Math.round(size / (1024 * 1024))}MB). Open it in Cowork desktop.`,
      );
      await this.ensurePlaceholderReplaced(state, adapter, platform, chatId, msg);
      if (state.placeholderReplaced) {
        await adapter.sendMessage(chatId, msg);
        eventEmitter.integrationMessageOut(platform, chatId);
      }
      state.sentMediaItemIds.add(item.id);
      state.hasDeliveredContent = true;
      return;
    }

    await this.ensurePlaceholderReplaced(
      state,
      adapter,
      platform,
      chatId,
      formatIntegrationText(platform, media.caption || `Generated ${media.mediaType}`),
    );

    await adapter.sendMedia(chatId, media);
    eventEmitter.integrationMessageOut(platform, chatId);
    state.sentMediaItemIds.add(item.id);
    state.hasDeliveredContent = true;
  }

  private async getMediaSizeBytes(media: IntegrationMediaPayload): Promise<number | null> {
    if (media.path && existsSync(media.path)) {
      try {
        const s = await stat(media.path);
        return s.size;
      } catch {
        return null;
      }
    }

    if (media.data) {
      try {
        return Buffer.from(media.data, 'base64').length;
      } catch {
        return null;
      }
    }

    return null;
  }

  private matchesTurn(state: SessionProcessingState, turnId: string | undefined): boolean {
    if (!turnId) return false;
    if (!state.turnId) return true;
    return state.turnId === turnId;
  }

  private detectTurnFromUserMessage(state: SessionProcessingState, item: ChatItem): void {
    if (item.kind !== 'user_message') return;
    if (state.turnId) return;
    if (!state.requestMarker) return;

    const text = this.extractTextContent(item.content);
    if (text.trim() === state.requestMarker.trim()) {
      state.turnId = item.turnId || item.id;
    }
  }

  onChatItem(sessionId: string, item: ChatItem): void {
    if (sessionId !== this.integrationSessionId) return;

    const state = this.getState(sessionId);
    if (!state.pendingOrigin) return;

    this.detectTurnFromUserMessage(state, item);

    if (item.kind === 'assistant_message') {
      if (!this.matchesTurn(state, item.turnId)) return;
      if (!state.turnId && item.turnId) {
        state.turnId = item.turnId;
      }

      const segmentIndex = item.stream?.segmentIndex ?? 0;
      const text = this.extractTextContent(item.content);
      if (!text.trim()) return;

      this.enqueueOutbound(state, async () => {
        await this.sendAssistantText(state, item.id, segmentIndex, text);
      });
      return;
    }

    if (item.kind === 'media') {
      if (!this.matchesTurn(state, item.turnId)) return;
      if (!state.turnId && item.turnId) {
        state.turnId = item.turnId;
      }
      this.enqueueOutbound(state, async () => {
        await this.sendMediaItem(state, item);
      });
    }
  }

  onChatItemUpdate(sessionId: string, itemId: string, updates: Partial<ChatItem>): void {
    if (sessionId !== this.integrationSessionId) return;

    const state = this.getState(sessionId);
    if (!state.pendingOrigin) return;

    const segment = state.segmentStateByItemId.get(itemId);
    if (!segment) return;

    const content = (updates as { content?: unknown }).content;
    if (content === undefined) return;

    const text = this.extractTextContent(content);
    if (!text.trim()) return;

    this.enqueueOutbound(state, async () => {
      await this.sendAssistantText(state, itemId, segment.segmentIndex, text);
    });
  }

  /**
   * Called when agent finishes streaming a response.
   * If no assistant/media output was sent, replace placeholder with fallback text.
   */
  async onStreamDone(sessionId: string): Promise<void> {
    if (sessionId !== this.integrationSessionId) return;

    const state = this.getState(sessionId);
    if (!state.pendingOrigin) return;

    const { platform, chatId, thinkingHandle } = state.pendingOrigin;
    const adapter = this.adapters.get(platform);

    await state.outboundChain;

    try {
      if (!state.hasDeliveredContent && adapter) {
        await adapter.replaceProcessingPlaceholder(
          chatId,
          thinkingHandle,
          this.getFallbackResponseText(),
        );
        eventEmitter.integrationMessageOut(platform, chatId);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      eventEmitter.error(
        undefined,
        `Failed to send fallback to ${platform}: ${errorMsg}`,
        'INTEGRATION_SEND_ERROR',
      );
    }

    this.resetStateForNextRequest(state);
    await this.processNextInQueue(sessionId, state);
  }

  async onStreamError(sessionId: string, errorText?: string): Promise<void> {
    if (sessionId !== this.integrationSessionId) return;

    const state = this.getState(sessionId);
    if (!state.pendingOrigin) return;

    const { platform, chatId, thinkingHandle } = state.pendingOrigin;
    const adapter = this.adapters.get(platform);

    await state.outboundChain;

    try {
      if (adapter) {
        const message = formatIntegrationText(
          platform,
          errorText?.trim() || 'Sorry, there was an error while processing your message.',
        );
        await adapter.replaceProcessingPlaceholder(chatId, thinkingHandle, message);
        eventEmitter.integrationMessageOut(platform, chatId);
      }
    } catch {
      // Best effort.
    }

    this.resetStateForNextRequest(state);
    await this.processNextInQueue(sessionId, state);
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

    const inboundSummary = this.normalizeIncomingContent(msg.content) || '[attachment]';
    eventEmitter.integrationMessageIn(msg.platform, msg.senderName, inboundSummary);

    if (state.isProcessing) {
      state.messageQueue.push(msg);
      eventEmitter.integrationQueued(msg.platform, state.messageQueue.length);

      const adapter = this.adapters.get(msg.platform);
      if (adapter) {
        try {
          await adapter.sendMessage(
            msg.chatId,
            `Message received. Processing previous request... (${state.messageQueue.length} in queue)`,
          );
        } catch {
          // Ignore queue ack errors.
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
    state.turnId = null;
    state.requestMarker = null;
    state.placeholderReplaced = false;
    state.hasDeliveredContent = false;
    state.segmentStateByItemId.clear();
    state.sentMediaItemIds.clear();

    state.pendingOrigin = {
      requestId: ++this.requestCounter,
      platform: msg.platform,
      chatId: msg.chatId,
      senderName: msg.senderName,
      thinkingHandle: null,
    };

    const adapter = this.adapters.get(msg.platform);
    if (adapter) {
      try {
        await adapter.sendTypingIndicator(msg.chatId);
      } catch {
        // Ignore typing errors.
      }

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

    await this.maybeNameSessionFromFirstMessage(sessionId, this.buildSessionSeedText(msg));
    const taggedContent = this.buildTaggedInboundContent(msg);
    const inboundAttachments = this.mapIncomingAttachments(msg.attachments);
    state.requestMarker = taggedContent;

    try {
      await this.agentRunner.sendMessage(
        sessionId,
        taggedContent,
        inboundAttachments.length > 0 ? inboundAttachments : undefined,
      );
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

      this.resetStateForNextRequest(state);
      throw err;
    }
  }

  /** Process the next message in the queue, if any */
  private async processNextInQueue(
    sessionId: string,
    state: SessionProcessingState,
  ): Promise<void> {
    if (state.messageQueue.length === 0) return;

    let nextMsg: IncomingMessage;

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
      this.resetStateForNextRequest(state);
      if (state.messageQueue.length > 0) {
        await this.processNextInQueue(sessionId, state);
      }
    }
  }

  /** Consolidate multiple queued messages into one */
  private consolidateQueue(messages: IncomingMessage[]): IncomingMessage {
    const first = messages[0];
    const combined = messages
      .map((m, i) => {
        const text = this.normalizeIncomingContent(m.content);
        const attachmentNote =
          m.attachments && m.attachments.length > 0
            ? ` (${m.attachments.length} attachment${m.attachments.length === 1 ? '' : 's'})`
            : '';
        return `${i + 1}. ${text || '[attachment only]'}${attachmentNote}`;
      })
      .join('\n');
    const combinedAttachments = messages.flatMap((m) => m.attachments ?? []);
    return {
      ...first,
      content: `Multiple messages received:\n${combined}`,
      attachments: combinedAttachments.length > 0 ? combinedAttachments : undefined,
    };
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
