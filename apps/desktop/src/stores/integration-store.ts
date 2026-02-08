import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  SUPPORTED_PLATFORM_TYPES,
  type PlatformType,
  type PlatformStatus as SharedPlatformStatus,
} from '@gemini-cowork/shared';

// ============================================================================
// Types
// ============================================================================

type PlatformStatus = SharedPlatformStatus;

export interface WhatsAppSenderControlConfig {
  senderPolicy: 'allowlist';
  allowFrom: string[];
  denialMessage: string;
}

export interface IntegrationGeneralSettings {
  sharedSessionWorkingDirectory: string;
}

export const DEFAULT_WHATSAPP_DENIAL_MESSAGE =
  'This Cowork bot is private. You are not authorized to chat with it.';
export const ALLOW_ALL_SENDERS_WILDCARD = '*';

interface IntegrationState {
  platforms: Record<PlatformType, PlatformStatus>;
  whatsappQR: string | null;
  isConnecting: Record<PlatformType, boolean>;
  whatsappConfig: WhatsAppSenderControlConfig;
  integrationSettings: IntegrationGeneralSettings;
  isConfigLoading: boolean;
  isConfigSaving: boolean;
  configError: string | null;
  isIntegrationSettingsLoading: boolean;
  isIntegrationSettingsSaving: boolean;
  integrationSettingsError: string | null;
}

interface IntegrationActions {
  connect: (platform: PlatformType, config?: Record<string, unknown>) => Promise<void>;
  reconnect: (platform: PlatformType) => Promise<void>;
  disconnect: (platform: PlatformType) => Promise<void>;
  refreshStatuses: () => Promise<void>;
  updatePlatformStatus: (status: PlatformStatus) => void;
  setQRCode: (qr: string | null) => void;
  loadConfig: (platform: PlatformType) => Promise<void>;
  saveConfig: (platform: PlatformType, config: Record<string, unknown>) => Promise<void>;
  loadIntegrationSettings: () => Promise<void>;
  saveIntegrationSettings: (settings: IntegrationGeneralSettings) => Promise<void>;
  sendTestMessage: (platform: PlatformType, message?: string) => Promise<void>;
  getConnectedPlatforms: () => PlatformType[];
}

// ============================================================================
// Initial State
// ============================================================================

const defaultPlatformStatus = (platform: PlatformType): PlatformStatus => ({
  platform,
  connected: false,
});

function createPlatformRecord<T>(
  factory: (platform: PlatformType) => T,
): Record<PlatformType, T> {
  const output = {} as Record<PlatformType, T>;
  for (const platform of SUPPORTED_PLATFORM_TYPES) {
    output[platform] = factory(platform);
  }
  return output;
}

const initialState: IntegrationState = {
  platforms: createPlatformRecord((platform) => defaultPlatformStatus(platform)),
  whatsappQR: null,
  isConnecting: createPlatformRecord(() => false),
  whatsappConfig: {
    senderPolicy: 'allowlist',
    allowFrom: [],
    denialMessage: DEFAULT_WHATSAPP_DENIAL_MESSAGE,
  },
  integrationSettings: {
    sharedSessionWorkingDirectory: '',
  },
  isConfigLoading: false,
  isConfigSaving: false,
  configError: null,
  isIntegrationSettingsLoading: false,
  isIntegrationSettingsSaving: false,
  integrationSettingsError: null,
};

const statusPollTimers: Partial<Record<PlatformType, ReturnType<typeof setInterval>>> = {};

function clearStatusPolling(platform: PlatformType): void {
  const timer = statusPollTimers[platform];
  if (timer) {
    clearInterval(timer);
    delete statusPollTimers[platform];
  }
}

