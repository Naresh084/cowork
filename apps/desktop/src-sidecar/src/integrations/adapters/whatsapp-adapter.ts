import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import type WAWebJS from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { rm } from 'fs/promises';
import { homedir } from 'os';
import { join, basename } from 'path';
import { BaseAdapter } from './base-adapter.js';
import {
  DEFAULT_WHATSAPP_DENIAL_MESSAGE,
  type IntegrationMediaPayload,
  type PlatformMessageAttachment,
  type WhatsAppConfig,
} from '../types.js';

const DEFAULT_SESSION_DIR = join(homedir(), '.cowork', 'integrations', 'whatsapp');
const DEBUG_WHATSAPP_AUTH =
  process.env.COWORK_DEBUG_WHATSAPP_AUTH === '1' ||
  process.env.COWORK_DEBUG_WHATSAPP_AUTH === 'true';

function normalizeE164Like(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D+/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

function fallbackMimeTypeForWhatsAppType(type: string): string {
  switch (type) {
    case 'image':
    case 'sticker':
      return 'image/jpeg';
    case 'video':
    case 'video_note':
      return 'video/mp4';
    case 'audio':
      return 'audio/mpeg';
    case 'ptt':
    case 'voice':
      return 'audio/ogg';
    case 'document':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

function extensionFromMimeType(mimeType: string): string {
  const cleanMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const slashIndex = cleanMime.indexOf('/');
  if (slashIndex < 0) return 'bin';
  const subtype = cleanMime.slice(slashIndex + 1);
  if (!subtype) return 'bin';
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'quicktime') return 'mov';
  if (subtype === 'x-m4a') return 'm4a';
  if (subtype.includes('+')) {
    const normalized = subtype.split('+').pop();
    return normalized || 'bin';
  }
  return subtype;
}

export class WhatsAppAdapter extends BaseAdapter {
  private client: WAWebJS.Client | null = null;
  private qrCode: string | null = null;
  private sessionDataDir: string;
  private senderPolicy: 'allowlist' = 'allowlist';
  private allowFrom: Set<string> = new Set();
  private denialMessage: string = DEFAULT_WHATSAPP_DENIAL_MESSAGE;
  private senderAliasToPhone: Map<string, string> = new Map();

  constructor() {
    super('whatsapp');
    this.sessionDataDir = DEFAULT_SESSION_DIR;
  }

  /** Returns the current QR code as a base64 data URL, or null if not available. */
  getQRCode(): string | null {
    return this.qrCode;
  }

  async connect(config: Record<string, unknown> = {}): Promise<void> {
    const waConfig = config as unknown as WhatsAppConfig;
    this.sessionDataDir = waConfig.sessionDataDir ?? DEFAULT_SESSION_DIR;
    await this.updateConfig(config);

    if (this.client) {
      await this.disconnect();
    }

    this.client = this.createClient();
    this.registerEvents(this.client);

    try {
      await this.client.initialize();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isProfileLockError =
        message.includes('already running for') || message.includes('userDataDir');

      if (!isProfileLockError) {
        throw err;
      }

      // Try one recovery path for stale Chromium singleton lock files.
      await this.cleanupStaleProfileLocks();
      await this.destroyClient(this.client);

      this.client = this.createClient();
      this.registerEvents(this.client);

      try {
        await this.client.initialize();
      } catch (retryErr) {
        const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
        throw new Error(
          `WhatsApp session is locked by another browser process. ${retryMessage}`
        );
      }
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;

    try {
      await this.destroyClient(this.client);
      await this.cleanupStaleProfileLocks();
    } catch {
      // Client may already be disconnected
    } finally {
      this.client = null;
      this.qrCode = null;
      this.setConnected(false);
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.client || !this._connected) {
      throw new Error('WhatsApp client is not connected');
    }
    const resolvedChatId = this.resolveOutboundChatId(chatId);
    if (resolvedChatId !== chatId) {
      process.stderr.write(
        `[whatsapp-send] remapped chatId ${chatId} -> ${resolvedChatId}\n`
      );
    }
    await this.client.sendMessage(resolvedChatId, text);
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.client || !this._connected) return;

    try {
      const resolvedChatId = this.resolveOutboundChatId(chatId);
      const chat = await this.client.getChatById(resolvedChatId);
      await chat.sendStateTyping();
    } catch {
      // Typing indicator is best-effort, don't throw
    }
  }

  override async sendProcessingPlaceholder(
    chatId: string,
    text: string,
  ): Promise<unknown> {
    if (!this.client || !this._connected) {
      throw new Error('WhatsApp client is not connected');
    }
    const resolvedChatId = this.resolveOutboundChatId(chatId);
    return this.client.sendMessage(resolvedChatId, text);
  }

  override async replaceProcessingPlaceholder(
    chatId: string,
    placeholderHandle: unknown,
    text: string,
  ): Promise<void> {
    if (!this.client || !this._connected) {
      throw new Error('WhatsApp client is not connected');
    }

    const sentMessage = placeholderHandle as
      | {
          edit?: (content: string) => Promise<unknown>;
        }
      | null;

    if (sentMessage && typeof sentMessage.edit === 'function') {
      try {
        await sentMessage.edit(text);
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[whatsapp-send] failed to edit placeholder, falling back to sendMessage: ${errMsg}\n`,
        );
      }
    }

    const resolvedChatId = this.resolveOutboundChatId(chatId);
    await this.client.sendMessage(resolvedChatId, text);
  }

  override async updateStreamingMessage(
    chatId: string,
    handle: unknown,
    text: string,
  ): Promise<unknown> {
    if (!this.client || !this._connected) {
      throw new Error('WhatsApp client is not connected');
    }

    const sentMessage = handle as
      | {
          edit?: (content: string) => Promise<unknown>;
        }
      | null;

    if (sentMessage && typeof sentMessage.edit === 'function') {
      try {
        await sentMessage.edit(text);
        return sentMessage;
      } catch {
        // Fall back to send-new below.
      }
    }

    const resolvedChatId = this.resolveOutboundChatId(chatId);
    return this.client.sendMessage(resolvedChatId, text);
  }

  override async sendMedia(chatId: string, media: IntegrationMediaPayload): Promise<unknown> {
    if (!this.client || !this._connected) {
      throw new Error('WhatsApp client is not connected');
    }

    const resolvedChatId = this.resolveOutboundChatId(chatId);
    const caption = media.caption?.trim();

    if (media.path) {
      try {
        const messageMedia = MessageMedia.fromFilePath(media.path);
        return this.client.sendMessage(
          resolvedChatId,
          messageMedia,
          caption ? ({ caption } as WAWebJS.MessageSendOptions) : undefined,
        );
      } catch {
        // Fall through to next source.
      }
    }

    if (media.data && media.mimeType) {
      const filename =
        (media.path ? basename(media.path) : undefined) ||
        `${media.mediaType}-${Date.now()}`;
      try {
        const messageMedia = new MessageMedia(media.mimeType, media.data, filename);
        return this.client.sendMessage(
          resolvedChatId,
          messageMedia,
          caption ? ({ caption } as WAWebJS.MessageSendOptions) : undefined,
        );
      } catch {
        // Fall through to text fallback.
      }
    }

    const fallbackText = `${caption || `Sent ${media.mediaType}`}${media.url ? `\n${media.url}` : ''}`;
    return this.client.sendMessage(resolvedChatId, fallbackText);
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  override async updateConfig(config: Record<string, unknown>): Promise<void> {
    const waConfig = config as WhatsAppConfig;
    this.senderPolicy = 'allowlist';

    const allowFromRaw = Array.isArray(waConfig.allowFrom) ? waConfig.allowFrom : [];
    const normalizedAllowFrom = new Set<string>();
    for (const value of allowFromRaw) {
      const normalized = normalizeE164Like(value);
      if (normalized) {
        normalizedAllowFrom.add(normalized);
      }
    }
    this.allowFrom = normalizedAllowFrom;

    const denial =
      typeof waConfig.denialMessage === 'string'
        ? waConfig.denialMessage.trim()
        : '';
    this.denialMessage = denial
      ? denial.slice(0, 280)
      : DEFAULT_WHATSAPP_DENIAL_MESSAGE;

    if (DEBUG_WHATSAPP_AUTH) {
      const allowlist = Array.from(this.allowFrom).join(', ') || '(empty)';
      process.stderr.write(
        `[whatsapp-auth] config updated policy=${this.senderPolicy} allowFrom=${allowlist}\n`
      );
    }
  }

  private registerEvents(client: WAWebJS.Client): void {
    client.on('qr', async (qr: string) => {
      try {
        this.qrCode = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
        });
        this.emit('qr', this.qrCode);
      } catch (err) {
        this.emit('error', new Error(`QR code generation failed: ${err}`));
      }
    });

    client.on('ready', async () => {
      this.qrCode = null;
      const info = client.info;
      const displayName = info?.pushname ?? info?.wid?.user ?? 'WhatsApp';
      const identityName = info?.pushname ?? displayName;
      const identityPhone = normalizeE164Like(info?.wid?.user);
      this.setConnected(true, displayName, identityName, identityPhone ?? undefined);
    });

    client.on('message', async (message: WAWebJS.Message) => {
      try {
        // Skip group messages and status broadcasts
        if (message.from.endsWith('@g.us') || message.from === 'status@broadcast') {
          return;
        }

        // Ignore bot's own echo messages to prevent loops.
        if (message.fromMe) {
          return;
        }

        const contact = await message.getContact().catch(() => null);
        this.updateAliasMapping(message, contact);
        const senderPhones = this.collectSenderPhoneCandidates(message, contact);
        const authorized = this.isSenderAuthorized(senderPhones);

        if (DEBUG_WHATSAPP_AUTH) {
          process.stderr.write(
            `[whatsapp-auth] from=${message.from} contactId=${contact?.id?._serialized ?? '-'} contactNumber=${contact?.number ?? '-'} candidates=${senderPhones.join('|') || '-'} allowlist=${Array.from(this.allowFrom).join('|') || '-'} aliases=${this.senderAliasToPhone.size} authorized=${authorized}\n`
          );
        }

        if (!authorized) {
          await this.sendUnauthorizedReply(message.from);
          return;
        }

        const senderName =
          contact?.pushname ?? contact?.name ?? contact?.number ?? message.from;

        const replyChatId = this.resolveInboundReplyChatId(message, contact);
        const attachments = await this.extractIncomingAttachments(message);
        const bodyText = typeof message.body === 'string' ? message.body.trim() : '';
        const fallbackText = this.buildFallbackIncomingText(message, attachments.length);
        const content = bodyText || fallbackText;

        if (!content && attachments.length === 0) {
          return;
        }

        const incoming = this.buildIncomingMessage(
          replyChatId,
          contact?.id?._serialized ?? message.from,
          senderName,
          content,
          attachments,
        );

        this.emit('message', incoming);
      } catch (err) {
        this.emit('error', new Error(`WhatsApp message handler error: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

    client.on('disconnected', (reason: string) => {
      this.qrCode = null;
      this.setConnected(false);
      this.emit('error', new Error(`WhatsApp disconnected: ${reason}`));
    });

    client.on('auth_failure', (message: string) => {
      this.qrCode = null;
      this.setConnected(false);
      this.emit('error', new Error(`WhatsApp auth failed: ${message}`));
    });
  }

  private createClient(): WAWebJS.Client {
    const options = {
      authStrategy: new LocalAuth({
        dataPath: this.sessionDataDir,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      webVersionCache: {
        type: 'local',
        path: join(this.sessionDataDir, '.wwebjs_cache'),
      },
    } as unknown as WAWebJS.ClientOptions;

    return new Client(options);
  }

  private async extractIncomingAttachments(
    message: WAWebJS.Message,
  ): Promise<PlatformMessageAttachment[]> {
    if (!message.hasMedia) {
      return [];
    }

    const media = await message.downloadMedia().catch(() => null);
    if (!media?.data) {
      return [];
    }

    const mimeType = media.mimetype || fallbackMimeTypeForWhatsAppType(message.type);
    const messageType = String(message.type);
    const attachmentType = this.mapWhatsAppAttachmentType(messageType, mimeType);
    const inferredName = this.inferWhatsAppAttachmentName(
      media.filename ?? undefined,
      attachmentType,
      mimeType,
    );
    const size =
      typeof media.filesize === 'number'
        ? media.filesize
        : typeof media.filesize === 'string'
          ? Number.parseInt(media.filesize, 10)
          : undefined;
    const rawDuration = (message as unknown as { duration?: unknown }).duration;
    const parsedDuration =
      typeof rawDuration === 'number'
        ? rawDuration
        : typeof rawDuration === 'string'
          ? Number.parseInt(rawDuration, 10)
          : undefined;
    const duration = Number.isFinite(parsedDuration) ? parsedDuration : undefined;

    return [
      {
        type: attachmentType,
        name: inferredName,
        mimeType,
        data: media.data,
        size: Number.isFinite(size) ? size : undefined,
        duration,
      },
    ];
  }

  private mapWhatsAppAttachmentType(
    messageType: string,
    mimeType: string | undefined,
  ): PlatformMessageAttachment['type'] {
    if (messageType === 'image' || messageType === 'sticker') {
      return 'image';
    }

    if (messageType === 'video' || messageType === 'video_note') {
      return 'video';
    }

    if (messageType === 'audio' || messageType === 'ptt' || messageType === 'voice') {
      return 'audio';
    }

    const normalizedMime = (mimeType || '').toLowerCase();
    if (normalizedMime.includes('pdf')) {
      return 'pdf';
    }

    if (normalizedMime.startsWith('image/')) {
      return 'image';
    }

    if (normalizedMime.startsWith('video/')) {
      return 'video';
    }

    if (normalizedMime.startsWith('audio/')) {
      return 'audio';
    }

    return 'file';
  }

  private inferWhatsAppAttachmentName(
    filename: string | null | undefined,
    attachmentType: PlatformMessageAttachment['type'],
    mimeType: string,
  ): string {
    if (filename && filename.trim()) {
      return filename.trim();
    }

    const extension = extensionFromMimeType(mimeType);
    const prefix = attachmentType === 'pdf' ? 'document' : attachmentType;
    return `${prefix}-${Date.now()}.${extension}`;
  }

  private buildFallbackIncomingText(
    message: WAWebJS.Message,
    attachmentCount: number,
  ): string {
    const messageType = String(message.type);

    if (attachmentCount > 0) {
      if (messageType === 'ptt' || messageType === 'voice') {
        return 'Voice note received.';
      }
      if (messageType === 'audio') {
        return 'Audio message received.';
      }
      if (messageType === 'image') {
        return 'Image received.';
      }
      if (messageType === 'video' || messageType === 'video_note') {
        return 'Video received.';
      }
      if (messageType === 'document') {
        return 'Document received.';
      }
      return 'Attachment received.';
    }

    if (messageType === 'location' || messageType === 'live_location') {
      return 'Location shared.';
    }

    if (messageType === 'vcard' || messageType === 'multi_vcard') {
      return 'Contact card shared.';
    }

    if (messageType !== 'chat') {
      return `${messageType} message received.`;
    }

    return '';
  }

  private extractSenderPhoneFromJid(
    jid: string | null | undefined
  ): string | null {
    if (!jid) {
      return null;
    }
    const localPart = jid.split('@')[0] ?? jid;
    const senderId = localPart.split(':')[0] ?? localPart;
    return normalizeE164Like(senderId);
  }

  private extractJidAlias(jid: string | null | undefined): string | null {
    if (!jid) return null;
    const localPart = jid.split('@')[0] ?? jid;
    const alias = localPart.split(':')[0] ?? localPart;
    return alias || null;
  }

  private collectSenderPhoneCandidates(
    message: WAWebJS.Message,
    contact: WAWebJS.Contact | null
  ): string[] {
    const candidates = new Set<string>();

    this.addSenderCandidate(candidates, this.extractSenderPhoneFromJid(message.from));
    this.addSenderCandidate(candidates, this.extractSenderPhoneFromJid(message.author));
    this.addSenderCandidate(
      candidates,
      this.extractSenderPhoneFromJid(
        (message.id as { remote?: string } | undefined)?.remote
      )
    );
    this.addSenderCandidate(candidates, normalizeE164Like(contact?.number));
    this.addSenderCandidate(candidates, normalizeE164Like(contact?.id?.user));
    this.addSenderCandidate(
      candidates,
      this.senderAliasToPhone.get(this.extractJidAlias(message.from) ?? '')
        ?? null
    );
    this.addSenderCandidate(
      candidates,
      this.senderAliasToPhone.get(this.extractJidAlias(message.author) ?? '')
        ?? null
    );
    this.addSenderCandidate(
      candidates,
      this.senderAliasToPhone.get(
        this.extractJidAlias((message.id as { remote?: string } | undefined)?.remote) ?? ''
      ) ?? null
    );

    return Array.from(candidates);
  }

  private resolveInboundReplyChatId(
    message: WAWebJS.Message,
    contact: WAWebJS.Contact | null
  ): string {
    const contactId = contact?.id?._serialized;
    if (contactId && typeof contactId === 'string') {
      return contactId;
    }
    return message.from;
  }

  private updateAliasMapping(
    message: WAWebJS.Message,
    contact: WAWebJS.Contact | null
  ): void {
    const normalizedFromContact =
      normalizeE164Like(contact?.number) ?? normalizeE164Like(contact?.id?.user);
    if (!normalizedFromContact) return;

    const aliases = new Set<string>();
    const fromAlias = this.extractJidAlias(message.from);
    if (fromAlias) aliases.add(fromAlias);
    const authorAlias = this.extractJidAlias(message.author);
    if (authorAlias) aliases.add(authorAlias);
    const remoteAlias = this.extractJidAlias(
      (message.id as { remote?: string } | undefined)?.remote
    );
    if (remoteAlias) aliases.add(remoteAlias);

    for (const alias of aliases) {
      this.senderAliasToPhone.set(alias, normalizedFromContact);
    }
  }

  private resolveOutboundChatId(chatId: string): string {
    if (!chatId) {
      return chatId;
    }

    if (chatId.includes('@')) {
      if (chatId.endsWith('@lid')) {
        const alias = this.extractJidAlias(chatId);
        const mappedPhone = alias
          ? this.senderAliasToPhone.get(alias)
          : undefined;
        if (mappedPhone) {
          const digits = mappedPhone.replace(/\D+/g, '');
          if (digits) {
            return `${digits}@c.us`;
          }
        }
      }
      return chatId;
    }

    const normalized = normalizeE164Like(chatId);
    if (!normalized) {
      return chatId;
    }
    const digits = normalized.replace(/\D+/g, '');
    return digits ? `${digits}@c.us` : chatId;
  }

  private addSenderCandidate(
    candidates: Set<string>,
    candidate: string | null
  ): void {
    if (!candidate) return;
    candidates.add(candidate);
  }

  private isSenderAuthorized(senderPhones: string[]): boolean {
    if (this.senderPolicy !== 'allowlist') {
      return true;
    }
    if (senderPhones.length === 0) {
      return false;
    }
    return senderPhones.some((senderPhone) => this.allowFrom.has(senderPhone));
  }

  private async sendUnauthorizedReply(chatId: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.sendMessage(chatId, this.denialMessage);
    } catch {
      // Unauthorized reply is best-effort.
    }
  }

  private async destroyClient(client: WAWebJS.Client | null): Promise<void> {
    if (!client) return;

    const browser = (client as WAWebJS.Client & {
      pupBrowser?: {
        close?: () => Promise<void>;
        process?: () => { killed?: boolean; kill: (signal?: NodeJS.Signals) => boolean } | null;
      };
    }).pupBrowser;

    try {
      client.removeAllListeners();
    } catch {
      // best-effort cleanup
    }

    try {
      await client.destroy();
    } catch {
      // best-effort cleanup
    }

    try {
      await browser?.close?.();
    } catch {
      // best-effort cleanup
    }

    try {
      const proc = browser?.process?.();
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch {
      // best-effort cleanup
    }
  }

  private async cleanupStaleProfileLocks(): Promise<void> {
    const profileDir = join(this.sessionDataDir, 'session');
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    await Promise.all(
      lockFiles.map(async (file) => {
        try {
          await rm(join(profileDir, file), { force: true });
        } catch {
          // ignore cleanup failures, retry path is best-effort
        }
      })
    );
  }
}
