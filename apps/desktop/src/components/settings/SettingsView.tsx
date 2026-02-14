// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  Settings2,
  SlidersHorizontal,
  KeyRound,
  Image,
  CircleHelp,
  Sparkles,
  Bot,
  Smartphone,
  Wrench,
  LogOut,
  Loader2,
  Cpu,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import { useAppStore, type SettingsTab } from '../../stores/app-store';
import { useIntegrationStore } from '../../stores/integration-store';
import { useHelpStore } from '../../stores/help-store';
import { useCapabilityStore } from '../../stores/capability-store';
import { toast } from '@/components/ui/Toast';
import { useSettingsStore } from '@/stores/settings-store';
import { useSessionStore } from '@/stores/session-store';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { GeneralSettings } from './GeneralSettings';
import { ApiKeysSettings } from './ApiKeysSettings';
import { IntegrationSettings } from './IntegrationSettings';
import { CapabilitySettings } from './CapabilitySettings';
import { RuntimeSettings } from './RuntimeSettings';
import { SoulSettings } from './SoulSettings';
import { RemoteAccessSettings } from './RemoteAccessSettings';
import { BenchmarkDashboard } from '@/components/benchmark/BenchmarkDashboard';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string; color?: string }>;
  color?: string;
}

const tabConfig: TabConfig[] = [
  { id: 'provider', label: 'Provider', icon: KeyRound },
  { id: 'media', label: 'Media', icon: Image },
  { id: 'capabilities', label: 'Capabilities', icon: Wrench },
  { id: 'runtime', label: 'Runtime', icon: Cpu },
  { id: 'benchmarks', label: 'Benchmarks', icon: BarChart3 },
  { id: 'integrations', label: 'Integrations', icon: SlidersHorizontal },
  { id: 'remote', label: 'Remote', icon: Smartphone },
  { id: 'souls', label: 'Souls', icon: Bot },
];

const tabContent: Record<SettingsTab, React.ComponentType> = {
  provider: ApiKeysSettings,
  media: GeneralSettings,
  capabilities: CapabilitySettings,
  runtime: RuntimeSettings,
  benchmarks: BenchmarkDashboard,
  integrations: IntegrationSettings,
  remote: RemoteAccessSettings,
  souls: SoulSettings,
};

