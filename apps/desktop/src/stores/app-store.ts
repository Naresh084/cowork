import { create } from 'zustand';
import { WORKFLOWS_ENABLED } from '../lib/feature-flags';

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
  startupIssueFingerprint: string | null;
  startupIssueSetAt: number;
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

function sanitizeAppView(view: AppView): AppView {
  if (!WORKFLOWS_ENABLED && view === 'workflows') {
    return 'chat';
  }

  return view;
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  showApiKeyModal: false,
  apiKeyError: null,
  currentView: 'chat',
  settingsTab: 'provider',
  startupIssue: null,
  startupIssueFingerprint: null,
  startupIssueSetAt: 0,
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
      currentView: sanitizeAppView(view),
    }),

  setSettingsTab: (tab) =>
    set({
      settingsTab: tab,
    }),

  setStartupIssue: (issue) =>
    set((state) => {
      if (!issue?.target) {
        return { startupIssue: issue, startupIssueFingerprint: null, startupIssueSetAt: 0 };
      }

      const fingerprint = [
        issue.title.trim().toLowerCase(),
        issue.message.trim().toLowerCase(),
        issue.target.view,
        issue.target.settingsTab || '',
      ].join('::');
      const timestamp = Date.now();
      const duplicateWithinCooldown =
        state.startupIssueFingerprint === fingerprint && timestamp - state.startupIssueSetAt < 4_000;

      if (duplicateWithinCooldown) {
        return {};
      }

      const nextState: Partial<AppState> = {
        startupIssue: issue,
        startupIssueFingerprint: fingerprint,
        startupIssueSetAt: timestamp,
        currentView: sanitizeAppView(issue.target.view),
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
