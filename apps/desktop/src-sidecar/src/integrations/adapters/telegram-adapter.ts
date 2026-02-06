import TelegramBot from 'node-telegram-bot-api';
import { BaseAdapter } from './base-adapter.js';
import type {
  TelegramConfig,
  IntegrationMediaPayload,
  PlatformMessageAttachment,
} from '../types.js';

/**
 * Telegram adapter using long-polling for real-time messaging.
 * Requires a bot token from @BotFather.
 */
export class TelegramAdapter extends BaseAdapter {
  private bot: TelegramBot | null = null;
  private allowedChatIds: Set<string> = new Set();

  constructor() {
    super('telegram');
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const telegramConfig = config as unknown as TelegramConfig;

    if (!telegramConfig.botToken) {
      throw new Error('Telegram requires a botToken from @BotFather');
    }

    const allowedChatIds = Array.isArray(telegramConfig.allowedChatIds)
      ? telegramConfig.allowedChatIds
      : [];
    this.allowedChatIds = new Set(allowedChatIds.map((id) => String(id)));

    this.bot = new TelegramBot(telegramConfig.botToken, { polling: true });

    // Get bot info for display name
    const botInfo = await this.bot.getMe();
    const botName = botInfo.first_name || botInfo.username || 'Cowork';

    // Handle incoming messages
    this.bot.on('message', async (msg) => {
      try {
        // Skip /start and /help commands
        if (msg.text === '/start' || msg.text === '/help') return;

        // Check allowed chat IDs whitelist
        const chatId = String(msg.chat.id);
        if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId)) {
          return;
        }

        const parsed = await this.extractIncomingPayload(msg);
        if (!parsed.content.trim() && parsed.attachments.length === 0) {
          return;
        }

        const senderId = String(msg.from?.id || msg.chat.id);
        const senderName =
          msg.from?.first_name
            ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}`
            : msg.from?.username || 'Unknown';

        const message = this.buildIncomingMessage(
          chatId,
          senderId,
          senderName,
          parsed.content,
          parsed.attachments,
        );
        this.emit('message', message);
      } catch (err) {
        this.emit('error', new Error(`Telegram message handler error: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

    // Handle polling errors gracefully
    this.bot.on('polling_error', (error) => {
      this.emit('error', error);
    });

    this.setConnected(true, botName);
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = null;
    }
    this.allowedChatIds.clear();
    this.setConnected(false);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram adapter is not connected');
    }

    await this.bot.sendMessage(chatId, text);
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.sendChatAction(chatId, 'typing');
    } catch {
      // Typing indicator is non-critical, ignore failures
    }
  }

  override async sendProcessingPlaceholder(
    chatId: string,
    text: string,
  ): Promise<unknown> {
    if (!this.bot) {
      throw new Error('Telegram adapter is not connected');
    }

    const sent = await this.bot.sendMessage(chatId, text);
    return {
      chatId: String(sent.chat.id),
      messageId: sent.message_id,
    };
  }

  override async replaceProcessingPlaceholder(
    chatId: string,
    placeholderHandle: unknown,
    text: string,
  ): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram adapter is not connected');
    }

    const handle = placeholderHandle as
      | {
          chatId?: string;
          messageId?: number;
        }
      | null;

    if (typeof handle?.messageId === 'number') {
      try {
        await this.bot.editMessageText(text, {
          chat_id: handle.chatId ?? chatId,
          message_id: handle.messageId,
        });
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.emit(
          'error',
          new Error(
            `Telegram placeholder edit failed, sending fallback message: ${errMsg}`,
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
    if (!this.bot) {
      throw new Error('Telegram adapter is not connected');
    }

    const currentHandle = handle as
      | {
          chatId?: string;
          messageId?: number;
        }
      | null;

    if (typeof currentHandle?.messageId === 'number') {
      try {
        await this.bot.editMessageText(text, {
          chat_id: currentHandle.chatId ?? chatId,
          message_id: currentHandle.messageId,
        });
        return currentHandle;
      } catch {
        // Fall through to send-new.
      }
    }

    const sent = await this.bot.sendMessage(chatId, text);
    return {
      chatId: String(sent.chat.id),
      messageId: sent.message_id,
    };
  }

  override async sendMedia(chatId: string, media: IntegrationMediaPayload): Promise<unknown> {
    if (!this.bot) {
      throw new Error('Telegram adapter is not connected');
    }

    const caption = media.caption?.trim() || undefined;

    if (media.mediaType === 'image') {
      const source: Buffer | string | undefined = media.path
        ? media.path
        : media.data
          ? Buffer.from(media.data, 'base64')
          : media.url;

      if (source) {
        return this.bot.sendPhoto(chatId, source, caption ? { caption } : {});
      }
    }

    if (media.mediaType === 'video') {
      const source: Buffer | string | undefined = media.path
        ? media.path
        : media.data
          ? Buffer.from(media.data, 'base64')
          : media.url;

      if (source) {
        return this.bot.sendVideo(chatId, source, caption ? { caption } : {});
      }
    }

    const fallback = `${caption || `Sent ${media.mediaType}`}${media.url ? `\n${media.url}` : ''}`;
    return this.bot.sendMessage(chatId, fallback);
  }

  private async extractIncomingPayload(
    msg: TelegramBot.Message,
  ): Promise<{ content: string; attachments: PlatformMessageAttachment[] }> {
    let content = (msg.text || msg.caption || '').trim();
    const attachments: PlatformMessageAttachment[] = [];

    const photoSizes = Array.isArray(msg.photo) ? msg.photo : [];
    if (photoSizes.length > 0) {
      const largest = photoSizes[photoSizes.length - 1];
      if (largest?.file_id) {
        const attachment = await this.downloadTelegramAttachment(largest.file_id, {
          attachmentType: 'image',
          fallbackMimeType: 'image/jpeg',
          fallbackName: `telegram-photo-${msg.message_id}.jpg`,
          size: largest.file_size,
        });
        if (attachment) {
          attachments.push(attachment);
        }
      }
    }

    if (msg.video?.file_id) {
      const attachment = await this.downloadTelegramAttachment(msg.video.file_id, {
        attachmentType: 'video',
        fallbackMimeType: msg.video.mime_type || 'video/mp4',
        fallbackName: `telegram-video-${msg.message_id}.mp4`,
        size: msg.video.file_size,
        duration: msg.video.duration,
      });
      if (attachment) {
        attachments.push(attachment);
      }
    }

    if (msg.voice?.file_id) {
      const attachment = await this.downloadTelegramAttachment(msg.voice.file_id, {
        attachmentType: 'audio',
        fallbackMimeType: msg.voice.mime_type || 'audio/ogg',
        fallbackName: `telegram-voice-${msg.message_id}.ogg`,
        size: msg.voice.file_size,
        duration: msg.voice.duration,
      });
      if (attachment) {
        attachments.push(attachment);
      }
    }

    if (msg.audio?.file_id) {
      const extension = (msg.audio.mime_type || 'audio/mpeg').split('/')[1] || 'mp3';
      const attachment = await this.downloadTelegramAttachment(msg.audio.file_id, {
        attachmentType: 'audio',
        fallbackMimeType: msg.audio.mime_type || 'audio/mpeg',
        fallbackName: `telegram-audio-${msg.message_id}.${extension}`,
        size: msg.audio.file_size,
        duration: msg.audio.duration,
      });
      if (attachment) {
        attachments.push(attachment);
      }
    }

    if (msg.video_note?.file_id) {
      const attachment = await this.downloadTelegramAttachment(msg.video_note.file_id, {
        attachmentType: 'video',
        fallbackMimeType: 'video/mp4',
        fallbackName: `telegram-video-note-${msg.message_id}.mp4`,
        size: msg.video_note.file_size,
        duration: msg.video_note.duration,
      });
      if (attachment) {
        attachments.push(attachment);
      }
    }

    if (msg.document?.file_id) {
      const mimeType = msg.document.mime_type || 'application/octet-stream';
      const attachmentType: PlatformMessageAttachment['type'] = mimeType.includes('pdf')
        ? 'pdf'
        : mimeType.startsWith('text/')
          ? 'text'
          : 'file';
      const attachment = await this.downloadTelegramAttachment(msg.document.file_id, {
        attachmentType,
        fallbackMimeType: mimeType,
        fallbackName: msg.document.file_name || `telegram-document-${msg.message_id}`,
        size: msg.document.file_size,
      });
      if (attachment) {
        attachments.push(attachment);
      }
    }

    if (msg.sticker?.file_id) {
      const stickerExt = msg.sticker.is_video ? 'webm' : 'webp';
      const attachmentType: PlatformMessageAttachment['type'] = msg.sticker.is_video
        ? 'video'
        : 'image';
      const attachment = await this.downloadTelegramAttachment(msg.sticker.file_id, {
        attachmentType,
        fallbackMimeType: msg.sticker.is_video ? 'video/webm' : 'image/webp',
        fallbackName: `telegram-sticker-${msg.message_id}.${stickerExt}`,
        size: msg.sticker.file_size,
      });
      if (attachment) {
        attachments.push(attachment);
      }
    }

    if (!content) {
      if (attachments.length > 0) {
        content = attachments.length === 1 ? 'Attachment received.' : `${attachments.length} attachments received.`;
      } else if (msg.location) {
        content = `Location: ${msg.location.latitude}, ${msg.location.longitude}`;
      } else if (msg.contact?.phone_number) {
        content = `Contact: ${msg.contact.phone_number}`;
      }
    }

    return { content, attachments };
  }

  private async downloadTelegramAttachment(
    fileId: string,
    options: {
      attachmentType: PlatformMessageAttachment['type'];
      fallbackMimeType: string;
      fallbackName: string;
      size?: number;
      duration?: number;
    },
  ): Promise<PlatformMessageAttachment | null> {
    if (!this.bot) {
      return null;
    }

    const fileUrl = await this.bot.getFileLink(fileId);
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Telegram file download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = response.headers.get('content-type') || options.fallbackMimeType;

    return {
      type: options.attachmentType,
      name: options.fallbackName,
      mimeType,
      data,
      size: typeof options.size === 'number' ? options.size : Buffer.from(data, 'base64').length,
      duration: options.duration,
    };
  }
}
