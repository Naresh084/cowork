import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Calendar, Play, Pause, RotateCcw, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CronJobCard } from './CronJobCard';
import { useCronStore } from '@/stores/cron-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useAppStore } from '@/stores/app-store';
import { WORKFLOWS_ENABLED } from '@/lib/feature-flags';
import type { CronJob, WorkflowSchedule, WorkflowScheduledTaskSummary } from '@gemini-cowork/shared';

interface JobSectionProps {
  title: string;
  jobs: CronJob[];
  defaultOpen?: boolean;
  badgeColor?: string;
}

function JobSection({
  title,
  jobs,
  defaultOpen = true,
  badgeColor = 'bg-white/20',
}: JobSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (jobs.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 rounded-lg',
          'hover:bg-white/[0.04] transition-colors',
          'text-white/70 hover:text-white/90'
        )}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{title}</span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium',
              badgeColor
            )}
          >
            {jobs.length}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-3">
              {jobs.map((job) => (
                <CronJobCard key={job.id} job={job} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, count, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors',
        active
          ? 'bg-[#1D4ED8]/25 text-[#BFDBFE] border border-[#1D4ED8]/40'
          : 'bg-white/[0.04] text-white/50 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/70'
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-[#1D4ED8]/45' : 'bg-white/[0.08]')}>
        {count}
      </span>
    </button>
  );
}

function formatNextRun(timestamp: number | null): string {
  if (!timestamp) return 'Not scheduled';
  const diff = timestamp - Date.now();
  if (diff < 0) return 'Overdue';
  if (diff < 60_000) return 'In <1m';
  if (diff < 3_600_000) return `In ${Math.round(diff / 60_000)}m`;
  if (diff < 86_400_000) return `In ${Math.round(diff / 3_600_000)}h`;
  return `In ${Math.round(diff / 86_400_000)}d`;
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

function WorkflowTaskCard({ task }: { task: WorkflowScheduledTaskSummary }) {
  const runWorkflowTask = useCronStore((state) => state.runWorkflowTask);
  const pauseWorkflowTask = useCronStore((state) => state.pauseWorkflowTask);
  const resumeWorkflowTask = useCronStore((state) => state.resumeWorkflowTask);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        WORKFLOWS_ENABLED ? 'border-[#06B6D4]/20 bg-[#06B6D4]/5' : 'border-white/[0.08] bg-white/[0.03]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <GitBranch className={cn('h-3.5 w-3.5', WORKFLOWS_ENABLED ? 'text-[#67E8F9]' : 'text-white/45')} />
            <span className="truncate text-xs font-medium text-white/90">{task.name}</span>
            {WORKFLOWS_ENABLED ? (
              <span className="rounded bg-[#06B6D4]/25 px-1.5 py-0.5 text-[10px] text-[#67E8F9]">
                workflow
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] text-white/55">
            {task.schedules[0] ? formatWorkflowSchedule(task.schedules[0]) : 'No schedule'}
          </div>
          <div className="mt-0.5 text-[10px] text-white/45">
            {task.enabled ? formatNextRun(task.nextRunAt) : 'Paused'}
            {' · '}
            {task.runCount} run{task.runCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void runWorkflowTask(task.workflowId)}
            className="rounded p-1 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-[#60A5FA]"
            title="Run now"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() =>
              void (task.enabled
                ? pauseWorkflowTask(task.workflowId)
                : resumeWorkflowTask(task.workflowId))
            }
            className="rounded p-1 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-yellow-300"
            title={task.enabled ? 'Pause schedule' : 'Resume schedule'}
          >
            {task.enabled ? <Pause className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
          </button>
          {WORKFLOWS_ENABLED ? (
            <button
              onClick={() => setCurrentView('workflows')}
              className="rounded p-1 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-[#67E8F9]"
              title="Open workflow builder"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CronJobList() {
  const isLoading = useCronStore((state) => state.isLoading);
  const error = useCronStore((state) => state.error);
  const jobs = useCronStore((state) => state.jobs);
  const workflowTasks = useCronStore((state) => state.workflowTasks);
  const automationListFilters = useSettingsStore((state) => state.automationListFilters);
  const toggleAutomationListFilter = useSettingsStore((state) => state.toggleAutomationListFilter);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === 'active'),
    [jobs]
  );
  const pausedJobs = useMemo(
    () => jobs.filter((j) => j.status === 'paused'),
    [jobs]
  );
  const completedJobs = useMemo(
    () => jobs.filter((j) => j.status === 'completed'),
    [jobs]
  );
  const failedJobs = useMemo(
    () => jobs.filter((j) => j.status === 'failed'),
    [jobs]
  );
  const pendingJobs = useMemo(
    () => [...activeJobs, ...pausedJobs].sort((a, b) => {
      const aNext = a.nextRunAt ?? Number.MAX_SAFE_INTEGER;
      const bNext = b.nextRunAt ?? Number.MAX_SAFE_INTEGER;
      return aNext - bNext;
    }),
    [activeJobs, pausedJobs]
  );

  const totalJobs = activeJobs.length + pausedJobs.length + completedJobs.length + failedJobs.length;
  const totalItems = totalJobs + workflowTasks.length;
  const visibleJobCount =
    (automationListFilters.pending ? pendingJobs.length : 0) +
    (automationListFilters.completed ? completedJobs.length : 0) +
    (automationListFilters.failed ? failedJobs.length : 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-white/40">Loading automations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-2">Failed to load tasks</p>
          <p className="text-xs text-white/40">{error}</p>
        </div>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
          <Calendar className="w-8 h-8 text-white/30" />
        </div>
        <h3 className="text-lg font-medium text-white/70 mb-2">
          No automations yet
        </h3>
        <p className="text-sm text-white/40 text-center max-w-xs">
          Create an automation to handle recurring work like code reviews,
          reports, or reminders.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {workflowTasks.length > 0 && (
        <div
          className={cn(
            'mb-5 rounded-lg border p-3',
            WORKFLOWS_ENABLED ? 'border-[#06B6D4]/20 bg-[#06B6D4]/5' : 'border-white/[0.08] bg-white/[0.03]',
          )}
        >
          <div
            className={cn(
              'mb-2 flex items-center gap-2 text-xs font-medium',
              WORKFLOWS_ENABLED ? 'text-[#67E8F9]' : 'text-white/70',
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            {WORKFLOWS_ENABLED
              ? `Workflow Schedules (${workflowTasks.length})`
              : `Automated Schedules (${workflowTasks.length})`}
          </div>
          <div className="space-y-2">
            {workflowTasks.map((task) => (
              <WorkflowTaskCard key={task.workflowId} task={task} />
            ))}
          </div>
        </div>
      )}

      {totalJobs > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <FilterChip
              label="Pending / Running"
              count={pendingJobs.length}
              active={automationListFilters.pending}
              onClick={() => toggleAutomationListFilter('pending')}
            />
            <FilterChip
              label="Completed"
              count={completedJobs.length}
              active={automationListFilters.completed}
              onClick={() => toggleAutomationListFilter('completed')}
            />
            <FilterChip
              label="Failed"
              count={failedJobs.length}
              active={automationListFilters.failed}
              onClick={() => toggleAutomationListFilter('failed')}
            />
          </div>

          {visibleJobCount === 0 ? (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-center">
              <p className="text-sm text-white/60">No cron tasks match the selected filters.</p>
            </div>
          ) : (
            <>
              {automationListFilters.pending && (
                <JobSection
                  title="Pending / Running"
                  jobs={pendingJobs}
                  defaultOpen={true}
                  badgeColor="bg-[#50956A]/20 text-[#8FDCA9]"
                />
              )}

              {automationListFilters.completed && (
                <JobSection
                  title="Completed"
                  jobs={completedJobs}
                  defaultOpen={false}
                  badgeColor="bg-white/10 text-white/50"
                />
              )}

              {automationListFilters.failed && (
                <JobSection
                  title="Failed"
                  jobs={failedJobs}
                  defaultOpen={false}
                  badgeColor="bg-red-500/15 text-red-300"
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
