import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CronJobCard } from './CronJobCard';
import { useCronStore } from '@/stores/cron-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { CronJob } from '@gemini-cowork/shared';

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

export function CronJobList() {
  const isLoading = useCronStore((state) => state.isLoading);
  const error = useCronStore((state) => state.error);
  const jobs = useCronStore((state) => state.jobs);
  const automationListFilters = useSettingsStore((state) => state.automationListFilters);
  const toggleAutomationListFilter = useSettingsStore((state) => state.toggleAutomationListFilter);

  // Memoize filtered jobs to prevent unnecessary re-renders
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

  if (totalJobs === 0) {
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
          <p className="text-sm text-white/60">No automations match the selected filters.</p>
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
    </div>
  );
}
