import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import type WAWebJS from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { homedir } from 'os';
import { join } from 'path';
import { BaseAdapter } from './base-adapter.js';
import type { WhatsAppConfig } from '../types.js';

const DEFAULT_SESSION_DIR = join(homedir(), '.cowork', 'integrations', 'whatsapp');

export class WhatsAppAdapter extends BaseAdapter {
  private client: WAWebJS.Client | null = null;
  private qrCode: string | null = null;
  private sessionDataDir: string;

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

    if (this.client) {
      await this.disconnect();
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: this.sessionDataDir,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.registerEvents(this.client);

    await this.client.initialize();
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;

    try {
      this.client.removeAllListeners();
      await this.client.destroy();
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
    await this.client.sendMessage(chatId, text);
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.client || !this._connected) return;

    try {
      const chat = await this.client.getChatById(chatId);
      await chat.sendStateTyping();
    } catch {
      // Typing indicator is best-effort, don't throw
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

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
      this.setConnected(true, displayName);
    });

    client.on('message', async (message: WAWebJS.Message) => {
      try {
        // Skip group messages and status broadcasts
        if (message.from.endsWith('@g.us') || message.from === 'status@broadcast') {
          return;
        }

        // Only handle plain text messages
        if (message.type !== 'chat') {
          return;
        }

        const contact = await message.getContact();
        const senderName = contact.pushname ?? contact.name ?? contact.number ?? message.from;

        const incoming = this.buildIncomingMessage(
          message.from,
          message.from,
          senderName,
          message.body,
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
}
