import { readFile } from 'fs/promises';
import WebSocket from 'ws';
import { BaseAdapter } from './base-adapter.js';
import type {
  DiscordConfig,
  IntegrationMediaPayload,
  PlatformMessageAttachment,
} from '../types.js';

interface DiscordGatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string;
}

interface DiscordMessageAttachmentRaw {
  id: string;
  filename: string;
  content_type?: string;
  size?: number;
  url: string;
}

interface DiscordMessageEventRaw {
  id: string;
  channel_id: string;
  guild_id?: string;
  content: string;
  author?: {
    id?: string;
    username?: string;
    bot?: boolean;
  };
  member?: {
    nick?: string;
  };
  attachments?: DiscordMessageAttachmentRaw[];
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_GATEWAY_VERSION = 10;

const DISCORD_INTENTS = {
  GUILDS: 1,
  GUILD_MESSAGES: 1 << 9,
  DIRECT_MESSAGES: 1 << 12,
  MESSAGE_CONTENT: 1 << 15,
};

export class DiscordAdapter extends BaseAdapter {
  private botToken: string | null = null;
  private botUserId: string | null = null;
  private websocket: WebSocket | null = null;
  private heartbeatIntervalMs: number | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastSequence: number | null = null;
  private allowDirectMessages = true;
  private allowedGuildIds: Set<string> = new Set();
  private allowedChannelIds: Set<string> = new Set();

  constructor() {
    super('discord');
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    const discordConfig = config as unknown as DiscordConfig;
    if (!discordConfig.botToken || !discordConfig.botToken.trim()) {
      throw new Error('Discord requires a botToken');
    }

    this.botToken = discordConfig.botToken.trim();
    this.allowDirectMessages = discordConfig.allowDirectMessages !== false;
    this.allowedGuildIds = new Set(
      Array.isArray(discordConfig.allowedGuildIds)
        ? discordConfig.allowedGuildIds.map((id) => String(id).trim()).filter(Boolean)
        : [],
    );
    this.allowedChannelIds = new Set(
      Array.isArray(discordConfig.allowedChannelIds)
        ? discordConfig.allowedChannelIds.map((id) => String(id).trim()).filter(Boolean)
        : [],
    );

    const me = (await this.discordRequest('/users/@me', 'GET')) as {
      id: string;
      username: string;
      global_name?: string;
    };
    this.botUserId = me.id;
    const displayName = me.global_name || me.username || 'Discord Bot';

    const gatewayInfo = (await this.discordRequest('/gateway/bot', 'GET')) as { url?: string };
    const gatewayUrl = gatewayInfo.url || 'wss://gateway.discord.gg';

    await this.openGateway(gatewayUrl, displayName);
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.websocket) {
      this.websocket.removeAllListeners();
      this.websocket.terminate();
      this.websocket = null;
    }

    this.heartbeatIntervalMs = null;
    this.lastSequence = null;
    this.botToken = null;
    this.botUserId = null;
    this.allowedGuildIds.clear();
    this.allowedChannelIds.clear();
    this.setConnected(false);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.botToken) {
      throw new Error('Discord adapter is not connected');
    }

