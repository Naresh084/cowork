import { EventEmitter } from 'events';
import type {
  PlatformType,
  PlatformStatus,
  IncomingMessage,
  IntegrationMediaPayload,
  PlatformMessageAttachment,
  IntegrationAction,
  IntegrationActionRequest,
  IntegrationActionResult,
  IntegrationCapabilityMatrix,
} from '../types.js';
import { buildCapabilityMatrix } from '../types.js';

/**
 * Abstract base class for messaging platform adapters.
 * Each platform (WhatsApp, Slack, Telegram) extends this class.
 *
 * Events emitted:
 * - 'message': When a new message is received from the platform
 * - 'status': When connection status changes
 * - 'qr': When a QR code is generated (WhatsApp only)
 * - 'error': When an error occurs
 */
export abstract class BaseAdapter extends EventEmitter {
  protected platform: PlatformType;
  protected _connected: boolean = false;
  protected _displayName: string | undefined;
  protected _identityPhone: string | undefined;
  protected _identityName: string | undefined;
  protected _lastActiveChat: string | undefined;
  protected _connectedAt: number | undefined;
  protected _lastMessageAt: number | undefined;

  constructor(platform: PlatformType) {
    super();
    this.platform = platform;
  }

  /**
   * Validate adapter config before connect/configure.
   * Return null when valid, otherwise an error message.
   */
  validateConfig(_config: Record<string, unknown>): string | null {
    return null;
  }

  /** Connect to the platform. Resolves when connected. */
  abstract connect(config: Record<string, unknown>): Promise<void>;

  /** Disconnect from the platform. */
  abstract disconnect(): Promise<void>;

  /** Update adapter runtime config without reconnect (optional override). */
  async updateConfig(_config: Record<string, unknown>): Promise<void> {
    // No-op by default.
  }

  /** Send a text message to the platform. */
  abstract sendMessage(chatId: string, text: string): Promise<void>;

  /** Send a typing indicator on the platform. */
  abstract sendTypingIndicator(chatId: string): Promise<void>;

  /**
   * Send a temporary "processing" placeholder message.
   * Returns a platform-specific handle that can be used to replace/edit it.
   */
  async sendProcessingPlaceholder(chatId: string, text: string): Promise<unknown> {
    await this.sendMessage(chatId, text);
    return null;
  }

  /**
   * Replace the processing placeholder with the final response.
   * Default behavior sends a new message if in-place replacement is unsupported.
   */
  async replaceProcessingPlaceholder(
    chatId: string,
    _placeholderHandle: unknown,
    text: string,
  ): Promise<void> {
    await this.sendMessage(chatId, text);
  }

  /**
   * Update an existing streaming text message and return the latest handle.
   * Default behavior sends a new message and returns no reusable handle.
   */
  async updateStreamingMessage(
    chatId: string,
    _handle: unknown,
    text: string,
  ): Promise<unknown> {
    await this.sendMessage(chatId, text);
    return null;
  }

  /**
   * Send media content to the platform.
   * Default behavior falls back to text-only representation.
   */
  async sendMedia(chatId: string, media: IntegrationMediaPayload): Promise<unknown> {
    const suffix = media.url ? `\n${media.url}` : '';
    const caption = media.caption?.trim() || `Sent ${media.mediaType}`;
    await this.sendMessage(chatId, `${caption}${suffix}`);
    return null;
  }

  /**
   * Return supported integration actions for this adapter.
   */
  getCapabilities(): IntegrationCapabilityMatrix {
    return buildCapabilityMatrix(['send']);
  }

  /**
   * Perform a rich messaging action.
   * Default implementation supports only `send`.
   */
  async performAction(
    request: IntegrationActionRequest,
  ): Promise<IntegrationActionResult> {
    const action = request.action as IntegrationAction;
    if (action === 'send') {
      const targetChatId =
        request.target?.chatId ||
        request.target?.channelId ||
        this.getDefaultChatId();
      if (!targetChatId) {
        return {
          success: false,
          channel: this.platform,
          action,
          reason: `No chat/channel target available for ${this.platform}`,
        };
      }

      const text = request.payload?.text || '';
      if (!text.trim()) {
        return {
          success: false,
          channel: this.platform,
          action,
          reason: 'payload.text is required for send',
        };
      }

      await this.sendMessage(targetChatId, text);
      return {
        success: true,
        channel: this.platform,
        action,
        data: {
          chatId: targetChatId,
        },
      };
    }

    return {
      success: false,
      channel: this.platform,
      action,
      unsupported: true,
      reason: `${this.platform} adapter does not support action "${action}"`,
      fallbackSuggestion: 'Try action "send" or a channel with richer capabilities.',
    };
  }

  /** Get the current connection status. */
  getStatus(): PlatformStatus {
    return {
      platform: this.platform,
      connected: this._connected,
      displayName: this._displayName,
      identityPhone: this._identityPhone,
      identityName: this._identityName,
      connectedAt: this._connectedAt,
      lastMessageAt: this._lastMessageAt,
    };
  }

  /** Get the last active chat ID (for defaulting notification targets). */
  getDefaultChatId(): string | undefined {
    return this._lastActiveChat;
  }

  /** Update status and emit event. */
  protected setConnected(
    connected: boolean,
    displayName?: string,
    identityName?: string,
    identityPhone?: string,
  ): void {
    this._connected = connected;
    if (displayName) this._displayName = displayName;
    if (identityName) this._identityName = identityName;
    if (identityPhone) this._identityPhone = identityPhone;
    if (connected) this._connectedAt = Date.now();
    if (!connected) {
      this._connectedAt = undefined;
      this._identityName = undefined;
      this._identityPhone = undefined;
    }
    this.emit('status', this.getStatus());
  }

  /** Build IncomingMessage from platform-specific data. */
  protected buildIncomingMessage(
    chatId: string,
    senderId: string,
    senderName: string,
    content: string,
    attachments?: PlatformMessageAttachment[],
  ): IncomingMessage {
    this._lastActiveChat = chatId;
    this._lastMessageAt = Date.now();
    return {
      platform: this.platform,
      chatId,
      senderId,
      senderName,
      content,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now(),
    };
  }
}
