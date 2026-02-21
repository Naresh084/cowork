// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState, useMemo, useCallback, useRef, forwardRef } from 'react';
import {
  ListChecks,
  CheckCircle2,
  Circle,
  Loader2,
  Lock,
  ChevronRight,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore, type Task } from '../../stores/agent-store';
import { useSessionStore } from '../../stores/session-store';
import { CollapsibleSection } from './CollapsibleSection';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ProgressSection - Displays agent tasks from agent-store
 *
 * Features:
 * - Progress bar with completion percentage
 * - Numeric task IDs (#1, #2, etc.)
 * - Expandable descriptions
 * - Dependency visualization (blocked by #N)
 * - Click-to-scroll between dependent tasks
 */
export function ProgressSection() {
  const { activeSessionId } = useSessionStore();
  const tasks = useAgentStore((state) => state.getSessionState(activeSessionId).tasks);

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalCount = tasks.length;
  const badge = totalCount > 0 ? `${completedCount}/${totalCount}` : undefined;

  return (
    <CollapsibleSection id="progress" title="Progress" icon={ListChecks} badge={badge}>
      {tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <TaskListView tasks={tasks} />
      )}
    </CollapsibleSection>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center mb-2">
        <CheckCircle2 className="w-5 h-5 text-white/30" />
      </div>
      <p className="text-xs text-white/40">No tasks yet</p>
      <p className="text-xs text-white/25 mt-0.5">
        Tasks will appear as the agent works
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;

  return (
    <div className="px-1 mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-white/45">
          {completed} of {total} completed
        </span>
        <span className="text-[11px] text-white/45">{percent}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className={cn(
            'h-full rounded-full',
            allDone
              ? 'bg-[#50956A]'
              : 'bg-gradient-to-r from-[#1D4ED8] to-[#3B82F6]'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskListView
// ---------------------------------------------------------------------------

function TaskListView({ tasks }: { tasks: Task[] }) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  // Sort by numeric ID
  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const na = parseInt(a.id, 10);
        const nb = parseInt(b.id, 10);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.id.localeCompare(b.id);
      }),
    [tasks],
  );

  // Group by owner
  const tasksByOwner = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const task of sorted) {
      const owner = task.owner || 'main';
      if (!groups[owner]) groups[owner] = [];
      groups[owner].push(task);
    }
    return groups;
  }, [sorted]);

  const owners = Object.keys(tasksByOwner);
  const hasMultipleOwners = owners.length > 1;

  const scrollToTask = useCallback((id: string) => {
    const el = taskRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Brief highlight
    el.classList.add('ring-1', 'ring-[#F5C400]/40');
    setTimeout(() => {
      el.classList.remove('ring-1', 'ring-[#F5C400]/40');
    }, 1500);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedTaskId((prev) => (prev === id ? null : id));
  }, []);

  const setRef = useCallback((id: string, el: HTMLDivElement | null) => {
    taskRefs.current[id] = el;
  }, []);

  return (
    <div className="space-y-1">
      <ProgressBar completed={completedCount} total={sorted.length} />
      <AnimatePresence mode="popLayout">
        {hasMultipleOwners ? (
          owners.map((owner) => (
            <div key={owner} className="mb-2">
              {owner !== 'main' && (
                <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
                  <User className="w-3 h-3 text-white/40" />
                  <span className="text-xs text-white/40 font-medium">{owner}</span>
                </div>
              )}
              {tasksByOwner[owner].map((task) => (
                <TaskRow
                  key={task.id}
                  ref={(el) => setRef(task.id, el)}
                  task={task}
                  expanded={expandedTaskId === task.id}
                  onToggle={() => toggleExpand(task.id)}
                  onScrollTo={scrollToTask}
                  allTasks={sorted}
                />
              ))}
            </div>
          ))
        ) : (
          sorted.map((task) => (
            <TaskRow
              key={task.id}
              ref={(el) => setRef(task.id, el)}
              task={task}
              expanded={expandedTaskId === task.id}
              onToggle={() => toggleExpand(task.id)}
              onScrollTo={scrollToTask}
              allTasks={sorted}
            />
          ))
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskRow
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onScrollTo: (id: string) => void;
  allTasks: Task[];
}

function isBlocked(task: Task, allTasks: Task[]): boolean {
  if (!task.blockedBy || task.blockedBy.length === 0) return false;
  // Blocked if any blocker is not yet completed
  return task.blockedBy.some((bid) => {
    const blocker = allTasks.find((t) => t.id === bid);
    return blocker && blocker.status !== 'completed';
  });
}

const TaskRow = forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow(
  { task, expanded, onToggle, onScrollTo, allTasks },
  ref,
) {
  const blocked = isBlocked(task, allTasks);
  const hasDescription = Boolean(task.description);

  const statusColor = blocked
    ? 'text-[#F5C400]'
    : task.status === 'completed'
      ? 'text-[#50956A]'
      : task.status === 'in_progress'
        ? 'text-[#1D4ED8]'
        : 'text-white/25';

  const badgeBg = blocked
    ? 'bg-[#F5C400]/10'
    : task.status === 'completed'
      ? 'bg-[#50956A]/15'
      : task.status === 'in_progress'
        ? 'bg-[#1D4ED8]/15'
        : 'bg-white/[0.06]';

  const rowBg = blocked
    ? 'bg-[#F5C400]/[0.03]'
    : task.status === 'in_progress'
      ? 'bg-[#1D4ED8]/5'
      : '';

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-lg transition-all duration-150',
        rowBg,
      )}
    >
      <div
        className={cn(
          'flex items-start gap-2 py-1.5 px-1',
          hasDescription && 'cursor-pointer',
        )}
        onClick={hasDescription ? onToggle : undefined}
      >
        {/* ID Badge */}
        <div
          className={cn(
            'flex-shrink-0 mt-0.5 min-w-[22px] h-5 rounded flex items-center justify-center text-[10px] font-medium',
            badgeBg,
            statusColor,
          )}
        >
          #{task.id}
        </div>

        {/* Status Icon */}
        <div className="mt-0.5 flex-shrink-0">
          {blocked ? (
            <Lock className={cn('w-4 h-4', statusColor)} />
          ) : task.status === 'completed' ? (
            <CheckCircle2 className={cn('w-4 h-4', statusColor)} />
          ) : task.status === 'in_progress' ? (
            <Loader2 className={cn('w-4 h-4 animate-spin', statusColor)} />
          ) : (
            <Circle className={cn('w-4 h-4', statusColor)} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              'text-sm block',
              task.status === 'completed'
                ? 'text-white/50 line-through decoration-white/30'
                : 'text-white/80',
            )}
          >
            {task.subject}
          </span>

          {/* Active form spinner */}
          {task.status === 'in_progress' && task.activeForm && !blocked && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Loader2 className="w-3 h-3 text-[#93C5FD] animate-spin" />
              <span className="text-xs text-[#93C5FD]">{task.activeForm}</span>
            </div>
          )}

          {/* Blocked by indicator */}
          {blocked && task.blockedBy && task.blockedBy.length > 0 && task.status !== 'completed' && (
            <BlockedByIndicator
              blockedBy={task.blockedBy}
              onScrollTo={onScrollTo}
            />
          )}
        </div>

        {/* Expand chevron */}
        {hasDescription && (
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 mt-1 flex-shrink-0 text-white/25 transition-transform duration-150',
              expanded && 'rotate-90',
            )}
          />
        )}
      </div>

      {/* Expandable description */}
      <AnimatePresence>
        {expanded && task.description && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-1 pb-2 pl-[52px]">
              <p className="text-xs text-white/40 leading-relaxed whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ---------------------------------------------------------------------------
// BlockedByIndicator
// ---------------------------------------------------------------------------

function BlockedByIndicator({
  blockedBy,
  onScrollTo,
}: {
  blockedBy: string[];
  onScrollTo: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <Lock className="w-3 h-3 text-[#F5C400]" />
      <span className="text-xs text-[#F5C400]">
        Blocked by{' '}
        {blockedBy.map((id, idx) => (
          <span key={id}>
            {idx > 0 && ', '}
            <button
              type="button"
              className="underline underline-offset-2 decoration-[#F5C400]/40 hover:decoration-[#F5C400] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onScrollTo(id);
              }}
            >
              #{id}
            </button>
          </span>
        ))}
      </span>
    </div>
  );
}
