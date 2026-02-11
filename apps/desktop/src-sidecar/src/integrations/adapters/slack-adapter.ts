import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { BaseAdapter } from './base-adapter.js';
import type {
  SlackConfig,
  IntegrationMediaPayload,
  PlatformMessageAttachment,
} from '../types.js';

/**
 * Slack adapter using Socket Mode for real-time messaging.
 * Requires an App-Level Token (xapp-) and Bot User OAuth Token (xoxb-).
 */
export class SlackAdapter extends BaseAdapter {
  private socketClient: SocketModeClient | null = null;
  private webClient: WebClient | null = null;
  private botUserId: string | null = null;
  private botToken: string | null = null;

  constructor() {
    super('slack');
  }

  override supportsStreamingEdits(): boolean {
    return true;
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const slackConfig = config as unknown as SlackConfig;
    // Config stored for potential future use
void slackConfig;

    if (!slackConfig.appToken || !slackConfig.botToken) {
      throw new Error('Slack requires both appToken (xapp-) and botToken (xoxb-)');
    }

    this.webClient = new WebClient(slackConfig.botToken);
    this.botToken = slackConfig.botToken;
    this.socketClient = new SocketModeClient({ appToken: slackConfig.appToken });

    // Get bot user ID for @mention detection
    const authResult = await this.webClient.auth.test();
    this.botUserId = authResult.user_id as string;
    const botName = (authResult.user as string | undefined) || (authResult.user_id as string | undefined) || 'Cowork';

    // Handle incoming message events
    this.socketClient.on('message', async ({ event, ack }) => {
      await ack();

      try {
        // Skip bot's own messages
        if (event.user === this.botUserId) return;

        const subtype = typeof event.subtype === 'string' ? event.subtype : null;
        const rawFiles = Array.isArray(event.files)
          ? (event.files as Array<Record<string, unknown>>)
          : [];
        const hasFiles = rawFiles.length > 0;

        // Skip message subtypes except file shares.
        if (subtype && subtype !== 'file_share') return;

        const rawText = typeof event.text === 'string' ? event.text : '';
        if (!rawText.trim() && !hasFiles) return;

        const isDM = event.channel_type === 'im';
        const isMention = rawText.includes(`<@${this.botUserId}>`);

        // Only respond to DMs or @mentions
        if (!isDM && !isMention) return;

        // Clean @mention text from message
        let content = rawText;
        if (isMention) {
          content = content.replace(new RegExp(`<@${this.botUserId}>`, 'g'), '').trim();
        }

        const attachments = hasFiles
          ? await this.extractIncomingAttachments(rawFiles)
          : [];
        if (!content.trim()) {
          content = this.buildAttachmentFallbackText(rawFiles, attachments.length);
        }

        if (!content.trim() && attachments.length === 0) return;

        // Get sender display name
        const senderName = await this.getUserDisplayName(event.user);

        const message = this.buildIncomingMessage(
          event.channel,
          event.user,
          senderName,
          content,
          attachments,
        );
        this.emit('message', message);
      } catch (err) {
        this.emit('error', new Error(`Slack message handler error: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

    // Handle connection events
    this.socketClient.on('connected', () => {
      this.setConnected(true, botName);
    });

    this.socketClient.on('disconnected', () => {
      this.setConnected(false);
    });

    // Start the socket connection
    await this.socketClient.start();
  }

  async disconnect(): Promise<void> {
    if (this.socketClient) {
      await this.socketClient.disconnect();
      this.socketClient = null;
    }
    this.webClient = null;
    this.botUserId = null;
    this.botToken = null;
    this.setConnected(false);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.webClient) {
      throw new Error('Slack adapter is not connected');
    }

    await this.webClient.chat.postMessage({
      channel: chatId,
      text,
      mrkdwn: true,
    });
  }

  async sendTypingIndicator(_chatId: string): Promise<void> {
    // Slack does not support typing indicators for bots
  }

  override async sendProcessingPlaceholder(
    chatId: string,
    text: string,
  ): Promise<unknown> {
    if (!this.webClient) {
      throw new Error('Slack adapter is not connected');
    }

    const response = await this.webClient.chat.postMessage({
      channel: chatId,
      text,
      mrkdwn: true,
    });

    return {
      channel: response.channel || chatId,
      ts: response.ts,
    };
  }

  override async replaceProcessingPlaceholder(
    chatId: string,
    placeholderHandle: unknown,
    text: string,
  ): Promise<void> {
    if (!this.webClient) {
      throw new Error('Slack adapter is not connected');
    }

    const handle = placeholderHandle as
      | {
          channel?: string;
          ts?: string;
        }
      | null;

    if (handle?.ts) {
      try {
        await this.webClient.chat.update({
          channel: handle.channel || chatId,
          ts: handle.ts,
          text,
        });
        return;
      } catch (err) {
        this.emit(
          'error',
          new Error(
            `Slack placeholder update failed, sending fallback message: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }

    await this.sendMessage(chatId, text);
  }

  override async updateStreamingMessage(
    chatId: string,
    handle: unknown,
    text: string,
  ): Promise<unknown> {
    if (!this.webClient) {
      throw new Error('Slack adapter is not connected');
    }

    const currentHandle = handle as
      | {
          channel?: string;
          ts?: string;
        }
      | null;

    if (currentHandle?.ts) {
      try {
        await this.webClient.chat.update({
          channel: currentHandle.channel || chatId,
          ts: currentHandle.ts,
          text,
        });
        return currentHandle;
      } catch {
        // Fall back to send-new below.
      }
    }

    const response = await this.webClient.chat.postMessage({
      channel: chatId,
      text,
      mrkdwn: true,
    });
    return {
      channel: response.channel || chatId,
      ts: response.ts,
    };
  }

  override async sendMedia(chatId: string, media: IntegrationMediaPayload): Promise<unknown> {
    if (!this.webClient) {
      throw new Error('Slack adapter is not connected');
    }

    if (!media.path && !media.data && !media.url) {
      await this.sendMessage(chatId, media.caption || `Sent ${media.mediaType}`);
      return null;
    }

    if (media.url && !media.path && !media.data) {
      await this.sendMessage(
        chatId,
        `${media.caption?.trim() || `Sent ${media.mediaType}`}\n${media.url}`,
      );
      return null;
    }

    const filename =
      media.path?.split('/').pop() ||
      `${media.mediaType}-${Date.now()}${media.mediaType === 'image' ? '.png' : '.mp4'}`;

    const uploadArgs: Record<string, unknown> = {
      channel_id: chatId,
      filename,
      title: filename,
    };

    if (media.caption?.trim()) {
      uploadArgs.initial_comment = media.caption.trim();
    }

    if (media.path) {
      uploadArgs.file = media.path;
    } else if (media.data) {
      uploadArgs.file = Buffer.from(media.data, 'base64');
    }

    const response = await this.webClient.filesUploadV2(uploadArgs as never);
    return response;
  }

  private async getUserDisplayName(userId: string): Promise<string> {
    if (!this.webClient) return userId;

    try {
      const result = await this.webClient.users.info({ user: userId });
      const user = result.user;
      return user?.profile?.display_name || user?.real_name || user?.name || userId;
    } catch {
      return userId;
    }
  }

  private async extractIncomingAttachments(
    files: Array<Record<string, unknown>>,
  ): Promise<PlatformMessageAttachment[]> {
    const attachments: PlatformMessageAttachment[] = [];

    for (const file of files) {
      const attachment = await this.downloadSlackAttachment(file);
      if (attachment) {
        attachments.push(attachment);
      }
    }

    return attachments;
  }

  private async downloadSlackAttachment(
    file: Record<string, unknown>,
  ): Promise<PlatformMessageAttachment | null> {
    const token = this.botToken;
    if (!token) {
      return null;
    }

    const urlPrivateDownload = typeof file.url_private_download === 'string'
      ? file.url_private_download
      : null;
    const urlPrivate = typeof file.url_private === 'string' ? file.url_private : null;
    const downloadUrl = urlPrivateDownload || urlPrivate;
    if (!downloadUrl) {
      return null;
    }

    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Slack file download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString('base64');

    const mimeTypeFromFile = typeof file.mimetype === 'string' ? file.mimetype : '';
    const mimeTypeFromHeader = response.headers.get('content-type') || '';
    const mimeType = mimeTypeFromFile || mimeTypeFromHeader || 'application/octet-stream';

    const name = typeof file.name === 'string' && file.name.trim()
      ? file.name.trim()
      : `slack-file-${Date.now()}`;
    const size = typeof file.size === 'number' ? file.size : data ? Buffer.from(data, 'base64').length : undefined;
    const durationMs = typeof file.duration_ms === 'number' ? file.duration_ms : undefined;

    return {
      type: this.mapMimeTypeToAttachmentType(mimeType),
      name,
      mimeType,
      data,
      size,
      duration: typeof durationMs === 'number' ? Math.round(durationMs / 1000) : undefined,
    };
  }

  override async checkHealth(): Promise<{
    health: 'healthy' | 'degraded' | 'unhealthy';
    healthMessage?: string;
    requiresReconnect?: boolean;
  }> {
    if (!this._connected || !this.webClient) {
      return {
        health: 'unhealthy',
        healthMessage: 'Slack is disconnected.',
        requiresReconnect: false,
      };
    }

    try {
      await this.webClient.auth.test();
      return {
        health: 'healthy',
        requiresReconnect: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        health: 'unhealthy',
        healthMessage: `Slack health check failed: ${message}`,
        requiresReconnect: true,
      };
    }
  }

  private mapMimeTypeToAttachmentType(
    mimeType: string,
  ): PlatformMessageAttachment['type'] {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('pdf')) return 'pdf';
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('video/')) return 'video';
    if (normalized.startsWith('audio/')) return 'audio';
    if (normalized.startsWith('text/')) return 'text';
    return 'file';
  }

  private buildAttachmentFallbackText(
    files: Array<Record<string, unknown>>,
    downloadedCount: number,
  ): string {
    if (downloadedCount > 0) {
      if (downloadedCount === 1) return 'Attachment received.';
      return `${downloadedCount} attachments received.`;
    }

    if (files.length > 0) {
      if (files.length === 1) return 'File received.';
      return `${files.length} files received.`;
    }

    return '';
  }
}
