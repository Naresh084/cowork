import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

type PlatformType = 'whatsapp' | 'slack' | 'telegram';

interface PlatformStatus {
  platform: PlatformType;
  connected: boolean;
  displayName?: string;
  error?: string;
  connectedAt?: number;
  lastMessageAt?: number;
}

interface IntegrationState {
  platforms: Record<PlatformType, PlatformStatus>;
  whatsappQR: string | null;
  isConnecting: Record<PlatformType, boolean>;
}

interface IntegrationActions {
  connect: (platform: PlatformType, config?: Record<string, string>) => Promise<void>;
  disconnect: (platform: PlatformType) => Promise<void>;
  refreshStatuses: () => Promise<void>;
  updatePlatformStatus: (status: PlatformStatus) => void;
  setQRCode: (qr: string | null) => void;
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

const initialState: IntegrationState = {
  platforms: {
    whatsapp: defaultPlatformStatus('whatsapp'),
    slack: defaultPlatformStatus('slack'),
    telegram: defaultPlatformStatus('telegram'),
  },
  whatsappQR: null,
  isConnecting: {
    whatsapp: false,
    slack: false,
    telegram: false,
  },
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
