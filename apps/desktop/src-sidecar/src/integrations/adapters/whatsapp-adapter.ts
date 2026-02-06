import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import type WAWebJS from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { rm } from 'fs/promises';
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

  private createClient(): WAWebJS.Client {
    return new Client({
      authStrategy: new LocalAuth({
        dataPath: this.sessionDataDir,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
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
