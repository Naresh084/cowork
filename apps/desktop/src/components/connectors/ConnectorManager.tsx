import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectorStore } from '../../stores/connector-store';
import { useSettingsStore } from '../../stores/settings-store';
import { ConnectorsHeader } from './ConnectorsHeader';
import { AvailableTab } from './AvailableTab';
import { InstalledTab } from './InstalledTab';
import { ConnectorDetailsPanel } from './ConnectorDetailsPanel';
import { ConfigureSecretsModal } from './ConfigureSecretsModal';
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
        // Don't close if configure modal is open
        if (configureConnectorId) return;

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
  }, [isOpen, selectedConnectorId, selectConnector, onClose, configureConnectorId]);

  // Get selected connector state for the configure modal
  const selectedState = selectedConnectorId ? getConnectorState(selectedConnectorId) : undefined;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-4 md:inset-8 lg:inset-16 bg-zinc-900 rounded-xl z-50 flex flex-col overflow-hidden border border-zinc-800 shadow-2xl"
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
            <ConnectorsHeader />

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Main Content */}
              <div
                className={cn(
                  'flex-1 overflow-y-auto transition-all duration-300',
                  selectedConnectorId ? 'mr-96' : ''
                )}
              >
                {activeTab === 'available' ? (
                  <AvailableTab />
                ) : (
                  <InstalledTab onConfigure={(id) => setConfigureConnectorId(id)} />
                )}
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
                      onConfigure={() => setConfigureConnectorId(selectedConnectorId)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Configure Secrets Modal */}
          {configureConnectorId && selectedState && (
            <ConfigureSecretsModal
              isOpen={!!configureConnectorId}
              onClose={() => setConfigureConnectorId(null)}
              connector={selectedState.manifest}
              onConfigured={() => {
                setConfigureConnectorId(null);
                // Switch to installed tab to show the configured connector
                setActiveTab('installed');
              }}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}