export function SettingsView() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const activeTab = useAppStore((s) => s.settingsTab);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const uxProfile = useSettingsStore((s) => s.uxProfile);
  const setUxProfile = useSettingsStore((s) => s.setUxProfile);
  const platforms = useIntegrationStore((s) => s.platforms);
  const openHelp = useHelpStore((s) => s.openHelp);
  const startTour = useHelpStore((s) => s.startTour);
  const refreshCapabilitySnapshot = useCapabilityStore((s) => s.refreshSnapshot);
  const visibleTabs = useMemo(() => {
    if (uxProfile === 'pro') {
      return tabConfig;
    }
    const allowed = new Set<SettingsTab>(['provider', 'runtime', 'benchmarks']);
    return tabConfig.filter((tab) => allowed.has(tab.id));
  }, [uxProfile]);

  useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === activeTab)) {
      return;
    }
    const fallback = visibleTabs[0]?.id || 'provider';
    setSettingsTab(fallback);
  }, [activeTab, setSettingsTab, visibleTabs]);

  // Refresh platform statuses while integrations tab is active.
  useEffect(() => {
    const store = useIntegrationStore.getState();
    if (activeTab === 'integrations') {
      store.refreshStatuses();
    }
    void refreshCapabilitySnapshot();

    const interval = setInterval(() => {
      if (useAppStore.getState().settingsTab === 'integrations') {
        void useIntegrationStore.getState().refreshStatuses();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, refreshCapabilitySnapshot]);

  const resolvedTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id || 'provider');
  const ActiveContent = tabContent[resolvedTab];
  const handleLogout = async () => {
    if (isLoggingOut) return;

    const confirmed = window.confirm(
      [
        'Sign out and reset this device?',
        '',
        'This will:',
        '- Delete all saved API keys and provider credentials.',
        '- Reset provider/model/settings stored in this desktop app.',
        '- Remove local Cowork data at ~/.cowork (sessions, policies, schedules, pairings).',
        '',
        'This cannot be undone. Continue?',
      ].join('\n'),
    );
    if (!confirmed) return;

    setIsLoggingOut(true);
    try {
      await invoke('auth_logout_and_cleanup');

      await Promise.all([
        useSettingsStore.persist.clearStorage(),
        useSessionStore.persist.clearStorage(),
        useHelpStore.persist.clearStorage(),
      ]);

      useChatStore.setState({ sessions: {}, error: null });
      useSessionStore.setState({
        sessions: [],
        activeSessionId: null,
        isLoading: false,
        hasLoaded: false,
        error: null,
        backendInitialized: false,
      });
      useSettingsStore.getState().resetSettings();
      useAuthStore.setState({
        isAuthenticated: false,
        apiKey: null,
        providerApiKeys: {},
        providerBaseUrls: {},
        googleApiKey: null,
        openaiApiKey: null,
        falApiKey: null,
        exaApiKey: null,
        tavilyApiKey: null,
        stitchApiKey: null,
        activeSoul: null,
        error: null,
      });

      toast.success('Signed out. Reloading setup…');
      window.setTimeout(() => {
        window.location.reload();
      }, 250);
    } catch (error) {
      toast.error('Failed to sign out', error instanceof Error ? error.message : String(error));
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0E0F13]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.08]">
        <button
          onClick={() => setCurrentView('chat')}
          className="p-2 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-[#93C5FD]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white/90">Settings</h1>
            <p className="text-xs text-white/40">Configure models and integrations</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2" data-tour-id="settings-help-actions">
          <div className="inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setUxProfile('simple')}
              className={cn(
                'rounded-md px-2 py-1 text-xs transition-colors',
                uxProfile === 'simple'
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-white/65 hover:text-white/85',
              )}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setUxProfile('pro')}
              className={cn(
                'rounded-md px-2 py-1 text-xs transition-colors',
                uxProfile === 'pro'
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-white/65 hover:text-white/85',
              )}
            >
              Pro
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors',
              isLoggingOut
                ? 'border-[#FF5449]/25 text-[#FF5449]/60 cursor-not-allowed bg-[#FF5449]/10'
                : 'border-[#FF5449]/35 text-[#FF8A80] hover:bg-[#FF5449]/14',
            )}
          >
            {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            {isLoggingOut ? 'Signing out…' : 'Logout'}
          </button>
          <button
            type="button"
            onClick={() => openHelp('platform-overview')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.05] hover:text-white/90"
          >
            <CircleHelp className="w-3.5 h-3.5" />
            Help Center
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsTab('provider');
              startTour('settings', true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.05] hover:text-white/90"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Start Guided Tour
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-white/[0.08] overflow-x-auto" data-tour-id="settings-tab-nav">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isConnected =
            tab.id === 'integrations' &&
            (
              platforms.whatsapp?.connected ||
              platforms.slack?.connected ||
              platforms.telegram?.connected ||
              platforms.discord?.connected ||
              platforms.imessage?.connected ||
              platforms.teams?.connected
            );

          return (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              data-tour-id={`settings-tab-${tab.id}`}
              className={cn(
                'relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors shrink-0 whitespace-nowrap',
                isActive
                  ? 'bg-white/[0.08] text-white/90'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
              )}
            >
              <Icon
                className="w-4 h-4"
                color={tab.color && isActive ? tab.color : undefined}
              />
              <span>{tab.label}</span>
              {tab.id === 'integrations' && (
                <div
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    isConnected
                      ? ''
                      : 'border border-white/20'
                  )}
                  style={
                    isConnected
                      ? {
                          backgroundColor: '#22C55E',
                          boxShadow: '0 0 4px 1px rgba(34, 197, 94, 0.35)',
                        }
                      : undefined
                  }
                />
              )}
            </button>
          );
        })}
      </div>
      {uxProfile === 'simple' ? (
        <div className="border-b border-white/[0.06] px-6 py-2 text-xs text-white/45">
          Simple profile hides advanced controls. Switch to <span className="text-white/75">Pro</span> for full settings.
        </div>
      ) : null}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-4 py-5 lg:px-6" data-tour-id="settings-content-region">
          <AnimatePresence mode="wait">
            <motion.div
              key={resolvedTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <ActiveContent />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
