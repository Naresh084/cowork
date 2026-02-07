import React, { useEffect, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

export function MainLayout() {
  const { sidebarCollapsed, liveViewOpen, closeLiveView } = useSettingsStore();
  const { activeSessionId } = useSessionStore();
  const { previewArtifact, setPreviewArtifact, clearPreviewArtifact } = useAgentStore();
  const { showApiKeyModal, apiKeyError, setShowApiKeyModal, currentView } = useAppStore();
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

            {/* Right Panel */}
            <RightPanel onPreviewArtifact={handlePreviewArtifact} />
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
