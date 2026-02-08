import React, { useEffect, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { ChatView } from '../chat/ChatView';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { RightPanel } from './RightPanel';
import { SplitViewLayout } from './SplitViewLayout';
import { useSettingsStore } from '../../stores/settings-store';
import { useSessionStore } from '../../stores/session-store';
import { useAgentStore, type Artifact } from '../../stores/agent-store';
import { useAppStore } from '../../stores/app-store';
import { useAgentEvents } from '../../hooks/useAgentEvents';
import { ToastContainer } from '../ui/Toast';
import { PreviewModal } from '../panels/PreviewPanel';
import { ApiKeyModal } from '../modals/ApiKeyModal';
import { HelpCenterModal } from '../help/HelpCenterModal';
import { GuidedTourOverlay } from '../help/GuidedTourOverlay';
import { useCapabilityStore } from '../../stores/capability-store';
import { WorkflowBuilder } from '../workflow/WorkflowBuilder';

// Lazy load SettingsView for code splitting
const SettingsView = React.lazy(() => import('../settings/SettingsView').then(m => ({ default: m.SettingsView })));

const SETTINGS_TAB_LABELS = {
  provider: 'provider',
  media: 'media',
  capabilities: 'capabilities',
  runtime: 'runtime',
  integrations: 'integrations',
  remote: 'remote',
  souls: 'souls',
} as const;

export function MainLayout() {
  const { sidebarCollapsed, liveViewOpen, closeLiveView } = useSettingsStore();
  const { activeSessionId } = useSessionStore();
  const { previewArtifact, setPreviewArtifact, clearPreviewArtifact } = useAgentStore();
  const {
    showApiKeyModal,
    apiKeyError,
    setShowApiKeyModal,
    currentView,
    settingsTab,
    setCurrentView,
    setSettingsTab,
    startupIssue,
    setStartupIssue,
  } = useAppStore();
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);

  // Close live view when switching sessions
  useEffect(() => {
    if (liveViewOpen) {
      closeLiveView();
    }
    // Only run when activeSessionId changes, not when liveViewOpen changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Keep sidecar event subscription alive across all app views
  useAgentEvents(activeSessionId);

  useEffect(() => {
    void refreshCapabilitySnapshot();
  }, [refreshCapabilitySnapshot]);

  const handlePreviewArtifact = (artifact: Artifact) => {
    setPreviewArtifact(artifact);
  };

  const recoveryLabel =
    startupIssue?.target?.view === 'settings'
      ? `Open ${SETTINGS_TAB_LABELS[startupIssue.target.settingsTab || settingsTab]} settings`
      : startupIssue?.target?.view === 'workflows'
        ? 'Open Workflows'
        : 'Open Chat';

  const handleOpenRecovery = () => {
    if (!startupIssue?.target) return;
    setCurrentView(startupIssue.target.view);
    if (startupIssue.target.view === 'settings' && startupIssue.target.settingsTab) {
      setSettingsTab(startupIssue.target.settingsTab);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0C10] overflow-hidden">
      {/* Title Bar - minimal drag area for macOS */}
      <TitleBar />

      {/* Main Content - Switches between normal and split view layouts */}
      <AnimatePresence mode="wait">
        {liveViewOpen ? (
          <SplitViewLayout key="split-view" />
        ) : (
          <motion.div
            key="normal-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex overflow-hidden"
          >
            {/* Sidebar */}
            <Sidebar isCollapsed={sidebarCollapsed} />

            {/* Main View */}
            <main className="flex-1 flex flex-col min-w-0 min-h-0 relative codex-grid codex-vignette overflow-x-hidden">
              {startupIssue ? (
                <div className="mx-4 mt-3 rounded-xl border border-[#F5C400]/30 bg-[#F5C400]/10 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 mt-0.5 text-[#F5C400] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#FFE58A]">{startupIssue.title}</p>
                      <p className="mt-1 text-xs text-white/80">{startupIssue.message}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={handleOpenRecovery}
                          className="px-3 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#2563EB] transition-colors"
                        >
                          {recoveryLabel}
                        </button>
                        <button
                          onClick={() => setStartupIssue(null)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-xs font-medium hover:bg-white/15 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setStartupIssue(null)}
                      className="p-1 rounded-md text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                      aria-label="Dismiss startup warning"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : null}
              {currentView === 'settings' ? (
                <Suspense fallback={<div className="h-full flex items-center justify-center"><div className="animate-pulse text-white/40">Loading settings...</div></div>}>
                  <SettingsView />
                </Suspense>
              ) : currentView === 'workflows' ? (
                <div className="h-full p-4">
                  <WorkflowBuilder />
                </div>
              ) : (
                <ChatView />
              )}
            </main>

            {/* Right Panel (chat-focused) */}
            {currentView === 'chat' ? (
              <RightPanel onPreviewArtifact={handlePreviewArtifact} />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast notifications */}
      <ToastContainer />

      {/* Preview Modal */}
      <PreviewModal
        file={previewArtifact ? {
          id: previewArtifact.id,
          name: previewArtifact.path.split('/').pop() || previewArtifact.path,
          path: previewArtifact.path,
          content: previewArtifact.content,
          url: previewArtifact.url,
        } : null}
        isOpen={!!previewArtifact}
        onClose={clearPreviewArtifact}
      />

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        errorMessage={apiKeyError}
      />

      {/* Help + Tour overlays */}
      <HelpCenterModal />
      <GuidedTourOverlay />
    </div>
  );
}
