import { create } from 'zustand';

// Dynamically import Tauri API to handle browser vs Tauri context
const getTauriInvoke = async () => {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke;
  }
  throw new Error('Not running in Tauri context. Please use the desktop app.');
};

interface AuthState {
  isAuthenticated: boolean;
  apiKey: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  setApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  validateApiKey: (apiKey: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  isAuthenticated: false,
  apiKey: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      const apiKey = await invoke<string | null>('get_api_key');
      set({
        isAuthenticated: !!apiKey,
        apiKey,
        isLoading: false,
      });
    } catch (error) {
      set({
        isAuthenticated: false,
        apiKey: null,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setApiKey: async (apiKey: string) => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      // Save to keychain
      await invoke('set_api_key', { apiKey });
      // Also set on the agent sidecar (if running)
      try {
        await invoke('agent_set_api_key', { apiKey });
      } catch {
        // Ignore if sidecar not running yet - it will get the key when it starts
      }
      set({
        isAuthenticated: true,
        apiKey,
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  clearApiKey: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_api_key');
      set({
        isAuthenticated: false,
        apiKey: null,
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  validateApiKey: async (apiKey: string) => {
    try {
      const invoke = await getTauriInvoke();
      const isValid = await invoke<boolean>('validate_api_key', { apiKey });
      return isValid;
    } catch (error) {
      console.error('API key validation error:', error);
      throw error;
    }
  },
}));
