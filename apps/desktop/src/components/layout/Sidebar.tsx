import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  MessageSquare,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  Copy,
  LogOut,
  Settings,
  Settings2,
  Puzzle,
  Calendar,
  Terminal,
  Bot,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessionStore, type SessionSummary } from '../../stores/session-store';
import { useChatStore } from '../../stores/chat-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { useAppStore } from '../../stores/app-store';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '../ui/Toast';
import { BrandMark } from '../icons/BrandMark';
import { WorkingDirectoryModal } from './WorkingDirectoryModal';
// ModelSettingsModal moved to SettingsView
import { SkillsModal } from '../skills/SkillsModal';
import { useSkillStore } from '../../stores/skill-store';
import { CronModal } from '../cron/CronModal';
import { useCronActiveJobCount, useCronStore } from '../../stores/cron-store';
import { CommandManager } from '../commands/CommandManager';
import { useCommandStore } from '../../stores/command-store';
import { SubagentManager } from '../subagents/SubagentManager';
import { useSubagentStore } from '../../stores/subagent-store';
import { ConnectorManager } from '../connectors/ConnectorManager';
import { useConnectorStore } from '../../stores/connector-store';

interface SidebarProps {
  isCollapsed: boolean;
}

export function Sidebar({ isCollapsed }: SidebarProps) {
  const {
    sessions,
    activeSessionId,
    isLoading,
    hasLoaded,
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
  } = useSessionStore();

  const {
    defaultWorkingDirectory,
    selectedModel,
    availableModels,
    modelsLoading,
    sessionListFilters,
    toggleSessionListFilter,
  } = useSettingsStore();
  const { apiKey } = useAuthStore();
  const chatSessions = useChatStore((state) => state.sessions);

  const isLiveSession = (sessionId: string) => {
    const session = chatSessions[sessionId];
    if (!session) return false;
    const hasRunningTool = session.chatItems.some(
      (ci) => ci.kind === 'tool_start' && ci.status === 'running'
    );
    return session.isStreaming || session.pendingPermissions.length > 0 || hasRunningTool;
  };

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null);
  const [sessionMenuPosition, setSessionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [commandsModalOpen, setCommandsModalOpen] = useState(false);
  const [subagentsModalOpen, setSubagentsModalOpen] = useState(false);
  const [connectorsModalOpen, setConnectorsModalOpen] = useState(false);
  const [workingDirModalOpen, setWorkingDirModalOpen] = useState(false);
  const pendingWorkingDirCallback = useRef<((path: string) => void) | null>(null);

  // Cron store - use store state so right panel "Create one" / icon also opens the modal
  const activeJobCount = useCronActiveJobCount();
  const cronModalOpen = useCronStore((state) => state.isModalOpen);
  const openCronModal = useCronStore((state) => state.openModal);
  const closeCronModal = useCronStore((state) => state.closeModal);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const sessionMenuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Skills store
  const { getEnabledCount } = useSkillStore();
  const enabledSkillsCount = getEnabledCount();

  // Commands store - show INSTALLED command count
  // Subscribe to availableCommands for reactivity
  const availableCommands = useCommandStore((s) => s.availableCommands);
  // Compute installed count - re-renders when availableCommands changes
  const commandCount = availableCommands.filter((c) => c.source.type === 'managed').length;

  // Subagents store - show INSTALLED count, not total
  // Subscribe to subagents array for reactivity when it changes
  const { subagents } = useSubagentStore();
  const installedSubagentCount = subagents.filter((s) => s.installed).length;

  // Connectors store - show CONNECTED count
  const { getConnectedCount } = useConnectorStore();
  const connectedConnectorCount = getConnectedCount();

  // Load sessions on mount
  useEffect(() => {
    if (!hasLoaded) {
      loadSessions();
    }
  }, [hasLoaded, loadSessions]);

  // Close session menu when clicking outside
  useEffect(() => {
    if (!sessionMenuId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // Check if click is inside the menu
      if (sessionMenuRef.current?.contains(target)) {
        return;
      }

      // Check if click is on a menu button
      const buttonRef = sessionMenuButtonRefs.current.get(sessionMenuId);
      if (buttonRef?.contains(target)) {
        return;
      }

      setSessionMenuId(null);
      setSessionMenuPosition(null);
    };

    // Use setTimeout to avoid the initial click that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [sessionMenuId]);

  const handleSessionMenuToggle = useCallback((sessionId: string, buttonElement: HTMLButtonElement | null) => {
    if (sessionMenuId === sessionId) {
      setSessionMenuId(null);
      setSessionMenuPosition(null);
    } else {
      if (buttonElement) {
        const rect = buttonElement.getBoundingClientRect();
        setSessionMenuPosition({
          top: rect.bottom + 4,
          left: rect.right - 140, // Menu width is ~140px
        });
        sessionMenuButtonRefs.current.set(sessionId, buttonElement);
      }
      setSessionMenuId(sessionId);
    }
  }, [sessionMenuId]);

  const startSessionWithDir = useCallback(async (workingDir: string) => {
    try {
      const selectedIsValid = selectedModel && availableModels.some((m) => m.id === selectedModel);
      const modelToUse = selectedIsValid ? selectedModel : availableModels[0]?.id;

      if (!modelToUse) {
        const message = modelsLoading
          ? 'Models are still loading. Try again in a moment.'
          : 'No models available. Check your API key and model access.';
        toast.error('No model available', message);
        return;
      }

      await createSession(workingDir, modelToUse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to create session', errorMessage);
    }
  }, [selectedModel, availableModels, modelsLoading, createSession]);

  const handleNewTask = async () => {
    if (defaultWorkingDirectory) {
      await startSessionWithDir(defaultWorkingDirectory);
    } else {
      // Show centered modal to select working directory
      pendingWorkingDirCallback.current = (path: string) => {
        startSessionWithDir(path);
      };
      setWorkingDirModalOpen(true);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setSessionMenuId(null);
      setSessionMenuPosition(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error('Failed to delete session', errorMessage);
    }
  };

  const showExpandedOverlay = isCollapsed && isHovering;

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => isCollapsed && setIsHovering(true)}
      onMouseLeave={() => isCollapsed && setIsHovering(false)}
    >
      {isCollapsed ? (
        <SidebarRail
          sessions={sessions}
          activeSessionId={activeSessionId}
          apiKey={apiKey}
          onNewTask={handleNewTask}
          onSelectSession={selectSession}
          isLiveSession={isLiveSession}
          onOpenProfile={() => setProfileMenuOpen(!profileMenuOpen)}
          onCloseProfile={() => setProfileMenuOpen(false)}
          profileButtonRef={profileButtonRef}
          profileMenuOpen={profileMenuOpen}
          onOpenSkills={() => setSkillsModalOpen(true)}
          enabledSkillsCount={enabledSkillsCount}
          onOpenCron={() => openCronModal()}
          activeJobCount={activeJobCount}
          onOpenCommands={() => setCommandsModalOpen(true)}
          commandCount={commandCount}
          onOpenSubagents={() => setSubagentsModalOpen(true)}
          subagentCount={installedSubagentCount}
          onOpenConnectors={() => setConnectorsModalOpen(true)}
          connectorCount={connectedConnectorCount}
          sessionListFilters={sessionListFilters}
        />
      ) : (
        <SidebarExpanded
          sessions={sessions}
          activeSessionId={activeSessionId}
          isLoading={isLoading}
          apiKey={apiKey}
          sessionMenuId={sessionMenuId}
          sessionMenuPosition={sessionMenuPosition}
          sessionMenuRef={sessionMenuRef}
          profileButtonRef={profileButtonRef}
          profileMenuOpen={profileMenuOpen}
          onNewTask={handleNewTask}
          onSelectSession={selectSession}
          isLiveSession={isLiveSession}
          onToggleSessionMenu={handleSessionMenuToggle}
          onDeleteSession={handleDeleteSession}
          onOpenProfile={() => setProfileMenuOpen(!profileMenuOpen)}
          onCloseProfile={() => setProfileMenuOpen(false)}
          isOverlay={false}
          onOpenSkills={() => setSkillsModalOpen(true)}
          enabledSkillsCount={enabledSkillsCount}
          onOpenCron={() => openCronModal()}
          activeJobCount={activeJobCount}
          onOpenCommands={() => setCommandsModalOpen(true)}
          commandCount={commandCount}
          onOpenSubagents={() => setSubagentsModalOpen(true)}
          subagentCount={installedSubagentCount}
          onOpenConnectors={() => setConnectorsModalOpen(true)}
          connectorCount={connectedConnectorCount}
          sessionListFilters={sessionListFilters}
          onToggleSessionListFilter={toggleSessionListFilter}
        />
      )}

      {/* Skills Modal */}
      <SkillsModal
        isOpen={skillsModalOpen}
        onClose={() => setSkillsModalOpen(false)}
      />

      {/* Cron Modal */}
      <CronModal
        isOpen={cronModalOpen}
        onClose={() => closeCronModal()}
      />

      {/* Commands Modal */}
      <CommandManager
        isOpen={commandsModalOpen}
        onClose={() => setCommandsModalOpen(false)}
      />

      {/* Subagents Modal */}
      <SubagentManager
        isOpen={subagentsModalOpen}
        onClose={() => setSubagentsModalOpen(false)}
      />

      {/* Connectors Modal */}
      <ConnectorManager
        isOpen={connectorsModalOpen}
        onClose={() => setConnectorsModalOpen(false)}
      />

      {/* Working Directory Selection Modal */}
      <WorkingDirectoryModal
        isOpen={workingDirModalOpen}
        onClose={() => {
          setWorkingDirModalOpen(false);
          pendingWorkingDirCallback.current = null;
        }}
        onSelected={(path) => {
          setWorkingDirModalOpen(false);
          if (pendingWorkingDirCallback.current) {
            pendingWorkingDirCallback.current(path);
            pendingWorkingDirCallback.current = null;
          }
        }}
      />

      <AnimatePresence>
        {showExpandedOverlay && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="absolute inset-y-0 left-0 z-40"
          >
            <SidebarExpanded
              sessions={sessions}
              activeSessionId={activeSessionId}
              isLoading={isLoading}
              apiKey={apiKey}
              sessionMenuId={sessionMenuId}
              sessionMenuPosition={sessionMenuPosition}
              sessionMenuRef={sessionMenuRef}
              profileButtonRef={profileButtonRef}
              profileMenuOpen={profileMenuOpen}
              onNewTask={handleNewTask}
              onSelectSession={selectSession}
              isLiveSession={isLiveSession}
              onToggleSessionMenu={handleSessionMenuToggle}
              onDeleteSession={handleDeleteSession}
              onOpenProfile={() => setProfileMenuOpen(!profileMenuOpen)}
              onCloseProfile={() => setProfileMenuOpen(false)}
              isOverlay={true}
              onOpenSkills={() => setSkillsModalOpen(true)}
              enabledSkillsCount={enabledSkillsCount}
              onOpenCron={() => openCronModal()}
              activeJobCount={activeJobCount}
              onOpenCommands={() => setCommandsModalOpen(true)}
              commandCount={commandCount}
              onOpenSubagents={() => setSubagentsModalOpen(true)}
              subagentCount={installedSubagentCount}
              onOpenConnectors={() => setConnectorsModalOpen(true)}
              connectorCount={connectedConnectorCount}
              sessionListFilters={sessionListFilters}
              onToggleSessionListFilter={toggleSessionListFilter}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SidebarRailProps {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  apiKey: string | null;
  onNewTask: () => void;
  onSelectSession: (id: string) => void;
  isLiveSession: (id: string) => boolean;
  onOpenProfile: () => void;
  onCloseProfile: () => void;
  profileButtonRef: RefObject<HTMLButtonElement>;
  profileMenuOpen: boolean;
  onOpenSkills: () => void;
  enabledSkillsCount: number;
  onOpenCron: () => void;
  activeJobCount: number;
  onOpenCommands: () => void;
  commandCount: number;
  onOpenSubagents: () => void;
  subagentCount: number;
  onOpenConnectors: () => void;
  connectorCount: number;
  sessionListFilters: { chat: boolean; shared: boolean; cron: boolean };
}

function SidebarRail({
  sessions,
  activeSessionId,
  apiKey,
  onNewTask,
  onSelectSession,
  isLiveSession,
  onOpenProfile,
  onCloseProfile,
  profileButtonRef,
  profileMenuOpen,
  onOpenSkills,
  enabledSkillsCount,
  onOpenCron,
  activeJobCount,
  onOpenCommands,
  commandCount,
  onOpenSubagents,
  subagentCount,
  onOpenConnectors,
  connectorCount,
  sessionListFilters,
}: SidebarRailProps) {
  const { userName } = useSettingsStore();
  const filteredSessions = sessions.filter((session) => sessionListFilters[getSessionCategory(session)]);
  const getInitial = (name: string) => name?.charAt(0).toUpperCase() || '?';
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'w-14 flex flex-col h-full',
        'bg-[#0B0C10] border-r border-white/[0.06]'
      )}
    >
      {/* Brand */}
      <div className="p-2">
        <BrandMark className="mx-auto h-7 w-7" />
      </div>

      {/* New Task Button */}
      <div className="p-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onNewTask}
          className={cn(
            'w-10 h-10 flex items-center justify-center rounded-xl',
            'bg-[#1D4ED8] text-white shadow-lg shadow-[#1D4ED8]/25',
            'hover:shadow-xl hover:shadow-[#1D4ED8]/35',
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
            {filteredSessions.map((session, index) => (
              <motion.button
                key={session.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
                onClick={() => onSelectSession(session.id)}
                className={cn(
                  'relative w-10 h-10 flex items-center justify-center rounded-xl',
                  'transition-all duration-150',
                  activeSessionId === session.id
                    ? 'bg-white/[0.08] text-[#93C5FD]'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                )}
                title={session.title || 'New task'}
              >
                <MessageSquare className="w-4 h-4" />
                {activeSessionId === session.id && !isLiveSession(session.id) && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#1D4ED8]" />
                )}
                {isLiveSession(session.id) && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />
                )}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Tools & Extensions */}
      <div className="px-2 py-1.5 space-y-0.5 border-t border-white/[0.06]">
        {([
          { icon: Puzzle, count: enabledSkillsCount, color: '#1D4ED8', onClick: onOpenSkills, title: 'Skills' },
          { icon: Bot, count: subagentCount, color: '#06B6D4', onClick: onOpenSubagents, title: 'Subagents' },
          { icon: Terminal, count: commandCount, color: '#9B59B6', onClick: onOpenCommands, title: 'Commands' },
          { icon: Plug, count: connectorCount, color: '#10B981', onClick: onOpenConnectors, title: 'Connectors' },
          { icon: Calendar, count: activeJobCount, color: '#10B981', onClick: onOpenCron, title: 'Automations' },
        ] as const).map(({ icon: Icon, count, color, onClick, title }) => (
          <motion.button
            key={title}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={cn(
              'relative w-10 h-8 flex items-center justify-center rounded-lg',
              'text-white/40 hover:text-white/70 hover:bg-white/[0.04]',
              'transition-all duration-150'
            )}
            title={`${title}${count > 0 ? ` (${count})` : ''}`}
          >
            <Icon className="w-4 h-4" />
            {count > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                style={{ backgroundColor: color }}
              >
                {count > 9 ? '9+' : count}
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {/* Profile Section */}
      <div className="p-2 border-t border-white/[0.06]">
        <motion.button
          ref={profileButtonRef}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenProfile}
          className={cn(
            'w-10 h-10 flex items-center justify-center rounded-xl',
            'hover:bg-white/[0.04] transition-colors',
            profileMenuOpen && 'bg-white/[0.08]'
          )}
          title="Profile & Settings"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] flex items-center justify-center">
            <span className="text-white text-xs font-bold">{getInitial(userName)}</span>
          </div>
        </motion.button>
      </div>

      <AnimatePresence>
        {profileMenuOpen && (
          <ProfileMenu
            apiKey={apiKey}
            onClose={onCloseProfile}
            buttonRef={profileButtonRef}
            isCollapsed={true}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface SidebarExpandedProps {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  isLoading: boolean;
  apiKey: string | null;
  sessionMenuId: string | null;
  sessionMenuPosition: { top: number; left: number } | null;
  sessionMenuRef: RefObject<HTMLDivElement>;
  profileButtonRef: RefObject<HTMLButtonElement>;
  profileMenuOpen: boolean;
  onNewTask: () => void;
  onSelectSession: (id: string) => void;
  isLiveSession: (id: string) => boolean;
  onToggleSessionMenu: (id: string, buttonElement: HTMLButtonElement | null) => void;
  onDeleteSession: (id: string) => void;
  onOpenProfile: () => void;
  onCloseProfile: () => void;
  isOverlay: boolean;
  onOpenSkills: () => void;
  enabledSkillsCount: number;
  onOpenCron: () => void;
  activeJobCount: number;
  onOpenCommands: () => void;
  commandCount: number;
  onOpenSubagents: () => void;
  subagentCount: number;
  onOpenConnectors: () => void;
  connectorCount: number;
  sessionListFilters: { chat: boolean; shared: boolean; cron: boolean };
  onToggleSessionListFilter: (filter: 'chat' | 'shared' | 'cron') => void;
}

function SidebarExpanded({
  sessions,
  activeSessionId,
  isLoading,
  apiKey,
  sessionMenuId,
  sessionMenuPosition,
  sessionMenuRef,
  profileButtonRef,
  profileMenuOpen,
  onNewTask,
  onSelectSession,
  isLiveSession,
  onToggleSessionMenu,
  onDeleteSession,
  onOpenProfile,
  onCloseProfile,
  isOverlay,
  onOpenSkills,
  enabledSkillsCount,
  onOpenCron,
  activeJobCount,
  onOpenCommands,
  commandCount,
  onOpenSubagents,
  subagentCount,
  onOpenConnectors,
  connectorCount,
  sessionListFilters,
  onToggleSessionListFilter,
}: SidebarExpandedProps) {
  const { userName } = useSettingsStore();
  const sessionCounts = sessions.reduce(
    (acc, session) => {
      const category = getSessionCategory(session);
      acc[category] += 1;
      return acc;
    },
    { chat: 0, shared: 0, cron: 0 }
  );
  const filteredSessions = sessions.filter(
    (session) => sessionListFilters[getSessionCategory(session)]
  );
  const getInitial = (name: string) => name?.charAt(0).toUpperCase() || '?';
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'w-64 h-full flex flex-col',
        'bg-[#0E0F13] border-r border-white/[0.06]',
        isOverlay && 'shadow-2xl shadow-black/50'
      )}
    >
      {/* Brand */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <BrandMark className="h-7 w-7" />
          <div>
            <div className="text-sm font-semibold text-white/90">Cowork</div>
            <div className="text-xs text-white/40">Command center</div>
          </div>
        </div>
      </div>

      {/* New Task Button */}
      <div className="px-3 py-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNewTask}
          disabled={isLoading}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl',
            'bg-white/[0.06] border border-white/[0.10] text-white/90 font-medium text-sm',
            'hover:bg-white/[0.10]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200'
          )}
        >
          <Plus className="w-4 h-4" />
          New task
        </motion.button>
      </div>

      {/* Recents */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2">
        <h3 className="text-[11px] font-semibold text-white/40 px-2 py-2 uppercase tracking-[0.16em]">Recents</h3>
        <div className="px-1 pb-2 flex items-center gap-1.5">
          {([
            { key: 'chat', label: 'Chat' },
            { key: 'shared', label: 'Shared' },
            { key: 'cron', label: 'Cron' },
          ] as const).map((item) => {
            const isActive = sessionListFilters[item.key];
            return (
              <button
                key={item.key}
                onClick={() => onToggleSessionListFilter(item.key)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors',
                  isActive
                    ? 'bg-white/[0.10] border-white/[0.14] text-white/85'
                    : 'bg-transparent border-white/[0.08] text-white/45 hover:text-white/70 hover:border-white/[0.14]'
                )}
                title={`${item.label} sessions`}
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-white/60">{sessionCounts[item.key]}</span>
              </button>
            );
          })}
        </div>

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
        ) : filteredSessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-8 text-center px-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-white/30" />
            </div>
            <p className="text-sm text-white/50">No sessions in selected filters</p>
            <p className="text-xs text-white/30 mt-1">Enable another category to view more sessions</p>
          </motion.div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence>
              {filteredSessions.map((session, index) => (
                <SessionItem
                  key={session.id}
                  id={session.id}
                  title={session.title || 'New task'}
                  firstMessage={session.firstMessage}
                  category={getSessionCategory(session)}
                  sourceLabel={
                    getSessionCategory(session) === 'shared'
                      ? inferIntegrationSourceLabel(session)
                      : inferIsolatedSourceLabel(session)
                  }
                  createdAt={session.createdAt}
                  isActive={activeSessionId === session.id}
                  isLive={isLiveSession(session.id)}
                  isMenuOpen={sessionMenuId === session.id}
                  menuPosition={sessionMenuId === session.id ? sessionMenuPosition : null}
                  menuRef={sessionMenuRef}
                  index={index}
                  onSelect={() => onSelectSession(session.id)}
                  onMenuToggle={(buttonEl) => onToggleSessionMenu(session.id, buttonEl)}
                  onDelete={() => onDeleteSession(session.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="text-xs text-white/25 px-2 py-4">
          These tasks run locally and aren't synced across devices
        </p>
      </div>

      {/* Tools & Extensions */}
      <div className="px-2 py-1.5 border-t border-white/[0.08] space-y-0.5">
        {([
          { icon: Puzzle, label: 'Skills', count: enabledSkillsCount, badgeCls: 'bg-[#1D4ED8]/20 text-[#93C5FD]', onClick: onOpenSkills },
          { icon: Bot, label: 'Subagents', count: subagentCount, badgeCls: 'bg-[#06B6D4]/20 text-[#67E8F9]', onClick: onOpenSubagents },
          { icon: Terminal, label: 'Commands', count: commandCount, badgeCls: 'bg-[#9B59B6]/20 text-[#BB8FCE]', onClick: onOpenCommands },
          { icon: Plug, label: 'Connectors', count: connectorCount, badgeCls: 'bg-[#10B981]/20 text-[#34D399]', onClick: onOpenConnectors },
          { icon: Calendar, label: 'Automations', count: activeJobCount, badgeCls: 'bg-[#10B981]/20 text-[#34D399]', onClick: onOpenCron },
        ] as const).map(({ icon: Icon, label, count, badgeCls, onClick }) => (
          <motion.button
            key={label}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={onClick}
            className={cn(
              'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg',
              'hover:bg-white/[0.04] transition-colors text-white/60 hover:text-white/90'
            )}
          >
            <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="flex-1 text-left text-[13px] font-medium truncate">{label}</span>
            {count > 0 && (
              <span className={cn('px-1.5 py-px rounded-full text-[11px] font-medium', badgeCls)}>
                {count}
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {/* Profile Section */}
      <div className="p-3 border-t border-white/[0.08]">
        <motion.button
          ref={profileButtonRef}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onOpenProfile}
          className={cn(
            'w-full flex items-center gap-3 p-2 rounded-xl',
            'hover:bg-white/[0.04] transition-colors',
            profileMenuOpen && 'bg-white/[0.08]'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">{getInitial(userName)}</span>
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium text-white/90 truncate">{userName || 'User'}</div>
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
            onClose={onCloseProfile}
            buttonRef={profileButtonRef}
            isCollapsed={false}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function formatRelativeDate(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type SessionCategory = 'chat' | 'shared' | 'cron';

function getSessionCategory(session: Pick<SessionSummary, 'type' | 'title'>): SessionCategory {
  if (session.type === 'integration') return 'shared';
  if (session.type === 'isolated' || session.type === 'cron' || /^\[cron:/i.test(session.title ?? '')) {
    return 'cron';
  }
  return 'chat';
}

function inferIntegrationSourceLabel(
  session: Pick<SessionSummary, 'type' | 'firstMessage' | 'title'>
): string | null {
  if (getSessionCategory(session) !== 'shared') return null;

  const tagMatch = session.firstMessage?.match(/^\[([^\]|]+)\s*\|/);
  const labelFromTag = tagMatch?.[1]?.trim();
  if (labelFromTag) return labelFromTag;

  const titleMatch = session.title?.match(/\b(whatsapp|telegram|slack|twitter)\b/i);
  if (titleMatch?.[1]) {
    const normalized = titleMatch[1].toLowerCase();
    if (normalized === 'whatsapp') return 'WhatsApp';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return 'Integration';
}

function inferIsolatedSourceLabel(session: Pick<SessionSummary, 'type' | 'title'>): string | null {
  if (getSessionCategory(session) !== 'cron') return null;
  if (/^\[cron:/i.test(session.title ?? '')) return 'Cron job';
  return session.type === 'cron' ? 'Cron job' : 'Isolated task';
}

interface SessionItemProps {
  id: string;
  title: string;
  firstMessage: string | null;
  category: SessionCategory;
  sourceLabel?: string | null;
  createdAt: number;
  isActive: boolean;
  isLive: boolean;
  isMenuOpen: boolean;
  menuPosition: { top: number; left: number } | null;
  menuRef: RefObject<HTMLDivElement>;
  index: number;
  onSelect: () => void;
  onMenuToggle: (buttonElement: HTMLButtonElement | null) => void;
  onDelete: () => void;
}

function SessionItem({
  title,
  firstMessage,
  category,
  sourceLabel,
  createdAt,
  isActive,
  isLive,
  isMenuOpen,
  menuPosition,
  menuRef,
  index,
  onSelect,
  onMenuToggle,
  onDelete,
}: SessionItemProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isSharedSession = category === 'shared';
  const isCronSession = category === 'cron';
  const baseTitle = title !== 'New task'
    ? title
    : (firstMessage ? firstMessage : 'New conversation');
  const dateStr = formatRelativeDate(createdAt);

  const handleMenuButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onMenuToggle(menuButtonRef.current);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className={cn(
        'group relative flex items-center rounded-lg',
        'transition-all duration-150',
        isActive
          ? 'bg-white/[0.08] border border-white/[0.10]'
          : 'hover:bg-white/[0.05]'
      )}
    >
      <button
        onClick={onSelect}
        className={cn(
          'flex-1 flex flex-col gap-0.5 px-3 py-1.5 min-w-0 overflow-hidden',
          'text-left',
          isActive ? 'text-white/90' : 'text-white/50 hover:text-white/80'
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8] flex-shrink-0" />
          )}
          <span className="text-sm truncate min-w-0 flex-1">
            {baseTitle}
          </span>
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#93C5FD] flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8] animate-pulse" />
              Live
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          {isSharedSession ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#1D4ED8]/15 text-[#93C5FD] text-[10px] font-medium uppercase tracking-wide flex-shrink-0">
              Shared
            </span>
          ) : null}
          {isCronSession ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#FBBF24] text-[10px] font-medium uppercase tracking-wide flex-shrink-0">
              Isolated
            </span>
          ) : null}
          {(isSharedSession || isCronSession) && sourceLabel ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 text-[10px] font-medium flex-shrink-0">
              From {sourceLabel}
            </span>
          ) : null}
          <span className="text-xs text-white/40 truncate">{dateStr}</span>
        </span>
      </button>

      {/* Actions menu trigger */}
      <div className="pr-2">
        <button
          ref={menuButtonRef}
          onClick={handleMenuButtonClick}
          className={cn(
            'p-1.5 rounded-lg',
            'opacity-0 group-hover:opacity-100',
            'text-white/30 hover:text-white/70 hover:bg-white/[0.08]',
            'transition-all duration-150',
            isMenuOpen && 'opacity-100 bg-white/[0.08] text-white/70'
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Dropdown menu via portal */}
      {isMenuOpen && menuPosition && createPortal(
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -5 }}
          className="fixed z-[100] w-36 py-1 bg-[#111218] rounded-lg border border-white/[0.08] shadow-xl shadow-black/40"
          style={{ top: menuPosition.top, left: menuPosition.left }}
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
        </motion.div>,
        document.body
      )}
    </motion.div>
  );
}

interface ProfileMenuProps {
  apiKey: string | null;
  onClose: () => void;
  buttonRef: RefObject<HTMLButtonElement>;
  isCollapsed: boolean;
}

function ProfileMenu({ apiKey, onClose, buttonRef, isCollapsed }: ProfileMenuProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const { setApiKey, clearApiKey } = useAuthStore();
  const { userName, updateSetting } = useSettingsStore();
  const getInitial = (name: string) => name?.charAt(0).toUpperCase() || '?';

  const maskedApiKey = apiKey
    ? `${apiKey.slice(0, 6)}${'•'.repeat(20)}${apiKey.slice(-4)}`
    : 'Not configured';

  // Calculate position based on button location
  useEffect(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      if (isCollapsed) {
        setMenuPosition({
          top: rect.bottom - 300,
          left: rect.right + 8,
        });
      } else {
        setMenuPosition({
          top: rect.top - 320,
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

  const handleSaveName = () => {
    if (!newUserName.trim()) return;
    updateSetting('userName', newUserName.trim());
    setIsEditingName(false);
    setNewUserName('');
    toast.success('Name updated');
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
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className={cn(
        'fixed z-[100] w-80 rounded-2xl overflow-hidden',
        'bg-[#111218] border border-white/[0.08]',
        'shadow-2xl shadow-black/60'
      )}
      style={{ top: menuPosition.top, left: menuPosition.left }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.08]">
        {isEditingName ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Enter your name"
              className={cn(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[#0B0C10] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:border-[#1D4ED8]/50'
              )}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveName}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-[#1D4ED8] text-white"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={() => setIsEditingName(false)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-white/[0.06] text-white/70"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] flex items-center justify-center">
              <span className="text-white text-xs font-bold">{getInitial(userName)}</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white/90">{userName || 'User'}</div>
              <div className="text-xs text-white/40">Local account</div>
            </div>
            <button
              onClick={() => {
                setNewUserName(userName);
                setIsEditingName(true);
              }}
              className="text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* API Key Section */}
      <div className="p-4 border-b border-white/[0.08]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-white/40" />
            <span className="text-sm text-white/70">API Key</span>
          </div>
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="text-white/40 hover:text-white/70"
          >
            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {isEditingKey ? (
          <div className="space-y-2">
            <input
              type="password"
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              placeholder="Enter new API key"
              className={cn(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[#0B0C10] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:border-[#1D4ED8]/50'
              )}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveApiKey}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-[#1D4ED8] text-white"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={() => setIsEditingKey(false)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-white/[0.06] text-white/70"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="px-3 py-2 rounded-lg bg-[#0B0C10] border border-white/[0.08] text-xs text-white/60 font-mono">
              {showApiKey ? apiKey || 'Not configured' : maskedApiKey}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditingKey(true)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-white/[0.06] text-white/70"
              >
                <Settings className="w-4 h-4" />
                Update
              </button>
              {apiKey && (
                <button
                  onClick={handleCopyApiKey}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-white/[0.06] text-white/70"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="px-4 pb-2">
        <button
          onClick={() => {
            onClose();
            useAppStore.getState().setCurrentView('settings');
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/[0.04] transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          Settings
        </button>
      </div>

      {/* Logout */}
      <div className="p-4 pt-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20"
        >
          <LogOut className="w-4 h-4" />
          Remove API key
        </button>
      </div>
    </motion.div>
  );

  return (
    <>
      {createPortal(menuContent, document.body)}
    </>
  );
}
