import { readFile } from 'fs/promises';
import WebSocket from 'ws';
import { BaseAdapter } from './base-adapter.js';
import type {
  IMessageBlueBubblesConfig,
  IntegrationMediaPayload,
  PlatformMessageAttachment,
} from '../types.js';

interface BlueBubblesMessageLike {
  guid?: string;
  text?: string;
  body?: string;
  message?: string;
  chatGuid?: string;
  chat_guid?: string;
  handle?: string;
  address?: string;
  sender?: string;
  fromMe?: boolean;
  isFromMe?: boolean;
  attachments?: Array<Record<string, unknown>>;
}

export class IMessageBlueBubblesAdapter extends BaseAdapter {
  private config: IMessageBlueBubblesConfig | null = null;
  private websocket: WebSocket | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private knownMessageIds: Set<string> = new Set();
  private allowHandles: Set<string> = new Set();

  constructor() {
    super('imessage');
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('iMessage integration is only supported on macOS');
    }

    const parsed = this.parseConfig(config);
    this.config = parsed;
    this.allowHandles = new Set(
      Array.isArray(parsed.allowHandles)
        ? parsed.allowHandles.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
        : [],
    );

    await this.blueBubblesRequest('/api/v1/ping', 'GET').catch(async () => {
      // Some BlueBubbles deployments do not expose /ping; use chats endpoint as fallback.
      await this.blueBubblesRequest('/api/v1/chats', 'GET');
    });

    const displayName = 'BlueBubbles';
    this.setConnected(true, displayName);

