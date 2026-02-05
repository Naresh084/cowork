import { create } from 'zustand';

interface AppState {
  showApiKeyModal: boolean;
  apiKeyError: string | null;
  currentView: 'chat' | 'settings';
}

interface AppActions {
  setShowApiKeyModal: (show: boolean, error?: string) => void;
  clearApiKeyError: () => void;
  setCurrentView: (view: 'chat' | 'settings') => void;
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  showApiKeyModal: false,
  apiKeyError: null,
  currentView: 'chat',

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
}));
