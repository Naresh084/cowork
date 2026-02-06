import { useState } from 'react';
import { FolderOpen, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { useSettingsStore } from '../../stores/settings-store';
import { toast } from '../ui/Toast';

interface WorkingDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelected: (path: string) => void;
}

export function WorkingDirectoryModal({ isOpen, onClose, onSelected }: WorkingDirectoryModalProps) {
  const [isSelecting, setIsSelecting] = useState(false);

  const handleSelectFolder = async () => {
    setIsSelecting(true);
    try {
      const userHome = await homeDir().catch(() => null);
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: userHome || undefined,
        title: 'Select a project folder',
      });

      if (selected && typeof selected === 'string') {
        useSettingsStore.getState().updateSetting('defaultWorkingDirectory', selected);
        toast.success('Working directory set', `Using: ${selected}`);
        onSelected(selected);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error('Failed to select folder', msg);
    } finally {
      setIsSelecting(false);
    }
  };

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
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />

          {/* Modal - centered */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg"
          >
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden">
              {/* Icon header */}
              <div className="flex flex-col items-center pt-10 pb-4 px-8">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center mb-5">
                  <FolderOpen className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-xl font-semibold text-zinc-100 text-center">
                  Select a Working Directory
                </h2>
              </div>

              {/* Body */}
              <div className="px-8 pb-6">
                <p className="text-sm text-zinc-400 text-center leading-relaxed mb-2">
                  A working directory is required to get started. This is the project folder where your files live — all agent actions, memories, and session data will be scoped to this directory.
                </p>
                <p className="text-xs text-zinc-500 text-center mb-8">
                  You can change this later from the input bar at any time.
                </p>

                {/* Action button */}
                <button
                  onClick={handleSelectFolder}
                  disabled={isSelecting}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
                >
                  <FolderOpen className="w-4 h-4" />
                  {isSelecting ? 'Opening...' : 'Choose Project Folder'}
                  {!isSelecting && <ArrowRight className="w-4 h-4 ml-1" />}
                </button>
              </div>

              {/* Footer hint */}
              <div className="px-8 py-4 border-t border-zinc-800 bg-zinc-950/50">
                <p className="text-xs text-zinc-500 text-center">
                  Tip: Pick the root folder of your project (e.g. where package.json or .git lives).
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