    await this.startWebsocketStream();
    this.startPollingFallback();
  }

  async disconnect(): Promise<void> {
    if (this.websocket) {
      this.websocket.removeAllListeners();
      this.websocket.terminate();
      this.websocket = null;
    }

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    this.config = null;
    this.allowHandles.clear();
    this.knownMessageIds.clear();
    this.setConnected(false);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.config) {
      throw new Error('iMessage adapter is not connected');
    }

    const targetChatGuid = chatId || this.config.defaultChatGuid;
    if (!targetChatGuid) {
      throw new Error('No target iMessage chat GUID available');
    }

    const payload = {
      chatGuid: targetChatGuid,
      message: text,
    };

    const endpoints = ['/api/v1/message/text', '/api/v1/messages'];

    let lastError: unknown = null;
    for (const endpoint of endpoints) {
      try {
        await this.blueBubblesRequest(endpoint, 'POST', payload);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Failed to send iMessage via BlueBubbles: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  async sendTypingIndicator(_chatId: string): Promise<void> {
    // BlueBubbles typing API support is not guaranteed; no-op.
  }

  override async sendMedia(chatId: string, media: IntegrationMediaPayload): Promise<unknown> {
    if (!this.config) {
      throw new Error('iMessage adapter is not connected');
    }

    const targetChatGuid = chatId || this.config.defaultChatGuid;
    if (!targetChatGuid) {
      throw new Error('No target iMessage chat GUID available');
    }

    if (!media.path && !media.data && media.url) {
      await this.sendMessage(targetChatGuid, `${media.caption?.trim() || `Sent ${media.mediaType}`}\n${media.url}`);
      return null;
    }

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
      await this.sendMessage(targetChatGuid, media.caption || `Sent ${media.mediaType}`);
      return null;
    }

    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: media.mimeType || 'application/octet-stream' });
    form.append('chatGuid', targetChatGuid);
    form.append('attachment', blob, filename);
    if (media.caption?.trim()) {
      form.append('message', media.caption.trim());
    }

    const response = await fetch(`${this.config.serverUrl.replace(/\/$/, '')}/api/v1/message/file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BlueBubbles media send failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  override async checkHealth(): Promise<{
    health: 'healthy' | 'degraded' | 'unhealthy';
    healthMessage?: string;
    requiresReconnect?: boolean;
  }> {
    if (!this.config || !this._connected) {
      return {
        health: 'unhealthy',
        healthMessage: 'iMessage bridge is disconnected.',
        requiresReconnect: false,
      };
    }

    const websocketOpen =
      !!this.websocket && this.websocket.readyState === WebSocket.OPEN;
    const pollingActive = !!this.pollingTimer;

    if (!websocketOpen && !pollingActive) {
      return {
        health: 'unhealthy',
        healthMessage: 'BlueBubbles realtime stream is offline.',
        requiresReconnect: true,
      };
    }

    try {
      await this.blueBubblesRequest('/api/v1/ping', 'GET').catch(async () => {
        await this.blueBubblesRequest('/api/v1/chats?limit=1', 'GET');
      });
      return {
        health: websocketOpen ? 'healthy' : 'degraded',
        healthMessage: websocketOpen
          ? undefined
          : 'Realtime stream unavailable; polling fallback is active.',
        requiresReconnect: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        health: 'unhealthy',
        healthMessage: `BlueBubbles health check failed: ${message}`,
        requiresReconnect: true,
      };
    }
  }

  private parseConfig(config: Record<string, unknown>): IMessageBlueBubblesConfig {
    const serverUrl = String(config.serverUrl || '').trim().replace(/\/$/, '');
    const accessToken = String(config.accessToken || '').trim();

    if (!serverUrl) {
      throw new Error('iMessage requires BlueBubbles serverUrl');
    }

    if (!accessToken) {
      throw new Error('iMessage requires BlueBubbles accessToken');
    }

    const parsed: IMessageBlueBubblesConfig = {
      serverUrl,
      accessToken,
      defaultChatGuid: typeof config.defaultChatGuid === 'string' ? config.defaultChatGuid.trim() : undefined,
      allowHandles: Array.isArray(config.allowHandles)
        ? config.allowHandles.map((value) => String(value)).filter(Boolean)
        : undefined,
      pollIntervalSeconds:
        typeof config.pollIntervalSeconds === 'number' && config.pollIntervalSeconds > 0
          ? Math.max(5, Math.min(300, Math.floor(config.pollIntervalSeconds)))
          : 20,
    };

    return parsed;
  }

  private async startWebsocketStream(): Promise<void> {
    if (!this.config) {
      return;
    }

    const wsUrl = this.buildWsUrl(this.config.serverUrl);

    try {
      this.websocket = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      });

      this.websocket.on('message', (raw) => {
        try {
          const payload = JSON.parse(String(raw)) as Record<string, unknown>;
          const message = this.extractMessage(payload);
          if (!message) {
            return;
          }
          void this.handleIncomingMessage(message);
        } catch {
          // ignore malformed events
        }
      });

      this.websocket.on('error', (error) => {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      });
    } catch {
      // Fallback polling handles ingress when websocket is unavailable.
    }
  }

  private buildWsUrl(serverUrl: string): string {
    const normalized = serverUrl.replace(/\/$/, '');
    const wsBase = normalized.startsWith('https://')
      ? normalized.replace('https://', 'wss://')
      : normalized.startsWith('http://')
        ? normalized.replace('http://', 'ws://')
        : normalized;
    return `${wsBase}/api/v1/stream`;
  }

  private startPollingFallback(): void {
    if (!this.config) {
      return;
    }

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    const intervalMs = (this.config.pollIntervalSeconds || 20) * 1000;
    this.pollingTimer = setInterval(() => {
      void this.pollLatestMessages();
    }, intervalMs);

    void this.pollLatestMessages();
  }

  private async pollLatestMessages(): Promise<void> {
    if (!this.config) {
      return;
    }

    try {
      const response = await this.blueBubblesRequest('/api/v1/messages?limit=20', 'GET');
      const rawList = Array.isArray(response)
        ? response
        : Array.isArray((response as { data?: unknown }).data)
          ? ((response as { data: unknown[] }).data)
          : [];

      for (const raw of rawList) {
        if (!raw || typeof raw !== 'object') {
          continue;
        }

        const message = this.extractMessage(raw as Record<string, unknown>);
        if (!message) {
          continue;
        }

        await this.handleIncomingMessage(message);
      }
    } catch {
      // polling is best-effort
    }
  }

  private extractMessage(payload: Record<string, unknown>): BlueBubblesMessageLike | null {
    const candidate = (payload.message && typeof payload.message === 'object'
      ? payload.message
      : payload.data && typeof payload.data === 'object'
        ? payload.data
        : payload) as Record<string, unknown>;

    const chatGuid = String(candidate.chatGuid || candidate.chat_guid || '').trim();
    const guid = String(candidate.guid || candidate.id || '').trim();
    const text = String(candidate.text || candidate.body || candidate.message || '').trim();

    if (!chatGuid && !guid && !text) {
      return null;
    }

    return {
      guid,
      text,
      body: typeof candidate.body === 'string' ? candidate.body : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
      chatGuid,
      chat_guid: typeof candidate.chat_guid === 'string' ? candidate.chat_guid : undefined,
      handle:
        typeof candidate.handle === 'string'
          ? candidate.handle
          : typeof candidate.address === 'string'
            ? candidate.address
            : undefined,
      address: typeof candidate.address === 'string' ? candidate.address : undefined,
      sender: typeof candidate.sender === 'string' ? candidate.sender : undefined,
      fromMe: Boolean(candidate.fromMe),
      isFromMe: Boolean(candidate.isFromMe),
      attachments: Array.isArray(candidate.attachments)
        ? (candidate.attachments as Array<Record<string, unknown>>)
        : [],
    };
  }

  private async handleIncomingMessage(message: BlueBubblesMessageLike): Promise<void> {
    const messageId = (message.guid || '').trim();
    if (messageId) {
      if (this.knownMessageIds.has(messageId)) {
        return;
      }
      this.knownMessageIds.add(messageId);
      if (this.knownMessageIds.size > 2000) {
        const first = this.knownMessageIds.values().next();
        if (!first.done) {
          this.knownMessageIds.delete(first.value);
        }
      }
    }

    const fromMe = Boolean(message.fromMe || message.isFromMe);
    if (fromMe) {
      return;
    }

    const chatGuid = (message.chatGuid || message.chat_guid || '').trim() || this.config?.defaultChatGuid || '';
    if (!chatGuid) {
      return;
    }

    const senderId = String(message.handle || message.address || message.sender || chatGuid).trim();
    const senderNormalized = senderId.toLowerCase();
    if (this.allowHandles.size > 0 && !this.allowHandles.has(senderNormalized)) {
      return;
    }

    const attachments = await this.extractAttachments(message.attachments || []);
    const content = String(message.text || message.body || message.message || '').trim() || (attachments.length > 0 ? 'Attachment received.' : '');

    if (!content && attachments.length === 0) {
      return;
    }

    const incoming = this.buildIncomingMessage(
      chatGuid,
      senderId,
      senderId,
      content,
      attachments,
    );

    this.emit('message', incoming);
  }

  private async extractAttachments(
    attachments: Array<Record<string, unknown>>,
  ): Promise<PlatformMessageAttachment[]> {
    const parsed: PlatformMessageAttachment[] = [];

    for (const item of attachments) {
      const name = typeof item.name === 'string' ? item.name : `attachment-${Date.now()}`;
      const mimeType =
        typeof item.mimeType === 'string'
          ? item.mimeType
          : typeof item.mime_type === 'string'
            ? item.mime_type
            : 'application/octet-stream';

      const directData = typeof item.data === 'string' ? item.data : null;
      const url =
        typeof item.downloadUrl === 'string'
          ? item.downloadUrl
          : typeof item.url === 'string'
            ? item.url
            : typeof item.path === 'string'
              ? item.path
              : null;

      if (directData) {
        parsed.push({
          type: this.mapMimeTypeToAttachmentType(mimeType),
          name,
          mimeType,
          data: directData,
        });
        continue;
      }

      if (url && this.config) {
        try {
          const resolved = url.startsWith('http') ? url : `${this.config.serverUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
          const response = await fetch(resolved, {
            headers: {
              Authorization: `Bearer ${this.config.accessToken}`,
            },
          });

          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const data = Buffer.from(arrayBuffer).toString('base64');
            const responseType = response.headers.get('content-type') || mimeType;
            parsed.push({
              type: this.mapMimeTypeToAttachmentType(responseType),
              name,
              mimeType: responseType,
              data,
            });
            continue;
          }
        } catch {
          // fallthrough to metadata-only attachment
        }
      }

      parsed.push({
        type: 'file',
        name,
        mimeType,
      });
    }

    return parsed;
  }

  private mapMimeTypeToAttachmentType(mimeType: string): PlatformMessageAttachment['type'] {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('pdf')) return 'pdf';
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('audio/')) return 'audio';
    if (normalized.startsWith('video/')) return 'video';
    if (normalized.startsWith('text/')) return 'text';
    return 'file';
  }

  private async blueBubblesRequest(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.config) {
      throw new Error('BlueBubbles config is missing');
    }

    const response = await fetch(`${this.config.serverUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BlueBubbles API error (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }
}
