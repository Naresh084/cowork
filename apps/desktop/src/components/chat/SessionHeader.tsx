import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { ChevronDown, Edit2, Trash2, Share2, Plug, Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessionStore } from '../../stores/session-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '../ui/Toast';
import { invoke } from '@tauri-apps/api/core';
import type { ApprovalMode } from '../../stores/settings-store';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/Dialog';

const APPROVAL_MODES: Array<{ id: ApprovalMode; label: string; description: string }> = [
  { id: 'auto', label: 'Auto', description: 'Ask only when needed' },
  { id: 'read_only', label: 'Read-only', description: 'No writes or commands' },
  { id: 'full', label: 'Full', description: 'Allow local actions' },
];

export function SessionHeader() {
  const { activeSessionId, sessions, updateSessionTitle, deleteSession } = useSessionStore();
  const { approvalMode, updateSetting } = useSettingsStore();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [pendingMode, setPendingMode] = useState<ApprovalMode | null>(null);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Helper functions
  const truncate = (str: string, len: number) =>
    str.length > len ? str.slice(0, len) + '...' : str;

  const formatRelativeDate = (ts: number | undefined) => {
    if (!ts) return '';
    const days = Math.floor((Date.now() - ts) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const sessionTitle = activeSession?.title ||
    (activeSession?.firstMessage ? truncate(activeSession.firstMessage, 40) : 'New conversation');

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

  // Sync approval mode to sidecar when session changes or mode updates
  useEffect(() => {
    if (!activeSessionId) return;
    if (typeof window === 'undefined' || !('__TAURI__' in window)) return;
    invoke('agent_set_approval_mode', {
      sessionId: activeSessionId,
      mode: approvalMode,
    }).catch((error) => {
      console.error('[SessionHeader] Failed to set approval mode', error);
    });
  }, [activeSessionId, approvalMode]);

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
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error('Failed to update session title', errorMessage);
      }
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error('Failed to delete session', errorMessage);
      }
    }
    setIsMenuOpen(false);
  };

  const handleShare = async () => {
    if (!activeSession) {
      setIsMenuOpen(false);
      return;
    }

    try {
      const sessionInfo = {
        title: activeSession.title,
        id: activeSession.id,
        workingDirectory: activeSession.workingDirectory || 'Not set',
        model: activeSession.model || 'Default',
        createdAt: activeSession.createdAt
          ? new Date(activeSession.createdAt).toLocaleString()
          : 'Unknown',
      };

      const shareText = `Session: ${sessionInfo.title}\nWorking Directory: ${sessionInfo.workingDirectory}\nModel: ${sessionInfo.model}\nCreated: ${sessionInfo.createdAt}`;

      await navigator.clipboard.writeText(shareText);
      toast.success('Copied to clipboard', 'Session info has been copied');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to copy', errorMessage);
    }
    setIsMenuOpen(false);
  };

  const handleModeChange = (mode: ApprovalMode) => {
    if (mode === approvalMode) return;
    if (mode === 'auto') {
      updateSetting('approvalMode', mode);
      return;
    }
    setPendingMode(mode);
    setModeDialogOpen(true);
  };

  const confirmModeChange = () => {
    if (!pendingMode) return;
    updateSetting('approvalMode', pendingMode);
    setPendingMode(null);
    setModeDialogOpen(false);
  };

  const cancelModeChange = () => {
    setPendingMode(null);
    setModeDialogOpen(false);
  };

  const modeStyles: Record<ApprovalMode, { active: string; ring: string }> = {
    auto: { active: 'bg-[#4C71FF] text-white', ring: 'bg-[#4C71FF]/15 text-[#8CA2FF]' },
    read_only: { active: 'bg-[#F5C400] text-[#1A1A1E]', ring: 'bg-[#F5C400]/15 text-[#F5C400]' },
    full: { active: 'bg-[#FF5449] text-white', ring: 'bg-[#FF5449]/15 text-[#FF5449]' },
  };

  if (!activeSession) {
    return (
      <div className="flex items-center px-4 py-3 border-b border-white/[0.06]">
        <span className="text-white/50 text-sm">No active session</span>
      </div>
    );
  }

  const connectionLabel = authLoading
    ? 'Connecting'
    : isAuthenticated
      ? 'Connected'
      : 'No API key';

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-transparent">
      <div className="flex items-center gap-4 min-w-0">
        <div className="relative min-w-0" ref={menuRef}>
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
                  'px-3 py-1.5 rounded-lg text-sm font-medium',
                  'bg-[#111218] border border-white/[0.10]',
                  'text-white/90 placeholder:text-white/30',
                  'focus:outline-none focus:ring-2 focus:ring-[#4C71FF]/40',
                  'transition-all'
                )}
              />
            </div>
          ) : (
            <div className="flex flex-col">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={cn(
                  'flex items-center gap-2 px-2 py-1 -mx-2 rounded-lg',
                  'hover:bg-white/[0.06] transition-colors'
                )}
              >
                <span className="text-white/90 font-medium text-sm truncate max-w-[360px]">
                  {sessionTitle}
                </span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-white/40 transition-transform',
                    isMenuOpen && 'rotate-180'
                  )}
                />
              </motion.button>
              <div className="flex items-center gap-2 text-[11px] text-white/40 px-2 -mt-0.5">
                <span>{activeSession?.model || 'gemini-3-flash-preview'}</span>
                <span>•</span>
                <span>{formatRelativeDate(activeSession?.createdAt)}</span>
              </div>
            </div>
          )}

          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -5, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute left-0 top-full mt-2 z-50',
                  'w-48 py-1 bg-[#111218] rounded-xl',
                  'border border-white/[0.08] shadow-2xl shadow-black/40'
                )}
              >
                <button
                  onClick={handleStartEdit}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06]"
                >
                  <Edit2 className="w-4 h-4" />
                  Rename
                </button>
                <button
                  onClick={handleShare}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06]"
                >
                  <Share2 className="w-4 h-4" />
                  Copy details
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF5449] hover:bg-white/[0.06]"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs',
          isAuthenticated ? 'bg-[#0F1B33] text-[#8CA2FF]' : 'bg-[#1A1A1E] text-white/50'
        )}>
          <Plug className="w-3.5 h-3.5" />
          {connectionLabel}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-full bg-[#111218] border border-white/[0.08]">
          {APPROVAL_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleModeChange(mode.id)}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-medium transition-colors',
                approvalMode === mode.id
                  ? modeStyles[mode.id].active
                  : 'text-white/50 hover:text-white/80'
              )}
              title={mode.description}
            >
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {mode.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={modeDialogOpen} onClose={cancelModeChange}>
        <DialogHeader>
          <DialogTitle>Change approval mode?</DialogTitle>
          <DialogDescription>
            {pendingMode === 'full'
              ? 'Full mode allows local file writes and command execution. Only enable if you trust the task.'
              : 'Read-only mode blocks writes and command execution. Use this when you want safe inspection only.'}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2">
          <div
            className={cn(
              'flex items-start gap-3 rounded-xl p-3 text-sm',
              pendingMode === 'full' ? modeStyles.full.ring : modeStyles.read_only.ring
            )}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <div>
              <p className="font-medium">
                {pendingMode === 'full' ? 'Higher impact actions enabled.' : 'Writes and commands will be blocked.'}
              </p>
              <p className="text-xs text-white/50 mt-1">
                You can switch back anytime from the header.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={cancelModeChange}
            className="px-4 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/[0.06]"
          >
            Cancel
          </button>
          <button
            onClick={confirmModeChange}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              pendingMode === 'full'
                ? 'bg-[#FF5449] text-white hover:bg-[#E54840]'
                : 'bg-[#F5C400] text-[#1A1A1E] hover:bg-[#E0B400]'
            )}
          >
            Confirm
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
