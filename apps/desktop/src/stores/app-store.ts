import { create } from 'zustand';

interface AppState {
  showApiKeyModal: boolean;
  apiKeyError: string | null;
  showChromeExtensionModal: boolean;
}

interface AppActions {
  setShowApiKeyModal: (show: boolean, error?: string) => void;
  clearApiKeyError: () => void;
  setShowChromeExtensionModal: (show: boolean) => void;
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  showApiKeyModal: false,
  apiKeyError: null,
  showChromeExtensionModal: false,

  setShowApiKeyModal: (show, error) =>
    set({
      showApiKeyModal: show,
      apiKeyError: error || null,
    }),

  clearApiKeyError: () =>
    set({
      apiKeyError: null,
    }),

  setShowChromeExtensionModal: (show) =>
    set({
      showChromeExtensionModal: show,
    }),
}));
