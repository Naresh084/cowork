import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  MessageSquare,
  Trash2,
  MoreHorizontal,
  Puzzle,
  ChevronDown,
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  Copy,
  LogOut,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessionStore } from '../../stores/session-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '../ui/Toast';
import type { MainView } from './MainLayout';

interface SidebarProps {
  isCollapsed: boolean;
  onNavigate: (view: MainView) => void;
}

export function Sidebar({ isCollapsed, onNavigate }: SidebarProps) {
  const {
    sessions,
    activeSessionId,
    isLoading,
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
  } = useSessionStore();

  const { defaultWorkingDirectory, mcpServers } = useSettingsStore();
  const { apiKey } = useAuthStore();

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Close session menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (sessionMenuId) {
        setSessionMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sessionMenuId]);

  const handleNewTask = async () => {
    try {
      const workingDir = defaultWorkingDirectory || '/';
      await createSession(workingDir);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to create session', errorMessage);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setSessionMenuId(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to delete session', errorMessage);
    }
  };

  // Collapsed view
  if (isCollapsed) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'w-14 flex flex-col',
          'bg-[#0D0D0F] border-r border-white/[0.08]'
        )}
      >
        {/* New Task Button */}
        <div className="p-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleNewTask}
            className={cn(
              'w-10 h-10 flex items-center justify-center rounded-xl',
              'bg-gradient-to-r from-[#4F52D9] to-[#6B6EF0]',
              'text-white shadow-lg shadow-[#6B6EF0]/25',
              'hover:shadow-xl hover:shadow-[#6B6EF0]/35',
              'transition-all duration-200'
            )}
            title="New task"
          >
            <Plus className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Sessions List (icons only) */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          <div className="space-y-1">
            <AnimatePresence>
              {sessions.map((session, index) => (
                <motion.button
                  key={session.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                  onClick={() => selectSession(session.id)}
                  className={cn(
                    'w-10 h-10 flex items-center justify-center rounded-xl',
                    'transition-all duration-150',
                    activeSessionId === session.id
                      ? 'bg-[#1A1A1E] text-[#8B8EFF]'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  )}
                  title={session.title || 'New task'}
                >
                  <MessageSquare className="w-4 h-4" />
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Plugins Button */}
        <div className="p-2 border-t border-white/[0.08]">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('connectors')}
            className={cn(
              'relative w-10 h-10 flex items-center justify-center rounded-xl',
              'text-white/40 hover:text-white/70 hover:bg-white/[0.04]',
              'transition-all duration-150'
            )}
            title="Plugins"
          >
            <Puzzle className="w-4 h-4" />
            {enabledMcpCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-[#6B6EF0] text-white text-[10px] font-medium">
                {enabledMcpCount}
              </span>
            )}
          </motion.button>
        </div>

        {/* Profile Section */}
        <div className="p-2 border-t border-white/[0.08]">
          <motion.button
            ref={profileButtonRef}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className={cn(
              'w-10 h-10 flex items-center justify-center rounded-xl',
              'hover:bg-white/[0.04] transition-colors',
              profileMenuOpen && 'bg-white/[0.08]'
            )}
            title="Profile & Settings"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6B6EF0] to-[#8A62C2] flex items-center justify-center">
              <span className="text-white text-xs font-bold">N</span>
            </div>
          </motion.button>
        </div>

        <AnimatePresence>
          {profileMenuOpen && (
            <ProfileMenu
              apiKey={apiKey}
              onOpenConnectors={() => {
                setProfileMenuOpen(false);
                onNavigate('connectors');
              }}
              onClose={() => setProfileMenuOpen(false)}
              buttonRef={profileButtonRef}
              isCollapsed={true}
            />
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // Expanded view
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'w-64 flex flex-col',
        'bg-[#0D0D0F] border-r border-white/[0.08]'
      )}
    >
      {/* New Task Button */}
      <div className="p-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleNewTask}
          disabled={isLoading}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl',
            'bg-gradient-to-r from-[#4F52D9] to-[#6B6EF0]',
            'text-white font-medium text-sm',
            'shadow-lg shadow-[#6B6EF0]/25',
            'hover:shadow-xl hover:shadow-[#6B6EF0]/35',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200'
          )}
        >
          <Plus className="w-4 h-4" />
          New task
        </motion.button>
      </div>

      {/* Recents Section */}
      <div className="flex-1 overflow-y-auto px-2">
        <h3 className="text-xs font-medium text-white/50 px-2 py-2">Recents</h3>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-white/40 text-sm">Loading...</div>
          </div>
        ) : sessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-8 text-center px-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-white/30" />
            </div>
            <p className="text-sm text-white/50">No tasks yet</p>
            <p className="text-xs text-white/30 mt-1">Create a new task to get started</p>
          </motion.div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence>
              {sessions.map((session, index) => (
                <SessionItem
                  key={session.id}
                  id={session.id}
                  title={session.title || 'New task'}
                  firstMessage={session.firstMessage}
                  createdAt={session.createdAt}
                  isActive={activeSessionId === session.id}
                  isMenuOpen={sessionMenuId === session.id}
                  index={index}
                  onSelect={() => selectSession(session.id)}
                  onMenuToggle={() => setSessionMenuId(sessionMenuId === session.id ? null : session.id)}
                  onDelete={() => handleDeleteSession(session.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Helper text */}
        <p className="text-xs text-white/25 px-2 py-4">
          These tasks run locally and aren't synced across devices
        </p>
      </div>

      {/* Plugins Button */}
      <button
        onClick={() => onNavigate('connectors')}
        className={cn(
          'flex items-center gap-3 px-4 py-3 mx-2 mb-2 rounded-xl',
          'text-white/50 hover:text-white/80 hover:bg-white/[0.04]',
          'transition-all duration-150'
        )}
      >
        <Puzzle className="w-4 h-4" />
        <span className="text-sm font-medium">Plugins</span>
        {enabledMcpCount > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-[#6B6EF0]/20 text-[#8B8EFF] text-xs font-medium">
            {enabledMcpCount}
          </span>
        )}
      </button>

      {/* Profile Section */}
      <div className="p-3 border-t border-white/[0.08]">
        <motion.button
          ref={profileButtonRef}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          className={cn(
            'w-full flex items-center gap-3 p-2 rounded-xl',
            'hover:bg-white/[0.04] transition-colors',
            profileMenuOpen && 'bg-white/[0.08]'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6B6EF0] to-[#8A62C2] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">N</span>
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium text-white/90 truncate">Naresh</div>
            <div className="text-xs text-white/40 truncate">
              {apiKey ? 'API Connected' : 'Not configured'}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-white/40 transition-transform',
              profileMenuOpen && 'rotate-180'
            )}
          />
        </motion.button>
      </div>

      <AnimatePresence>
        {profileMenuOpen && (
          <ProfileMenu
            apiKey={apiKey}
            onOpenConnectors={() => {
              setProfileMenuOpen(false);
              onNavigate('connectors');
            }}
            onClose={() => setProfileMenuOpen(false)}
            buttonRef={profileButtonRef}
            isCollapsed={false}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function formatRelativeDate(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface SessionItemProps {
  id: string;
  title: string;
  firstMessage: string | null;
  createdAt: number;
  isActive: boolean;
  isMenuOpen: boolean;
  index: number;
  onSelect: () => void;
  onMenuToggle: () => void;
  onDelete: () => void;
}

function SessionItem({
  title,
  firstMessage,
  createdAt,
  isActive,
  isMenuOpen,
  index,
  onSelect,
  onMenuToggle,
  onDelete,
}: SessionItemProps) {
  const displayTitle = title !== 'New task'
    ? title
    : (firstMessage ? truncate(firstMessage, 30) : 'New conversation');
  const dateStr = formatRelativeDate(createdAt);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className={cn(
        'group relative flex items-center rounded-xl',
        'transition-all duration-150',
        isActive
          ? 'bg-white/[0.06] border-l-2 border-[#6B6EF0]'
          : 'hover:bg-white/[0.03]'
      )}
    >
      <button
        onClick={onSelect}
        className={cn(
          'flex-1 flex flex-col gap-0.5 px-3 py-2',
          'text-left',
          isActive ? 'text-white/90' : 'text-white/50 hover:text-white/80'
        )}
      >
        <span className="text-sm truncate">{displayTitle}</span>
        <span className="text-xs text-white/40">{dateStr}</span>
      </button>

      {/* Actions menu */}
      <div className="relative pr-2">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle();
          }}
          className={cn(
            'p-1.5 rounded-lg',
            'opacity-0 group-hover:opacity-100',
            'text-white/30 hover:text-white/70 hover:bg-white/[0.08]',
            'transition-all duration-150',
            isMenuOpen && 'opacity-100 bg-white/[0.08] text-white/70'
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </motion.button>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -5 }}
              className="absolute right-0 top-full mt-1 z-50 w-32 py-1 bg-[#1A1A1E] rounded-lg border border-white/[0.08] shadow-xl"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF5449] hover:bg-white/[0.04] transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

interface ProfileMenuProps {
  apiKey: string | null;
  onOpenConnectors: () => void;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
  isCollapsed: boolean;
}

function ProfileMenu({ apiKey, onOpenConnectors, onClose, buttonRef, isCollapsed }: ProfileMenuProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const { setApiKey, clearApiKey } = useAuthStore();

  const maskedApiKey = apiKey
    ? `${apiKey.slice(0, 6)}${'•'.repeat(20)}${apiKey.slice(-4)}`
    : 'Not configured';

  // Calculate position based on button location
  useEffect(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      if (isCollapsed) {
        // Position to the right of the button
        setMenuPosition({
          top: rect.bottom - 300, // Align bottom of menu with bottom of button area
          left: rect.right + 8,
        });
      } else {
        // Position above the button
        setMenuPosition({
          top: rect.top - 320, // Menu height approximately
          left: rect.left,
        });
      }
    }
  }, [buttonRef, isCollapsed]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, buttonRef]);

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) return;
    try {
      await setApiKey(newApiKey);
      setIsEditingKey(false);
      setNewApiKey('');
      toast.success('API key updated');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to save API key', errorMessage);
    }
  };

  const handleCopyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      toast.success('API key copied to clipboard');
    }
  };

  const handleLogout = async () => {
    try {
      await clearApiKey();
      toast.success('Logged out successfully');
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to logout', errorMessage);
    }
  };

  const menuContent = (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: Math.max(10, menuPosition.top),
        left: menuPosition.left,
        zIndex: 9999,
      }}
      className={cn(
        'w-72',
        'bg-[#1A1A1E] border border-white/[0.12]',
        'rounded-xl shadow-2xl shadow-black/50',
      )}
    >
        {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6B6EF0] to-[#8A62C2] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">N</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white/90">Naresh</div>
            <div className="text-xs text-white/40 flex items-center gap-1">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                apiKey ? 'bg-green-500' : 'bg-yellow-500'
              )} />
              {apiKey ? 'API Connected' : 'Not configured'}
            </div>
          </div>
        </div>
      </div>

      <div className="p-2 space-y-1">
        {/* API Key Section */}
        <div className="px-2 py-2">
          <label className="text-xs text-white/40 mb-1.5 block">Gemini API Key</label>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 px-2.5 py-1.5 bg-[#0D0D0F] rounded-lg text-xs text-white/50 font-mono truncate border border-white/[0.08]">
              {showApiKey && apiKey ? apiKey : maskedApiKey}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowApiKey(!showApiKey)}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
              title={showApiKey ? 'Hide API Key' : 'Show API Key'}
            >
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </motion.button>
            {apiKey && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopyApiKey}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
                title="Copy API Key"
              >
                <Copy className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mx-2" />

        {/* Edit API Key */}
        {isEditingKey ? (
          <div className="px-2 py-2 space-y-2">
            <input
              type="password"
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              placeholder="Enter new API key..."
              className={cn(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[#0D0D0F] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:ring-2 focus:ring-[#6B6EF0]/50'
              )}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveApiKey();
                if (e.key === 'Escape') {
                  setIsEditingKey(false);
                  setNewApiKey('');
                }
              }}
            />
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveApiKey}
                disabled={!newApiKey.trim()}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm',
                  'bg-[#6B6EF0] hover:bg-[#8B8EFF] text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <Check className="w-3.5 h-3.5" />
                Save
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setIsEditingKey(false);
                  setNewApiKey('');
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/[0.06] hover:bg-white/[0.10] text-white/70"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </motion.button>
            </div>
          </div>
        ) : (
          <>
            {/* Menu Items */}
            <button
              onClick={() => setIsEditingKey(true)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                'text-white/70 hover:text-white hover:bg-white/[0.06]',
                'transition-colors'
              )}
            >
              <Key className="w-4 h-4" />
              {apiKey ? 'Change API Key' : 'Add API Key'}
            </button>

            <button
              onClick={onOpenConnectors}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                'text-white/70 hover:text-white hover:bg-white/[0.06]',
                'transition-colors'
              )}
            >
              <Puzzle className="w-4 h-4" />
              Plugins & Connectors
            </button>

            <button
              onClick={() => toast.info('Settings coming soon')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                'text-white/70 hover:text-white hover:bg-white/[0.06]',
                'transition-colors'
              )}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>

            {/* Divider */}
            <div className="h-px bg-white/[0.06] mx-2 my-1" />

            {/* Logout */}
            {apiKey && (
              <button
                onClick={handleLogout}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                  'text-red-400 hover:text-red-300 hover:bg-red-500/10',
                  'transition-colors'
                )}
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );

  // Use portal to render outside sidebar DOM
  return createPortal(menuContent, document.body);
}
