import { create } from 'zustand';

export type AppView = 'chat' | 'settings' | 'workflows';
export type SettingsTab =
  | 'provider'
  | 'media'
  | 'capabilities'
  | 'runtime'
  | 'integrations'
  | 'souls'
  | 'remote';

export interface StartupIssue {
  title: string;
  message: string;
  target?: {
    view: AppView;
    settingsTab?: SettingsTab;
  };
}

interface AppState {
  showApiKeyModal: boolean;
  apiKeyError: string | null;
  currentView: AppView;
  settingsTab: SettingsTab;
  startupIssue: StartupIssue | null;
  runtimeConfigNotice: {
    requiresNewSession: boolean;
    reasons: string[];
    affectedSessionIds: string[];
  } | null;
}

interface AppActions {
  setShowApiKeyModal: (show: boolean, error?: string) => void;
  clearApiKeyError: () => void;
  setCurrentView: (view: AppView) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setStartupIssue: (issue: StartupIssue | null) => void;
  setRuntimeConfigNotice: (notice: AppState['runtimeConfigNotice']) => void;
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  showApiKeyModal: false,
  apiKeyError: null,
  currentView: 'chat',
  settingsTab: 'provider',
  startupIssue: null,
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

  setSettingsTab: (tab) =>
    set({
      settingsTab: tab,
    }),

  setStartupIssue: (issue) =>
    set(() => {
      if (!issue?.target) {
        return { startupIssue: issue };
      }

      const nextState: Partial<AppState> = {
        startupIssue: issue,
        currentView: issue.target.view,
      };

      if (issue.target.view === 'settings' && issue.target.settingsTab) {
        nextState.settingsTab = issue.target.settingsTab;
      }

      return nextState;
    }),

  setRuntimeConfigNotice: (notice) =>
    set({
      runtimeConfigNotice: notice,
    }),
}));
