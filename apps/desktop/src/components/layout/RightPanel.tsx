import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ListChecks,
  Folder,
  StickyNote,
  Layers,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import { useAgentStore, type Artifact } from '../../stores/agent-store';
import { ProgressSection } from '../panels/ProgressSection';
import { WorkingFolderSection } from '../panels/WorkingFolderSection';
import { ScratchpadSection } from '../panels/ScratchpadSection';
import { ContextSection } from '../panels/ContextSection';
import { motion } from 'framer-motion';

interface RightPanelProps {
  onPreviewArtifact?: (artifact: Artifact) => void;
}

export function RightPanel({ onPreviewArtifact: _onPreviewArtifact }: RightPanelProps) {
  const {
    rightPanelCollapsed,
    toggleRightPanel,
    rightPanelSections,
    toggleRightPanelSection,
  } = useSettingsStore();

  const tasks = useAgentStore((state) => state.tasks);
  const artifacts = useAgentStore((state) => state.artifacts);

  const [width, setWidth] = useState(288); // 72 * 4 = 288px
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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
      setWidth(Math.min(400, Math.max(240, newWidth)));
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

  // Collapsed view - icon strip
  if (rightPanelCollapsed) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col h-full w-12 bg-stone-950 border-l border-stone-800"
      >
        {/* Expand button */}
        <div className="flex items-center justify-center py-2 border-b border-stone-800">
          <button
            onClick={toggleRightPanel}
            className={cn(
              'p-1.5 rounded-lg',
              'text-stone-500 hover:text-stone-300 hover:bg-stone-800',
              'transition-colors'
            )}
            title="Expand panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Section icons */}
        <div className="flex-1 flex flex-col items-center gap-1 py-2">
          <CollapsedSectionButton
            icon={ListChecks}
            badge={activeTasks > 0 ? activeTasks : undefined}
            isExpanded={rightPanelSections.progress}
            onClick={() => {
              if (rightPanelCollapsed) toggleRightPanel();
              if (!rightPanelSections.progress) toggleRightPanelSection('progress');
            }}
            title="Progress"
          />
          <CollapsedSectionButton
            icon={Folder}
            badge={artifactCount > 0 ? artifactCount : undefined}
            isExpanded={rightPanelSections.workingFolder}
            onClick={() => {
              if (rightPanelCollapsed) toggleRightPanel();
              if (!rightPanelSections.workingFolder) toggleRightPanelSection('workingFolder');
            }}
            title="Working folder"
          />
          <CollapsedSectionButton
            icon={StickyNote}
            isExpanded={rightPanelSections.scratchpad}
            onClick={() => {
              if (rightPanelCollapsed) toggleRightPanel();
              if (!rightPanelSections.scratchpad) toggleRightPanelSection('scratchpad');
            }}
            title="Scratchpad"
          />
          <CollapsedSectionButton
            icon={Layers}
            isExpanded={rightPanelSections.context}
            onClick={() => {
              if (rightPanelCollapsed) toggleRightPanel();
              if (!rightPanelSections.context) toggleRightPanelSection('context');
            }}
            title="Context"
          />
        </div>
      </motion.div>
    );
  }

  // Expanded view
  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="relative h-full flex flex-col bg-stone-950 border-l border-stone-800"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 z-10',
          'cursor-col-resize',
          'hover:bg-orange-500/50',
          isResizing && 'bg-orange-500'
        )}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-800">
        <span className="text-sm font-medium text-stone-400">Panel</span>
        <button
          onClick={toggleRightPanel}
          className={cn(
            'p-1 rounded-lg',
            'text-stone-500 hover:text-stone-300 hover:bg-stone-800',
            'transition-colors'
          )}
          title="Collapse panel"
        >
          <ChevronLeft className="w-4 h-4 rotate-180" />
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        <ProgressSection />
        <WorkingFolderSection />
        <ScratchpadSection />
        <ContextSection />
      </div>
    </motion.div>
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
    <button
      onClick={onClick}
      className={cn(
        'relative p-2 rounded-lg transition-colors',
        isExpanded
          ? 'bg-stone-800 text-stone-300'
          : 'text-stone-500 hover:text-stone-300 hover:bg-stone-800/50'
      )}
      title={title}
    >
      <Icon className="w-4 h-4" />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-orange-500 text-white text-[10px] font-medium flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