    await this.discordRequest(`/channels/${chatId}/messages`, 'POST', {
      content: text,
    });
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.botToken) {
      return;
    }

    try {
      await this.discordRequest(`/channels/${chatId}/typing`, 'POST');
    } catch {
      // Best effort only.
    }
  }

  override async sendMedia(chatId: string, media: IntegrationMediaPayload): Promise<unknown> {
    if (!this.botToken) {
      throw new Error('Discord adapter is not connected');
    }

    if (!media.path && !media.data && media.url) {
      const content = `${media.caption?.trim() || `Sent ${media.mediaType}`}\n${media.url}`;
      await this.sendMessage(chatId, content);
      return null;
    }

    const caption = media.caption?.trim() || '';

    let fileBuffer: Buffer | null = null;
    let filename = `${media.mediaType}-${Date.now()}`;

    if (media.path) {
      fileBuffer = await readFile(media.path);
      const parts = media.path.split('/');
      filename = parts[parts.length - 1] || filename;
    } else if (media.data) {
      fileBuffer = Buffer.from(media.data, 'base64');
      filename = `${filename}${media.mediaType === 'image' ? '.png' : '.mp4'}`;
    }

    if (!fileBuffer) {
      await this.sendMessage(chatId, caption || `Sent ${media.mediaType}`);
      return null;
    }

    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: media.mimeType || 'application/octet-stream' });
    form.append('files[0]', blob, filename);
    form.append(
      'payload_json',
      JSON.stringify({
        content: caption || undefined,
      }),
    );

    const response = await fetch(`${DISCORD_API_BASE}/channels/${chatId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${this.botToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord media send failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  override async checkHealth(): Promise<{
    health: 'healthy' | 'degraded' | 'unhealthy';
    healthMessage?: string;
    requiresReconnect?: boolean;
  }> {
    if (!this.botToken || !this._connected) {
      return {
        health: 'unhealthy',
        healthMessage: 'Discord is disconnected.',
        requiresReconnect: false,
      };
    }

    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return {
        health: 'unhealthy',
        healthMessage: 'Discord gateway is not open.',
        requiresReconnect: true,
      };
    }

    try {
      await this.discordRequest('/users/@me', 'GET');
      return {
        health: 'healthy',
        requiresReconnect: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        health: 'unhealthy',
        healthMessage: `Discord health check failed: ${message}`,
        requiresReconnect: true,
      };
    }
  }

  private async openGateway(gatewayUrl: string, displayName: string): Promise<void> {
    const finalUrl = `${gatewayUrl}/?v=${DISCORD_GATEWAY_VERSION}&encoding=json`;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(finalUrl);
      this.websocket = ws;

      const rejectWith = (error: string) => {
        reject(new Error(error));
      };

      ws.on('error', (error) => {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
        if (!this._connected) {
          rejectWith(error instanceof Error ? error.message : String(error));
        }
      });

      ws.on('close', () => {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }

        const wasConnected = this._connected;
        this.websocket = null;
        this.setConnected(false);

        if (!wasConnected) {
          rejectWith('Discord gateway disconnected before READY');
        }
      });

      ws.on('message', async (raw) => {
        try {
          const payload = JSON.parse(String(raw)) as DiscordGatewayPayload;
          if (typeof payload.s === 'number') {
            this.lastSequence = payload.s;
          }

          if (payload.op === 10) {
            const hello = payload.d as { heartbeat_interval?: number };
            const interval = Number(hello?.heartbeat_interval || 0);
            if (!Number.isFinite(interval) || interval <= 0) {
              throw new Error('Invalid Discord heartbeat interval');
            }
            this.heartbeatIntervalMs = interval;
            this.startHeartbeat();
            this.sendIdentify();
            return;
          }

          if (payload.op === 11) {
            return;
          }

          if (payload.op === 0 && payload.t === 'READY') {
            this.setConnected(true, displayName);
            resolve();
            return;
          }

          if (payload.op === 0 && payload.t === 'MESSAGE_CREATE') {
            await this.handleMessageCreate(payload.d as DiscordMessageEventRaw);
            return;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.emit('error', new Error(`Discord gateway parse error: ${message}`));
        }
      });
    });
  }

  private startHeartbeat(): void {
    if (!this.websocket || !this.heartbeatIntervalMs) {
      return;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      const heartbeatPayload = {
        op: 1,
        d: this.lastSequence,
      };

      this.websocket.send(JSON.stringify(heartbeatPayload));
    }, this.heartbeatIntervalMs);
  }

  private sendIdentify(): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN || !this.botToken) {
      return;
    }

    const identifyPayload = {
      op: 2,
      d: {
        token: this.botToken,
        intents:
          DISCORD_INTENTS.GUILDS |
          DISCORD_INTENTS.GUILD_MESSAGES |
          DISCORD_INTENTS.DIRECT_MESSAGES |
          DISCORD_INTENTS.MESSAGE_CONTENT,
        properties: {
          os: process.platform,
          browser: 'gemini-cowork',
          device: 'gemini-cowork',
        },
      },
    };

    this.websocket.send(JSON.stringify(identifyPayload));
  }

  private async handleMessageCreate(message: DiscordMessageEventRaw): Promise<void> {
    const authorId = message.author?.id || '';
    const isBot = Boolean(message.author?.bot);

    if (!authorId || isBot || authorId === this.botUserId) {
      return;
    }

    const channelId = message.channel_id;
    const guildId = message.guild_id;

    if (this.allowedChannelIds.size > 0 && !this.allowedChannelIds.has(channelId)) {
      return;
    }

    if (guildId && this.allowedGuildIds.size > 0 && !this.allowedGuildIds.has(guildId)) {
      return;
    }

    if (!guildId && !this.allowDirectMessages) {
      return;
    }

    const attachments = await this.extractIncomingAttachments(message.attachments || []);

    const senderName = message.member?.nick || message.author?.username || 'Discord User';
    const content = message.content?.trim() || (attachments.length > 0 ? 'Attachment received.' : '');

    if (!content && attachments.length === 0) {
      return;
    }

    const incoming = this.buildIncomingMessage(
      channelId,
      authorId,
      senderName,
      content,
      attachments,
    );

    this.emit('message', incoming);
  }

  private async extractIncomingAttachments(
    attachments: DiscordMessageAttachmentRaw[],
  ): Promise<PlatformMessageAttachment[]> {
    const parsed: PlatformMessageAttachment[] = [];

    for (const item of attachments) {
      if (!item.url) {
        continue;
      }

      try {
        const response = await fetch(item.url, {
          headers: this.botToken
            ? {
                Authorization: `Bot ${this.botToken}`,
              }
            : undefined,
        });

        if (!response.ok) {
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = item.content_type || response.headers.get('content-type') || 'application/octet-stream';

        parsed.push({
          type: this.mapMimeTypeToAttachmentType(mimeType),
          name: item.filename || `discord-attachment-${item.id}`,
          mimeType,
          data,
          size: typeof item.size === 'number' ? item.size : undefined,
        });
      } catch {
        parsed.push({
          type: 'file',
          name: item.filename || `discord-attachment-${item.id}`,
          mimeType: item.content_type || 'application/octet-stream',
          size: typeof item.size === 'number' ? item.size : undefined,
        });
      }
    }

    return parsed;
  }

  private mapMimeTypeToAttachmentType(
    mimeType: string,
  ): PlatformMessageAttachment['type'] {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('pdf')) return 'pdf';
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('audio/')) return 'audio';
    if (normalized.startsWith('video/')) return 'video';
    if (normalized.startsWith('text/')) return 'text';
    return 'file';
  }

  private async discordRequest(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.botToken) {
      throw new Error('Discord bot token is not configured');
    }

    const response = await fetch(`${DISCORD_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord API error (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }
}
