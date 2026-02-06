import { useEffect, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Onboarding } from './components/onboarding/Onboarding';
import { AutoUpdater } from './components/AutoUpdater';
import { BrandMark } from './components/icons/BrandMark';
import { useAuthStore } from './stores/auth-store';
import { useSessionStore } from './stores/session-store';
import { useSettingsStore } from './stores/settings-store';
import { useSkillStore } from './stores/skill-store';
import { useCommandStore } from './stores/command-store';
import { useSubagentStore } from './stores/subagent-store';

export function App() {
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, initialize, apiKey } = useAuthStore();
  const { loadSessions, hasLoaded, waitForBackend } = useSessionStore();
  const { fetchModels, availableModels, modelsLoading, userName } = useSettingsStore();
  const { discoverSkills } = useSkillStore();
  const { discoverCommands } = useCommandStore();
  const { loadSubagents } = useSubagentStore();

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

      // Initialize auth (reads API key from file storage)
      await initialize().catch((error) => {
        console.error('[App] Initialization error:', error);
      });

      setIsLoading(false);
      clearTimeout(timeoutId);
    };

    run();

    return () => clearTimeout(timeoutId);
  }, [initialize]);

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
      } catch {
        // Backend initialization failed - UI will show appropriate error state
      }
    };

    initBackend();
  }, [isAuthenticated, hasLoaded, waitForBackend, loadSessions, discoverSkills, discoverCommands, loadSubagents]);

  useEffect(() => {
    if (!apiKey || modelsLoading || availableModels.length > 0) return;
    fetchModels(apiKey).catch((error) => {
      console.warn('[App] Failed to fetch models:', error);
    });
  }, [apiKey, availableModels.length, fetchModels, modelsLoading]);

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
