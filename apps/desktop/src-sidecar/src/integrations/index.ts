import { WhatsAppAdapter } from './adapters/whatsapp-adapter.js';
import { SlackAdapter } from './adapters/slack-adapter.js';
import { TelegramAdapter } from './adapters/telegram-adapter.js';
import { MessageRouter } from './message-router.js';
import { IntegrationStore } from './store.js';
import { eventEmitter } from '../event-emitter.js';
import type { PlatformType, PlatformStatus } from './types.js';
import type { BaseAdapter } from './adapters/base-adapter.js';

// ============================================================================
// Integration Bridge Service
// ============================================================================

/**
 * Main service that orchestrates all messaging platform adapters,
 * the message router, and config persistence.
 *
 * Provides a clean API for IPC handlers to:
 * - Connect/disconnect platforms
 * - Get statuses
 * - Send test/notification messages
 * - Get WhatsApp QR codes
 */
export class IntegrationBridgeService {
  private adapters: Map<PlatformType, BaseAdapter> = new Map();
  private router: MessageRouter;
  private store: IntegrationStore;
  private initialized = false;
  private platformOpInFlight: Set<PlatformType> = new Set();

  constructor() {
    this.router = new MessageRouter();
    this.store = new IntegrationStore();
  }

  /**
   * Initialize the bridge service.
   * Must be called after agentRunner is ready.
   */
  async initialize(agentRunner: any): Promise<void> {
    if (this.initialized) return;

    this.router.setAgentRunner(agentRunner);
    await this.store.load();

    // Subscribe to stream:done events for response routing
    this.subscribeToAgentEvents();

    // Auto-reconnect previously enabled platforms
    const enabled = this.store.getEnabledPlatforms();
    for (const platformConfig of enabled) {
      try {
        process.stderr.write(
          `[integration] Auto-reconnecting ${platformConfig.platform}...\n`,
        );
        await this.connect(platformConfig.platform, platformConfig.config);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[integration] Auto-reconnect failed for ${platformConfig.platform}: ${msg}\n`,
        );
        eventEmitter.error(
          undefined,
          `Auto-reconnect failed for ${platformConfig.platform}: ${msg}`,
          'INTEGRATION_RECONNECT_ERROR',
        );
      }
    }

    this.initialized = true;
    process.stderr.write(
      `[integration] Bridge initialized. ${enabled.length} platform(s) configured.\n`,
    );
  }

  /**
   * Subscribe to agent events to route responses back to platforms.
   * Intercepts the eventEmitter.streamDone to also call our router.
   */
  private subscribeToAgentEvents(): void {
    const originalStreamDone = eventEmitter.streamDone.bind(eventEmitter);
    eventEmitter.streamDone = (sessionId: string, message: unknown) => {
      // Call the original first
      originalStreamDone(sessionId, message);

      // Extract final text from the message
      const msg = message as {
        content?: string | Array<{ type: string; text?: string }>;
        role?: string;
      } | null;
      let finalText = '';

      if (typeof msg?.content === 'string') {
        finalText = msg.content;
      } else if (Array.isArray(msg?.content)) {
        // Extract text from content parts array
        finalText = msg.content
          .filter((p) => p.type === 'text' && p.text)
          .map((p) => p.text!)
          .join('\n');
      }

      if (finalText) {
        this.router.onStreamDone(sessionId, finalText).catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[integration] Error routing response: ${errMsg}\n`,
          );
        });
      }
    };
  }

  /** Connect a platform with given config */
  async connect(
    platform: PlatformType,
    config: Record<string, string> = {},
  ): Promise<void> {
    // Serialize platform operations to avoid concurrent connect/disconnect races.
    while (this.platformOpInFlight.has(platform)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.platformOpInFlight.add(platform);
    try {
    // Ensure previous adapter/browser for this platform is fully torn down before reconnecting.
    // This prevents profile lock conflicts (e.g. WhatsApp LocalAuth userDataDir in use).
    if (this.adapters.has(platform)) {
      const existing = this.adapters.get(platform)!;
      existing.removeAllListeners();
      this.router.unregisterAdapter(platform);
      try {
        await existing.disconnect();
      } catch {
        // Best effort cleanup
      }
      this.adapters.delete(platform);
    }

    if (platform === 'whatsapp') {
      // Chromium profile locks may persist briefly after teardown.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const adapter = this.createAdapter(platform);

    // Wire adapter status events to integration event emitter
    adapter.on('status', (status: PlatformStatus) => {
      eventEmitter.integrationStatus(status);
    });

    adapter.on('qr', (qrDataUrl: string) => {
      eventEmitter.integrationQR(qrDataUrl);
    });

    adapter.on('error', (error: Error) => {
      eventEmitter.error(
        undefined,
        `${platform} error: ${error.message}`,
        'INTEGRATION_PLATFORM_ERROR',
      );
    });

    // Attempt connection
    try {
      await adapter.connect(config);
    } catch (err) {
      // Clean up the failed adapter
      adapter.removeAllListeners();
      try { await adapter.disconnect(); } catch { /* ignore cleanup errors */ }
      throw err;
    }

    // Register new adapter
    this.router.registerAdapter(adapter);
    this.adapters.set(platform, adapter);

    // Save config for auto-reconnect (only after successful connection)
    await this.store.setConfig(platform, {
      platform,
      enabled: true,
      config,
    });
    } finally {
      this.platformOpInFlight.delete(platform);
    }
  }

  /** Disconnect a platform */
  async disconnect(platform: PlatformType): Promise<void> {
    while (this.platformOpInFlight.has(platform)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.platformOpInFlight.add(platform);
    try {
    const adapter = this.adapters.get(platform);
    if (adapter) {
      await adapter.disconnect();
      this.router.unregisterAdapter(platform);
      this.adapters.delete(platform);
    }
    await this.store.removeConfig(platform);
    } finally {
      this.platformOpInFlight.delete(platform);
    }
  }

  /** Get statuses of all platforms */
  getStatuses(): PlatformStatus[] {
    const platforms: PlatformType[] = ['whatsapp', 'slack', 'telegram'];
    return platforms.map((p) => {
      const adapter = this.adapters.get(p);
      return adapter
        ? adapter.getStatus()
        : { platform: p, connected: false };
    });
  }

  /** Get WhatsApp QR code (if available during connection) */
  getWhatsAppQR(): string | null {
    const adapter = this.adapters.get('whatsapp') as
      | WhatsAppAdapter
      | undefined;
    return adapter?.getQRCode() ?? null;
  }

  /** Send a test message on a platform */
  async sendTestMessage(
    platform: PlatformType,
    message: string,
  ): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter || !adapter.getStatus().connected) {
      throw new Error(`${platform} is not connected`);
    }
    const chatId = adapter.getDefaultChatId();
    if (!chatId) {
      throw new Error(
        `No active chat for ${platform}. Send a message from the platform first.`,
      );
    }
    await adapter.sendMessage(chatId, message);
  }

  /** Send a notification message (used by notification tools) */
  async sendNotification(
    platform: PlatformType,
    message: string,
    chatId?: string,
  ): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter || !adapter.getStatus().connected) {
      throw new Error(`${platform} is not connected`);
    }
    const targetChat = chatId || adapter.getDefaultChatId();
    if (!targetChat) {
      throw new Error(
        `No target chat for ${platform}. Send a message from the platform first.`,
      );
    }
    await adapter.sendMessage(targetChat, message);
  }

  /** Create adapter instance by platform type */
  private createAdapter(platform: PlatformType): BaseAdapter {
    switch (platform) {
      case 'whatsapp':
        return new WhatsAppAdapter();
      case 'slack':
        return new SlackAdapter();
      case 'telegram':
        return new TelegramAdapter();
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /** Get config store (for IPC handlers) */
  getStore(): IntegrationStore {
    return this.store;
  }
}

// Singleton instance
export const integrationBridge = new IntegrationBridgeService();
