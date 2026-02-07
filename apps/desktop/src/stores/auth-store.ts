import { create } from 'zustand';
import { useAppStore } from './app-store';

const getTauriInvoke = async () => {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke;
  }
  throw new Error('Not running in Tauri context. Please use the desktop app.');
};

export type ProviderId =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'moonshot'
  | 'glm'
  | 'deepseek'
  | 'lmstudio';

export const PROVIDERS: ProviderId[] = [
  'google',
  'openai',
  'anthropic',
  'openrouter',
  'moonshot',
  'glm',
  'deepseek',
  'lmstudio',
];

export const BASE_URL_EDITABLE_PROVIDERS: ProviderId[] = [
  'openrouter',
  'moonshot',
  'glm',
  'deepseek',
  'lmstudio',
];

export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface CommandSandboxSettings {
  mode: SandboxMode;
  allowNetwork: boolean;
  allowProcessSpawn: boolean;
  allowedPaths: string[];
  deniedPaths: string[];
  trustedCommands: string[];
  maxExecutionTimeMs: number;
  maxOutputBytes: number;
}

const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  google: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  openrouter: 'https://openrouter.ai/api',
  moonshot: 'https://api.moonshot.ai',
  glm: 'https://open.bigmodel.cn/api/paas',
  deepseek: 'https://api.deepseek.com',
  lmstudio: 'http://127.0.0.1:1234',
};

export interface RuntimeConfigPayload {
  activeProvider: ProviderId;
  providerApiKeys?: Partial<Record<ProviderId, string>>;
  providerBaseUrls?: Partial<Record<ProviderId, string>>;
  googleApiKey?: string | null;
  openaiApiKey?: string | null;
  falApiKey?: string | null;
  exaApiKey?: string | null;
  tavilyApiKey?: string | null;
  externalSearchProvider?: 'google' | 'exa' | 'tavily';
  mediaRouting?: {
    imageBackend: 'google' | 'openai' | 'fal';
    videoBackend: 'google' | 'openai' | 'fal';
  };
  sandbox?: CommandSandboxSettings;
  specializedModels?: {
    google: {
      imageGeneration: string;
      videoGeneration: string;
      computerUse: string;
      deepResearchAgent: string;
    };
    openai: {
      imageGeneration: string;
      videoGeneration: string;
    };
    fal: {
      imageGeneration: string;
      videoGeneration: string;
    };
  };
}

export interface RuntimeConfigUpdateResult {
  appliedImmediately: boolean;
  requiresNewSession: boolean;
  reasons: string[];
  affectedSessionIds: string[];
}

interface AuthState {
  isAuthenticated: boolean;
  activeProvider: ProviderId;
  apiKey: string | null;
  providerApiKeys: Partial<Record<ProviderId, string>>;
  providerBaseUrls: Partial<Record<ProviderId, string>>;
  googleApiKey: string | null;
  openaiApiKey: string | null;
  falApiKey: string | null;
  exaApiKey: string | null;
  tavilyApiKey: string | null;
  stitchApiKey: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  setActiveProvider: (provider: ProviderId) => Promise<void>;
  setProviderApiKey: (provider: ProviderId, apiKey: string) => Promise<void>;
  clearProviderApiKey: (provider: ProviderId) => Promise<void>;
  setProviderBaseUrl: (provider: ProviderId, baseUrl: string) => Promise<void>;
  clearProviderBaseUrl: (provider: ProviderId) => Promise<void>;
  setGoogleApiKey: (apiKey: string) => Promise<void>;
  clearGoogleApiKey: () => Promise<void>;
  setOpenAIApiKey: (apiKey: string) => Promise<void>;
  clearOpenAIApiKey: () => Promise<void>;
  setFalApiKey: (apiKey: string) => Promise<void>;
  clearFalApiKey: () => Promise<void>;
  setExaApiKey: (apiKey: string) => Promise<void>;
  clearExaApiKey: () => Promise<void>;
  setTavilyApiKey: (apiKey: string) => Promise<void>;
  clearTavilyApiKey: () => Promise<void>;
  setStitchApiKey: (apiKey: string) => Promise<void>;
  clearStitchApiKey: () => Promise<void>;
  validateProviderConnection: (provider: ProviderId, apiKey: string, baseUrl?: string) => Promise<boolean>;
  applyRuntimeConfig: (partial?: Partial<RuntimeConfigPayload>) => Promise<RuntimeConfigUpdateResult | null>;

