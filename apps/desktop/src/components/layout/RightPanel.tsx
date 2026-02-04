import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ListChecks,
  Folder,
  StickyNote,
  Layers,
  Pin,
  PinOff,
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

const RAIL_WIDTH = 56;

export function RightPanel({ onPreviewArtifact: _onPreviewArtifact }: RightPanelProps) {
  const {
    rightPanelCollapsed,
    rightPanelPinned,
    toggleRightPanel,
    toggleRightPanelPinned,
    rightPanelSections,
    toggleRightPanelSection,
  } = useSettingsStore();

  const { activeSessionId } = useSessionStore();
  const sessionState = useAgentStore((state) => state.getSessionState(activeSessionId));
  const tasks = sessionState.tasks;
  const artifacts = sessionState.artifacts;

  const [width, setWidth] = useState(304);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isExpanded = rightPanelPinned ? !rightPanelCollapsed : isHovering;
  const railVisible = rightPanelPinned || isHovering;
  const effectiveWidth = rightPanelPinned
    ? (rightPanelCollapsed ? RAIL_WIDTH : width)
    : (railVisible ? RAIL_WIDTH : 12);

  // Badge counts
  const activeTasks = tasks.filter((t) => t.status !== 'completed').length;
  const artifactCount = artifacts.length;

  // Handle resize when pinned
  useEffect(() => {
    if (!isResizing || !rightPanelPinned) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      setWidth(Math.min(420, Math.max(260, newWidth)));
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
  }, [isResizing, rightPanelPinned]);

  return (
    <div
      className={cn(
        'h-full overflow-visible',
        rightPanelPinned ? 'relative' : 'absolute top-0 right-0 z-20'
      )}
      style={{ width: effectiveWidth }}
      onMouseEnter={() => !rightPanelPinned && setIsHovering(true)}
      onMouseLeave={() => !rightPanelPinned && setIsHovering(false)}
    >
      {/* Rail */}
      {railVisible && (
        <div className="absolute inset-y-0 right-0 w-[56px] bg-[#0E0F13] border-l border-white/[0.06]">
          <div className="flex items-center justify-center py-2 border-b border-white/[0.06]">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleRightPanelPinned()}
              className={cn(
                'p-1.5 rounded-lg',
                'text-white/40 hover:text-white/80 hover:bg-white/[0.06]',
                'transition-colors'
              )}
              title={rightPanelPinned ? 'Unpin panel' : 'Pin panel'}
            >
              {rightPanelPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </motion.button>
          </div>

          <div className="flex-1 flex flex-col items-center gap-1 py-2">
            <CollapsedSectionButton
              icon={ListChecks}
              badge={activeTasks > 0 ? activeTasks : undefined}
              isExpanded={rightPanelSections.progress}
              onClick={() => {
                if (!rightPanelPinned) setIsHovering(true);
                if (!rightPanelSections.progress) toggleRightPanelSection('progress');
              }}
              title="Progress"
            />
            <CollapsedSectionButton
              icon={Folder}
              badge={artifactCount > 0 ? artifactCount : undefined}
              isExpanded={rightPanelSections.workingFolder}
              onClick={() => {
                if (!rightPanelPinned) setIsHovering(true);
                if (!rightPanelSections.workingFolder) toggleRightPanelSection('workingFolder');
              }}
              title="Working folder"
            />
            <CollapsedSectionButton
              icon={StickyNote}
              isExpanded={rightPanelSections.scratchpad}
              onClick={() => {
                if (!rightPanelPinned) setIsHovering(true);
                if (!rightPanelSections.scratchpad) toggleRightPanelSection('scratchpad');
              }}
              title="Scratchpad"
            />
            <CollapsedSectionButton
              icon={Layers}
              isExpanded={rightPanelSections.context}
              onClick={() => {
                if (!rightPanelPinned) setIsHovering(true);
                if (!rightPanelSections.context) toggleRightPanelSection('context');
              }}
              title="Context"
            />
          </div>
        </div>
      )}

      {/* Expanded Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-y-0 right-0 bg-[#0E0F13] border-l border-white/[0.06] shadow-2xl shadow-black/40"
            style={{ width }}
          >
            {/* Resize handle */}
            {rightPanelPinned && (
              <div
                className={cn(
                  'absolute left-0 top-0 bottom-0 w-1 z-10',
                  'cursor-col-resize',
                  'hover:bg-[#4C71FF]/50',
                  isResizing && 'bg-[#4C71FF]'
                )}
                onMouseDown={() => setIsResizing(true)}
              />
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Details</span>
              <div className="flex items-center gap-1">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleRightPanelPinned()}
                  className={cn(
                    'p-1.5 rounded-lg',
                    'text-white/40 hover:text-white/80 hover:bg-white/[0.06]',
                    'transition-colors'
                  )}
                  title={rightPanelPinned ? 'Unpin panel' : 'Pin panel'}
                >
                  {rightPanelPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </motion.button>
                {rightPanelPinned && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleRightPanel}
                    className={cn(
                      'p-1 rounded-lg',
                      'text-white/40 hover:text-white/80 hover:bg-white/[0.06]',
                      'transition-colors'
                    )}
                    title="Collapse panel"
                  >
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                  </motion.button>
                )}
              </div>
            </div>

            {/* Sections */}
            <div className="flex-1 overflow-y-auto">
              <ProgressSection />
              <WorkingFolderSection />
              <ScratchpadSection />
              <ContextSection />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CollapsedSectionButtonProps {
  icon: typeof ListChecks;
  badge?: number;
  isExpanded: boolean;
  onClick: () => void;
  title: string;
}

function CollapsedSectionButton({
  icon: Icon,
  badge,
  isExpanded,
  onClick,
  title,
}: CollapsedSectionButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'relative p-2 rounded-xl transition-colors',
        isExpanded
          ? 'bg-[#4C71FF]/20 text-[#8CA2FF]'
          : 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]'
      )}
      title={title}
    >
      <Icon className="w-4 h-4" />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#4C71FF] text-white text-[10px] font-medium flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </motion.button>
  );
}
