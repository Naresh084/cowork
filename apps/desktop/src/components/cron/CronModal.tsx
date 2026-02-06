import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCronStore, useCronModalState } from '@/stores/cron-store';
import { CronJobList } from './CronJobList';
import { CronJobEditor } from './CronJobEditor';
import { CronRunHistory } from './CronRunHistory';

interface CronModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CronModal({ isOpen, onClose }: CronModalProps) {
  const loadJobs = useCronStore((state) => state.loadJobs);
  const startCreate = useCronStore((state) => state.startCreate);
  const closeEditor = useCronStore((state) => state.closeEditor);
  const closeHistory = useCronStore((state) => state.closeHistory);
  const { editorMode, historyJobId } = useCronModalState();

  // Load jobs when modal opens
  useEffect(() => {
    if (isOpen) {
      loadJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editorMode) {
          closeEditor();
        } else if (historyJobId) {
          closeHistory();
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
  }, [isOpen, editorMode, historyJobId, closeEditor, closeHistory, onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (editorMode) {
        closeEditor();
      } else if (historyJobId) {
        closeHistory();
      } else {
        onClose();
      }
    }
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
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              'w-[680px] max-h-[85vh] overflow-hidden rounded-2xl',
              'bg-[#111218] border border-white/[0.08]',
              'shadow-2xl shadow-black/60',
              'flex flex-col'
            )}
          >
            {/* Show editor, history, or list based on state */}
            <AnimatePresence mode="wait">
              {editorMode ? (
                <CronJobEditor key="editor" />
              ) : historyJobId ? (
                <CronRunHistory key="history" />
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col h-full"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#1D4ED8]/15 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-[#60A5FA]" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white/90">
                          Automations
                        </h2>
                        <p className="text-xs text-white/40">
                          Run tasks automatically on a schedule
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={startCreate}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2 rounded-lg',
                          'bg-[#1D4ED8] text-white text-sm font-medium',
                          'hover:bg-[#3B82F6] transition-colors'
                        )}
                      >
                        <Plus className="w-4 h-4" />
                        New Task
                      </motion.button>
                      <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-y-auto p-6">
                    <CronJobList />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
