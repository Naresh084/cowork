import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '@/components/ui/Toast';

export type RemoteTunnelMode = 'tailscale' | 'cloudflare' | 'custom';
export type RemoteTunnelState = 'stopped' | 'starting' | 'running' | 'error';
export type RemoteTunnelAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';
export type RemoteTunnelVisibility = 'public' | 'private';
export type RemoteConfigHealth = 'valid' | 'repair_required';
export type RemoteDiagnosticLevel = 'info' | 'warn' | 'error';

export interface RemoteDiagnosticEntry {
  id: string;
  level: RemoteDiagnosticLevel;
  message: string;
  step: string;
  at: number;
  commandHint?: string;
}

export interface RemoteAccessDevice {
  id: string;
  name: string;
  platform: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt?: number;
}

export interface RemoteAccessStatus {
  enabled: boolean;
  running: boolean;
  bindHost: string;
  bindPort: number | null;
  localBaseUrl: string | null;
  publicBaseUrl: string | null;
  tunnelMode: RemoteTunnelMode;
  tunnelName: string | null;
  tunnelDomain: string | null;
  tunnelVisibility: RemoteTunnelVisibility;
  tunnelHints: string[];
  tunnelState: RemoteTunnelState;
  tunnelPublicUrl: string | null;
  tunnelLastError: string | null;
  tunnelBinaryInstalled: boolean;
  tunnelBinaryPath: string | null;
  tunnelAuthStatus: RemoteTunnelAuthStatus;
  tunnelStartedAt: number | null;
  tunnelPid: number | null;
  configHealth: RemoteConfigHealth;
  configRepairReason: string | null;
  lastOperation: string | null;
  lastOperationAt: number | null;
  diagnostics: RemoteDiagnosticEntry[];
  deviceCount: number;
  devices: RemoteAccessDevice[];
}

export interface PairingQrResult {
  qrDataUrl: string;
  pairingUri: string;
  expiresAt: number;
}

export interface RemoteDraftOptions {
  publicBaseUrl: string;
  tunnelName: string;
  tunnelDomain: string;
  tunnelVisibility: RemoteTunnelVisibility;
}

interface RemoteAccessState {
  status: RemoteAccessStatus | null;
  pairingQr: PairingQrResult | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isGeneratingQr: boolean;
  isInstallingTunnel: boolean;
  isAuthenticatingTunnel: boolean;
  isSavingProvider: boolean;
  isSavingOptions: boolean;
  isStartingTunnel: boolean;
  isStoppingTunnel: boolean;
  isDeletingRemote: boolean;
  error: string | null;
  draftProvider: RemoteTunnelMode | null;
  draftOptions: RemoteDraftOptions;
  draftDirty: boolean;
  hasHydratedDraft: boolean;
  pollingTimer: ReturnType<typeof setInterval> | null;
  pollingLastAt: number;
  pollingInFlight: boolean;
}

interface RemoteAccessActions {
  loadStatus: () => Promise<void>;
  refreshTunnel: (silent?: boolean) => Promise<void>;
  beginAdaptivePolling: () => void;
  stopAdaptivePolling: () => void;
  hydrateDraftFromStatus: (initialOnly?: boolean) => void;
  discardDraftChanges: () => void;
  setDraftProvider: (provider: RemoteTunnelMode) => void;
  setDraftOptions: (input: Partial<RemoteDraftOptions>) => void;
  applyDraftProvider: () => Promise<void>;
  applyDraftOptions: () => Promise<void>;
  enableRemoteAccess: (input?: {
    publicBaseUrl?: string | null;
    tunnelMode?: RemoteTunnelMode;
    tunnelName?: string | null;
    tunnelDomain?: string | null;
    tunnelVisibility?: RemoteTunnelVisibility;
    bindPort?: number;
  }) => Promise<void>;
  disableRemoteAccess: () => Promise<void>;
  installTunnelBinary: () => Promise<void>;
  authenticateTunnel: () => Promise<void>;
  startTunnel: () => Promise<void>;
  stopTunnel: () => Promise<void>;
  deleteAllRemote: () => Promise<void>;
  generatePairingQr: () => Promise<void>;
  revokeDevice: (deviceId: string) => Promise<void>;
  setPublicBaseUrl: (publicBaseUrl: string | null) => Promise<void>;
  setTunnelMode: (tunnelMode: RemoteTunnelMode) => Promise<void>;
  setTunnelOptions: (input: {
    tunnelName?: string | null;
    tunnelDomain?: string | null;
    tunnelVisibility?: RemoteTunnelVisibility;
    publicBaseUrl?: string | null;
  }) => Promise<void>;
  clearQr: () => void;
  clearError: () => void;
}

