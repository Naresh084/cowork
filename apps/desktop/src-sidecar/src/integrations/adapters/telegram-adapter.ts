import TelegramBot from 'node-telegram-bot-api';
import { BaseAdapter } from './base-adapter.js';
import type { TelegramConfig, IntegrationMediaPayload } from '../types.js';

/**
 * Telegram adapter using long-polling for real-time messaging.
 * Requires a bot token from @BotFather.
 */
export class TelegramAdapter extends BaseAdapter {
  private bot: TelegramBot | null = null;

  constructor() {
    super('telegram');
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const telegramConfig = config as unknown as TelegramConfig;
    void telegramConfig;

    if (!telegramConfig.botToken) {
      throw new Error('Telegram requires a botToken from @BotFather');
    }

    this.bot = new TelegramBot(telegramConfig.botToken, { polling: true });

    // Get bot info for display name
    const botInfo = await this.bot.getMe();
    const botName = botInfo.first_name || botInfo.username || 'Cowork';

    // Handle incoming messages
    const allowedChatIds = telegramConfig.allowedChatIds;
    this.bot.on('message', (msg) => {
      try {
        // Skip non-text messages
        if (!msg.text) return;

        // Skip /start and /help commands
        if (msg.text === '/start' || msg.text === '/help') return;

        // Check allowed chat IDs whitelist
        const chatId = String(msg.chat.id);
        if (allowedChatIds && allowedChatIds.length > 0) {
          if (!allowedChatIds.includes(chatId)) return;
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
          msg.text,
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
}
