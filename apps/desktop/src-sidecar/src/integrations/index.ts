import { WhatsAppAdapter } from './adapters/whatsapp-adapter.js';
import { SlackAdapter } from './adapters/slack-adapter.js';
import { TelegramAdapter } from './adapters/telegram-adapter.js';
import { DiscordAdapter } from './adapters/discord-adapter.js';
import { IMessageBlueBubblesAdapter } from './adapters/imessage-bluebubbles-adapter.js';
import { TeamsAdapter } from './adapters/teams-adapter.js';
import { MatrixAdapter } from './adapters/matrix-adapter.js';
import { LineAdapter } from './adapters/line-adapter.js';
import { MessageRouter } from './message-router.js';
import {
  IntegrationStore,
  type IntegrationGeneralSettings,
  type IntegrationHookRule,
  type IntegrationHookRun,
} from './store.js';
import { eventEmitter } from '../event-emitter.js';
import {
  DEFAULT_WHATSAPP_DENIAL_MESSAGE,
  SUPPORTED_INTEGRATION_PLATFORMS,
  type PlatformType,
  type PlatformStatus,
  type IntegrationActionRequest,
  type IntegrationActionResult,
  type IntegrationCapabilityMatrix,
  type IntegrationChannelManifest,
  type IntegrationPluginManifest,
} from './types.js';
import type { BaseAdapter } from './adapters/base-adapter.js';
import { IntegrationActionRouter } from './action-router.js';
import { integrationCatalogService } from './catalog-service.js';
import { IntegrationHooksStore } from './hooks/store.js';
import {
  IntegrationHookEngine,
  type CreateHookRuleInput,
  type UpdateHookRuleInput,
} from './hooks/engine.js';

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
  private actionRouter: IntegrationActionRouter;
  private hooksEngine: IntegrationHookEngine;
  private agentRunner: any = null;
  private initialized = false;
  private platformOpInFlight: Set<PlatformType> = new Set();

  constructor() {
    this.router = new MessageRouter();
    this.store = new IntegrationStore();
    this.actionRouter = new IntegrationActionRouter((platform) => this.adapters.get(platform));
    this.hooksEngine = new IntegrationHookEngine(
      new IntegrationHooksStore(this.store),
      (request) => this.callAction(request),
    );
  }

  /**
   * Initialize the bridge service.
   * Must be called after agentRunner is ready.
   */
  async initialize(agentRunner: any): Promise<void> {
    if (this.initialized) return;

    this.agentRunner = agentRunner;
    this.router.setAgentRunner(agentRunner);
    await this.store.load();
    this.router.setSharedSessionWorkingDirectory(
      this.store.getSettings().sharedSessionWorkingDirectory,
    );
    await this.hooksEngine.initialize();

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
   * Intercepts chat/stream lifecycle events to route responses back to platforms.
   */
  private subscribeToAgentEvents(): void {
    // Intercept chat:item events for segment/media routing.
    const originalChatItem = eventEmitter.chatItem.bind(eventEmitter);
    eventEmitter.chatItem = (sessionId: string, item: import('@gemini-cowork/shared').ChatItem) => {
      originalChatItem(sessionId, item);
      this.router.onChatItem(sessionId, item);
    };

    // Intercept chat:update events for streaming text updates.
    const originalChatUpdate = eventEmitter.chatItemUpdate.bind(eventEmitter);
    eventEmitter.chatItemUpdate = (
      sessionId: string,
      itemId: string,
      updates: Partial<import('@gemini-cowork/shared').ChatItem>,
    ) => {
      originalChatUpdate(sessionId, itemId, updates);
      this.router.onChatItemUpdate(sessionId, itemId, updates);
    };

    // Intercept stream completion to close active integration request state.
    const originalStreamDone = eventEmitter.streamDone.bind(eventEmitter);
    eventEmitter.streamDone = (sessionId: string, message: unknown) => {
      originalStreamDone(sessionId, message);
      this.router.onStreamDone(sessionId).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[integration] Error finishing integration stream: ${errMsg}\n`,
        );
      });
    };

    // Intercept errors to clear blocked integration state.
    const originalError = eventEmitter.error.bind(eventEmitter);
    eventEmitter.error = (
      sessionId: string | undefined,
      errorMessage: string,
      code?: string,
      details?: unknown,
    ) => {
      originalError(sessionId, errorMessage, code, details);
      if (sessionId) {
        this.router.onStreamError(sessionId, errorMessage).catch(() => {
          // Best-effort cleanup only.
        });
      }
    };

    const originalIntegrationMessageIn =
      eventEmitter.integrationMessageIn.bind(eventEmitter);
    eventEmitter.integrationMessageIn = (
      platform: string,
      sender: string,
      content: string,
    ) => {
      originalIntegrationMessageIn(platform, sender, content);
      void this.hooksEngine.notifyIntegrationEvent({
        eventType: 'incoming',
        platform,
        payload: { sender, content },
      });
    };

    const originalIntegrationMessageOut =
      eventEmitter.integrationMessageOut.bind(eventEmitter);
    eventEmitter.integrationMessageOut = (platform: string, chatId: string) => {
      originalIntegrationMessageOut(platform, chatId);
      void this.hooksEngine.notifyIntegrationEvent({
        eventType: 'outgoing',
        platform,
        payload: { chatId },
      });
    };
  }

  /** Connect a platform with given config */
  async connect(
    platform: PlatformType,
    config: Record<string, unknown> = {},
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
    const existingConfig = this.store.getConfig(platform)?.config || {};
    const normalizedConfig = this.normalizePlatformConfig(platform, {
      ...existingConfig,
      ...config,
    });
    const validationError = adapter.validateConfig(normalizedConfig);
    if (validationError) {
      throw new Error(validationError);
    }

    // Wire adapter status events to integration event emitter
    adapter.on('status', (status: PlatformStatus) => {
      eventEmitter.integrationStatus(status);
      void this.hooksEngine.notifyIntegrationEvent({
        eventType: 'status',
        platform: status.platform,
        payload: {
          connected: status.connected,
          displayName: status.displayName,
          error: status.error,
        },
      });
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
      await adapter.connect(normalizedConfig);
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
      config: normalizedConfig,
    });
    } finally {
      this.platformOpInFlight.delete(platform);
    }
  }

  /** Persist and apply runtime configuration for a platform */
  async configure(
    platform: PlatformType,
    config: Record<string, unknown> = {},
  ): Promise<void> {
    while (this.platformOpInFlight.has(platform)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.platformOpInFlight.add(platform);
    try {
      const existingConfig = this.store.getConfig(platform)?.config || {};
      const normalizedConfig = this.normalizePlatformConfig(platform, {
        ...existingConfig,
        ...config,
      });
      const existingAdapter = this.adapters.get(platform);
      if (existingAdapter) {
        const validationError = existingAdapter.validateConfig(normalizedConfig);
        if (validationError) {
          throw new Error(validationError);
        }
      }

      await this.store.setConfig(platform, {
        platform,
        enabled: true,
        config: normalizedConfig,
      });

      const adapter = this.adapters.get(platform);
      if (adapter) {
        await adapter.updateConfig(normalizedConfig);
        eventEmitter.integrationStatus(adapter.getStatus());
      }
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
    return SUPPORTED_INTEGRATION_PLATFORMS.map((p) => {
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
    await this.hooksEngine.notifyIntegrationEvent({
      eventType: 'outgoing',
      platform,
      payload: {
        chatId: targetChat,
        message,
      },
    });
  }

  async listCatalog(workingDirectory?: string): Promise<IntegrationChannelManifest[]> {
    return integrationCatalogService.listCatalog(workingDirectory);
  }

  async listPlugins(workingDirectory?: string): Promise<IntegrationPluginManifest[]> {
    return integrationCatalogService.listPlugins(workingDirectory);
  }

  async installPlugin(plugin: IntegrationPluginManifest): Promise<void> {
    await integrationCatalogService.installPlugin(plugin);
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    await integrationCatalogService.uninstallPlugin(pluginId);
  }

  getChannelCapabilities(channel: string): IntegrationCapabilityMatrix | null {
    const platform = channel.trim().toLowerCase() as PlatformType;
    const adapter = this.adapters.get(platform);
    if (!adapter) return null;
    return adapter.getCapabilities();
  }

  async callAction(
    request: IntegrationActionRequest,
  ): Promise<IntegrationActionResult> {
    const result = await this.actionRouter.route(request);
    if (result.success) {
      const channel = request.channel.trim().toLowerCase();
      if (channel) {
        await this.hooksEngine.notifyIntegrationEvent({
          eventType: 'outgoing',
          platform: channel,
          payload: {
            action: request.action,
            target: request.target,
          },
        });
      }
    }
    eventEmitter.integrationActionResult({
      channel: request.channel,
      action: request.action,
      success: result.success,
      unsupported: result.unsupported,
      reason: result.reason,
    });
    return result;
  }

  listHookRules(): IntegrationHookRule[] {
    return this.hooksEngine.listRules();
  }

  async createHookRule(input: CreateHookRuleInput): Promise<IntegrationHookRule> {
    const rule = await this.hooksEngine.createRule(input);
    eventEmitter.integrationHookStatus('rule_created', {
      ruleId: rule.id,
      name: rule.name,
    });
    return rule;
  }

  async updateHookRule(input: UpdateHookRuleInput): Promise<IntegrationHookRule> {
    const rule = await this.hooksEngine.updateRule(input);
    eventEmitter.integrationHookStatus('rule_updated', {
      ruleId: rule.id,
      name: rule.name,
    });
    return rule;
  }

  async deleteHookRule(ruleId: string): Promise<void> {
    await this.hooksEngine.deleteRule(ruleId);
    eventEmitter.integrationHookStatus('rule_deleted', { ruleId });
  }

  async runHookRuleNow(ruleId: string): Promise<IntegrationHookRun> {
    const run = await this.hooksEngine.runNow(ruleId);
    eventEmitter.integrationHookRun(run);
    return run;
  }

  listHookRuns(ruleId?: string): IntegrationHookRun[] {
    return this.hooksEngine.listRuns(ruleId);
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
      case 'discord':
        return new DiscordAdapter();
      case 'imessage':
        return new IMessageBlueBubblesAdapter();
      case 'teams':
        return new TeamsAdapter();
      case 'matrix':
        return new MatrixAdapter();
      case 'line':
        return new LineAdapter();
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /** Get config store (for IPC handlers) */
  getStore(): IntegrationStore {
    return this.store;
  }

  getSettings(): IntegrationGeneralSettings {
    return this.store.getSettings();
  }

  async updateSettings(settings: IntegrationGeneralSettings): Promise<void> {
    const normalized = this.normalizeIntegrationSettings(settings);
    await this.store.setSettings(normalized);
    this.router.setSharedSessionWorkingDirectory(
      normalized.sharedSessionWorkingDirectory,
    );

    const sessionId = this.router.getSessionId();
    if (!sessionId) {
      return;
    }

    if (
      normalized.sharedSessionWorkingDirectory &&
      this.agentRunner &&
      typeof this.agentRunner.updateSessionWorkingDirectory === 'function'
    ) {
      try {
        await Promise.resolve(
          this.agentRunner.updateSessionWorkingDirectory(
            sessionId,
            normalized.sharedSessionWorkingDirectory,
          ),
        );
        eventEmitter.sessionUpdated({
          id: sessionId,
          workingDirectory: normalized.sharedSessionWorkingDirectory,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[integration] Failed to apply shared session working directory: ${message}\n`,
        );
      }
    }
  }

  private normalizePlatformConfig(
    platform: PlatformType,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    if (platform === 'whatsapp') {
      const allowFromRaw = Array.isArray(config.allowFrom) ? config.allowFrom : [];
      const allowFromSet = new Set<string>();
      for (const value of allowFromRaw) {
        const normalized = this.normalizeE164Like(value);
        if (normalized) {
          allowFromSet.add(normalized);
        }
      }

      const denialMessage =
        typeof config.denialMessage === 'string' && config.denialMessage.trim()
          ? config.denialMessage.trim().slice(0, 280)
          : DEFAULT_WHATSAPP_DENIAL_MESSAGE;

      return {
        ...config,
        senderPolicy: 'allowlist',
        allowFrom: Array.from(allowFromSet),
        denialMessage,
      };
    }

    if (platform === 'discord') {
      const allowedGuildIds = Array.isArray(config.allowedGuildIds)
        ? config.allowedGuildIds.map((id) => String(id).trim()).filter(Boolean)
        : [];
      const allowedChannelIds = Array.isArray(config.allowedChannelIds)
        ? config.allowedChannelIds.map((id) => String(id).trim()).filter(Boolean)
        : [];

      return {
        ...config,
        botToken: typeof config.botToken === 'string' ? config.botToken.trim() : '',
        allowedGuildIds,
        allowedChannelIds,
        allowDirectMessages: config.allowDirectMessages !== false,
      };
    }

    if (platform === 'imessage') {
      const allowHandles = Array.isArray(config.allowHandles)
        ? config.allowHandles.map((entry) => String(entry).trim()).filter(Boolean)
        : [];
      const pollIntervalSeconds =
        typeof config.pollIntervalSeconds === 'number'
          ? Math.max(5, Math.min(300, Math.floor(config.pollIntervalSeconds)))
          : 20;

      return {
        ...config,
        serverUrl:
          typeof config.serverUrl === 'string'
            ? config.serverUrl.trim().replace(/\/$/, '')
            : '',
        accessToken: typeof config.accessToken === 'string' ? config.accessToken.trim() : '',
        defaultChatGuid:
          typeof config.defaultChatGuid === 'string' ? config.defaultChatGuid.trim() : '',
        allowHandles,
        pollIntervalSeconds,
      };
    }

    if (platform === 'teams') {
      const pollIntervalSeconds =
        typeof config.pollIntervalSeconds === 'number'
          ? Math.max(10, Math.min(300, Math.floor(config.pollIntervalSeconds)))
          : 30;

      return {
        ...config,
        tenantId: typeof config.tenantId === 'string' ? config.tenantId.trim() : '',
        clientId: typeof config.clientId === 'string' ? config.clientId.trim() : '',
        clientSecret:
          typeof config.clientSecret === 'string' ? config.clientSecret.trim() : '',
        teamId: typeof config.teamId === 'string' ? config.teamId.trim() : '',
        channelId: typeof config.channelId === 'string' ? config.channelId.trim() : '',
        pollIntervalSeconds,
      };
    }

    if (platform === 'matrix') {
      return {
        ...config,
        homeserverUrl:
          typeof config.homeserverUrl === 'string'
            ? config.homeserverUrl.trim().replace(/\/$/, '')
            : '',
        accessToken:
          typeof config.accessToken === 'string'
            ? config.accessToken.trim()
            : '',
        defaultRoomId:
          typeof config.defaultRoomId === 'string'
            ? config.defaultRoomId.trim()
            : '',
      };
    }

    if (platform === 'line') {
      return {
        ...config,
        channelAccessToken:
          typeof config.channelAccessToken === 'string'
            ? config.channelAccessToken.trim()
            : '',
        defaultTargetId:
          typeof config.defaultTargetId === 'string'
            ? config.defaultTargetId.trim()
            : '',
      };
    }

    return config;
  }

  private normalizeE164Like(value: unknown): string | null {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    const digits = raw.replace(/\D+/g, '');
    if (!digits) {
      return null;
    }
    return `+${digits}`;
  }

  private normalizeIntegrationSettings(
    settings: IntegrationGeneralSettings,
  ): IntegrationGeneralSettings {
    const sharedSessionWorkingDirectory =
      typeof settings.sharedSessionWorkingDirectory === 'string'
        ? settings.sharedSessionWorkingDirectory.trim()
        : '';

    return sharedSessionWorkingDirectory
      ? { sharedSessionWorkingDirectory }
      : {};
  }
}

// Singleton instance
export const integrationBridge = new IntegrationBridgeService();
