import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import { ChatView } from '../chat/ChatView';
import { LiveBrowserView } from '../panels/LiveBrowserView';

const MIN_PANEL_WIDTH = 400; // Minimum width for each panel in pixels

/**
 * Split-screen layout for Live Browser View mode.
 * Shows ChatView on the left and LiveBrowserView on the right.
 *
 * Features:
 * - Resizable split with drag handle
 * - Minimum panel widths enforced
 * - Smooth animations on enter/exit
 * - Split ratio persisted in settings
 */
export function SplitViewLayout() {
  const { liveViewSplitRatio, setLiveViewSplitRatio, closeLiveView } = useSettingsStore();
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const containerWidth = rect.width;
      const mouseX = e.clientX - rect.left;

      // Calculate new ratio
      let newRatio = mouseX / containerWidth;

      // Enforce minimum widths
      const minRatio = MIN_PANEL_WIDTH / containerWidth;
      const maxRatio = 1 - minRatio;

      // Clamp ratio
      newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));

      setLiveViewSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    // Set cursor and prevent text selection during drag
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, setLiveViewSplitRatio]);

  // Close live view if window becomes too narrow
  useEffect(() => {
    const checkWindowWidth = () => {
      // Need at least 2 * MIN_PANEL_WIDTH (800px) for split view
      if (window.innerWidth < MIN_PANEL_WIDTH * 2) {
        closeLiveView();
      }
    };

    // Check on resize
    window.addEventListener('resize', checkWindowWidth);
    return () => window.removeEventListener('resize', checkWindowWidth);
  }, [closeLiveView]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex overflow-hidden"
    >
      {/* Left Panel - Chat View */}
      <div
        className="flex flex-col min-w-0 min-h-0 overflow-hidden"
        style={{ width: `${liveViewSplitRatio * 100}%` }}
      >
        <ChatView />
      </div>

      {/* Resize Handle */}
      <div
        className={cn(
          'relative w-1 flex-shrink-0 cursor-col-resize group',
          'bg-white/[0.06] hover:bg-[#4C71FF]/50',
          'transition-colors duration-150',
          isResizing && 'bg-[#4C71FF]'
        )}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
      >
        {/* Wider invisible hit area for easier grabbing */}
        <div className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize" />

        {/* Visual indicator on hover */}
        <div
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-1 h-8 rounded-full',
            'bg-white/20 opacity-0 group-hover:opacity-100',
            'transition-opacity duration-150',
            isResizing && 'opacity-100 bg-[#4C71FF]'
          )}
        />
      </div>

      {/* Right Panel - Live Browser View */}
      <div
        className="flex flex-col min-w-0 min-h-0 overflow-hidden border-l border-white/[0.06]"
        style={{ width: `${(1 - liveViewSplitRatio) * 100}%` }}
      >
        <LiveBrowserView />
      </div>
    </motion.div>
  );
}
