// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { create } from 'zustand';
import { useAppStore } from './app-store';

const getTauriInvoke = async () => {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke;
  }
  throw new Error('Not running in Tauri context. Please use the desktop app.');
};

export type ProviderId = 'google';

export const PROVIDERS: ProviderId[] = ['google'];

export const BASE_URL_EDITABLE_PROVIDERS: ProviderId[] = [];

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

export interface RuntimeSoulProfile {
  id: string;
  title: string;
  content: string;
  source: 'preset' | 'custom';
  path?: string;
}

const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  google: 'https://generativelanguage.googleapis.com',
};

export interface RuntimeConfigPayload {
  activeProvider: ProviderId;
  providerApiKeys?: Partial<Record<ProviderId, string>>;
  providerBaseUrls?: Partial<Record<ProviderId, string>>;
  googleApiKey?: string | null;
  falApiKey?: string | null;
  mediaRouting?: {
    imageBackend: 'google' | 'fal';
    videoBackend: 'google' | 'fal';
  };
  sandbox?: CommandSandboxSettings;
  toolOutputTokenLimit?: number;
  thinkingLevel?: 'low' | 'medium' | 'high';
  specializedModels?: {
    google: {
      imageGeneration: string;
      videoGeneration: string;
      computerUse: string;
      deepResearchAgent: string;
    };
    fal: {
      imageGeneration: string;
      videoGeneration: string;
      enabledModels?: string[];
      defaultImageModelId?: string;
      defaultVideoModelId?: string;
    };
  };
  activeSoul?: RuntimeSoulProfile | null;
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
  falApiKey: string | null;
  stitchApiKey: string | null;
  activeSoul: RuntimeSoulProfile | null;
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
  setFalApiKey: (apiKey: string) => Promise<void>;
  clearFalApiKey: () => Promise<void>;
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
    activeProvider: 'google',
    providerApiKeys,
    providerBaseUrls,
    googleApiKey: partial?.googleApiKey ?? state.googleApiKey,
    falApiKey: partial?.falApiKey ?? state.falApiKey,
    mediaRouting: partial?.mediaRouting,
    sandbox: partial?.sandbox,
    toolOutputTokenLimit: partial?.toolOutputTokenLimit,
    thinkingLevel: partial?.thinkingLevel,
    specializedModels: partial?.specializedModels,
    activeSoul: partial?.activeSoul ?? state.activeSoul,
  };
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  isAuthenticated: false,
  activeProvider: 'google',
  apiKey: null,
  providerApiKeys: {},
  providerBaseUrls: {},
  googleApiKey: null,
  falApiKey: null,
  stitchApiKey: null,
  activeSoul: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();

      const key = await invoke<string | null>('get_provider_api_key', { providerId: 'google' });
      const providerApiKeys: Partial<Record<ProviderId, string>> = {};
      if (key?.trim()) {
        providerApiKeys.google = key.trim();
      }

      const [googleApiKey, falApiKey, stitchApiKey] = await Promise.all([
        invoke<string | null>('get_google_api_key'),
        invoke<string | null>('get_fal_api_key'),
        invoke<string | null>('get_stitch_api_key'),
      ]);

      const activeApiKey = providerApiKeys.google || null;
      const mergedBaseUrls = {
        ...DEFAULT_BASE_URLS,
        ...get().providerBaseUrls,
      };

      set({
        isAuthenticated: !!activeApiKey,
        apiKey: activeApiKey,
        providerApiKeys,
        providerBaseUrls: mergedBaseUrls,
        googleApiKey: googleApiKey || null,
        falApiKey: falApiKey || null,
        stitchApiKey: stitchApiKey || null,
        isLoading: false,
      });

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
        falApiKey: null,
        stitchApiKey: null,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setActiveProvider: async (_provider) => {
    const nextKey = get().providerApiKeys.google || null;
    set({
      activeProvider: 'google',
      apiKey: nextKey,
      isAuthenticated: !!nextKey,
    });
  },

  setProviderApiKey: async (_provider, apiKey) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_provider_api_key', { providerId: 'google', apiKey: trimmed });
      const nextProviderApiKeys: Partial<Record<ProviderId, string>> = { google: trimmed };
      set({
        providerApiKeys: nextProviderApiKeys,
        isAuthenticated: true,
        apiKey: trimmed,
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

  clearProviderApiKey: async (_provider) => {
    set({ isLoading: true, error: null });
    try {
      const invoke = await getTauriInvoke();
      await invoke('delete_provider_api_key', { providerId: 'google' });
      set({
        providerApiKeys: {},
        isAuthenticated: false,
        apiKey: null,
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

  setProviderBaseUrl: async (_provider, baseUrl) => {
    const trimmed = baseUrl.trim();
    set((state) => ({
      providerBaseUrls: {
        ...state.providerBaseUrls,
        google: trimmed,
      },
    }));
  },

  clearProviderBaseUrl: async (_provider) => {
    set((state) => {
      const next = { ...state.providerBaseUrls };
      delete next.google;
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

  validateProviderConnection: async (_provider, apiKey, baseUrl) => {
    const invoke = await getTauriInvoke();
    return invoke<boolean>('validate_provider_connection', {
      providerId: 'google',
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

      if (partial && Object.prototype.hasOwnProperty.call(partial, 'activeSoul')) {
        set({ activeSoul: partial.activeSoul ?? null });
      }
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
    await get().setProviderApiKey('google', apiKey);
  },

  clearApiKey: async () => {
    await get().clearProviderApiKey('google');
  },

  validateApiKey: async (apiKey: string) => {
    const baseUrl = get().providerBaseUrls.google;
    return get().validateProviderConnection('google', apiKey, baseUrl);
  },
}));
