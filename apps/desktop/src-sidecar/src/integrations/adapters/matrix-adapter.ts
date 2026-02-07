import { randomUUID } from 'crypto';
import { BaseAdapter } from './base-adapter.js';
import type {
  IntegrationActionRequest,
  IntegrationActionResult,
  IntegrationCapabilityMatrix,
} from '../types.js';
import { buildCapabilityMatrix } from '../types.js';

interface MatrixRuntimeConfig {
  homeserverUrl: string;
  accessToken: string;
  defaultRoomId?: string;
}

export class MatrixAdapter extends BaseAdapter {
  private config: MatrixRuntimeConfig | null = null;

  constructor() {
    super('matrix');
  }

  override validateConfig(config: Record<string, unknown>): string | null {
    const homeserverUrl =
      typeof config.homeserverUrl === 'string' ? config.homeserverUrl.trim() : '';
    const accessToken =
      typeof config.accessToken === 'string' ? config.accessToken.trim() : '';

    if (!homeserverUrl) return 'Matrix requires homeserverUrl';
    if (!accessToken) return 'Matrix requires accessToken';
    return null;
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const validationError = this.validateConfig(config);
    if (validationError) throw new Error(validationError);

    this.config = {
      homeserverUrl: String(config.homeserverUrl).trim().replace(/\/$/, ''),
      accessToken: String(config.accessToken).trim(),
      defaultRoomId:
        typeof config.defaultRoomId === 'string' && config.defaultRoomId.trim()
          ? config.defaultRoomId.trim()
          : undefined,
    };

    this.setConnected(true, 'Matrix');
  }

  async disconnect(): Promise<void> {
    this.config = null;
    this.setConnected(false);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.config) throw new Error('Matrix is not connected');
    const roomId = chatId || this.config.defaultRoomId;
    if (!roomId) throw new Error('Matrix roomId is required');

    const txnId = randomUUID();
    const url =
      `${this.config.homeserverUrl}/_matrix/client/v3/rooms/` +
      `${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msgtype: 'm.text',
        body: text,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Matrix send failed (${response.status}): ${message}`);
    }
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.config) return;
    const roomId = chatId || this.config.defaultRoomId;
    if (!roomId) return;

    const txnId = randomUUID();
    const url =
      `${this.config.homeserverUrl}/_matrix/client/v3/rooms/` +
      `${encodeURIComponent(roomId)}/typing/${encodeURIComponent(txnId)}`;

    await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        typing: true,
        timeout: 1500,
      }),
    }).catch(() => {
      // Typing indicator is best-effort.
    });
  }

  override getCapabilities(): IntegrationCapabilityMatrix {
    return buildCapabilityMatrix(['send', 'read', 'search', 'thread_reply']);
  }

  override async performAction(
    request: IntegrationActionRequest,
  ): Promise<IntegrationActionResult> {
    if (request.action === 'send') {
      const chatId =
        request.target?.chatId ||
        request.target?.channelId ||
        this.config?.defaultRoomId;
      const text = request.payload?.text || '';
      if (!chatId || !text.trim()) {
        return {
          success: false,
          channel: this.getStatus().platform,
          action: request.action,
          reason: 'Matrix send requires target chat/channel and payload.text',
        };
      }
      await this.sendMessage(chatId, text);
      return {
        success: true,
        channel: this.getStatus().platform,
        action: request.action,
        data: { roomId: chatId },
      };
    }

    return super.performAction(request);
  }
}

