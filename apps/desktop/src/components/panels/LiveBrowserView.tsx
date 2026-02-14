// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { useSettingsStore } from '../../stores/settings-store';
import { toast } from '../ui/Toast';

function formatRelative(ts?: number | null): string {
  if (!ts) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function LiveBrowserView() {
  const { activeSessionId } = useSessionStore();
  const { closeLiveView } = useSettingsStore();
  const recoverStalledRun = useChatStore((state) => state.recoverStalledRun);
  const sendMessage = useChatStore((state) => state.sendMessage);

  const screenshot = useChatStore((state) => {
    if (!activeSessionId) return null;
    return state.sessions[activeSessionId]?.browserViewScreenshot ?? null;
  });
  const browserRun = useChatStore((state) => {
    if (!activeSessionId) return null;
    return state.sessions[activeSessionId]?.browserRun ?? null;
  });

  const isRunning = browserRun?.status === 'running';
  const [lastUpdate, setLastUpdate] = useState('');
  const [recoveringRun, setRecoveringRun] = useState(false);
  const [resumingCheckpoint, setResumingCheckpoint] = useState(false);

  useEffect(() => {
    if (!screenshot?.timestamp) {
      setLastUpdate('');
      return;
    }
    const update = () => setLastUpdate(formatRelative(screenshot.timestamp));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [screenshot?.timestamp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLiveView();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeLiveView]);

  const progressPercent = useMemo(() => {
    const step = Math.max(0, browserRun?.step || 0);
    const max = Math.max(0, browserRun?.maxSteps || 0);
    if (max <= 0) return 0;
    return Math.min(100, Math.round((step / max) * 100));
  }, [browserRun?.step, browserRun?.maxSteps]);

  const events = useMemo(
    () => (browserRun?.events || []).slice(-8).reverse(),
    [browserRun?.events],
  );

  const handleRecoverRun = async () => {
    if (!activeSessionId || recoveringRun) return;
    setRecoveringRun(true);
    try {
      const ok = await recoverStalledRun(activeSessionId);
      if (!ok) {
        toast.warning('Recovery unavailable', 'No stalled run checkpoint was found.');
      }
    } finally {
      setRecoveringRun(false);
    }
  };

  const handleResumeFromCheckpoint = async () => {
    if (!activeSessionId || resumingCheckpoint) return;
    setResumingCheckpoint(true);
    try {
      const goalFragment = browserRun?.goal ? ` for this goal: "${browserRun.goal}"` : '';
      await sendMessage(
        activeSessionId,
        `Resume the browser automation${goalFragment}. Use computer_use with {"resumeFromCheckpoint": true} and continue safely from the last checkpoint.`,
      );
      toast.success('Resume requested', 'Continuation request queued.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Resume failed', message);
    } finally {
      setResumingCheckpoint(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0A0B0E] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0D0E12]">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#93C5FD]" />
          <span className="text-sm font-medium text-white/80">Live Browser View</span>
          {isRunning && <span className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />}
        </div>
        <button
          onClick={closeLiveView}
          className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
          title="Close Live View (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {!screenshot ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-white/20" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 text-[#1D4ED8] animate-spin" />
              <p className="text-white/60">Waiting for browser screenshot...</p>
            </div>
            <p className="text-sm text-white/30">The agent is connecting to the browser.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-4 overflow-hidden gap-3">
          <div className="px-3 py-2 rounded-lg bg-[#12131A] border border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-3 h-3 rounded-full flex-shrink-0',
                  isRunning ? 'bg-[#50956A]' : browserRun?.status === 'blocked' ? 'bg-[#F97316]' : 'bg-white/20',
                )}
              />
              <span className="flex-1 text-sm text-white/60 font-mono truncate">
                {screenshot.url || 'about:blank'}
              </span>
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

            {browserRun && browserRun.maxSteps > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] text-white/45 mb-1">
                  <span>
                    Step {browserRun.step} / {browserRun.maxSteps}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      browserRun.status === 'blocked' ? 'bg-[#F97316]' : 'bg-[#3B82F6]',
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {browserRun?.status === 'blocked' && (
            <div className="rounded-lg border border-[#F97316]/35 bg-[#451A03]/50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#FDBA74] mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#FDBA74]">
                    Blocker Detected
                  </p>
                  <p className="text-sm text-[#FED7AA] mt-1 break-words">
                    {browserRun.blockedReason || 'The browser run was blocked by a safety guard.'}
                  </p>
                  {browserRun.checkpointPath && (
                    <p className="text-[11px] text-[#FDBA74]/80 mt-2 break-all">
                      Checkpoint: {browserRun.checkpointPath}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <motion.div
            key={screenshot.timestamp}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="flex-1 rounded-xl overflow-hidden border border-white/[0.08] bg-black relative min-h-[200px]"
          >
            <img
              src={`data:${screenshot.mimeType};base64,${screenshot.data}`}
              alt="Browser screenshot"
              className="w-full h-full object-contain"
            />
          </motion.div>

          <div className="rounded-lg border border-white/[0.08] bg-[#101118] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
                Run Timeline
              </span>
              <span className="text-[11px] text-white/30">{events.length} events</span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
              {events.length === 0 ? (
                <p className="text-xs text-white/35">No browser timeline events yet.</p>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-white/70 truncate">
                        {event.detail || event.type}
                      </span>
                      <span className="text-white/35">
                        {event.step}/{event.maxSteps}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/35 mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate">{event.url || 'No URL snapshot'}</span>
                      <span>{formatRelative(event.timestamp)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-white/40">
            <span className="flex items-center gap-2">
              <span className={isRunning ? 'text-[#93C5FD]' : ''}>
                {isRunning ? 'Browser active' : browserRun?.status === 'blocked' ? 'Blocked' : 'Session idle'}
              </span>
              <span className="text-white/20">•</span>
              {lastUpdate}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRecoverRun}
                disabled={!activeSessionId || recoveringRun}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.14] px-2 py-1 text-white/70 hover:text-white disabled:opacity-50"
              >
                {recoveringRun ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                Recover Run
              </button>
              <button
                onClick={handleResumeFromCheckpoint}
                disabled={!activeSessionId || !browserRun?.checkpointPath || resumingCheckpoint}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#2563EB]/35 px-2 py-1 text-[#BFDBFE] hover:text-white disabled:opacity-50"
              >
                {resumingCheckpoint ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5" />
                )}
                Resume Checkpoint
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
