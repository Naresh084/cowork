import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '@/components/ui/Toast';

export type RemoteTunnelMode = 'tailscale' | 'cloudflare' | 'custom';
export type RemoteTunnelState = 'stopped' | 'starting' | 'running' | 'error';
export type RemoteTunnelAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';
export type RemoteTunnelVisibility = 'public' | 'private';

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
  deviceCount: number;
  devices: RemoteAccessDevice[];
}

export interface PairingQrResult {
  qrDataUrl: string;
  pairingUri: string;
  expiresAt: number;
}

interface RemoteAccessState {
  status: RemoteAccessStatus | null;
  pairingQr: PairingQrResult | null;
  isLoading: boolean;
  isGeneratingQr: boolean;
  isInstallingTunnel: boolean;
  isAuthenticatingTunnel: boolean;
  isStartingTunnel: boolean;
  error: string | null;
}

interface RemoteAccessActions {
  loadStatus: () => Promise<void>;
  refreshTunnel: () => Promise<void>;
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

export const useRemoteAccessStore = create<RemoteAccessState & RemoteAccessActions>((set, get) => ({
  status: null,
  pairingQr: null,
  isLoading: false,
  isGeneratingQr: false,
  isInstallingTunnel: false,
  isAuthenticatingTunnel: false,
  isStartingTunnel: false,
  error: null,

  loadStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_get_status');
      set({ status, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
    }
  },

  refreshTunnel: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_refresh_tunnel');
      set({ status, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
      toast.error('Tunnel health check failed', message);
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
      set({ status, isLoading: false });
      toast.success('Remote access enabled');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
      toast.error('Failed to enable remote access', message);
      throw error;
    }
  },

  disableRemoteAccess: async () => {
    set({ isLoading: true, error: null, pairingQr: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_disable');
      set({ status, isLoading: false });
      toast.success('Remote access disabled');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
      toast.error('Failed to disable remote access', message);
      throw error;
    }
  },

  installTunnelBinary: async () => {
    set({ isInstallingTunnel: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_install_tunnel_binary');
      set({ status, isInstallingTunnel: false });
      toast.success('Tunnel dependency installed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isInstallingTunnel: false });
      toast.error('Tunnel install failed', message);
      throw error;
    }
  },

  authenticateTunnel: async () => {
    set({ isAuthenticatingTunnel: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_authenticate_tunnel');
      set({ status, isAuthenticatingTunnel: false });
      toast.success('Tunnel authentication complete');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isAuthenticatingTunnel: false });
      toast.error('Tunnel authentication failed', message);
      throw error;
    }
  },

  startTunnel: async () => {
    set({ isStartingTunnel: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_start_tunnel');
      set({ status, isStartingTunnel: false });
      toast.success('Tunnel started');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isStartingTunnel: false });
      toast.error('Failed to start tunnel', message);
      throw error;
    }
  },

  stopTunnel: async () => {
    set({ isStartingTunnel: true, error: null });
    try {
      const status = await invoke<RemoteAccessStatus>('remote_access_stop_tunnel');
      set({ status, isStartingTunnel: false });
      toast.success('Tunnel stopped');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isStartingTunnel: false });
      toast.error('Failed to stop tunnel', message);
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
      const message = error instanceof Error ? error.message : String(error);
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
      const message = error instanceof Error ? error.message : String(error);
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
      set({ status, isLoading: false });
      toast.success('Public endpoint updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
      set({ status, isLoading: false });
      toast.success('Tunnel mode updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
      set({ status, isLoading: false });
      toast.success('Tunnel options updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ isLoading: false, error: message });
      toast.error('Failed to update tunnel options', message);
      throw error;
    }
  },

  clearQr: () => set({ pairingQr: null }),
  clearError: () => set({ error: null }),
}));
