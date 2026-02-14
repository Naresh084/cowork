// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSkillStore } from '../../stores/skill-store';
import { useSettingsStore } from '../../stores/settings-store';
import { SkillsHeader } from './SkillsHeader';
import { AvailableTab } from './AvailableTab';
import { InstalledTab } from './InstalledTab';
import { SkillDetailsPanel } from './SkillDetailsPanel';
import { CreateSkillModal } from './CreateSkillModal';
import { motion, AnimatePresence } from 'framer-motion';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SkillsModal({ isOpen, onClose }: SkillsModalProps) {
  const {
    activeTab,
    setActiveTab,
    selectedSkillId,
    discoverSkills,
    selectSkill,
  } = useSkillStore();

  const { defaultWorkingDirectory } = useSettingsStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Discover skills when modal opens
  useEffect(() => {
    if (isOpen) {
      discoverSkills(defaultWorkingDirectory || undefined);
    }
  }, [isOpen, defaultWorkingDirectory, discoverSkills]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't close if create modal is open
        if (isCreateModalOpen) return;

        if (selectedSkillId) {
          selectSkill(null);
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
  }, [isOpen, selectedSkillId, selectSkill, onClose, isCreateModalOpen]);

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
                Skills
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search and Filters */}
            <SkillsHeader onCreateClick={() => setIsCreateModalOpen(true)} />

            {/* Content */}
            <div className="flex-1 flex overflow-hidden relative">
              {/* Main Content */}
              <div
                className={cn(
                  'flex-1 overflow-y-auto transition-all duration-300',
                  selectedSkillId ? 'mr-96' : ''
                )}
              >
                {activeTab === 'available' ? (
                  <AvailableTab />
                ) : (
                  <InstalledTab />
                )}
              </div>

              {/* Details Panel */}
              <AnimatePresence>
                {selectedSkillId && (
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="absolute right-0 top-0 bottom-0 w-96 border-l border-zinc-800 bg-zinc-900"
                  >
                    <SkillDetailsPanel
                      skillId={selectedSkillId}
                      onClose={() => selectSkill(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Create Skill Modal */}
          <CreateSkillModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreated={(skillId) => {
              // Switch to installed tab to show the new skill
              setActiveTab('installed');
              selectSkill(skillId);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
