import {
  ListChecks,
  CheckCircle2,
  Circle,
  Loader2,
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
 * This component uses the deepagents task system:
 * - Data source: useAgentStore((state) => state.tasks)
 * - Tasks are created/updated by agent tool executions
 * - Shows real-time progress of agent work
 * - Supports subagents via task.owner field
 */
export function ProgressSection() {
  const { activeSessionId } = useSessionStore();
  const tasks = useAgentStore((state) => state.getSessionState(activeSessionId).tasks);

  // Calculate completion stats
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalCount = tasks.length;
  const badge = totalCount > 0 ? `${completedCount}/${totalCount}` : undefined;

  return (
    <CollapsibleSection id="progress" title="Progress" icon={ListChecks} badge={badge}>
      {tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <TaskList tasks={tasks} />
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

interface TaskListProps {
  tasks: Task[];
}

function TaskList({ tasks }: TaskListProps) {
  // Group tasks by owner (for subagent support)
  const tasksByOwner = tasks.reduce((acc, task) => {
    const owner = task.owner || 'main';
    if (!acc[owner]) {
      acc[owner] = [];
    }
    acc[owner].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const owners = Object.keys(tasksByOwner);
  const hasMultipleOwners = owners.length > 1;

  return (
    <div className="space-y-1">
      <AnimatePresence mode="popLayout">
        {hasMultipleOwners ? (
          // Show grouped by owner when multiple subagents
          owners.map((owner) => (
            <div key={owner} className="mb-2">
              {owner !== 'main' && (
                <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
                  <User className="w-3 h-3 text-white/40" />
                  <span className="text-xs text-white/40 font-medium">
                    {owner}
                  </span>
                </div>
              )}
              {tasksByOwner[owner].map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          ))
        ) : (
          // Simple list when single owner
          tasks.map((task) => <TaskItem key={task.id} task={task} />)
        )}
      </AnimatePresence>
    </div>
  );
}

interface TaskItemProps {
  task: Task;
}

function TaskItem({ task }: TaskItemProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-start gap-2 py-1.5 px-1 rounded-lg',
        'transition-colors duration-150',
        task.status === 'in_progress' && 'bg-[#4C71FF]/5'
      )}
    >
      {/* Status Icon */}
      <div className="mt-0.5 flex-shrink-0">
        {task.status === 'completed' ? (
          <CheckCircle2 className="w-4 h-4 text-[#50956A]" />
        ) : task.status === 'in_progress' ? (
          <Loader2 className="w-4 h-4 text-[#4C71FF] animate-spin" />
        ) : (
          <Circle className="w-4 h-4 text-white/25" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'text-sm block',
            task.status === 'completed'
              ? 'text-white/50 line-through decoration-white/30'
              : 'text-white/80'
          )}
        >
          {task.subject}
        </span>

        {/* Active form (shown when in progress) */}
        {task.status === 'in_progress' && task.activeForm && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <Loader2 className="w-3 h-3 text-[#8CA2FF] animate-spin" />
            <span className="text-xs text-[#8CA2FF]">{task.activeForm}</span>
          </div>
        )}

        {/* Blocked indicator */}
        {task.blockedBy && task.blockedBy.length > 0 && task.status !== 'completed' && (
          <span className="text-xs text-[#F5C400] mt-0.5 block">
            Waiting on {task.blockedBy.length} task(s)
          </span>
        )}
      </div>
    </motion.div>
  );
}