function normalizeStatusesResponse(result: unknown): PlatformStatus[] {
  if (Array.isArray(result)) {
    return result as PlatformStatus[];
  }

  if (result && typeof result === 'object' && Array.isArray((result as { statuses?: unknown }).statuses)) {
    return (result as { statuses: PlatformStatus[] }).statuses;
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizePhoneToE164Like(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === ALLOW_ALL_SENDERS_WILDCARD || trimmed.toLowerCase() === 'all') {
    return ALLOW_ALL_SENDERS_WILDCARD;
  }
  const digits = trimmed.replace(/\D+/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

function normalizeAndValidateAllowFrom(values: unknown): {
  normalized: string[];
  invalid: string[];
} {
  if (!Array.isArray(values)) {
    return { normalized: [], invalid: [] };
  }

  const normalizedSet = new Set<string>();
  const invalid: string[] = [];
  for (const raw of values) {
    const str = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    if (!str) continue;
    const normalized = normalizePhoneToE164Like(str);
    if (!normalized) {
      invalid.push(str);
      continue;
    }
    if (normalized === ALLOW_ALL_SENDERS_WILDCARD) {
      normalizedSet.clear();
      normalizedSet.add(ALLOW_ALL_SENDERS_WILDCARD);
      continue;
    }
    if (normalizedSet.has(ALLOW_ALL_SENDERS_WILDCARD)) {
      continue;
    }
    normalizedSet.add(normalized);
  }

  return { normalized: Array.from(normalizedSet), invalid };
}

function normalizeWhatsAppConfig(rawConfig: unknown): WhatsAppSenderControlConfig {
  const config = isRecord(rawConfig) ? rawConfig : {};
  const allowFromResult = normalizeAndValidateAllowFrom(config.allowFrom);
  const denialMessage =
    typeof config.denialMessage === 'string' && config.denialMessage.trim()
      ? config.denialMessage.trim().slice(0, 280)
      : DEFAULT_WHATSAPP_DENIAL_MESSAGE;

  return {
    senderPolicy: 'allowlist',
    allowFrom: allowFromResult.normalized,
    denialMessage,
  };
}

function normalizeIntegrationSettings(rawSettings: unknown): IntegrationGeneralSettings {
  const settings = isRecord(rawSettings) ? rawSettings : {};
  const sharedSessionWorkingDirectory =
    typeof settings.sharedSessionWorkingDirectory === 'string'
      ? settings.sharedSessionWorkingDirectory.trim()
      : '';

  return {
    sharedSessionWorkingDirectory,
  };
}

// ============================================================================
// Store
// ============================================================================

export const useIntegrationStore = create<IntegrationState & IntegrationActions>()(
  (set, get) => ({
    ...initialState,

    connect: async (platform, config) => {
      if (get().isConnecting[platform]) {
        return;
      }

      clearStatusPolling(platform);

      // Clear previous error and mark as connecting
      set((state) => ({
        isConnecting: { ...state.isConnecting, [platform]: true },
        platforms: {
          ...state.platforms,
          [platform]: { ...state.platforms[platform], error: undefined },
        },
      }));

      try {
        const status = await invoke<PlatformStatus | null>('agent_integration_connect', {
          platform,
          config: config || {},
        });
        if (status) {
          get().updatePlatformStatus(status);
        }
        await get().refreshStatuses();

        // For WhatsApp, QR code arrives via integration:qr event (handled in useAgentEvents).
        // Also do a delayed poll as a fallback in case the event was missed.
        if (platform === 'whatsapp') {
          let attempts = 0;
          statusPollTimers.whatsapp = setInterval(async () => {
            attempts += 1;
            try {
              await get().refreshStatuses();
              const current = get().platforms.whatsapp;
              if (current.connected || attempts >= 45) {
                clearStatusPolling('whatsapp');
                if (!current.connected) {
                  set((state) => ({
                    isConnecting: { ...state.isConnecting, whatsapp: false },
                  }));
                }
                return;
              }

              const result = await invoke<{ qrDataUrl: string | null }>('agent_integration_get_qr');
              if (result?.qrDataUrl && !get().whatsappQR) {
                set({ whatsappQR: result.qrDataUrl });
              }
            } catch {
              // QR/status may still arrive via events
            }
          }, 2000);
        } else {
          let attempts = 0;
          statusPollTimers[platform] = setInterval(async () => {
            attempts += 1;
            try {
              await get().refreshStatuses();
              const current = get().platforms[platform];
              if (current.connected || attempts >= 20) {
                clearStatusPolling(platform);
              }
            } catch {
              // ignore and keep polling briefly
            }
          }, 1000);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set((state) => ({
          platforms: {
            ...state.platforms,
            [platform]: {
              ...state.platforms[platform],
              error: errorMessage,
            },
          },
          isConnecting: { ...state.isConnecting, [platform]: false },
        }));
      } finally {
        if (platform !== 'whatsapp') {
          set((state) => ({
            isConnecting: { ...state.isConnecting, [platform]: false },
          }));
        }
      }
    },

    reconnect: async (platform) => {
      await get().connect(platform, {});
    },

    disconnect: async (platform) => {
      clearStatusPolling(platform);
      try {
        await invoke('agent_integration_disconnect', { platform });

        set((state) => ({
          platforms: {
            ...state.platforms,
            [platform]: {
              platform,
              connected: false,
            },
          },
          ...(platform === 'whatsapp' ? { whatsappQR: null } : {}),
        }));
      } catch (error) {
        console.warn(`Failed to disconnect ${platform}:`, error);
      }
    },

    refreshStatuses: async () => {
      try {
        const result = await invoke<unknown>('agent_integration_list_statuses');
        const statuses = normalizeStatusesResponse(result);

        set((state) => {
          const updated = { ...state.platforms };
          for (const status of statuses) {
            if (status.platform in updated) {
              updated[status.platform] = {
                ...updated[status.platform],
                ...status,
              };
              if (status.connected) {
                clearStatusPolling(status.platform);
              }
            }
          }
          return {
            platforms: updated,
            whatsappQR: updated.whatsapp.connected ? null : state.whatsappQR,
          };
        });
      } catch (error) {
        console.warn('Failed to refresh integration statuses:', error);
      }
    },

    updatePlatformStatus: (status) => {
      if (status.connected || status.error) {
        clearStatusPolling(status.platform);
      }
      set((state) => ({
        platforms: {
          ...state.platforms,
          [status.platform]: {
            ...state.platforms[status.platform],
            ...status,
          },
        },
        isConnecting: {
          ...state.isConnecting,
          [status.platform]:
            status.connected || !!status.error
              ? false
              : state.isConnecting[status.platform],
        },
        whatsappQR:
          status.platform === 'whatsapp' && status.connected ? null : state.whatsappQR,
      }));
    },

    setQRCode: (qr) => {
      set((state) => ({
        whatsappQR: qr,
        isConnecting: { ...state.isConnecting, whatsapp: qr ? false : state.isConnecting.whatsapp },
      }));
    },

    loadConfig: async (platform) => {
      if (platform !== 'whatsapp') {
        return;
      }

      set({ isConfigLoading: true, configError: null });
      try {
        const result = await invoke<unknown>('agent_integration_get_config', { platform });

        const configPayload = isRecord(result)
          ? (isRecord(result.config) ? result.config : result)
          : {};

        const normalizedConfig = normalizeWhatsAppConfig(configPayload);
        set({
          whatsappConfig: normalizedConfig,
          isConfigLoading: false,
          configError: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({
          isConfigLoading: false,
          configError: message,
        });
      }
    },

    saveConfig: async (platform, config) => {
      if (platform !== 'whatsapp') {
        await invoke('agent_integration_configure', { platform, config });
        return;
      }

      set({ isConfigSaving: true, configError: null });
      try {
        const payload = isRecord(config) ? config : {};
        const allowFromResult = normalizeAndValidateAllowFrom(payload.allowFrom);
        if (allowFromResult.invalid.length > 0) {
          throw new Error(
            `Invalid phone number format: ${allowFromResult.invalid.join(', ')}`
          );
        }
        if (allowFromResult.normalized.length === 0) {
          throw new Error('Allowlist cannot be empty.');
        }

        const denialRaw =
          typeof payload.denialMessage === 'string'
            ? payload.denialMessage.trim()
            : DEFAULT_WHATSAPP_DENIAL_MESSAGE;
        if (denialRaw.length > 280) {
          throw new Error('Denial message must be 280 characters or less.');
        }

        const normalizedConfig: WhatsAppSenderControlConfig = {
          senderPolicy: 'allowlist',
          allowFrom: allowFromResult.normalized,
          denialMessage: denialRaw || DEFAULT_WHATSAPP_DENIAL_MESSAGE,
        };

        await invoke('agent_integration_configure', {
          platform,
          config: normalizedConfig,
        });

        set({
          whatsappConfig: normalizedConfig,
          isConfigSaving: false,
          configError: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({
          isConfigSaving: false,
          configError: message,
        });
        throw error;
      }
    },

    loadIntegrationSettings: async () => {
      set({
        isIntegrationSettingsLoading: true,
        integrationSettingsError: null,
      });

      try {
        const result = await invoke<unknown>('agent_integration_get_settings');
        const normalizedSettings = normalizeIntegrationSettings(result);
        set({
          integrationSettings: normalizedSettings,
          isIntegrationSettingsLoading: false,
          integrationSettingsError: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({
          isIntegrationSettingsLoading: false,
          integrationSettingsError: message,
        });
      }
    },

    saveIntegrationSettings: async (settings) => {
      set({
        isIntegrationSettingsSaving: true,
        integrationSettingsError: null,
      });

      try {
        const normalizedSettings = normalizeIntegrationSettings(settings);
        await invoke('agent_integration_update_settings', {
          settings: normalizedSettings,
        });

        set({
          integrationSettings: normalizedSettings,
          isIntegrationSettingsSaving: false,
          integrationSettingsError: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({
          isIntegrationSettingsSaving: false,
          integrationSettingsError: message,
        });
        throw error;
      }
    },

    sendTestMessage: async (platform, message) => {
      try {
        await invoke('agent_integration_send_test', { platform, message: message || 'Hello from Cowork!' });
      } catch (error) {
        console.warn(`Failed to send test message on ${platform}:`, error);
      }
    },

    getConnectedPlatforms: () => {
      const { platforms } = get();
      return (Object.keys(platforms) as PlatformType[]).filter(
        (p) => platforms[p].connected
      );
    },
  })
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const usePlatforms = () => useIntegrationStore((state) => state.platforms);
export const useWhatsappQR = () => useIntegrationStore((state) => state.whatsappQR);
export const useIsConnecting = () => useIntegrationStore((state) => state.isConnecting);
