/**
 * SubagentManager - Manage available and enabled subagents
 *
 * Matches CommandManager design exactly with:
 * - Two tabs: Available and Installed
 * - Create Subagent button
 * - Details panel
 * - No marketplace - only built-in and custom subagents
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubagentStore } from '../../stores/subagent-store';
import { useSessionStore } from '../../stores/session-store';
import { SubagentsHeader } from './SubagentsHeader';
import { AvailableSubagentsTab } from './AvailableSubagentsTab';
import { InstalledSubagentsTab } from './InstalledSubagentsTab';
import { SubagentDetailsPanel } from './SubagentDetailsPanel';
import { CreateSubagentModal } from './CreateSubagentModal';
import { motion, AnimatePresence } from 'framer-motion';

interface SubagentManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SubagentManager({ isOpen, onClose }: SubagentManagerProps) {
  const {
    activeTab,
    setActiveTab,
    selectedSubagentName,
    loadSubagents,
    selectSubagent,
  } = useSubagentStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Load subagents when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSubagents(workingDirectory || undefined);
    }
  }, [isOpen, workingDirectory, loadSubagents]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't close if create modal is open
        if (isCreateModalOpen) return;

        if (selectedSubagentName) {
          selectSubagent(null);
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
  }, [isOpen, selectedSubagentName, selectSubagent, onClose, isCreateModalOpen]);

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
                Subagents
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search and Filters */}
            <SubagentsHeader onCreateClick={() => setIsCreateModalOpen(true)} />

            {/* Content */}
            <div className="flex-1 flex overflow-hidden relative">
              {/* Main Content */}
              <div
                className={cn(
                  'flex-1 overflow-y-auto transition-all duration-300',
                  selectedSubagentName ? 'mr-96' : ''
                )}
              >
                {activeTab === 'available' ? (
                  <AvailableSubagentsTab />
                ) : (
                  <InstalledSubagentsTab />
                )}
              </div>

              {/* Details Panel */}
              <AnimatePresence>
                {selectedSubagentName && (
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="absolute right-0 top-0 bottom-0 w-96 border-l border-zinc-800 bg-zinc-900"
                  >
                    <SubagentDetailsPanel
                      subagentName={selectedSubagentName}
                      onClose={() => selectSubagent(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Create Subagent Modal */}
          <CreateSubagentModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreated={(subagentName) => {
              // Switch to installed tab to show the new subagent
              setActiveTab('installed');
              selectSubagent(subagentName);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
