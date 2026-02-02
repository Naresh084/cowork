import { useEffect, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Onboarding } from './components/onboarding/Onboarding';
import { useAuthStore } from './stores/auth-store';
import { useSessionStore } from './stores/session-store';

export function App() {
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, initialize } = useAuthStore();
  const { loadSessions } = useSessionStore();

  useEffect(() => {
    console.log('[App] Starting initialization...');
    initialize()
      .then(() => {
        console.log('[App] Auth initialized, loading sessions...');
        return loadSessions();
      })
      .then(() => {
        console.log('[App] Sessions loaded successfully');
      })
      .catch((error) => {
        console.error('[App] Initialization error:', error);
      })
      .finally(() => {
        console.log('[App] Setting isLoading to false');
        setIsLoading(false);
      });
  }, [initialize, loadSessions]);

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
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Onboarding />;
  }

  return <MainLayout />;
}
