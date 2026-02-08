import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  SUPPORTED_PLATFORM_TYPES,
  type PlatformType,
  type PlatformConfig,
} from '@gemini-cowork/shared';
import { DEFAULT_WHATSAPP_DENIAL_MESSAGE } from './types.js';

const CONFIG_DIR = join(homedir(), '.cowork', 'integrations');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const WILDCARD_ALLOW_ALL = '*';

export interface IntegrationGeneralSettings {
  sharedSessionWorkingDirectory?: string;
}

interface IntegrationStoreData {
  platforms: Record<string, PlatformConfig>;
  lastSessionId?: string;
  settings: IntegrationGeneralSettings;
}

function normalizeE164Like(value: unknown): string | null {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

export class IntegrationStore {
  private data: IntegrationStoreData = { platforms: {}, settings: {} };
  private savePromise: Promise<void> | null = null;
  private pendingSave = false;

  async load(): Promise<void> {
    try {
      if (existsSync(CONFIG_FILE)) {
        const raw = await readFile(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const { data, changed } = this.normalizeData(parsed);
        this.data = data;
        if (changed) {
          await this.doSave();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[integration-store] Failed to load config: ${msg}\n`);
      this.data = { platforms: {}, settings: {} };
    }
  }

  /** Serialized save - prevents concurrent writes from corrupting the file */
  private async save(): Promise<void> {
    if (this.savePromise) {
      // Another save is in progress - mark pending and return
      this.pendingSave = true;
      return;
    }

    this.savePromise = this.doSave();
    try {
      await this.savePromise;
    } finally {
      this.savePromise = null;
    }

    // If a save was requested while we were writing, do it now
    if (this.pendingSave) {
      this.pendingSave = false;
      await this.save();
    }
  }

  private async doSave(): Promise<void> {
    try {
      if (!existsSync(CONFIG_DIR)) {
        await mkdir(CONFIG_DIR, { recursive: true });
      }
      await writeFile(CONFIG_FILE, JSON.stringify(this.data, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[integration-store] Failed to save config: ${msg}\n`);
    }
  }

  getConfig(platform: PlatformType): PlatformConfig | null {
    const config = this.data.platforms[platform];
    if (!config) return null;
    return {
      ...config,
      config: this.normalizePlatformConfig(platform, config.config),
    };
  }

  async setConfig(platform: PlatformType, config: PlatformConfig): Promise<void> {
    this.data.platforms[platform] = {
      ...config,
      config: this.normalizePlatformConfig(platform, config.config),
    };
    await this.save();
  }

  async removeConfig(platform: PlatformType): Promise<void> {
    delete this.data.platforms[platform];
    await this.save();
  }

  getEnabledPlatforms(): PlatformConfig[] {
    return Object.values(this.data.platforms)
      .filter((p) => p.enabled)
      .map((p) => ({
        ...p,
        config: this.normalizePlatformConfig(p.platform, p.config),
      }));
  }

  getLastSessionId(): string | undefined {
    return this.data.lastSessionId;
  }

  async setLastSessionId(sessionId: string): Promise<void> {
    this.data.lastSessionId = sessionId;
    await this.save();
  }

  getSettings(): IntegrationGeneralSettings {
    return {
      ...this.data.settings,
    };
  }

  async setSettings(settings: IntegrationGeneralSettings): Promise<void> {
    this.data.settings = this.normalizeSettings(settings);
    await this.save();
  }

  private normalizeData(input: unknown): { data: IntegrationStoreData; changed: boolean } {
    if (!input || typeof input !== 'object') {
      return { data: { platforms: {}, settings: {} }, changed: true };
    }

    const parsed = input as {
      platforms?: Record<string, PlatformConfig>;
      lastSessionId?: unknown;
      settings?: IntegrationGeneralSettings;
    };

    const platforms: Record<string, PlatformConfig> = {};
    const platformEntries = parsed.platforms && typeof parsed.platforms === 'object'
      ? Object.entries(parsed.platforms)
      : [];

    let changed = false;
    for (const [platformKey, value] of platformEntries) {
      if (!SUPPORTED_PLATFORM_TYPES.includes(platformKey as PlatformType)) {
        changed = true;
        continue;
      }
      const platform = platformKey as PlatformType;
      if (!value || typeof value !== 'object') {
        changed = true;
        continue;
      }

      const normalizedConfig = this.normalizePlatformConfig(platform, value.config);
      const normalizedPlatformConfig: PlatformConfig = {
        platform,
        enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
        config: normalizedConfig,
      };
      platforms[platform] = normalizedPlatformConfig;

      const sourceConfig = value.config && typeof value.config === 'object' ? value.config : {};
      if (
        value.platform !== platform ||
        typeof value.enabled !== 'boolean' ||
        JSON.stringify(sourceConfig) !== JSON.stringify(normalizedConfig)
      ) {
        changed = true;
      }
    }

    const lastSessionId =
      typeof parsed.lastSessionId === 'string' ? parsed.lastSessionId : undefined;
    const settings = this.normalizeSettings(parsed.settings);

    if (
      JSON.stringify(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}) !==
      JSON.stringify(settings)
    ) {
      changed = true;
    }

    return {
      data: {
        platforms,
        settings,
        ...(lastSessionId ? { lastSessionId } : {}),
      },
      changed,
    };
  }

  private normalizePlatformConfig(
    platform: PlatformType,
    config: unknown,
  ): Record<string, unknown> {
    const objectConfig =
      config && typeof config === 'object' && !Array.isArray(config)
        ? { ...(config as Record<string, unknown>) }
        : {};

    if (platform === 'discord') {
      return {
        ...objectConfig,
        botToken:
          typeof objectConfig.botToken === 'string'
            ? objectConfig.botToken.trim()
            : '',
        allowedGuildIds: Array.isArray(objectConfig.allowedGuildIds)
          ? objectConfig.allowedGuildIds.map((id) => String(id).trim()).filter(Boolean)
          : [],
        allowedChannelIds: Array.isArray(objectConfig.allowedChannelIds)
          ? objectConfig.allowedChannelIds.map((id) => String(id).trim()).filter(Boolean)
          : [],
        allowDirectMessages: objectConfig.allowDirectMessages !== false,
      };
    }

    if (platform === 'imessage') {
      const pollIntervalSeconds =
        typeof objectConfig.pollIntervalSeconds === 'number'
          ? Math.max(5, Math.min(300, Math.floor(objectConfig.pollIntervalSeconds)))
          : 20;

      return {
        ...objectConfig,
        serverUrl:
          typeof objectConfig.serverUrl === 'string'
            ? objectConfig.serverUrl.trim().replace(/\/$/, '')
            : '',
        accessToken:
          typeof objectConfig.accessToken === 'string'
            ? objectConfig.accessToken.trim()
            : '',
        defaultChatGuid:
          typeof objectConfig.defaultChatGuid === 'string'
            ? objectConfig.defaultChatGuid.trim()
            : '',
        allowHandles: Array.isArray(objectConfig.allowHandles)
          ? objectConfig.allowHandles.map((entry) => String(entry).trim()).filter(Boolean)
          : [],
        pollIntervalSeconds,
      };
    }

    if (platform === 'teams') {
      const pollIntervalSeconds =
        typeof objectConfig.pollIntervalSeconds === 'number'
          ? Math.max(10, Math.min(300, Math.floor(objectConfig.pollIntervalSeconds)))
          : 30;
      return {
        ...objectConfig,
        tenantId:
          typeof objectConfig.tenantId === 'string'
            ? objectConfig.tenantId.trim()
            : '',
        clientId:
          typeof objectConfig.clientId === 'string'
            ? objectConfig.clientId.trim()
            : '',
        clientSecret:
          typeof objectConfig.clientSecret === 'string'
            ? objectConfig.clientSecret.trim()
            : '',
        teamId:
          typeof objectConfig.teamId === 'string'
            ? objectConfig.teamId.trim()
            : '',
        channelId:
          typeof objectConfig.channelId === 'string'
            ? objectConfig.channelId.trim()
            : '',
        pollIntervalSeconds,
      };
    }

    if (platform !== 'whatsapp') {
      return objectConfig;
    }

    const allowFromRaw = Array.isArray(objectConfig.allowFrom)
      ? objectConfig.allowFrom
      : [];
    const allowFromSet = new Set<string>();
    for (const value of allowFromRaw) {
      const entry = String(value ?? '').trim();
      if (!entry) {
        continue;
      }
      if (entry === WILDCARD_ALLOW_ALL || entry.toLowerCase() === 'all') {
        allowFromSet.add(WILDCARD_ALLOW_ALL);
        continue;
      }
      const normalized = normalizeE164Like(value);
      if (normalized) {
        allowFromSet.add(normalized);
      }
    }

    const denialMessage =
      typeof objectConfig.denialMessage === 'string' &&
      objectConfig.denialMessage.trim()
        ? objectConfig.denialMessage.trim().slice(0, 280)
        : DEFAULT_WHATSAPP_DENIAL_MESSAGE;

    return {
      ...objectConfig,
      senderPolicy: 'allowlist',
      allowFrom: Array.from(allowFromSet),
      denialMessage,
    };
  }

  private normalizeSettings(settings: unknown): IntegrationGeneralSettings {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return {};
    }

    const raw = settings as { sharedSessionWorkingDirectory?: unknown };
    const sharedSessionWorkingDirectory =
      typeof raw.sharedSessionWorkingDirectory === 'string'
        ? raw.sharedSessionWorkingDirectory.trim()
        : '';

    return sharedSessionWorkingDirectory
      ? { sharedSessionWorkingDirectory }
      : {};
  }
}
