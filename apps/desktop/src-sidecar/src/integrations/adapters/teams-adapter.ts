import { readFile } from 'fs/promises';
import { BaseAdapter } from './base-adapter.js';
import type {
  IntegrationMediaPayload,
  PlatformMessageAttachment,
  TeamsConfig,
  IntegrationActionRequest,
  IntegrationActionResult,
  IntegrationCapabilityMatrix,
} from '../types.js';
import { buildCapabilityMatrix } from '../types.js';

interface GraphChannelMessage {
  id: string;
  createdDateTime?: string;
  from?: {
    user?: {
      id?: string;
      displayName?: string;
    };
  };
  body?: {
    content?: string;
  };
  attachments?: Array<{
    id?: string;
    name?: string;
    contentType?: string;
    contentUrl?: string;
    content?: string;
  }>;
}

interface AccessTokenState {
  token: string;
  expiresAtMs: number;
}

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
type GraphRequestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export class TeamsAdapter extends BaseAdapter {
  private config: TeamsConfig | null = null;
  private tokenState: AccessTokenState | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private seenMessageIds: Set<string> = new Set();

  constructor() {
    super('teams');
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    this.config = this.parseConfig(config);
    await this.refreshAccessToken();

    const channel = (await this.graphRequest(
      `/teams/${this.config.teamId}/channels/${this.config.channelId}`,
      'GET',
    )) as { displayName?: string };

    this.setConnected(true, channel.displayName || 'Microsoft Teams');
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    this.config = null;
    this.tokenState = null;
    this.seenMessageIds.clear();
    this.setConnected(false);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.config) {
      throw new Error('Teams adapter is not connected');
    }

    const target = this.resolveTarget(chatId);

    await this.graphRequest(
      `/teams/${target.teamId}/channels/${target.channelId}/messages`,
      'POST',
      {
        body: {
          contentType: 'html',
          content: this.escapeHtml(text),
        },
      },
    );
  }

  async sendTypingIndicator(_chatId: string): Promise<void> {
    // Microsoft Teams Graph channel messages do not expose a simple typing API for this flow.
  }

  override getCapabilities(): IntegrationCapabilityMatrix {
    return buildCapabilityMatrix([
      'send',
      'read',
      'edit',
      'delete',
      'thread_reply',
      'thread_list',
    ]);
  }

  override async performAction(
    request: IntegrationActionRequest,
  ): Promise<IntegrationActionResult> {
    if (!this.config) {
      return {
        success: false,
        channel: this.getStatus().platform,
        action: request.action,
        reason: 'Teams adapter is not connected',
      };
    }

    const action = request.action;
    const targetChatId = request.target?.chatId || request.target?.channelId || '';

    try {
      switch (action) {
        case 'send': {
          const text = request.payload?.text?.trim() || '';
          if (!text) {
            return {
              success: false,
              channel: this.getStatus().platform,
              action,
              reason: 'Teams send requires payload.text',
            };
          }
          await this.sendMessage(targetChatId, text);
          return {
            success: true,
            channel: this.getStatus().platform,
            action,
            data: { target: targetChatId || `${this.config.teamId}:${this.config.channelId}` },
          };
        }
        case 'read': {
          const target = this.resolveTarget(targetChatId);
          const data = await this.graphRequest(
            `/teams/${target.teamId}/channels/${target.channelId}/messages?$top=20`,
            'GET',
          );
          return {
            success: true,
            channel: this.getStatus().platform,
            action,
            data,
          };
        }
        case 'edit': {
          const messageId = request.target?.messageId;
          const text = request.payload?.text?.trim() || '';
          if (!messageId || !text) {
            return {
              success: false,
              channel: this.getStatus().platform,
              action,
              reason: 'Teams edit requires target.messageId and payload.text',
            };
          }
          const target = this.resolveTarget(targetChatId);
          const data = await this.graphRequest(
            `/teams/${target.teamId}/channels/${target.channelId}/messages/${messageId}`,
            'PATCH',
            {
              body: {
                contentType: 'html',
                content: this.escapeHtml(text),
              },
            },
          );
          return {
            success: true,
            channel: this.getStatus().platform,
            action,
            data,
          };
        }
        case 'delete': {
          const messageId = request.target?.messageId;
          if (!messageId) {
            return {
              success: false,
              channel: this.getStatus().platform,
              action,
              reason: 'Teams delete requires target.messageId',
            };
          }
          const target = this.resolveTarget(targetChatId);
          const data = await this.graphRequest(
            `/teams/${target.teamId}/channels/${target.channelId}/messages/${messageId}`,
            'DELETE',
          );
          return {
            success: true,
            channel: this.getStatus().platform,
            action,
            data,
          };
        }
        case 'thread_list': {
          const messageId = request.target?.messageId;
          if (!messageId) {
            return {
              success: false,
              channel: this.getStatus().platform,
              action,
              reason: 'Teams thread_list requires target.messageId',
            };
          }
          const target = this.resolveTarget(targetChatId);
          const data = await this.graphRequest(
            `/teams/${target.teamId}/channels/${target.channelId}/messages/${messageId}/replies?$top=20`,
            'GET',
          );
          return {
            success: true,
            channel: this.getStatus().platform,
            action,
            data,
          };
        }
        case 'thread_reply': {
          const messageId = request.target?.messageId;
          const text = request.payload?.text?.trim() || '';
          if (!messageId || !text) {
            return {
              success: false,
              channel: this.getStatus().platform,
              action,
              reason: 'Teams thread_reply requires target.messageId and payload.text',
            };
          }
          const target = this.resolveTarget(targetChatId);
          const data = await this.graphRequest(
            `/teams/${target.teamId}/channels/${target.channelId}/messages/${messageId}/replies`,
            'POST',
            {
              body: {
                contentType: 'html',
                content: this.escapeHtml(text),
              },
            },
          );
          return {
            success: true,
            channel: this.getStatus().platform,
            action,
            data,
          };
        }
        default:
          return super.performAction(request);
      }
    } catch (error) {
      return {
        success: false,
        channel: this.getStatus().platform,
        action,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  override async sendMedia(chatId: string, media: IntegrationMediaPayload): Promise<unknown> {
    if (!this.config) {
      throw new Error('Teams adapter is not connected');
    }

    const target = this.resolveTarget(chatId);

    if (!media.path && !media.data && media.url) {
      const content = `${media.caption?.trim() || `Sent ${media.mediaType}`}<br/><a href="${this.escapeHtml(media.url)}">${this.escapeHtml(media.url)}</a>`;
      await this.graphRequest(
        `/teams/${target.teamId}/channels/${target.channelId}/messages`,
        'POST',
        {
          body: {
            contentType: 'html',
            content,
          },
        },
      );
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
      await this.sendMessage(chatId, media.caption || `Sent ${media.mediaType}`);
      return null;
    }

    const contentType = media.mimeType || 'application/octet-stream';
    const content = media.caption?.trim() || `Sent ${media.mediaType}`;

    return this.graphRequest(
      `/teams/${target.teamId}/channels/${target.channelId}/messages`,
      'POST',
      {
        body: {
          contentType: 'html',
          content: this.escapeHtml(content),
        },
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: filename,
            contentType,
            contentBytes: fileBuffer.toString('base64'),
          },
        ],
      },
    );
  }

  private parseConfig(raw: Record<string, unknown>): TeamsConfig {
    const tenantId = String(raw.tenantId || '').trim();
    const clientId = String(raw.clientId || '').trim();
    const clientSecret = String(raw.clientSecret || '').trim();
    const teamId = String(raw.teamId || '').trim();
    const channelId = String(raw.channelId || '').trim();

    if (!tenantId || !clientId || !clientSecret || !teamId || !channelId) {
      throw new Error('Teams requires tenantId, clientId, clientSecret, teamId, and channelId');
    }

    const pollIntervalSeconds =
      typeof raw.pollIntervalSeconds === 'number' && raw.pollIntervalSeconds > 0
        ? Math.max(10, Math.min(300, Math.floor(raw.pollIntervalSeconds)))
        : 30;

    return {
      tenantId,
      clientId,
      clientSecret,
      teamId,
      channelId,
      pollIntervalSeconds,
    };
  }

  private startPolling(): void {
    if (!this.config) {
      return;
    }

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    const intervalMs = (this.config.pollIntervalSeconds || 30) * 1000;
    this.pollingTimer = setInterval(() => {
      void this.pollMessages();
    }, intervalMs);

    void this.pollMessages();
  }

  private async pollMessages(): Promise<void> {
    if (!this.config) {
      return;
    }

    try {
      const response = (await this.graphRequest(
        `/teams/${this.config.teamId}/channels/${this.config.channelId}/messages?$top=20`,
        'GET',
      )) as { value?: GraphChannelMessage[] };

      const messages = Array.isArray(response.value) ? response.value : [];
      for (const message of messages) {
        await this.handleIncomingMessage(message);
      }
    } catch (error) {
      this.emit(
        'error',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private async handleIncomingMessage(message: GraphChannelMessage): Promise<void> {
    if (!this.config || !message.id) {
      return;
    }

    if (this.seenMessageIds.has(message.id)) {
      return;
    }

    this.seenMessageIds.add(message.id);
    if (this.seenMessageIds.size > 2000) {
      const first = this.seenMessageIds.values().next();
      if (!first.done) {
        this.seenMessageIds.delete(first.value);
      }
    }

    const senderId = message.from?.user?.id || 'teams-user';
    const senderName = message.from?.user?.displayName || 'Teams User';

    const bodyContent = this.stripHtml(message.body?.content || '').trim();
    const attachments = await this.extractAttachments(message.attachments || []);

    const content = bodyContent || (attachments.length > 0 ? 'Attachment received.' : '');
    if (!content && attachments.length === 0) {
      return;
    }

    const chatId = `${this.config.teamId}:${this.config.channelId}`;
    const incoming = this.buildIncomingMessage(
      chatId,
      senderId,
      senderName,
      content,
      attachments,
    );

    this.emit('message', incoming);
  }

  private async extractAttachments(
    attachments: NonNullable<GraphChannelMessage['attachments']>,
  ): Promise<PlatformMessageAttachment[]> {
    const parsed: PlatformMessageAttachment[] = [];

    for (const attachment of attachments) {
      const contentType = attachment.contentType || 'application/octet-stream';
      const name = attachment.name || `teams-attachment-${Date.now()}`;

      if (attachment.contentUrl) {
        try {
          const response = await this.graphRequestRaw(attachment.contentUrl, 'GET');
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            parsed.push({
              type: this.mapMimeTypeToAttachmentType(response.headers.get('content-type') || contentType),
              name,
              mimeType: response.headers.get('content-type') || contentType,
              data: Buffer.from(arrayBuffer).toString('base64'),
            });
            continue;
          }
        } catch {
          // fallback to metadata only
        }
      }

      if (attachment.content && attachment.content.length > 0) {
        parsed.push({
          type: contentType.startsWith('text/') ? 'text' : 'file',
          name,
          mimeType: contentType,
          data: Buffer.from(attachment.content, 'utf-8').toString('base64'),
        });
        continue;
      }

      parsed.push({
        type: 'file',
        name,
        mimeType: contentType,
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

  private resolveTarget(chatId: string): { teamId: string; channelId: string } {
    if (!this.config) {
      throw new Error('Teams config missing');
    }

    const raw = String(chatId || '').trim();
    if (!raw) {
      return { teamId: this.config.teamId, channelId: this.config.channelId };
    }

    const [teamId, channelId] = raw.split(':');
    if (!teamId || !channelId) {
      return { teamId: this.config.teamId, channelId: this.config.channelId };
    }

    return { teamId, channelId };
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.config) {
      throw new Error('Teams config missing');
    }

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Teams token request failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token) {
      throw new Error('Teams token response did not include access_token');
    }

    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;

    this.tokenState = {
      token: payload.access_token,
      expiresAtMs: Date.now() + expiresIn * 1000,
    };

    return payload.access_token;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.tokenState || Date.now() > this.tokenState.expiresAtMs - 60_000) {
      return this.refreshAccessToken();
    }

    return this.tokenState.token;
  }

  private async graphRequest(
    path: string,
    method: GraphRequestMethod,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.graphRequestRaw(path, method, body);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Teams Graph API error (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  private async graphRequestRaw(
    pathOrUrl: string,
    method: GraphRequestMethod,
    body?: Record<string, unknown>,
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const isAbsolute = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
    const url = isAbsolute ? pathOrUrl : `${GRAPH_BASE_URL}${pathOrUrl}`;

    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private stripHtml(input: string): string {
    return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br/>');
  }
}
