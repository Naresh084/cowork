import { Platform } from 'react-native';
import { create } from 'zustand';
import { clearRemoteClient, setRemoteClientAuth } from '@/lib/client';
import { completePairing, parsePairingUri } from '@/lib/pairing';
import { clearAuthStorage, readAuthStorage, writeAuthStorage } from '@/lib/storage';
import type { RemoteStatus } from '@/types/remote';

interface AuthState {
  hydrated: boolean;
  isAuthenticated: boolean;
  endpoint: string | null;
  wsEndpoint: string | null;
  token: string | null;
  deviceName: string;
  status: RemoteStatus | null;
  isBusy: boolean;
  error: string | null;
}

interface AuthActions {
  bootstrap: () => Promise<void>;
  pairWithQr: (rawQr: string, deviceName: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  hydrated: false,
  isAuthenticated: false,
  endpoint: null,
  wsEndpoint: null,
  token: null,
  deviceName: 'My phone',
  status: null,
  isBusy: false,
  error: null,

  bootstrap: async () => {
    set({ isBusy: true, error: null });
    try {
      const state = await readAuthStorage();
      if (!state) {
        set({ hydrated: true, isBusy: false });
        return;
      }

      setRemoteClientAuth({
        endpoint: state.endpoint,
        token: state.token,
      });

      set({
        hydrated: true,
        isAuthenticated: true,
        endpoint: state.endpoint,
        wsEndpoint: state.wsEndpoint,
        token: state.token,
        deviceName: state.deviceName,
        isBusy: false,
      });

      await get().refreshStatus();
    } catch (error) {
      set({
        hydrated: true,
        isBusy: false,
        isAuthenticated: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  pairWithQr: async (rawQr, deviceName) => {
    set({ isBusy: true, error: null });
    try {
      const payload = parsePairingUri(rawQr);
      const response = await completePairing(
        payload,
        deviceName.trim() || 'My phone',
        Platform.OS === 'ios' ? 'ios' : 'android',
      );

      const endpoint = (response.endpoint || payload.endpoint).replace(/\/+$/, '');
      const wsEndpoint = (response.wsEndpoint || payload.wsEndpoint).replace(/\/+$/, '');
      const token = response.token;

      setRemoteClientAuth({
        endpoint,
        token,
      });

      await writeAuthStorage({
        endpoint,
        wsEndpoint,
        token,
        deviceName: deviceName.trim() || 'My phone',
      });

      set({
        hydrated: true,
        isAuthenticated: true,
        endpoint,
        wsEndpoint,
        token,
        deviceName: deviceName.trim() || 'My phone',
        isBusy: false,
      });

      await get().refreshStatus();
    } catch (error) {
      set({
        isBusy: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  refreshStatus: async () => {
    const { isAuthenticated } = get();
    if (!isAuthenticated) return;
    try {
      const client = setRemoteClientAuth({
        endpoint: get().endpoint!,
        token: get().token!,
      });
      const payload = await client.getMe();
      set({ status: payload.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      if (message.toLowerCase().includes('unauthorized')) {
        await get().logout();
      }
    }
  },

  logout: async () => {
    set({ isBusy: true });
    try {
      const endpoint = get().endpoint;
      const token = get().token;
      if (endpoint && token) {
        try {
          const client = setRemoteClientAuth({ endpoint, token });
          await client.logout();
        } catch {
          // Ignore remote logout failures and clear local state.
        }
      }
      await clearAuthStorage();
      clearRemoteClient();
      set({
        isAuthenticated: false,
        endpoint: null,
        wsEndpoint: null,
        token: null,
        status: null,
        isBusy: false,
      });
    } catch (error) {
      set({
        isBusy: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  clearError: () => set({ error: null }),
}));
