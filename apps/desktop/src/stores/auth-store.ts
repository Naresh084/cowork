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
  stitchApiKey: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  setApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  setStitchApiKey: (apiKey: string) => Promise<void>;
  clearStitchApiKey: () => Promise<void>;
  validateApiKey: (apiKey: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  isAuthenticated: false,
  apiKey: null,
  stitchApiKey: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      const [apiKey, stitchApiKey] = await Promise.all([
        invoke<string | null>('get_api_key'),
        invoke<string | null>('get_stitch_api_key'),
      ]);
      set({
        isAuthenticated: !!apiKey,
        apiKey,
        stitchApiKey,
        isLoading: false,
      });
      // Sync API key to sidecar in the background — don't block startup
      if (apiKey) {
        invoke('agent_set_api_key', { apiKey }).catch(() => {
          // Sidecar may not be running yet — backend init will handle it
        });
      }
      invoke('agent_set_stitch_api_key', { apiKey: stitchApiKey ?? null }).catch(() => {
        // Sidecar may not be running yet — backend init will handle it
      });
    } catch (error) {
      console.error('[AuthStore] Initialization error:', error);
      set({
        isAuthenticated: false,
        apiKey: null,
        stitchApiKey: null,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setApiKey: async (apiKey: string) => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      // Save to secure local credentials storage
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

  setStitchApiKey: async (apiKey: string) => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_stitch_api_key', { apiKey });
      try {
        await invoke('agent_set_stitch_api_key', { apiKey });
      } catch {
        // Ignore if sidecar not running yet
      }
      set({
        stitchApiKey: apiKey,
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

  clearStitchApiKey: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_stitch_api_key');
      try {
        await invoke('agent_set_stitch_api_key', { apiKey: null });
      } catch {
        // Ignore if sidecar not running yet
      }
      set({
        stitchApiKey: null,
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
}));
