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
      <div className="flex items-center px-4 py-3 border-b border-white/[0.08]">
        <span className="text-white/50 text-base">No active session</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-[#0D0D0F]/50">
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
                'px-3 py-1.5 rounded-xl text-base font-medium',
                'bg-[#151518] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:ring-2 focus:ring-[#6B6EF0]/50',
                'transition-all'
              )}
            />
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn(
              'flex items-center gap-2 px-2 py-1 -mx-2 rounded-xl',
              'hover:bg-white/[0.06] transition-colors'
            )}
          >
            <span className="text-white/90 font-medium text-base">
              {sessionTitle}
            </span>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-white/40 transition-transform',
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
                'w-48 py-1 bg-[#1A1A1E] rounded-xl',
                'border border-white/[0.08] shadow-2xl shadow-black/40'
              )}
            >
              <button
                onClick={handleStartEdit}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Rename
              </button>
              <button
                onClick={() => {
                  // TODO: Implement share functionality
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <div className="my-1 border-t border-white/[0.08]" />
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF5449] hover:bg-[#FF5449]/10 transition-colors"
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
