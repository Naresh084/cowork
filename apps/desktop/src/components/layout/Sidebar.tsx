import { useState, useRef, useEffect } from 'react';
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
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessionStore } from '../../stores/session-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { motion, AnimatePresence } from 'framer-motion';
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
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
      // Close session menu when clicking outside
      if (sessionMenuId) {
        setSessionMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen, sessionMenuId]);

  const handleNewTask = async () => {
    try {
      const workingDir = defaultWorkingDirectory || '/';
      await createSession(workingDir);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setSessionMenuId(null);
    } catch (error) {
      console.error('Failed to delete session:', error);
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
          'bg-stone-950 border-r border-stone-800'
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
              'bg-gradient-to-r from-orange-600 to-orange-500',
              'text-white shadow-lg shadow-orange-600/20',
              'hover:shadow-xl hover:shadow-orange-600/30',
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
                      ? 'bg-stone-800 text-orange-400'
                      : 'text-stone-500 hover:text-stone-300 hover:bg-stone-800/50'
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
        <div className="p-2 border-t border-stone-800">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('connectors')}
            className={cn(
              'relative w-10 h-10 flex items-center justify-center rounded-xl',
              'text-stone-500 hover:text-stone-300 hover:bg-stone-800/50',
              'transition-all duration-150'
            )}
            title="Plugins"
          >
            <Puzzle className="w-4 h-4" />
            {enabledMcpCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-medium">
                {enabledMcpCount}
              </span>
            )}
          </motion.button>
        </div>

        {/* Profile Section */}
        <div className="p-2 border-t border-stone-800" ref={profileMenuRef}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className={cn(
              'w-10 h-10 flex items-center justify-center rounded-xl',
              'hover:bg-stone-800/50 transition-colors',
              profileMenuOpen && 'bg-stone-800'
            )}
            title="Profile"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">N</span>
            </div>
          </motion.button>

          <AnimatePresence>
            {profileMenuOpen && (
              <ProfileMenu
                apiKey={apiKey}
                onOpenConnectors={() => {
                  setProfileMenuOpen(false);
                  onNavigate('connectors');
                }}
                position="collapsed"
              />
            )}
          </AnimatePresence>
        </div>
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
        'bg-stone-950 border-r border-stone-800'
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
            'bg-gradient-to-r from-orange-600 to-orange-500',
            'text-white font-medium text-sm',
            'shadow-lg shadow-orange-600/20',
            'hover:shadow-xl hover:shadow-orange-600/30',
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
        <h3 className="text-xs font-medium text-stone-500 px-2 py-2">Recents</h3>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-stone-500 text-sm">Loading...</div>
          </div>
        ) : sessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-8 text-center px-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-stone-800/50 flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-stone-600" />
            </div>
            <p className="text-sm text-stone-400">No tasks yet</p>
            <p className="text-xs text-stone-600 mt-1">Create a new task to get started</p>
          </motion.div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence>
              {sessions.map((session, index) => (
                <SessionItem
                  key={session.id}
                  id={session.id}
                  title={session.title || 'New task'}
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
        <p className="text-xs text-stone-600 px-2 py-4">
          These tasks run locally and aren't synced across devices
        </p>
      </div>

      {/* Plugins Button */}
      <button
        onClick={() => onNavigate('connectors')}
        className={cn(
          'flex items-center gap-3 px-4 py-3 mx-2 mb-2 rounded-xl',
          'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50',
          'transition-all duration-150'
        )}
      >
        <Puzzle className="w-4 h-4" />
        <span className="text-sm font-medium">Plugins</span>
        {enabledMcpCount > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium">
            {enabledMcpCount}
          </span>
        )}
      </button>

      {/* Profile Section */}
      <div className="p-3 border-t border-stone-800" ref={profileMenuRef}>
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          className={cn(
            'w-full flex items-center gap-3 p-2 rounded-xl',
            'hover:bg-stone-800/50 transition-colors',
            profileMenuOpen && 'bg-stone-800'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">N</span>
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium text-stone-200 truncate">Naresh</div>
            <div className="text-xs text-stone-500 truncate">
              {apiKey ? 'API Connected' : 'Not configured'}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-stone-500 transition-transform',
              profileMenuOpen && 'rotate-180'
            )}
          />
        </motion.button>

        <AnimatePresence>
          {profileMenuOpen && (
            <ProfileMenu
              apiKey={apiKey}
              onOpenConnectors={() => {
                setProfileMenuOpen(false);
                onNavigate('connectors');
              }}
              position="expanded"
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

interface SessionItemProps {
  id: string;
  title: string;
  isActive: boolean;
  isMenuOpen: boolean;
  index: number;
  onSelect: () => void;
  onMenuToggle: () => void;
  onDelete: () => void;
}

function SessionItem({
  title,
  isActive,
  isMenuOpen,
  index,
  onSelect,
  onMenuToggle,
  onDelete,
}: SessionItemProps) {
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
          ? 'bg-stone-800/50 border-l-2 border-orange-500'
          : 'hover:bg-stone-800/30'
      )}
    >
      <button
        onClick={onSelect}
        className={cn(
          'flex-1 flex items-center gap-2.5 px-3 py-2',
          'text-left text-sm truncate',
          isActive ? 'text-stone-200' : 'text-stone-400 hover:text-stone-200'
        )}
      >
        <MessageSquare
          className={cn(
            'w-4 h-4 flex-shrink-0',
            isActive ? 'text-orange-400' : 'text-stone-600'
          )}
        />
        <span className="flex-1 truncate">{title}</span>
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
            'text-stone-500 hover:text-stone-300 hover:bg-stone-700',
            'transition-all duration-150',
            isMenuOpen && 'opacity-100 bg-stone-700 text-stone-300'
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
              className="absolute right-0 top-full mt-1 z-50 w-32 py-1 bg-stone-800 rounded-lg border border-stone-700 shadow-xl"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-stone-700/50 transition-colors"
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
  position: 'collapsed' | 'expanded';
}

function ProfileMenu({ apiKey, onOpenConnectors, position }: ProfileMenuProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const { setApiKey } = useAuthStore();

  const maskedApiKey = apiKey
    ? `${apiKey.slice(0, 6)}${'•'.repeat(20)}${apiKey.slice(-4)}`
    : 'Not configured';

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) return;
    try {
      await setApiKey(newApiKey);
      setIsEditingKey(false);
      setNewApiKey('');
    } catch (error) {
      console.error('Failed to save API key:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'absolute bottom-full mb-2 z-50',
        'bg-stone-900 border border-stone-800',
        'rounded-xl shadow-2xl shadow-black/40',
        'overflow-hidden',
        position === 'collapsed' ? 'left-0 w-72' : 'left-0 right-0'
      )}
    >
      <div className="p-3 space-y-3">
        {/* API Key Section */}
        <div>
          <label className="text-xs text-stone-500 mb-1.5 block">API Key</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-stone-950 rounded-lg text-sm text-stone-400 font-mono truncate border border-stone-800">
              {showApiKey && apiKey ? apiKey : maskedApiKey}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowApiKey(!showApiKey)}
              className="p-2 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-stone-300 transition-colors"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </motion.button>
          </div>
        </div>

        {/* Edit API Key */}
        {isEditingKey ? (
          <div className="space-y-2">
            <input
              type="password"
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              placeholder="Enter new API key..."
              className={cn(
                'w-full px-3 py-2.5 rounded-lg text-sm',
                'bg-stone-950 border border-stone-800',
                'text-stone-200 placeholder:text-stone-600',
                'focus:outline-none focus:ring-2 focus:ring-orange-500/50'
              )}
              autoFocus
            />
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveApiKey}
                disabled={!newApiKey.trim()}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm',
                  'bg-orange-600 hover:bg-orange-500 text-white',
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
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-stone-800 hover:bg-stone-700 text-stone-300"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </motion.button>
            </div>
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsEditingKey(true)}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm',
              'bg-stone-800 hover:bg-stone-700 text-stone-300',
              'transition-colors'
            )}
          >
            <Key className="w-4 h-4" />
            Update API Key
          </motion.button>
        )}

        {/* Connectors Link */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onOpenConnectors}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm',
            'bg-stone-800 hover:bg-stone-700 text-stone-300',
            'transition-colors'
          )}
        >
          <span className="flex items-center gap-2">
            <Puzzle className="w-4 h-4" />
            Manage Connectors
          </span>
          <ExternalLink className="w-3.5 h-3.5 text-stone-500" />
        </motion.button>
      </div>
    </motion.div>
  );
}
