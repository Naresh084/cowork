import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Edit2, Trash2, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessionStore } from '../../stores/session-store';
import { motion, AnimatePresence } from 'framer-motion';

export function SessionHeader() {
  const { activeSessionId, sessions, updateSessionTitle, deleteSession } = useSessionStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const sessionTitle = activeSession?.title || 'New task';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditTitle(sessionTitle);
    setIsEditing(true);
    setIsMenuOpen(false);
  };

  const handleSaveTitle = async () => {
    if (activeSessionId && editTitle.trim()) {
      try {
        await updateSessionTitle(activeSessionId, editTitle.trim());
      } catch (error) {
        console.error('Failed to update session title:', error);
      }
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleDelete = async () => {
    if (activeSessionId) {
      try {
        await deleteSession(activeSessionId);
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
    }
    setIsMenuOpen(false);
  };

  if (!activeSession) {
    return (
      <div className="flex items-center px-4 py-3 border-b border-stone-800">
        <span className="text-stone-400 text-base">No active session</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
      <div className="relative" ref={menuRef}>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveTitle}
              className={cn(
                'px-2 py-1 rounded-lg text-base font-medium',
                'bg-stone-800 border border-stone-700',
                'text-stone-200 placeholder:text-stone-500',
                'focus:outline-none focus:ring-2 focus:ring-orange-500/50'
              )}
            />
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn(
              'flex items-center gap-2 px-2 py-1 -mx-2 rounded-lg',
              'hover:bg-stone-800/50 transition-colors'
            )}
          >
            <span className="text-stone-200 font-medium text-base">
              {sessionTitle}
            </span>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-stone-500 transition-transform',
                isMenuOpen && 'rotate-180'
              )}
            />
          </motion.button>
        )}

        {/* Dropdown Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'absolute left-0 top-full mt-1 z-50',
                'w-48 py-1 bg-stone-900 rounded-lg',
                'border border-stone-800 shadow-xl shadow-black/30'
              )}
            >
              <button
                onClick={handleStartEdit}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-300 hover:bg-stone-800/50 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Rename
              </button>
              <button
                onClick={() => {
                  // TODO: Implement share functionality
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-300 hover:bg-stone-800/50 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <div className="my-1 border-t border-stone-800" />
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-stone-800/50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right side - could add more actions here */}
      <div className="flex items-center gap-2">
        {/* Placeholder for future actions */}
      </div>
    </div>
  );
}
