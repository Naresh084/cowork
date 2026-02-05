import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { BaseAdapter } from './base-adapter.js';
import type { SlackConfig } from '../types.js';

/**
 * Slack adapter using Socket Mode for real-time messaging.
 * Requires an App-Level Token (xapp-) and Bot User OAuth Token (xoxb-).
 */
export class SlackAdapter extends BaseAdapter {
  private socketClient: SocketModeClient | null = null;
  private webClient: WebClient | null = null;
  private botUserId: string | null = null;

  constructor() {
    super('slack');
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const slackConfig = config as unknown as SlackConfig;
    // Config stored for potential future use
void slackConfig;

    if (!slackConfig.appToken || !slackConfig.botToken) {
      throw new Error('Slack requires both appToken (xapp-) and botToken (xoxb-)');
    }

    this.webClient = new WebClient(slackConfig.botToken);
    this.socketClient = new SocketModeClient({ appToken: slackConfig.appToken });

    // Get bot user ID for @mention detection
    const authResult = await this.webClient.auth.test();
    this.botUserId = authResult.user_id as string;
    const botName = (authResult.user as string | undefined) || (authResult.user_id as string | undefined) || 'Gemini Cowork';

    // Handle incoming message events
    this.socketClient.on('message', async ({ event, ack }) => {
      await ack();

      try {
        // Skip bot's own messages
        if (event.user === this.botUserId) return;

        // Skip message subtypes (edits, deletes, joins, etc.)
        if (event.subtype) return;

        // Skip messages without text
        if (!event.text) return;

        const isDM = event.channel_type === 'im';
        const isMention = event.text.includes(`<@${this.botUserId}>`);

        // Only respond to DMs or @mentions
        if (!isDM && !isMention) return;

        // Clean @mention text from message
        let content = event.text;
        if (isMention) {
          content = content.replace(new RegExp(`<@${this.botUserId}>`, 'g'), '').trim();
        }

        if (!content) return;

        // Get sender display name
        const senderName = await this.getUserDisplayName(event.user);

        const message = this.buildIncomingMessage(
          event.channel,
          event.user,
          senderName,
          content,
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
}
