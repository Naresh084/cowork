import { useEffect, useMemo, useState } from 'react';
import { Calendar, Play, Clock, ExternalLink, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollapsibleSection } from './CollapsibleSection';
import { useCronStore } from '../../stores/cron-store';
import { useAppStore } from '../../stores/app-store';
import { motion } from 'framer-motion';
import { WORKFLOWS_ENABLED } from '@/lib/feature-flags';
import type { CronJob, WorkflowSchedule, WorkflowScheduledTaskSummary } from '@gemini-cowork/shared';

function formatNextRun(timestamp?: number): string {
  if (!timestamp) return 'Not scheduled';
  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) return 'Overdue';
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

function getRemainingRuns(job: CronJob): number | null {
  if (!job.maxRuns || job.maxRuns <= 0) return null;
  return Math.max(job.maxRuns - (job.runCount || 0), 0);
}

function getRemainingTurnBudget(job: CronJob): number | null {
  if (!job.maxTurns || job.maxTurns <= 0) return null;
  const remainingRuns = getRemainingRuns(job);
  if (remainingRuns === null) return null;
  return Math.max(remainingRuns * job.maxTurns, 0);
}

function formatWorkflowSchedule(schedule: WorkflowSchedule): string {
  switch (schedule.type) {
    case 'at':
      return `Once at ${new Date(schedule.timestamp).toLocaleString()}`;
    case 'every': {
      const mins = Math.max(1, Math.round(schedule.intervalMs / 60_000));
      if (mins < 60) return `Every ${mins}m`;
      const hrs = Math.round(mins / 60);
      return `Every ${hrs}h`;
    }
    case 'cron':
      return `Cron ${schedule.expression}`;
    default:
      return 'Scheduled';
  }
}

type AutomationItem =
  | { kind: 'cron'; job: CronJob }
  | { kind: 'workflow'; task: WorkflowScheduledTaskSummary };

function getItemNextRun(item: AutomationItem): number | null {
  if (item.kind === 'cron') return item.job.nextRunAt || null;
  return item.task.nextRunAt;
}

