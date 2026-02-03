import { useState } from 'react';
import { ChatView } from '../chat/ChatView';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { RightPanel } from './RightPanel';
import { useSettingsStore } from '../../stores/settings-store';
import { useAgentStore, type Artifact } from '../../stores/agent-store';
import { useAppStore } from '../../stores/app-store';
import { ToastContainer } from '../ui/Toast';
import { PermissionDialogContainer } from '../dialogs/PermissionDialog';
import { PreviewModal } from '../panels/PreviewPanel';
import { ConnectorsScreen } from '../connectors/ConnectorsScreen';
import { ApiKeyModal } from '../modals/ApiKeyModal';

export type MainView = 'chat' | 'connectors';

export function MainLayout() {
  const [currentView, setCurrentView] = useState<MainView>('chat');
  const { sidebarCollapsed } = useSettingsStore();
  const { previewArtifact, setPreviewArtifact, clearPreviewArtifact } = useAgentStore();
  const { showApiKeyModal, apiKeyError, setShowApiKeyModal } = useAppStore();

  const handlePreviewArtifact = (artifact: Artifact) => {
    setPreviewArtifact(artifact);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0D0D0F] overflow-hidden">
      {/* Title Bar - minimal drag area for macOS */}
      <TitleBar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar isCollapsed={sidebarCollapsed} onNavigate={setCurrentView} />

        {/* Main View */}
        <main className="flex-1 flex flex-col min-w-0">
          {currentView === 'chat' && <ChatView />}
          {currentView === 'connectors' && (
            <ConnectorsScreen onBack={() => setCurrentView('chat')} />
          )}
        </main>

        {/* Right Panel - only show in chat view */}
        {currentView === 'chat' && <RightPanel onPreviewArtifact={handlePreviewArtifact} />}
      </div>

      {/* Toast notifications */}
      <ToastContainer />

      {/* Permission dialogs */}
      <PermissionDialogContainer />

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
    </div>
  );
}
