// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCronStore } from '@/stores/cron-store';
import type { CronRun } from '@cowork/shared';

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startedAt: number, completedAt?: number): string {
  if (!completedAt) return 'Running...';
  const ms = completedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function RunCard({ run }: { run: CronRun }) {
  const isSuccess = run.result === 'success';
  const isError = run.result === 'error';
  const isTimeout = run.result === 'timeout';
  const isCancelled = run.result === 'cancelled';

  return (
    <div
      className={cn(
        'p-4 rounded-lg border',
        isSuccess && 'bg-[#50956A]/5 border-[#50956A]/20',
        isError && 'bg-red-500/5 border-red-500/20',
        isTimeout && 'bg-yellow-500/5 border-yellow-500/20',
        isCancelled && 'bg-white/[0.02] border-white/[0.06]'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {isSuccess && <CheckCircle2 className="w-4 h-4 text-[#8FDCA9]" />}
          {isError && <XCircle className="w-4 h-4 text-red-400" />}
          {isTimeout && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
          {isCancelled && <Clock className="w-4 h-4 text-white/40" />}
          <span className="text-sm text-white/90">
            {formatDate(run.startedAt)} at {formatTime(run.startedAt)}
          </span>
        </div>
        <span className="text-xs text-white/40">
          {formatDuration(run.startedAt, run.completedAt)}
        </span>
      </div>

      {run.summary && (
        <p className="text-sm text-white/70 mb-2">{run.summary}</p>
      )}

      {run.error && (
        <p className="text-sm text-red-400">{run.error}</p>
      )}

      {(run.promptTokens || run.completionTokens) && (
        <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
          {run.promptTokens && <span>Prompt: {run.promptTokens} tokens</span>}
          {run.completionTokens && (
            <span>Completion: {run.completionTokens} tokens</span>
          )}
        </div>
      )}

      {run.sessionId && run.sessionId !== 'main' && (
        <button className="flex items-center gap-1 mt-2 text-xs text-[#93C5FD] hover:underline">
          <ExternalLink className="w-3 h-3" />
          View Session
        </button>
      )}
    </div>
  );
}

export function CronRunHistory() {
  const { historyJobId, getJob, getJobRuns, loadRunHistory, closeHistory } =
    useCronStore();

  const job = historyJobId ? getJob(historyJobId) : null;
  const runs = historyJobId ? getJobRuns(historyJobId) : [];

  // Load run history when component mounts
  useEffect(() => {
    if (historyJobId) {
      loadRunHistory(historyJobId, 50);
    }
  }, [historyJobId, loadRunHistory]);

  if (!job) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-white/40">Job not found</p>
      </div>
    );
  }

  const successCount = runs.filter((r) => r.result === 'success').length;
  const errorCount = runs.filter((r) => r.result === 'error').length;
  const avgDuration =
    runs.length > 0
      ? runs
          .filter((r) => r.completedAt)
          .reduce((sum, r) => sum + ((r.completedAt || 0) - r.startedAt), 0) /
        runs.filter((r) => r.completedAt).length
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.08]">
        <button
          onClick={closeHistory}
          className="p-2 -ml-2 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-white/90 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-white/90">Run History</h2>
          <p className="text-xs text-white/40">{job.name}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-white/40">Total runs: </span>
            <span className="text-white/90 font-medium">{runs.length}</span>
          </div>
          <div>
            <span className="text-white/40">Successful: </span>
            <span className="text-[#8FDCA9] font-medium">{successCount}</span>
          </div>
          <div>
            <span className="text-white/40">Failed: </span>
            <span className="text-red-400 font-medium">{errorCount}</span>
          </div>
          {avgDuration > 0 && (
            <div>
              <span className="text-white/40">Avg duration: </span>
              <span className="text-white/90 font-medium">
                {formatDuration(0, avgDuration)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Runs list */}
      <div className="flex-1 overflow-y-auto p-6">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Clock className="w-12 h-12 text-white/20 mb-4" />
            <p className="text-sm text-white/40">No runs yet</p>
            <p className="text-xs text-white/30 mt-1">
              This task hasn't been executed yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
