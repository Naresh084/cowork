import { useEffect, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Onboarding } from './components/onboarding/Onboarding';
import { AutoUpdater } from './components/AutoUpdater';
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

  useEffect(() => {
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    }, 4000);

    initialize()
      .catch((error) => {
        console.error('[App] Initialization error:', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
        clearTimeout(timeoutId);
      });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
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

  if (isLoading && !isAuthenticated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-white/40 border-t-transparent rounded-full animate-spin" />
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
