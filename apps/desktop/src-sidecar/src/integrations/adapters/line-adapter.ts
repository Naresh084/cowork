import { BaseAdapter } from './base-adapter.js';
import type {
  IntegrationActionRequest,
  IntegrationActionResult,
  IntegrationCapabilityMatrix,
} from '../types.js';
import { buildCapabilityMatrix } from '../types.js';

interface LineRuntimeConfig {
  channelAccessToken: string;
  defaultTargetId?: string;
}

export class LineAdapter extends BaseAdapter {
  private config: LineRuntimeConfig | null = null;

  constructor() {
    super('line');
  }

  override validateConfig(config: Record<string, unknown>): string | null {
    const token =
      typeof config.channelAccessToken === 'string'
        ? config.channelAccessToken.trim()
        : '';
    if (!token) return 'LINE requires channelAccessToken';
    return null;
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const validationError = this.validateConfig(config);
    if (validationError) throw new Error(validationError);

    this.config = {
      channelAccessToken: String(config.channelAccessToken).trim(),
      defaultTargetId:
        typeof config.defaultTargetId === 'string' && config.defaultTargetId.trim()
          ? config.defaultTargetId.trim()
          : undefined,
    };

    this.setConnected(true, 'LINE');
  }

  async disconnect(): Promise<void> {
    this.config = null;
    this.setConnected(false);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.config) throw new Error('LINE is not connected');
    const target = chatId || this.config.defaultTargetId;
    if (!target) throw new Error('LINE target user/group ID is required');

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.channelAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: target,
        messages: [{ type: 'text', text }],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`LINE send failed (${response.status}): ${message}`);
    }
  }

  async sendTypingIndicator(_chatId: string): Promise<void> {
    // LINE Messaging API does not support bot typing indicators.
  }

  override getCapabilities(): IntegrationCapabilityMatrix {
    return buildCapabilityMatrix(['send', 'read']);
  }

  override async performAction(
    request: IntegrationActionRequest,
  ): Promise<IntegrationActionResult> {
    if (request.action === 'send') {
      const chatId =
        request.target?.chatId ||
        request.target?.channelId ||
        this.config?.defaultTargetId;
      const text = request.payload?.text || '';
      if (!chatId || !text.trim()) {
        return {
          success: false,
          channel: this.getStatus().platform,
          action: request.action,
          reason: 'LINE send requires target chat/channel and payload.text',
        };
      }
      await this.sendMessage(chatId, text);
      return {
        success: true,
        channel: this.getStatus().platform,
        action: request.action,
        data: { target: chatId },
      };
    }

    return super.performAction(request);
  }
}

