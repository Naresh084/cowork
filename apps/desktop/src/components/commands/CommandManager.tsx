/**
 * CommandManager - Marketplace-style command management
 *
 * Shows available and installed slash commands in a marketplace UI.
 * Users can browse, install, uninstall, and create custom commands.
 */

import { useState, useEffect } from 'react';
import { X, Terminal, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCommandStore } from '../../stores/command-store';
import { useSettingsStore } from '../../stores/settings-store';
import { CommandsHeader } from './CommandsHeader';
import { CommandGrid } from './CommandGrid';
import { CommandDetailsPanel } from './CommandDetailsPanel';
import { CreateCommandModal } from './CreateCommandModal';

interface CommandManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandManager({ isOpen, onClose }: CommandManagerProps) {
  const {
    discoverCommands,
    getFilteredCommands,
    installCommand,
    selectCommand,
    selectedCommandId,
    isDiscovering,
    error,
  } = useCommandStore();

  const { defaultWorkingDirectory } = useSettingsStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Discover commands when modal opens
  useEffect(() => {
    if (isOpen) {
      discoverCommands(defaultWorkingDirectory || undefined);
    }
  }, [isOpen, defaultWorkingDirectory, discoverCommands]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedCommandId) {
          selectCommand(null);
        } else if (isCreateModalOpen) {
          setIsCreateModalOpen(false);
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
  }, [isOpen, selectedCommandId, isCreateModalOpen, selectCommand, onClose]);

  if (!isOpen) return null;

  const filteredCommands = getFilteredCommands();

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
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] md:w-[calc(100vw-4rem)] md:h-[calc(100vh-4rem)] lg:w-[calc(100vw-6rem)] lg:h-[calc(100vh-6rem)] -translate-x-1/2 -translate-y-1/2 bg-zinc-900 rounded-xl flex flex-col overflow-hidden border border-zinc-800 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#1D4ED8]/20 flex items-center justify-center">
                  <Terminal className="w-5 h-5 text-[#1D4ED8]" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">
                    Slash Commands
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Install and manage command shortcuts
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filters Header */}
            <CommandsHeader onCreateClick={() => setIsCreateModalOpen(true)} />

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Main Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {isDiscovering ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                    <p className="text-zinc-400">Loading commands...</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16 text-red-400">
                    <p className="text-lg mb-2">Failed to load commands</p>
                    <p className="text-sm text-zinc-500">{error}</p>
                  </div>
                ) : (
                  <CommandGrid
                    commands={filteredCommands}
                    onSelect={(commandId) => selectCommand(commandId)}
                    onInstall={(commandId) => installCommand(commandId)}
                  />
                )}

                {/* Tip */}
                <div className="mt-6 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-300 font-medium">Tip:</span>{' '}
                    Type "/" in chat to use installed commands. You can add additional instructions after any command.
                    For example: <code className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">/init focus on the API layer</code>
                  </p>
                </div>
              </div>

              {/* Details Panel */}
              <AnimatePresence>
                {selectedCommandId && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 350, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="border-l border-zinc-800 bg-zinc-900/50 overflow-hidden"
                  >
                    <CommandDetailsPanel
                      commandId={selectedCommandId}
                      onClose={() => selectCommand(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Create Command Modal */}
          <CreateCommandModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
          />
        </>
      )}
    </AnimatePresence>
  );
}
