import { useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ListChecks,
  Folder,
  StickyNote,
  Layers,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import { useAgentStore, type Artifact } from '../../stores/agent-store';
import { useSessionStore } from '../../stores/session-store';
import { ProgressSection } from '../panels/ProgressSection';
import { WorkingFolderSection } from '../panels/WorkingFolderSection';
import { ScratchpadSection } from '../panels/ScratchpadSection';
import { ContextSection } from '../panels/ContextSection';
import { motion, AnimatePresence } from 'framer-motion';

interface RightPanelProps {
  onPreviewArtifact?: (artifact: Artifact) => void;
}

const COLLAPSED_WIDTH = 48;
const EXPANDED_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 480;

export function RightPanel({ onPreviewArtifact: _onPreviewArtifact }: RightPanelProps) {
  const {
    rightPanelCollapsed,
    toggleRightPanel,
    rightPanelSections,
    toggleRightPanelSection,
  } = useSettingsStore();

  const { activeSessionId } = useSessionStore();
  const sessionState = useAgentStore((state) => state.getSessionState(activeSessionId));
  const tasks = sessionState.tasks;
  const artifacts = sessionState.artifacts;

  const [width, setWidth] = useState(EXPANDED_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isCollapsed = rightPanelCollapsed;

  // Badge counts
  const activeTasks = tasks.filter((t) => t.status !== 'completed').length;
  const artifactCount = artifacts.length;

  // Handle resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <motion.div
      ref={panelRef}
      className="relative h-full flex-shrink-0 bg-[#0A0B0E] border-l border-white/[0.06]"
      initial={false}
      animate={{
        width: isCollapsed ? COLLAPSED_WIDTH : width,
      }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 35,
        mass: 0.8,
      }}
    >
      {/* Toggle Button - Positioned on the left edge */}
      <motion.button
        onClick={toggleRightPanel}
        className={cn(
          'absolute -left-3 top-1/2 z-30',
          'w-6 h-12 rounded-full',
          'bg-[#12131A] border border-white/[0.08]',
          'flex items-center justify-center',
          'text-white/40 hover:text-white/80',
          'hover:bg-[#1A1B24] hover:border-white/[0.12]',
          'shadow-lg shadow-black/40',
          'transition-colors duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4C71FF]/50'
        )}
        style={{ transform: 'translateY(-50%)' }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
      >
        <motion.div
          initial={false}
          animate={{ rotate: isCollapsed ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.div>
      </motion.button>

      {/* Resize Handle */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'absolute left-0 top-0 bottom-0 w-1 z-20',
              'cursor-col-resize group',
              isResizing && 'bg-[#4C71FF]'
            )}
            onMouseDown={() => setIsResizing(true)}
          >
            <div className={cn(
              'absolute inset-y-0 -left-1 -right-1',
              'group-hover:bg-[#4C71FF]/30',
              'transition-colors duration-150'
            )} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed View - Icon Rail */}
      <AnimatePresence mode="wait">
        {isCollapsed ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full flex flex-col items-center py-4"
          >
            <div className="flex flex-col items-center gap-2">
              <CollapsedSectionButton
                icon={ListChecks}
                badge={activeTasks > 0 ? activeTasks : undefined}
                isActive={rightPanelSections.progress}
                onClick={() => {
                  if (!rightPanelSections.progress) toggleRightPanelSection('progress');
                  toggleRightPanel();
                }}
                title="Progress"
              />
              <CollapsedSectionButton
                icon={Folder}
                badge={artifactCount > 0 ? artifactCount : undefined}
                isActive={rightPanelSections.workingFolder}
                onClick={() => {
                  if (!rightPanelSections.workingFolder) toggleRightPanelSection('workingFolder');
                  toggleRightPanel();
                }}
                title="Working folder"
              />
              <CollapsedSectionButton
                icon={StickyNote}
                isActive={rightPanelSections.scratchpad}
                onClick={() => {
                  if (!rightPanelSections.scratchpad) toggleRightPanelSection('scratchpad');
                  toggleRightPanel();
                }}
                title="Scratchpad"
              />
              <CollapsedSectionButton
                icon={Layers}
                isActive={rightPanelSections.context}
                onClick={() => {
                  if (!rightPanelSections.context) toggleRightPanelSection('context');
                  toggleRightPanel();
                }}
                title="Context"
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, delay: 0.1 }}
            className="h-full flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                Details
              </span>
            </div>

            {/* Sections */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
              <ProgressSection />
              <WorkingFolderSection />
              <ScratchpadSection />
              <ContextSection />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface CollapsedSectionButtonProps {
  icon: typeof ListChecks;
  badge?: number;
  isActive: boolean;
  onClick: () => void;
  title: string;
}

function CollapsedSectionButton({
  icon: Icon,
  badge,
  isActive,
  onClick,
  title,
}: CollapsedSectionButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'relative p-2.5 rounded-xl transition-all duration-200',
        isActive
          ? 'bg-[#4C71FF]/15 text-[#8CA2FF] shadow-[0_0_12px_rgba(76,113,255,0.15)]'
          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
      )}
      title={title}
    >
      <Icon className="w-[18px] h-[18px]" />
      {badge !== undefined && badge > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#4C71FF] text-white text-[10px] font-semibold flex items-center justify-center shadow-lg shadow-[#4C71FF]/30"
        >
          {badge > 99 ? '99+' : badge}
        </motion.span>
      )}
    </motion.button>
  );
}
