import { create } from 'zustand';

interface AppState {
  showApiKeyModal: boolean;
  apiKeyError: string | null;
}

interface AppActions {
  setShowApiKeyModal: (show: boolean, error?: string) => void;
  clearApiKeyError: () => void;
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  showApiKeyModal: false,
  apiKeyError: null,

  setShowApiKeyModal: (show, error) =>
    set({
      showApiKeyModal: show,
      apiKeyError: error || null,
    }),

  clearApiKeyError: () =>
    set({
      apiKeyError: null,
    }),
}));
