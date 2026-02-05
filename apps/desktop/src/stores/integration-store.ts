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

// ============================================================================
// Store
// ============================================================================

export const useIntegrationStore = create<IntegrationState & IntegrationActions>()(
  (set, get) => ({
    ...initialState,

    connect: async (platform, config) => {
      // Clear previous error and mark as connecting
      set((state) => ({
        isConnecting: { ...state.isConnecting, [platform]: true },
        platforms: {
          ...state.platforms,
          [platform]: { ...state.platforms[platform], error: undefined },
        },
      }));

      try {
        await invoke('agent_integration_connect', { platform, config: config || {} });

        // For WhatsApp, QR code arrives via integration:qr event (handled in useAgentEvents).
        // Also do a delayed poll as a fallback in case the event was missed.
        if (platform === 'whatsapp') {
          setTimeout(async () => {
            try {
              const result = await invoke<{ qrDataUrl: string | null }>('agent_integration_get_qr');
              if (result?.qrDataUrl) {
                set({ whatsappQR: result.qrDataUrl });
              }
            } catch {
              // QR will arrive via event, this is just a fallback
            }
          }, 2000);
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
        }));
      } finally {
        set((state) => ({
          isConnecting: { ...state.isConnecting, [platform]: false },
        }));
      }
    },

    disconnect: async (platform) => {
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
        const result = await invoke<{ statuses: PlatformStatus[] }>('agent_integration_list_statuses');

        set((state) => {
          const updated = { ...state.platforms };
          for (const status of result.statuses) {
            if (status.platform in updated) {
              updated[status.platform] = status;
            }
          }
          return { platforms: updated };
        });
      } catch (error) {
        console.warn('Failed to refresh integration statuses:', error);
      }
    },

    updatePlatformStatus: (status) => {
      set((state) => ({
        platforms: {
          ...state.platforms,
          [status.platform]: status,
        },
      }));
    },

    setQRCode: (qr) => {
      set({ whatsappQR: qr });
    },

    sendTestMessage: async (platform, message) => {
      try {
        await invoke('agent_integration_send_test', { platform, message: message || 'Hello from Gemini Cowork!' });
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
