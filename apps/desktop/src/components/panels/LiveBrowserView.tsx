import { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, Globe, X, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { useSettingsStore } from '../../stores/settings-store';

/**
 * Live Browser View panel - displays real-time screenshots from computer_use tool.
 * Shows in the right panel of the split-screen layout.
 *
 * Features:
 * - Header with title, status indicator, and close button
 * - URL bar showing current browser URL
 * - Screenshot display with smooth transitions
 * - Footer with activity status and last update time
 * - Escape key to close
 */
export function LiveBrowserView() {
  const { activeSessionId } = useSessionStore();
  const { closeLiveView } = useSettingsStore();

  // Get screenshot from chat store
  const screenshot = useChatStore((state) => {
    const session = activeSessionId ? state.sessions[activeSessionId] : null;
    return session?.browserViewScreenshot ?? null;
  });

  // Check if computer_use is still running
  const isRunning = useChatStore((state) => {
    if (!activeSessionId) return false;
    const session = state.sessions[activeSessionId];
    if (!session) return false;
    return session.streamingToolCalls.some(
      (t) => t.name.toLowerCase() === 'computer_use' && t.status === 'running'
    );
  });

  // Relative time display
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Update relative time display
  useEffect(() => {
    if (!screenshot?.timestamp) {
      setLastUpdate('');
      return;
    }

    const updateTime = () => {
      const seconds = Math.floor((Date.now() - screenshot.timestamp) / 1000);
      if (seconds < 5) setLastUpdate('Just now');
      else if (seconds < 60) setLastUpdate(`${seconds}s ago`);
      else setLastUpdate(`${Math.floor(seconds / 60)}m ago`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [screenshot?.timestamp]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLiveView();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeLiveView]);

  return (
    <div className="flex-1 flex flex-col bg-[#0A0B0E] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0D0E12]">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#93C5FD]" />
          <span className="text-sm font-medium text-white/80">Live Browser View</span>
          {isRunning && (
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />
          )}
        </div>
        <button
          onClick={closeLiveView}
          className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
          title="Close Live View (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      {!screenshot ? (
        /* Loading state - waiting for first screenshot */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-white/20" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 text-[#1D4ED8] animate-spin" />
              <p className="text-white/60">Waiting for browser screenshot...</p>
            </div>
            <p className="text-sm text-white/30">
              The agent is connecting to the browser
            </p>
          </div>
        </div>
      ) : (
        /* Screenshot display */
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          {/* URL Bar */}
          <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg bg-[#12131A] border border-white/[0.06]">
            {/* Connection status dot */}
            <div
              className={cn(
                'w-3 h-3 rounded-full flex-shrink-0',
                isRunning ? 'bg-[#50956A]' : 'bg-white/20'
              )}
            />

            {/* URL */}
            <span className="flex-1 text-sm text-white/60 font-mono truncate">
              {screenshot.url || 'about:blank'}
            </span>

            {/* External link button */}
            {screenshot.url && (
              <a
                href={screenshot.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
                title="Open in browser"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          {/* Screenshot Image */}
          <motion.div
            key={screenshot.timestamp}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="flex-1 rounded-xl overflow-hidden border border-white/[0.08] bg-black relative"
          >
            <img
              src={`data:${screenshot.mimeType};base64,${screenshot.data}`}
              alt="Browser screenshot"
              className="w-full h-full object-contain"
            />
          </motion.div>

          {/* Footer with status */}
          <div className="flex items-center justify-between mt-3 text-xs text-white/40">
            <span className="flex items-center gap-2">
              <span className={isRunning ? 'text-[#93C5FD]' : ''}>
                {isRunning ? 'Browser active' : 'Session ended'}
              </span>
              <span className="text-white/20">•</span>
              {lastUpdate}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