function emptyDraftOptions(): RemoteDraftOptions {
  return {
    publicBaseUrl: '',
    tunnelName: '',
    tunnelDomain: '',
    tunnelVisibility: 'public',
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getDraftFromStatus(status: RemoteAccessStatus): {
  provider: RemoteTunnelMode;
  options: RemoteDraftOptions;
} {
  return {
    provider: status.tunnelMode,
    options: {
      publicBaseUrl: status.publicBaseUrl || '',
      tunnelName: status.tunnelName || '',
      tunnelDomain: status.tunnelDomain || '',
      tunnelVisibility: status.tunnelVisibility || 'public',
    },
  };
}

function getPollingInterval(state: RemoteAccessState): number {
  if (
    state.isSavingProvider ||
    state.isSavingOptions ||
    state.isStartingTunnel ||
    state.isStoppingTunnel ||
    state.isInstallingTunnel ||
    state.isAuthenticatingTunnel ||
    state.isRefreshing ||
    state.isDeletingRemote
  ) {
    return 1000;
  }

  return 9000;
}

export const useRemoteAccessStore = create<RemoteAccessState & RemoteAccessActions>((set, get) => ({
  status: null,
  pairingQr: null,
  isLoading: false,
  isRefreshing: false,
  isGeneratingQr: false,
  isInstallingTunnel: false,
  isAuthenticatingTunnel: false,
  isSavingProvider: false,
  isSavingOptions: false,
  isStartingTunnel: false,
  isStoppingTunnel: false,
  isDeletingRemote: false,
  error: null,
  draftProvider: null,
  draftOptions: emptyDraftOptions(),
  draftDirty: false,
  hasHydratedDraft: false,
  pollingTimer: null,
  pollingLastAt: 0,
  pollingInFlight: false,

  hydrateDraftFromStatus: (initialOnly = false) => {
    const state = get();
    if (!state.status) return;
    if (initialOnly && state.hasHydratedDraft) return;
    if (!initialOnly && state.draftDirty) return;

    const draft = getDraftFromStatus(state.status);
    set({
      draftProvider: draft.provider,
      draftOptions: draft.options,
      draftDirty: false,
      hasHydratedDraft: true,
    });
  },

  discardDraftChanges: () => {
    const { status } = get();
    if (!status) {
      set({ draftProvider: null, draftOptions: emptyDraftOptions(), draftDirty: false, hasHydratedDraft: false });
      return;
    }
    const draft = getDraftFromStatus(status);
    set({
      draftProvider: draft.provider,
      draftOptions: draft.options,
      draftDirty: false,
      hasHydratedDraft: true,
      error: null,
    });
  },

  setDraftProvider: (provider) => {
    set({ draftProvider: provider, draftDirty: true });
  },

  setDraftOptions: (input) => {
    set((state) => ({
      draftOptions: {
        ...state.draftOptions,
        ...input,
      },
      draftDirty: true,
    }));
  },

  loadStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_get_status');
      set({ status, isLoading: false, pollingLastAt: Date.now() });
      get().hydrateDraftFromStatus(true);
    } catch (error) {
      set({ error: toErrorMessage(error), isLoading: false });
    }
  },

  refreshTunnel: async (silent = false) => {
    set({ isRefreshing: true, error: silent ? get().error : null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_refresh_tunnel');
      set({
        status,
        isRefreshing: false,
        pollingLastAt: Date.now(),
      });
      get().hydrateDraftFromStatus(true);
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isRefreshing: false, pollingLastAt: Date.now() });
      if (!silent) {
        toast.error('Tunnel health check failed', message);
      }
      throw error;
    }
  },

  beginAdaptivePolling: () => {
    const existing = get().pollingTimer;
    if (existing) return;

    const timer = globalThis.setInterval(() => {
      const state = get();
      if (state.pollingInFlight || !state.status) {
        return;
      }

      const interval = getPollingInterval(state);
      const elapsed = Date.now() - state.pollingLastAt;
      if (elapsed < interval) {
        return;
      }

      set({ pollingInFlight: true });
      void get()
        .refreshTunnel(true)
        .catch(() => {
          // Keep polling alive even when refresh fails.
        })
        .finally(() => {
          set({ pollingInFlight: false });
        });
    }, 1000);

    set({ pollingTimer: timer });
  },

  stopAdaptivePolling: () => {
    const timer = get().pollingTimer;
    if (timer) {
      clearInterval(timer);
    }
    set({ pollingTimer: null, pollingInFlight: false });
  },

  applyDraftProvider: async () => {
    const { draftProvider, status } = get();
    const provider = draftProvider ?? status?.tunnelMode;
    if (!provider) {
      toast.error('Choose a provider first');
      return;
    }

    set({ isSavingProvider: true, error: null });
    try {
      const nextStatus = await invoke<RemoteAccessStatus>('remote_access_set_tunnel_mode', {
        tunnelMode: provider,
      });
      set({
        status: nextStatus,
        isSavingProvider: false,
        draftDirty: false,
        pollingLastAt: Date.now(),
      });
      get().discardDraftChanges();
      toast.success('Tunnel provider saved');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isSavingProvider: false });
      toast.error('Failed to update tunnel mode', message);
      throw error;
    }
  },

  applyDraftOptions: async () => {
    const { status, draftProvider, draftOptions } = get();
    const provider = draftProvider ?? status?.tunnelMode ?? 'tailscale';

    set({ isSavingOptions: true, error: null });
    try {
      const normalized = {
        publicBaseUrl: draftOptions.publicBaseUrl.trim() || null,
        tunnelName: draftOptions.tunnelName.trim() || null,
        tunnelDomain: draftOptions.tunnelDomain.trim() || null,
        tunnelVisibility: provider === 'cloudflare' ? 'public' : draftOptions.tunnelVisibility,
      } as const;

      let nextStatus: RemoteAccessStatus;

      if (!status?.enabled) {
        nextStatus = await invoke<RemoteAccessStatus>('remote_access_enable', {
          publicBaseUrl: normalized.publicBaseUrl,
          tunnelMode: provider,
          tunnelName: normalized.tunnelName,
          tunnelDomain: normalized.tunnelDomain,
          tunnelVisibility: normalized.tunnelVisibility,
        });
      } else {
        if (status.tunnelMode !== provider) {
          await invoke<RemoteAccessStatus>('remote_access_set_tunnel_mode', {
            tunnelMode: provider,
          });
        }

        nextStatus = await invoke<RemoteAccessStatus>('remote_access_set_tunnel_options', {
          tunnelName: normalized.tunnelName,
          tunnelDomain: normalized.tunnelDomain,
          tunnelVisibility: normalized.tunnelVisibility,
          publicBaseUrl: normalized.publicBaseUrl,
        });
      }

      set({
        status: nextStatus,
        isSavingOptions: false,
        draftDirty: false,
        pollingLastAt: Date.now(),
      });
      get().discardDraftChanges();
      toast.success('Tunnel configuration applied');
      await get().refreshTunnel(true);
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isSavingOptions: false });
      toast.error('Failed to apply tunnel configuration', message);
      throw error;
    }
  },

  enableRemoteAccess: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_enable', {
        publicBaseUrl: input?.publicBaseUrl ?? null,
        tunnelMode: input?.tunnelMode,
        tunnelName: input?.tunnelName ?? null,
        tunnelDomain: input?.tunnelDomain ?? null,
        tunnelVisibility: input?.tunnelVisibility,
        bindPort: input?.bindPort,
      });
      set({ status, isLoading: false, pollingLastAt: Date.now() });
      get().hydrateDraftFromStatus(false);
      toast.success('Remote access enabled');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isLoading: false });
      toast.error('Failed to enable remote access', message);
      throw error;
    }
  },

  disableRemoteAccess: async () => {
    set({ isLoading: true, error: null, pairingQr: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_disable');
      set({ status, isLoading: false, pollingLastAt: Date.now() });
      get().hydrateDraftFromStatus(false);
      toast.success('Remote access disabled');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isLoading: false });
      toast.error('Failed to disable remote access', message);
      throw error;
    }
  },

  installTunnelBinary: async () => {
    set({ isInstallingTunnel: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_install_tunnel_binary');
      set({ status, isInstallingTunnel: false, pollingLastAt: Date.now() });
      toast.success('Tunnel dependency installed');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isInstallingTunnel: false });
      toast.error('Tunnel install failed', message);
      throw error;
    }
  },

  authenticateTunnel: async () => {
    set({ isAuthenticatingTunnel: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_authenticate_tunnel');
      set({ status, isAuthenticatingTunnel: false, pollingLastAt: Date.now() });
      toast.success('Tunnel authentication complete');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isAuthenticatingTunnel: false });
      toast.error('Tunnel authentication failed', message);
      throw error;
    }
  },

  startTunnel: async () => {
    set({ isStartingTunnel: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_start_tunnel');
      set({ status, isStartingTunnel: false, pollingLastAt: Date.now() });
      toast.success('Tunnel started');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isStartingTunnel: false });
      toast.error('Failed to start tunnel', message);
      throw error;
    }
  },

  stopTunnel: async () => {
    set({ isStoppingTunnel: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_stop_tunnel');
      set({ status, isStoppingTunnel: false, pollingLastAt: Date.now() });
      toast.success('Tunnel stopped');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isStoppingTunnel: false });
      toast.error('Failed to stop tunnel', message);
      throw error;
    }
  },

  deleteAllRemote: async () => {
    set({ isDeletingRemote: true, error: null, pairingQr: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_delete_all');
      set({
        status,
        isDeletingRemote: false,
        pollingLastAt: Date.now(),
        draftDirty: false,
      });
      get().discardDraftChanges();
      toast.success('Remote setup deleted');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isDeletingRemote: false });
      toast.error('Failed to delete remote setup', message);
      throw error;
    }
  },

  generatePairingQr: async () => {
    const { status } = get();
    if (!status?.enabled) {
      toast.error('Enable remote access first');
      return;
    }

    set({ isGeneratingQr: true, error: null });
    try {
      const pairingQr = await invoke<PairingQrResult>('remote_access_generate_qr');
      set({ pairingQr, isGeneratingQr: false });
    } catch (error) {
      const message = toErrorMessage(error);
      set({ error: message, isGeneratingQr: false });
      toast.error('Failed to generate pairing QR', message);
      throw error;
    }
  },

  revokeDevice: async (deviceId: string) => {
    try {
      const revoked = await invoke<boolean>('remote_access_revoke_device', { deviceId });
      if (!revoked) {
        toast.error('Device not found');
        return;
      }
      toast.success('Device revoked');
      await get().loadStatus();
    } catch (error) {
      const message = toErrorMessage(error);
      toast.error('Failed to revoke device', message);
      throw error;
    }
  },

  setPublicBaseUrl: async (publicBaseUrl) => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_set_public_base_url', {
        publicBaseUrl,
      });
      set({ status, isLoading: false, pollingLastAt: Date.now() });
      get().hydrateDraftFromStatus(false);
      toast.success('Public endpoint updated');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isLoading: false, error: message });
      toast.error('Failed to update public endpoint', message);
      throw error;
    }
  },

  setTunnelMode: async (tunnelMode) => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_set_tunnel_mode', {
        tunnelMode,
      });
      set({ status, isLoading: false, pollingLastAt: Date.now() });
      get().hydrateDraftFromStatus(false);
      toast.success('Tunnel mode updated');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isLoading: false, error: message });
      toast.error('Failed to update tunnel mode', message);
      throw error;
    }
  },

  setTunnelOptions: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_set_tunnel_options', {
        tunnelName: input.tunnelName ?? null,
        tunnelDomain: input.tunnelDomain ?? null,
        tunnelVisibility: input.tunnelVisibility,
        publicBaseUrl: input.publicBaseUrl ?? null,
      });
      set({ status, isLoading: false, pollingLastAt: Date.now() });
      get().hydrateDraftFromStatus(false);
      toast.success('Tunnel options updated');
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isLoading: false, error: message });
      toast.error('Failed to update tunnel options', message);
      throw error;
    }
  },

  clearQr: () => set({ pairingQr: null }),
  clearError: () => set({ error: null }),
}));
