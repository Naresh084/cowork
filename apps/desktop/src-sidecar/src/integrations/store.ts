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

export interface IntegrationGeneralSettings {
  sharedSessionWorkingDirectory?: string;
}

export type IntegrationHookTriggerType =
  | 'cron'
  | 'webhook'
  | 'mailbox'
  | 'path'
  | 'integration_event'
  | 'manual';

export interface IntegrationHookRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: IntegrationHookTriggerType;
    config?: Record<string, unknown>;
  };
  action: {
    type: 'integration_action' | 'tool_call';
    config?: Record<string, unknown>;
  };
  createdAt: number;
  updatedAt: number;
}

export interface IntegrationHookRun {
  id: string;
  ruleId: string;
  status: 'success' | 'error';
  startedAt: number;
  finishedAt: number;
  error?: string;
  result?: unknown;
}

interface IntegrationHooksState {
  rules: Record<string, IntegrationHookRule>;
  runs: IntegrationHookRun[];
}

interface IntegrationStoreData {
  channels: Record<string, PlatformConfig>;
  lastSessionId?: string;
  settings: IntegrationGeneralSettings;
  hooks: IntegrationHooksState;
}

function normalizeE164Like(value: unknown): string | null {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

export class IntegrationStore {
  private data: IntegrationStoreData = {
    channels: {},
    settings: {},
    hooks: { rules: {}, runs: [] },
  };
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
      this.data = { channels: {}, settings: {}, hooks: { rules: {}, runs: [] } };
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
    const config = this.data.channels[platform];
    if (!config) return null;
    return {
      ...config,
      config: this.normalizePlatformConfig(platform, config.config),
    };
  }

  async setConfig(platform: PlatformType, config: PlatformConfig): Promise<void> {
    this.data.channels[platform] = {
      ...config,
      config: this.normalizePlatformConfig(platform, config.config),
    };
    await this.save();
  }

  async removeConfig(platform: PlatformType): Promise<void> {
    delete this.data.channels[platform];
    await this.save();
  }

  getEnabledPlatforms(): PlatformConfig[] {
    return Object.values(this.data.channels)
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

  listHookRules(): IntegrationHookRule[] {
    return Object.values(this.data.hooks.rules).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  getHookRule(ruleId: string): IntegrationHookRule | null {
    return this.data.hooks.rules[ruleId] || null;
  }

  async upsertHookRule(rule: IntegrationHookRule): Promise<void> {
    this.data.hooks.rules[rule.id] = rule;
    await this.save();
  }

  async deleteHookRule(ruleId: string): Promise<void> {
    delete this.data.hooks.rules[ruleId];
    await this.save();
  }

  listHookRuns(ruleId?: string): IntegrationHookRun[] {
    const runs = this.data.hooks.runs;
    if (!ruleId) return [...runs];
    return runs.filter((run) => run.ruleId === ruleId);
  }

  async addHookRun(run: IntegrationHookRun): Promise<void> {
    this.data.hooks.runs.unshift(run);
    if (this.data.hooks.runs.length > 500) {
      this.data.hooks.runs = this.data.hooks.runs.slice(0, 500);
    }
    await this.save();
  }

  private normalizeData(input: unknown): { data: IntegrationStoreData; changed: boolean } {
    if (!input || typeof input !== 'object') {
      return {
        data: { channels: {}, settings: {}, hooks: { rules: {}, runs: [] } },
        changed: true,
      };
    }

    const parsed = input as {
      channels?: Record<string, PlatformConfig>;
      platforms?: Record<string, PlatformConfig>;
      lastSessionId?: unknown;
      settings?: IntegrationGeneralSettings;
      hooks?: unknown;
    };

    const channels: Record<string, PlatformConfig> = {};
    const channelsSource =
      parsed.channels && typeof parsed.channels === 'object'
        ? parsed.channels
        : parsed.platforms && typeof parsed.platforms === 'object'
          ? parsed.platforms
          : {};

    const platformEntries = channelsSource && typeof channelsSource === 'object'
      ? Object.entries(channelsSource)
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
      channels[platform] = normalizedPlatformConfig;

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
    const hooks = this.normalizeHooks(parsed.hooks);

    if (
      JSON.stringify(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}) !==
      JSON.stringify(settings)
    ) {
      changed = true;
    }
    if (!parsed.channels || parsed.platforms) {
      changed = true;
    }

    return {
      data: {
        channels,
        settings,
        hooks,
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

    if (platform === 'matrix') {
      return {
        ...objectConfig,
        homeserverUrl:
          typeof objectConfig.homeserverUrl === 'string'
            ? objectConfig.homeserverUrl.trim().replace(/\/$/, '')
            : '',
        accessToken:
          typeof objectConfig.accessToken === 'string'
            ? objectConfig.accessToken.trim()
            : '',
        defaultRoomId:
          typeof objectConfig.defaultRoomId === 'string'
            ? objectConfig.defaultRoomId.trim()
            : '',
      };
    }

    if (platform === 'line') {
      return {
        ...objectConfig,
        channelAccessToken:
          typeof objectConfig.channelAccessToken === 'string'
            ? objectConfig.channelAccessToken.trim()
            : '',
        defaultTargetId:
          typeof objectConfig.defaultTargetId === 'string'
            ? objectConfig.defaultTargetId.trim()
            : '',
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

  private normalizeHooks(rawHooks: unknown): IntegrationHooksState {
    if (!rawHooks || typeof rawHooks !== 'object' || Array.isArray(rawHooks)) {
      return { rules: {}, runs: [] };
    }

    const hooks = rawHooks as { rules?: unknown; runs?: unknown };
    const rawRules =
      hooks.rules && typeof hooks.rules === 'object' && !Array.isArray(hooks.rules)
        ? (hooks.rules as Record<string, unknown>)
        : {};
    const rawRuns = Array.isArray(hooks.runs) ? hooks.runs : [];

    const rules: Record<string, IntegrationHookRule> = {};
    for (const [key, value] of Object.entries(rawRules)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const rule = value as Record<string, unknown>;
      const id = typeof rule.id === 'string' && rule.id.trim() ? rule.id.trim() : key;
      const name = typeof rule.name === 'string' ? rule.name.trim() : '';
      const trigger =
        rule.trigger && typeof rule.trigger === 'object' && !Array.isArray(rule.trigger)
          ? (rule.trigger as Record<string, unknown>)
          : {};
      const action =
        rule.action && typeof rule.action === 'object' && !Array.isArray(rule.action)
          ? (rule.action as Record<string, unknown>)
          : {};
      if (!id || !name || typeof trigger.type !== 'string' || typeof action.type !== 'string') {
        continue;
      }

      rules[id] = {
        id,
        name,
        enabled: rule.enabled !== false,
        trigger: {
          type: trigger.type as IntegrationHookTriggerType,
          config:
            trigger.config && typeof trigger.config === 'object' && !Array.isArray(trigger.config)
              ? (trigger.config as Record<string, unknown>)
              : undefined,
        },
        action: {
          type: action.type === 'tool_call' ? 'tool_call' : 'integration_action',
          config:
            action.config && typeof action.config === 'object' && !Array.isArray(action.config)
              ? (action.config as Record<string, unknown>)
              : undefined,
        },
        createdAt:
          typeof rule.createdAt === 'number' && Number.isFinite(rule.createdAt)
            ? rule.createdAt
            : Date.now(),
        updatedAt:
          typeof rule.updatedAt === 'number' && Number.isFinite(rule.updatedAt)
            ? rule.updatedAt
            : Date.now(),
      };
    }

    const runs: IntegrationHookRun[] = [];
    for (const entry of rawRuns) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const run = entry as Record<string, unknown>;
      if (
        typeof run.id !== 'string' ||
        typeof run.ruleId !== 'string' ||
        typeof run.startedAt !== 'number' ||
        typeof run.finishedAt !== 'number'
      ) {
        continue;
      }
      runs.push({
        id: run.id,
        ruleId: run.ruleId,
        status: run.status === 'success' ? 'success' : 'error',
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        error: typeof run.error === 'string' ? run.error : undefined,
        result: run.result,
      });
    }

    return { rules, runs };
  }
}
