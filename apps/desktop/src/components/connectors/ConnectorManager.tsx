import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectorStore } from '../../stores/connector-store';
import { useSettingsStore } from '../../stores/settings-store';
import { ConnectorsHeader } from './ConnectorsHeader';
import { AvailableTab } from './AvailableTab';
import { InstalledTab } from './InstalledTab';
import { ConnectorAppsTab } from './ConnectorAppsTab';
import { ConnectorDetailsPanel } from './ConnectorDetailsPanel';
import { ConfigureSecretsModal } from './ConfigureSecretsModal';
import { OAuthFlowModal } from './OAuthFlowModal';
import { CreateConnectorModal } from './CreateConnectorModal';
import { motion, AnimatePresence } from 'framer-motion';

interface ConnectorManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectorManager({ isOpen, onClose }: ConnectorManagerProps) {
  const {
    activeTab,
    setActiveTab,
    selectedConnectorId,
    discoverConnectors,
    selectConnector,
    getConnectorState,
  } = useConnectorStore();

  const { defaultWorkingDirectory } = useSettingsStore();
  const [configureConnectorId, setConfigureConnectorId] = useState<string | null>(null);
  const [oauthConnectorId, setOAuthConnectorId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Discover connectors when modal opens
  useEffect(() => {
    if (isOpen) {
      discoverConnectors(defaultWorkingDirectory || undefined);
    }
  }, [isOpen, defaultWorkingDirectory, discoverConnectors]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't close if any modal is open
        if (configureConnectorId || oauthConnectorId || isCreateModalOpen) return;

        if (selectedConnectorId) {
          selectConnector(null);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, selectedConnectorId, selectConnector, onClose, configureConnectorId, oauthConnectorId, isCreateModalOpen]);

  // Get OAuth connector state for the OAuth modal
  const oauthConnectorState = oauthConnectorId ? getConnectorState(oauthConnectorId) : undefined;

  // Get configure connector state for the secrets modal
  const configureConnectorState = configureConnectorId ? getConnectorState(configureConnectorId) : undefined;

  // Handle configure action - routes to appropriate modal based on auth type
  const handleConfigure = (connectorId: string) => {
    const state = getConnectorState(connectorId);
    if (!state) return;

    if (state.manifest.auth.type === 'oauth') {
      setOAuthConnectorId(connectorId);
    } else {
      setConfigureConnectorId(connectorId);
    }
  };

  const handleConnectorInstalled = (connectorId: string) => {
    setActiveTab('installed');
    selectConnector(connectorId);
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] md:w-[calc(100vw-4rem)] md:h-[calc(100vh-4rem)] lg:w-[calc(100vw-8rem)] lg:h-[calc(100vh-8rem)] bg-zinc-900 rounded-xl flex flex-col overflow-hidden border border-zinc-800 shadow-2xl shadow-black/60"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-100">
                Connectors
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search and Filters */}
            <ConnectorsHeader onAddCustom={() => setIsCreateModalOpen(true)} />

            {/* Content */}
            <div className="flex-1 flex overflow-hidden relative">
              {/* Main Content */}
              <div
                className={cn(
                  'flex-1 overflow-y-auto transition-all duration-300',
                  selectedConnectorId ? 'mr-96' : ''
                )}
              >
                {activeTab === 'available' && <AvailableTab />}
                {activeTab === 'installed' && <InstalledTab onConfigure={handleConfigure} />}
                {activeTab === 'apps' && <ConnectorAppsTab />}
              </div>

              {/* Details Panel */}
              <AnimatePresence>
                {selectedConnectorId && (
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="absolute right-0 top-0 bottom-0 w-96 border-l border-zinc-800 bg-zinc-900"
                  >
                    <ConnectorDetailsPanel
                      connectorId={selectedConnectorId}
                      onClose={() => selectConnector(null)}
                      onConfigure={handleConfigure}
                      onInstalled={handleConnectorInstalled}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Configure Secrets Modal */}
          {configureConnectorId && configureConnectorState && (
            <ConfigureSecretsModal
              isOpen={!!configureConnectorId}
              onClose={() => setConfigureConnectorId(null)}
              connector={configureConnectorState.manifest}
              onConfigured={() => {
                setConfigureConnectorId(null);
                // Switch to installed tab to show the configured connector
                setActiveTab('installed');
              }}
            />
          )}

          {/* OAuth Flow Modal */}
          {oauthConnectorId && oauthConnectorState && (
            <OAuthFlowModal
              isOpen={!!oauthConnectorId}
              onClose={() => setOAuthConnectorId(null)}
              connector={oauthConnectorState.manifest}
              onSuccess={() => {
                setOAuthConnectorId(null);
                // Switch to installed tab to show the connected connector
                setActiveTab('installed');
                // Refresh connectors to update status
                discoverConnectors(defaultWorkingDirectory || undefined);
              }}
            />
          )}

          {/* Create Custom Connector Modal */}
          <CreateConnectorModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreated={() => {
              setIsCreateModalOpen(false);
              // Refresh connectors to include the new one
              discoverConnectors(defaultWorkingDirectory || undefined);
              // Switch to installed tab to show the new connector
              setActiveTab('installed');
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