function AutomationsJobItem({ item }: { item: AutomationItem }) {
  const {
    triggerJob,
    runWorkflowTask,
    pauseWorkflowTask,
    resumeWorkflowTask,
    openModal,
  } = useCronStore();
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const isCron = item.kind === 'cron';
  const cronJob = isCron ? item.job : null;
  const workflowTask = !isCron ? item.task : null;

  const remainingRuns = cronJob ? getRemainingRuns(cronJob) : null;
  const remainingTurnBudget = cronJob ? getRemainingTurnBudget(cronJob) : null;

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCron && cronJob) {
      await triggerJob(cronJob.id);
      return;
    }
    if (workflowTask) {
      await runWorkflowTask(workflowTask.workflowId);
    }
  };

  const handleToggleSchedule = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workflowTask) return;
    if (workflowTask.enabled) {
      await pauseWorkflowTask(workflowTask.workflowId);
      return;
    }
    await resumeWorkflowTask(workflowTask.workflowId);
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
      onClick={() => {
        if (isCron) {
          openModal();
        } else if (WORKFLOWS_ENABLED) {
          setCurrentView('workflows');
        } else {
          openModal();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                isCron && cronJob?.status === 'active' && 'bg-[#50956A]',
                isCron && cronJob?.status === 'paused' && 'bg-yellow-500',
                isCron && cronJob?.status === 'completed' && 'bg-white/30',
                isCron && cronJob?.status === 'failed' && 'bg-red-500',
                !isCron && workflowTask?.enabled && 'bg-[#50956A]',
                !isCron && !workflowTask?.enabled && 'bg-yellow-500'
              )}
            />
            <span className="text-xs font-medium text-white/80 truncate">
              {isCron ? cronJob?.name : workflowTask?.name}
            </span>
            {!isCron && WORKFLOWS_ENABLED && (
              <span className="rounded bg-[#06B6D4]/20 px-1.5 py-0.5 text-[9px] text-[#67E8F9]">
                workflow
              </span>
            )}
          </div>
          {!isCron && workflowTask?.schedules[0] && (
            <div className="mt-0.5 text-[10px] text-white/35 truncate">
              {formatWorkflowSchedule(workflowTask.schedules[0])}
            </div>
          )}
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-white/30" />
            <span className="text-[10px] text-white/40">
              {formatNextRun(getItemNextRun(item) || undefined)}
            </span>
          </div>
          {(remainingRuns !== null || remainingTurnBudget !== null || cronJob?.maxTurns) && (
            <div className="mt-0.5 text-[10px] text-white/35">
              {remainingRuns !== null && (
                <span>{remainingRuns} run{remainingRuns !== 1 ? 's' : ''} left</span>
              )}
              {remainingTurnBudget !== null && (
                <span>
                  {remainingRuns !== null ? ' · ' : ''}
                  up to {remainingTurnBudget} turn{remainingTurnBudget !== 1 ? 's' : ''} left
                </span>
              )}
              {remainingRuns === null && remainingTurnBudget === null && cronJob?.maxTurns && (
                <span>max {cronJob.maxTurns} turns/run</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isCron && (
            <button
              onClick={handleToggleSchedule}
              className="p-1 rounded hover:bg-white/[0.08] text-white/40 hover:text-yellow-300 transition-colors"
              title={workflowTask?.enabled ? 'Pause schedule' : 'Resume schedule'}
            >
              {workflowTask?.enabled ? (
                <Pause className="w-3 h-3" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
            </button>
          )}
          <button
            onClick={handleRun}
            className="p-1 rounded hover:bg-white/[0.08] text-white/40 hover:text-[#60A5FA] transition-colors"
            title="Run now"
          >
            <Play className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function ScheduledSection() {
  const loadJobs = useCronStore((state) => state.loadJobs);
  const openModal = useCronStore((state) => state.openModal);
  const jobs = useCronStore((state) => state.jobs);
  const workflowTasks = useCronStore((state) => state.workflowTasks);
  const isModalOpen = useCronStore((state) => state.isModalOpen);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const [, setTick] = useState(0);
  const hasImminent = [...jobs, ...workflowTasks].some(
    (item) =>
      ('enabled' in item ? item.enabled : item.status === 'active')
      && item.nextRunAt
      && item.nextRunAt - Date.now() < 600_000,
  );

  useEffect(() => {
    loadJobs();
    const ms = hasImminent ? 1_000 : 30_000;
    let loadCounter = 0;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      loadCounter += 1;
      if (loadCounter * ms >= 30_000) {
        loadJobs();
        loadCounter = 0;
      }
    }, ms);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImminent]);

  useEffect(() => {
    if (!isModalOpen) {
      loadJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  const activeItems = useMemo(
    () => [
      ...jobs
        .filter((j) => j.status === 'active')
        .map((job) => ({ kind: 'cron', job } as AutomationItem)),
      ...workflowTasks
        .filter((task) => task.enabled)
        .map((task) => ({ kind: 'workflow', task } as AutomationItem)),
    ],
    [jobs, workflowTasks],
  );

  const upcomingItems = useMemo(
    () =>
      activeItems
        .filter((item) => getItemNextRun(item))
        .sort((a, b) => (getItemNextRun(a) || 0) - (getItemNextRun(b) || 0))
        .slice(0, 3),
    [activeItems],
  );

  return (
    <CollapsibleSection
      id="scheduled"
      title="Automations"
      icon={Calendar}
      badge={activeItems.length > 0 ? activeItems.length : undefined}
      actions={
        <button
          type="button"
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
      {upcomingItems.length === 0 ? (
        <div className="py-3 text-center">
          <p className="text-xs text-white/40 mb-2">No scheduled tasks</p>
          <button
            onClick={() => {
              if (WORKFLOWS_ENABLED) {
                setCurrentView('workflows');
                return;
              }
              openModal();
            }}
            className="text-xs text-[#93C5FD] hover:underline"
          >
            Create one
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {upcomingItems.map((item) => (
            <AutomationsJobItem
              key={item.kind === 'cron' ? `cron:${item.job.id}` : `workflow:${item.task.workflowId}`}
              item={item}
            />
          ))}
          {activeItems.length > 3 && (
            <button
              onClick={() => openModal()}
              className="w-full py-1.5 text-[10px] text-center text-[#93C5FD] hover:underline"
            >
              View all {activeItems.length} scheduled tasks
            </button>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
