import { create } from 'zustand';

interface AppState {
  showApiKeyModal: boolean;
  apiKeyError: string | null;
  currentView: 'chat' | 'settings';
  runtimeConfigNotice: {
    requiresNewSession: boolean;
    reasons: string[];
    affectedSessionIds: string[];
  } | null;
}

interface AppActions {
  setShowApiKeyModal: (show: boolean, error?: string) => void;
  clearApiKeyError: () => void;
  setCurrentView: (view: 'chat' | 'settings') => void;
  setRuntimeConfigNotice: (notice: AppState['runtimeConfigNotice']) => void;
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  showApiKeyModal: false,
  apiKeyError: null,
  currentView: 'chat',
  runtimeConfigNotice: null,

  setShowApiKeyModal: (show, error) =>
    set({
      showApiKeyModal: show,
      apiKeyError: error || null,
    }),

  clearApiKeyError: () =>
    set({
      apiKeyError: null,
    }),

  setCurrentView: (view) =>
    set({
      currentView: view,
    }),

  setRuntimeConfigNotice: (notice) =>
    set({
      runtimeConfigNotice: notice,
    }),
}));
