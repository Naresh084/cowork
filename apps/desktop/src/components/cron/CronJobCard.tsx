import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  Clock,
  Folder,
  MoreHorizontal,
  Edit2,
  Trash2,
  History,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCronStore } from '@/stores/cron-store';
import type { CronJob, CronSchedule } from '@gemini-cowork/shared';

interface CronJobCardProps {
  job: CronJob;
  compact?: boolean;
}

function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.type) {
    case 'at': {
      const date = new Date(schedule.timestamp);
      return `One-time: ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    case 'every': {
      const minutes = schedule.intervalMs / 60000;
      if (minutes < 60) return `Every ${minutes} minute${minutes > 1 ? 's' : ''}`;
      const hours = minutes / 60;
      if (hours < 24) return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
      const days = hours / 24;
      return `Every ${days} day${days > 1 ? 's' : ''}`;
    }
    case 'cron':
      return `Cron: ${schedule.expression}${schedule.timezone ? ` (${schedule.timezone})` : ''}`;
  }
}

function formatNextRun(timestamp?: number): string {
  if (!timestamp) return 'Not scheduled';
  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) return 'Overdue';
  if (diff < 60000) return 'In less than a minute';
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `In ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `In ${hours} hour${hours > 1 ? 's' : ''}`;
  }
  const days = Math.floor(diff / 86400000);
  return `In ${days} day${days > 1 ? 's' : ''}`;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function CronJobCard({ job, compact = false }: CronJobCardProps) {
  const { pauseJob, resumeJob, triggerJob, deleteJob, startEdit, viewHistory } =
    useCronStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const isActive = job.status === 'active';
  const isPaused = job.status === 'paused';

  const handleTrigger = async () => {
    setIsRunning(true);
    try {
      await triggerJob(job.id);
    } finally {
      setIsRunning(false);
    }
  };

  const handleToggleStatus = async () => {
    if (isActive) {
      await pauseJob(job.id);
    } else if (isPaused) {
      await resumeJob(job.id);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Delete "${job.name}"? This action cannot be undone.`)) {
      await deleteJob(job.id);
    }
  };

  if (compact) {
    return (
      <div
        className={cn(
          'p-3 rounded-lg',
          'bg-white/[0.02] border border-white/[0.06]',
          'hover:bg-white/[0.04] transition-colors'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                isActive && 'bg-[#50956A]',
                isPaused && 'bg-yellow-500',
                job.status === 'completed' && 'bg-white/30',
                job.status === 'failed' && 'bg-red-500'
              )}
            />
            <span className="text-sm text-white/90 truncate">{job.name}</span>
          </div>
          <span className="text-xs text-white/40 flex-shrink-0">
            {formatNextRun(job.nextRunAt)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-4 rounded-xl',
        'bg-white/[0.02] border border-white/[0.06]',
        'hover:bg-white/[0.03] transition-colors'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'w-3 h-3 rounded-full flex-shrink-0',
              isActive && 'bg-[#50956A]',
              isPaused && 'bg-yellow-500',
              job.status === 'completed' && 'bg-white/30',
              job.status === 'failed' && 'bg-red-500'
            )}
          />
          <h3 className="text-base font-medium text-white/90 truncate">
            {job.name}
          </h3>
        </div>

        {/* Actions menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-8 w-40 py-1 rounded-lg bg-[#111218] border border-white/[0.08] shadow-xl z-20">
                <button
                  onClick={() => {
                    startEdit(job.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06]"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    viewHistory(job.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06]"
                >
                  <History className="w-4 h-4" />
                  View History
                </button>
                <div className="h-px bg-white/[0.06] my-1" />
                <button
                  onClick={() => {
                    handleDelete();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/[0.06]"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Schedule info */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <RefreshCw className="w-4 h-4 flex-shrink-0" />
          <span>
            {formatSchedule(job.schedule)}
            {job.maxTurns && <span className="text-white/40"> · {job.maxTurns} turns max</span>}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>
            Next run: {formatNextRun(job.nextRunAt)} · {job.runCount} run
            {job.runCount !== 1 ? 's' : ''}
            {job.lastStatus && (
              <>
                {' '}
                · Last:{' '}
                {job.lastStatus === 'ok' ? (
                  <span className="text-[#8FDCA9]">
                    Success{job.lastDurationMs ? ` (${formatDuration(job.lastDurationMs)})` : ''}
                  </span>
                ) : job.lastStatus === 'error' ? (
                  <span className="text-red-400">Error</span>
                ) : (
                  <span className="text-yellow-400">Skipped</span>
                )}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Prompt preview */}
      <div className="mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] max-h-32 overflow-y-auto">
        <p className="text-sm text-white/50 whitespace-pre-wrap">{job.prompt}</p>
      </div>

      {/* Working directory */}
      <div className="flex items-center gap-2 text-xs text-white/40 mb-4">
        <Folder className="w-3.5 h-3.5" />
        <span className="truncate">{job.workingDirectory}</span>
      </div>

      {/* Error display */}
      {job.lastError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{job.lastError}</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleTrigger}
          disabled={isRunning}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
            'bg-[#1D4ED8]/15 text-[#60A5FA]',
            'hover:bg-[#1D4ED8]/25 transition-colors',
            isRunning && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isRunning ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Run Now
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleToggleStatus}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
            'bg-white/[0.06] text-white/70',
            'hover:bg-white/[0.10] transition-colors'
          )}
        >
          {isActive ? (
            <>
              <Pause className="w-4 h-4" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Resume
            </>
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => startEdit(job.id)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
            'bg-white/[0.06] text-white/70',
            'hover:bg-white/[0.10] transition-colors'
          )}
        >
          <Edit2 className="w-4 h-4" />
          Edit
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => viewHistory(job.id)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
            'bg-white/[0.06] text-white/70',
            'hover:bg-white/[0.10] transition-colors'
          )}
        >
          <History className="w-4 h-4" />
          History
        </motion.button>
      </div>
    </motion.div>
  );
}
