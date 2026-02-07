import { useEffect, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Onboarding } from './components/onboarding/Onboarding';
import { AutoUpdater } from './components/AutoUpdater';
import { BrandMark } from './components/icons/BrandMark';
import { useAuthStore } from './stores/auth-store';
import { useSessionStore } from './stores/session-store';
import { resolveActiveSoul, useSettingsStore } from './stores/settings-store';
import { useSkillStore } from './stores/skill-store';
import { useCommandStore } from './stores/command-store';
import { useSubagentStore } from './stores/subagent-store';
import { useCronStore } from './stores/cron-store';
import type { ProviderId } from './stores/auth-store';

export function App() {
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, initialize, apiKey, activeProvider, applyRuntimeConfig } = useAuthStore();
  const { loadSessions, hasLoaded, waitForBackend } = useSessionStore();
  const { fetchProviderModels, availableModels, modelsLoading, userName, loadSoulProfiles } =
    useSettingsStore();
  const { discoverSkills } = useSkillStore();
  const { discoverCommands } = useCommandStore();
  const { loadSubagents } = useSubagentStore();
  const { loadJobs: loadCronJobs } = useCronStore();

  // Initialize auth + wait for settings hydration, then hide loading
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsLoading(false);
    }, 4000);

    const run = async () => {
      // Wait for settings store to hydrate from localStorage
      if (!useSettingsStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = useSettingsStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
        });
      }

      const hydratedProvider = useSettingsStore.getState().activeProvider;
      await useAuthStore.getState().setActiveProvider(hydratedProvider);
      const persistedBaseUrls = useSettingsStore.getState().providerBaseUrls;
      for (const [provider, baseUrl] of Object.entries(persistedBaseUrls)) {
        if (!baseUrl) continue;
        await useAuthStore.getState().setProviderBaseUrl(provider as ProviderId, baseUrl);
      }

      // Initialize auth (reads API key from file storage)
      await initialize().catch((error) => {
        console.error('[App] Initialization error:', error);
      });

      await loadSoulProfiles().catch(() => undefined);
      const refreshedSettings = useSettingsStore.getState();
      const activeSoul = resolveActiveSoul(
        refreshedSettings.souls,
        refreshedSettings.activeSoulId,
        refreshedSettings.defaultSoulId,
      );
      await applyRuntimeConfig({
        activeProvider: refreshedSettings.activeProvider,
        providerBaseUrls: refreshedSettings.providerBaseUrls,
        externalSearchProvider: refreshedSettings.externalSearchProvider,
        mediaRouting: refreshedSettings.mediaRouting,
        specializedModels: refreshedSettings.specializedModelsV2,
        sandbox: refreshedSettings.commandSandbox,
        activeSoul,
      }).catch(() => undefined);

      setIsLoading(false);
      clearTimeout(timeoutId);
    };

    run();

    return () => clearTimeout(timeoutId);
  }, [initialize, loadSoulProfiles]);

  // Coordinate backend initialization with session loading
  useEffect(() => {
    if (!isAuthenticated || hasLoaded) return;

    const initBackend = async () => {
      try {
        await waitForBackend();
        await loadSessions();
        await discoverSkills();
        await discoverCommands();
        await loadSubagents();
        await loadCronJobs();
      } catch {
        // Backend initialization failed - UI will show appropriate error state
      }
    };

    initBackend();
  }, [isAuthenticated, hasLoaded, waitForBackend, loadSessions, discoverSkills, discoverCommands, loadSubagents, loadCronJobs]);

  useEffect(() => {
    if ((!apiKey && activeProvider !== 'lmstudio') || modelsLoading || availableModels.length > 0) return;
    fetchProviderModels(activeProvider).catch((error) => {
      console.warn('[App] Failed to fetch models:', error);
    });
  }, [activeProvider, apiKey, availableModels.length, fetchProviderModels, modelsLoading]);

  // Detect system theme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      document.documentElement.classList.toggle('dark', mediaQuery.matches);
    };

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <BrandMark className="w-12 h-12 animate-pulse" />
          <p className="text-sm text-white/70">Initializing…</p>
        </div>
      </div>
    );
  }

  // Show onboarding if not authenticated OR if userName is not set
  if (!isAuthenticated || !userName) {
    return <Onboarding />;
  }

  return (
    <>
      <MainLayout />
      <AutoUpdater />
    </>
  );
}
