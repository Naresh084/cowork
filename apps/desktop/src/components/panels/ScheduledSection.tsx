import { useEffect, useMemo, useState } from 'react';
import { Calendar, Play, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollapsibleSection } from './CollapsibleSection';
import { useCronStore } from '../../stores/cron-store';
import { motion } from 'framer-motion';
import type { CronJob } from '@gemini-cowork/shared';

function formatNextRun(timestamp?: number): string {
  if (!timestamp) return 'Not scheduled';
  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) return 'Overdue';
  // Under 10 minutes: show m:ss
  if (diff < 600000) {
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `In ${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `In ${minutes}m`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `In ${hours}h`;
  }
  const days = Math.floor(diff / 86400000);
  return `In ${days}d`;
}

function AutomationsJobItem({ job }: { job: CronJob }) {
  const { triggerJob, openModal } = useCronStore();

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await triggerJob(job.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-2 rounded-lg',
        'bg-white/[0.02] border border-white/[0.04]',
        'hover:bg-white/[0.04] transition-colors',
        'cursor-pointer'
      )}
      onClick={() => openModal()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                job.status === 'active' && 'bg-[#50956A]',
                job.status === 'paused' && 'bg-yellow-500',
                job.status === 'completed' && 'bg-white/30',
                job.status === 'failed' && 'bg-red-500'
              )}
            />
            <span className="text-xs font-medium text-white/80 truncate">
              {job.name}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-white/30" />
            <span className="text-[10px] text-white/40">
              {formatNextRun(job.nextRunAt)}
            </span>
          </div>
        </div>
        <button
          onClick={handleRun}
          className="p-1 rounded hover:bg-white/[0.08] text-white/40 hover:text-[#60A5FA] transition-colors"
          title="Run now"
        >
          <Play className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

// Export with both names for backwards compatibility
export function ScheduledSection() {
  const loadJobs = useCronStore((state) => state.loadJobs);
  const openModal = useCronStore((state) => state.openModal);
  const jobs = useCronStore((state) => state.jobs);
  const isModalOpen = useCronStore((state) => state.isModalOpen);

  // Tick to keep relative times fresh; 1s when any job is <10min, else 30s
  const [, setTick] = useState(0);
  const hasImminent = jobs.some(
    (j) => j.status === 'active' && j.nextRunAt && j.nextRunAt - Date.now() < 600_000
  );
  useEffect(() => {
    loadJobs();
    const ms = hasImminent ? 1_000 : 30_000;
    let loadCounter = 0;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      // Only reload from backend every 30s, not every second
      loadCounter++;
      if (loadCounter * ms >= 30_000) {
        loadJobs();
        loadCounter = 0;
      }
    }, ms);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImminent]);

  // Reload when modal closes (job may have been created/edited)
  useEffect(() => {
    if (!isModalOpen) {
      loadJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  // Memoize filtered jobs to prevent infinite re-renders
  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === 'active'),
    [jobs]
  );

  const upcomingJobs = useMemo(
    () =>
      activeJobs
        .filter((j) => j.nextRunAt)
        .sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0))
        .slice(0, 3),
    [activeJobs]
  );

  return (
    <CollapsibleSection
      id="scheduled"
      title="Automations"
      icon={Calendar}
      badge={activeJobs.length > 0 ? activeJobs.length : undefined}
      actions={
        <button
          onClick={(e) => {
            e.stopPropagation();
            openModal();
          }}
          className="p-1 rounded hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors"
          title="Manage scheduled tasks"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      }
    >
      {upcomingJobs.length === 0 ? (
        <div className="py-3 text-center">
          <p className="text-xs text-white/40 mb-2">No scheduled tasks</p>
          <button
            onClick={() => openModal()}
            className="text-xs text-[#93C5FD] hover:underline"
          >
            Create one
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {upcomingJobs.map((job) => (
            <AutomationsJobItem key={job.id} job={job} />
          ))}
          {activeJobs.length > 3 && (
            <button
              onClick={() => openModal()}
              className="w-full py-1.5 text-[10px] text-center text-[#93C5FD] hover:underline"
            >
              View all {activeJobs.length} scheduled tasks
            </button>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
