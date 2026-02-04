import { ChatView } from '../chat/ChatView';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { RightPanel } from './RightPanel';
import { useSettingsStore } from '../../stores/settings-store';
import { useAgentStore, type Artifact } from '../../stores/agent-store';
import { useAppStore } from '../../stores/app-store';
import { ToastContainer } from '../ui/Toast';
import { PreviewModal } from '../panels/PreviewPanel';
import { ApiKeyModal } from '../modals/ApiKeyModal';

export function MainLayout() {
  const { sidebarCollapsed, rightPanelPinned } = useSettingsStore();
  const { previewArtifact, setPreviewArtifact, clearPreviewArtifact } = useAgentStore();
  const { showApiKeyModal, apiKeyError, setShowApiKeyModal } = useAppStore();

  const handlePreviewArtifact = (artifact: Artifact) => {
    setPreviewArtifact(artifact);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0C10] overflow-hidden">
      {/* Title Bar - minimal drag area for macOS */}
      <TitleBar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar isCollapsed={sidebarCollapsed} />

        {/* Main View */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 relative codex-grid codex-vignette overflow-x-hidden">
          <ChatView />
          {!rightPanelPinned && <RightPanel onPreviewArtifact={handlePreviewArtifact} />}
        </main>

        {/* Right Panel */}
        {rightPanelPinned && <RightPanel onPreviewArtifact={handlePreviewArtifact} />}
      </div>

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
    </div>
  );
}