  // Backward-compatible wrappers
  setApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  validateApiKey: (apiKey: string) => Promise<boolean>;
}

function buildRuntimeConfig(
  state: AuthState,
  partial?: Partial<RuntimeConfigPayload>,
): RuntimeConfigPayload {
  const providerApiKeys = {
    ...state.providerApiKeys,
    ...(partial?.providerApiKeys || {}),
  };
  const providerBaseUrls = {
    ...state.providerBaseUrls,
    ...(partial?.providerBaseUrls || {}),
  };

  return {
    activeProvider: partial?.activeProvider || state.activeProvider,
    providerApiKeys,
    providerBaseUrls,
    googleApiKey: partial?.googleApiKey ?? state.googleApiKey,
    openaiApiKey: partial?.openaiApiKey ?? state.openaiApiKey,
    falApiKey: partial?.falApiKey ?? state.falApiKey,
    exaApiKey: partial?.exaApiKey ?? state.exaApiKey,
    tavilyApiKey: partial?.tavilyApiKey ?? state.tavilyApiKey,
    externalSearchProvider: partial?.externalSearchProvider,
    mediaRouting: partial?.mediaRouting,
    sandbox: partial?.sandbox,
    specializedModels: partial?.specializedModels,
  };
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  isAuthenticated: false,
  activeProvider: 'google',
  apiKey: null,
  providerApiKeys: {},
  providerBaseUrls: {},
  googleApiKey: null,
  openaiApiKey: null,
  falApiKey: null,
  exaApiKey: null,
  tavilyApiKey: null,
  stitchApiKey: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();

      const providerKeyEntries = await Promise.all(
        PROVIDERS.map(async (provider) => {
          const key = await invoke<string | null>('get_provider_api_key', { providerId: provider });
          return [provider, key || null] as const;
        }),
      );

      const providerApiKeys = providerKeyEntries.reduce<Partial<Record<ProviderId, string>>>((acc, [provider, key]) => {
        if (key && key.trim()) acc[provider] = key.trim();
        return acc;
      }, {});

      const [googleApiKey, openaiApiKey, falApiKey, exaApiKey, tavilyApiKey, stitchApiKey] = await Promise.all([
        invoke<string | null>('get_google_api_key'),
        invoke<string | null>('get_openai_api_key'),
        invoke<string | null>('get_fal_api_key'),
        invoke<string | null>('get_exa_api_key'),
        invoke<string | null>('get_tavily_api_key'),
        invoke<string | null>('get_stitch_api_key'),
      ]);

      const activeProvider = get().activeProvider;
      const activeApiKey = providerApiKeys[activeProvider] || null;
      const providerReady = activeProvider === 'lmstudio' ? true : !!activeApiKey;
      const mergedBaseUrls = {
        ...DEFAULT_BASE_URLS,
        ...get().providerBaseUrls,
      };

      set({
        isAuthenticated: providerReady,
        apiKey: activeApiKey,
        providerApiKeys,
        providerBaseUrls: mergedBaseUrls,
        googleApiKey: googleApiKey || null,
        openaiApiKey: openaiApiKey || null,
        falApiKey: falApiKey || null,
        exaApiKey: exaApiKey || null,
        tavilyApiKey: tavilyApiKey || null,
        stitchApiKey: stitchApiKey || null,
        isLoading: false,
      });

      // Keep legacy sidecar API key path warm for compatibility.
      if (activeApiKey) {
        invoke('agent_set_api_key', { apiKey: activeApiKey }).catch(() => undefined);
      }
      invoke('agent_set_stitch_api_key', { apiKey: stitchApiKey ?? null }).catch(() => undefined);
    } catch (error) {
      set({
        isAuthenticated: false,
        apiKey: null,
        providerApiKeys: {},
        googleApiKey: null,
        openaiApiKey: null,
        falApiKey: null,
        exaApiKey: null,
        tavilyApiKey: null,
        stitchApiKey: null,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setActiveProvider: async (provider) => {
    const nextKey = get().providerApiKeys[provider] || null;
    set({
      activeProvider: provider,
      apiKey: nextKey,
      isAuthenticated: provider === 'lmstudio' ? true : !!nextKey,
    });
  },

  setProviderApiKey: async (provider, apiKey) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_provider_api_key', { providerId: provider, apiKey: trimmed });
      const nextProviderApiKeys = { ...get().providerApiKeys, [provider]: trimmed };
      const isActive = get().activeProvider === provider;
      set({
        providerApiKeys: nextProviderApiKeys,
        isAuthenticated: isActive ? true : get().isAuthenticated,
        apiKey: isActive ? trimmed : get().apiKey,
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

  clearProviderApiKey: async (provider) => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_provider_api_key', { providerId: provider });
      const next = { ...get().providerApiKeys };
      delete next[provider];
      const isActive = get().activeProvider === provider;
      const activeStillReady = isActive && provider === 'lmstudio';
      set({
        providerApiKeys: next,
        isAuthenticated: isActive ? activeStillReady : get().isAuthenticated,
        apiKey: isActive ? null : get().apiKey,
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

  setProviderBaseUrl: async (provider, baseUrl) => {
    const trimmed = baseUrl.trim();
    set((state) => ({
      providerBaseUrls: {
        ...state.providerBaseUrls,
        [provider]: trimmed,
      },
    }));
  },

  clearProviderBaseUrl: async (provider) => {
    set((state) => {
      const next = { ...state.providerBaseUrls };
      delete next[provider];
      return { providerBaseUrls: next };
    });
  },

  setGoogleApiKey: async (apiKey) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_google_api_key', { apiKey: trimmed });
      set({ googleApiKey: trimmed, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  clearGoogleApiKey: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_google_api_key');
      set({ googleApiKey: null, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  setOpenAIApiKey: async (apiKey) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_openai_api_key', { apiKey: trimmed });
      set({ openaiApiKey: trimmed, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  clearOpenAIApiKey: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_openai_api_key');
      set({ openaiApiKey: null, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  setFalApiKey: async (apiKey) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_fal_api_key', { apiKey: trimmed });
      set({ falApiKey: trimmed, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  clearFalApiKey: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_fal_api_key');
      set({ falApiKey: null, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  setExaApiKey: async (apiKey) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_exa_api_key', { apiKey: trimmed });
      set({ exaApiKey: trimmed, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  clearExaApiKey: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_exa_api_key');
      set({ exaApiKey: null, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  setTavilyApiKey: async (apiKey) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_tavily_api_key', { apiKey: trimmed });
      set({ tavilyApiKey: trimmed, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  clearTavilyApiKey: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_tavily_api_key');
      set({ tavilyApiKey: null, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  setStitchApiKey: async (apiKey: string) => {
    const trimmed = apiKey.trim();
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_stitch_api_key', { apiKey: trimmed });
      try {
        await invoke('agent_set_stitch_api_key', { apiKey: trimmed });
      } catch {
        // Sidecar might not be running yet.
      }
      set({ stitchApiKey: trimmed, isLoading: false });
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
        // Sidecar might not be running yet.
      }
      set({ stitchApiKey: null, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  validateProviderConnection: async (provider, apiKey, baseUrl) => {
    const invoke = await getTauriInvoke();
    return invoke<boolean>('validate_provider_connection', {
      providerId: provider,
      apiKey,
      baseUrl: baseUrl || null,
    });
  },

  applyRuntimeConfig: async (partial) => {
    try {
      const invoke = await getTauriInvoke();
      const state = get();
      const config = buildRuntimeConfig(state, partial);
      const result = await invoke<RuntimeConfigUpdateResult>('agent_set_runtime_config', { config });

      if (result?.requiresNewSession) {
        useAppStore.getState().setRuntimeConfigNotice({
          requiresNewSession: true,
          reasons: result.reasons || [],
          affectedSessionIds: result.affectedSessionIds || [],
        });
      } else {
        useAppStore.getState().setRuntimeConfigNotice(null);
      }

      return result;
    } catch (error) {
      console.warn('[AuthStore] Failed to apply runtime config:', error);
      return null;
    }
  },

  // Backward-compatible wrappers (used by existing UI)
  setApiKey: async (apiKey: string) => {
    const provider = get().activeProvider;
    await get().setProviderApiKey(provider, apiKey);
  },

  clearApiKey: async () => {
    const provider = get().activeProvider;
    await get().clearProviderApiKey(provider);
  },

  validateApiKey: async (apiKey: string) => {
    const provider = get().activeProvider;
    const baseUrl = get().providerBaseUrls[provider];
    return get().validateProviderConnection(provider, apiKey, baseUrl);
  },
}));
