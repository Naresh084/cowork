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

export type WhatsAppRecoveryMode = 'soft' | 'hard';

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
  isRecoveringWhatsapp: boolean;
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
  recoverWhatsApp: (mode?: WhatsAppRecoveryMode) => Promise<void>;
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
  isRecoveringWhatsapp: false,
};

const statusPollTimers: Partial<Record<PlatformType, ReturnType<typeof setInterval>>> = {};
const INTEGRATION_STORE_LOG_PREFIX = '[integration-store]';

function logIntegrationStoreInfo(message: string, context?: Record<string, unknown>): void {
  if (context) {
    console.info(`${INTEGRATION_STORE_LOG_PREFIX} ${message}`, context);
    return;
  }
  console.info(`${INTEGRATION_STORE_LOG_PREFIX} ${message}`);
}

function logIntegrationStoreWarn(message: string, context?: Record<string, unknown>): void {
  if (context) {
    console.warn(`${INTEGRATION_STORE_LOG_PREFIX} ${message}`, context);
    return;
  }
  console.warn(`${INTEGRATION_STORE_LOG_PREFIX} ${message}`);
}

function createAttemptId(platform: PlatformType): string {
  return `${platform}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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
      const attemptId = createAttemptId(platform);
      const startedAt = Date.now();
      logIntegrationStoreInfo('connect:start', {
        attemptId,
        platform,
        configKeys: Object.keys(config || {}).sort(),
      });
      if (get().isConnecting[platform]) {
        logIntegrationStoreInfo('connect:ignored-already-connecting', {
          attemptId,
          platform,
        });
        return;
      }

      clearStatusPolling(platform);
      logIntegrationStoreInfo('connect:cleared-existing-polling', {
        attemptId,
        platform,
      });

      // Clear previous error and mark as connecting
      set((state) => ({
        isConnecting: { ...state.isConnecting, [platform]: true },
        platforms: {
          ...state.platforms,
          [platform]: { ...state.platforms[platform], error: undefined },
        },
      }));

      try {
        logIntegrationStoreInfo('connect:invoke-backend', { attemptId, platform });
        const status = await invoke<PlatformStatus | null>('agent_integration_connect', {
          platform,
          config: config || {},
        });
        logIntegrationStoreInfo('connect:invoke-backend:resolved', {
          attemptId,
          platform,
          elapsedMs: Date.now() - startedAt,
          hasStatus: Boolean(status),
          connected: status?.connected ?? false,
          health: status?.health,
          error: status?.error,
        });
        if (status) {
          get().updatePlatformStatus(status);
        }
        await get().refreshStatuses();
        logIntegrationStoreInfo('connect:refresh-statuses:done', {
          attemptId,
          platform,
          elapsedMs: Date.now() - startedAt,
        });

        // For WhatsApp, QR code arrives via integration:qr event (handled in useAgentEvents).
        // Also do a delayed poll as a fallback in case the event was missed.
        if (platform === 'whatsapp') {
          let attempts = 0;
          statusPollTimers.whatsapp = setInterval(async () => {
            attempts += 1;
            try {
              await get().refreshStatuses();
              const current = get().platforms.whatsapp;
              if (attempts === 1 || attempts % 5 === 0 || current.connected) {
                logIntegrationStoreInfo('connect:whatsapp-poll', {
                  attemptId,
                  attempts,
                  connected: current.connected,
                  hasError: Boolean(current.error),
                  hasQR: Boolean(get().whatsappQR),
                });
              }
              if (current.connected || attempts >= 45) {
                clearStatusPolling('whatsapp');
                if (!current.connected) {
                  logIntegrationStoreWarn('connect:whatsapp-poll-timeout', {
                    attemptId,
                    attempts,
                    elapsedMs: Date.now() - startedAt,
                  });
                }
                return;
              }

              const result = await invoke<{ qrDataUrl: string | null }>('agent_integration_get_qr');
              if (result?.qrDataUrl && !get().whatsappQR) {
                logIntegrationStoreInfo('connect:whatsapp-poll:qr-fetched', {
                  attemptId,
                  attempts,
                  qrLength: result.qrDataUrl.length,
                });
                set({ whatsappQR: result.qrDataUrl });
              }
            } catch (pollError) {
              logIntegrationStoreWarn('connect:whatsapp-poll:error', {
                attemptId,
                attempts,
                error: pollError instanceof Error ? pollError.message : String(pollError),
              });
              // QR/status may still arrive via events.
            }
          }, 2000);
        } else {
          let attempts = 0;
          statusPollTimers[platform] = setInterval(async () => {
            attempts += 1;
            try {
              await get().refreshStatuses();
              const current = get().platforms[platform];
              if (attempts === 1 || attempts % 5 === 0 || current.connected) {
                logIntegrationStoreInfo('connect:poll', {
                  attemptId,
                  platform,
                  attempts,
                  connected: current.connected,
                  hasError: Boolean(current.error),
                });
              }
              if (current.connected || attempts >= 20) {
                clearStatusPolling(platform);
              }
            } catch (pollError) {
              logIntegrationStoreWarn('connect:poll:error', {
                attemptId,
                platform,
                attempts,
                error: pollError instanceof Error ? pollError.message : String(pollError),
              });
              // Ignore and keep polling briefly.
            }
          }, 1000);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logIntegrationStoreWarn('connect:error', {
          attemptId,
          platform,
          elapsedMs: Date.now() - startedAt,
          error: errorMessage,
        });
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
        logIntegrationStoreInfo('connect:finally', {
          attemptId,
          platform,
          elapsedMs: Date.now() - startedAt,
          clearConnecting: true,
        });
        set((state) => ({
          isConnecting: { ...state.isConnecting, [platform]: false },
        }));
      }
    },

    reconnect: async (platform) => {
      await get().connect(platform, {});
    },

    recoverWhatsApp: async (mode = 'soft') => {
      const startedAt = Date.now();
      const normalizedMode: WhatsAppRecoveryMode = mode === 'hard' ? 'hard' : 'soft';
      logIntegrationStoreInfo('recover-whatsapp:start', {
        mode: normalizedMode,
      });
      if (get().isRecoveringWhatsapp) {
        logIntegrationStoreInfo('recover-whatsapp:ignored-already-running', {
          mode: normalizedMode,
        });
        return;
      }

      set({ isRecoveringWhatsapp: true });
      try {
        const status = await invoke<PlatformStatus | null>('agent_integration_recover_whatsapp', {
          mode: normalizedMode,
        });
        logIntegrationStoreInfo('recover-whatsapp:invoke:resolved', {
          mode: normalizedMode,
          elapsedMs: Date.now() - startedAt,
          connected: status?.connected ?? false,
          health: status?.health,
          error: status?.error,
        });
        if (status) {
          get().updatePlatformStatus(status);
        }
        await get().refreshStatuses();
        if (normalizedMode === 'hard') {
          set({ whatsappQR: null });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logIntegrationStoreWarn('recover-whatsapp:error', {
          mode: normalizedMode,
          elapsedMs: Date.now() - startedAt,
          error: message,
        });
        set((state) => ({
          platforms: {
            ...state.platforms,
            whatsapp: {
              ...state.platforms.whatsapp,
              error: message,
            },
          },
        }));
        throw error;
      } finally {
        set({ isRecoveringWhatsapp: false });
        logIntegrationStoreInfo('recover-whatsapp:finally', {
          mode: normalizedMode,
          elapsedMs: Date.now() - startedAt,
        });
      }
    },

    disconnect: async (platform) => {
      logIntegrationStoreInfo('disconnect:start', { platform });
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
        logIntegrationStoreWarn('disconnect:error', {
          platform,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    refreshStatuses: async () => {
      try {
        const result = await invoke<unknown>('agent_integration_list_statuses');
        const statuses = normalizeStatusesResponse(result);
        logIntegrationStoreInfo('refresh-statuses:received', {
          count: statuses.length,
          connectedPlatforms: statuses
            .filter((status) => status.connected)
            .map((status) => status.platform),
        });

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
        logIntegrationStoreWarn('refresh-statuses:error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    updatePlatformStatus: (status) => {
      logIntegrationStoreInfo('status:update', {
        platform: status.platform,
        connected: status.connected,
        health: status.health,
        error: status.error,
        requiresReconnect: status.requiresReconnect,
      });
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
      logIntegrationStoreInfo('status:qr-update', {
        hasQR: Boolean(qr),
        qrLength: qr?.length ?? 0,
      });
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
