import { useState } from 'react';
import { cn } from '../../lib/utils';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ToolExecution } from '../../stores/chat-store';
import { getToolMeta, getPrimaryArg } from './tool-metadata';

interface SubToolExecution {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startedAt: number;
  completedAt?: number;
}

interface TaskToolCardProps {
  execution: ToolExecution;
  isActive?: boolean;
}

export function TaskToolCard({ execution, isActive }: TaskToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract subtool calls from result
  const subToolCalls = extractSubToolCalls(execution);
  const taskDescription = getTaskDescription(execution);
  const progress = computeProgress(subToolCalls);

  const statusConfig = getStatusConfig(execution.status);

  return (
    <div
      className={cn(
        'tool-selectable rounded-xl border overflow-hidden transition-all duration-200',
        execution.status === 'running'
          ? 'bg-gradient-to-b from-[#101421] to-[#0B0C10] border-[#1D4ED8]/30'
          : execution.status === 'error'
            ? 'bg-gradient-to-b from-[#1A1212] to-[#0B0C10] border-[#FF5449]/30'
            : execution.status === 'success'
              ? 'bg-gradient-to-b from-[#0F1712] to-[#0B0C10] border-[#50956A]/30'
              : 'bg-[#0F1014] border-white/[0.06]'
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          isActive && 'codex-shimmer-row'
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            'p-2 rounded-lg flex-shrink-0',
            execution.status === 'running'
              ? 'bg-[#1D4ED8]/20'
              : execution.status === 'error'
                ? 'bg-[#FF5449]/20'
                : execution.status === 'success'
                  ? 'bg-[#50956A]/20'
                  : 'bg-white/[0.06]'
          )}
        >
          {execution.status === 'running' ? (
            <Loader2 className={cn('w-4 h-4 animate-spin', statusConfig.color)} />
          ) : (
            <Zap className={cn('w-4 h-4', statusConfig.color)} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/40">
            <span>Agent</span>
            <span className="text-white/20">&bull;</span>
            <span className="text-white/70">Task</span>
          </div>
          <p
            className={cn(
              'text-sm text-white/80 truncate mt-0.5',
              execution.status === 'running' && 'codex-shimmer-text'
            )}
          >
            {taskDescription || 'Running task...'}
          </p>
        </div>

        {/* Expand icon */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {subToolCalls.length > 0 && (
            <span className="text-[10px] text-white/40">
              {progress.completed}/{progress.total} steps
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-white/30" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/30" />
          )}
        </div>
      </button>

      {/* Progress bar */}
      {subToolCalls.length > 0 && (
        <div className="px-4 pb-2">
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(progress.completed / progress.total) * 100}%` }}
              transition={{ duration: 0.3 }}
              className={cn(
                'h-full rounded-full',
                execution.status === 'running'
                  ? 'bg-gradient-to-r from-[#1D4ED8] to-[#93C5FD] task-progress-shimmer'
                  : execution.status === 'error'
                    ? 'bg-[#FF5449]'
                    : 'bg-gradient-to-r from-[#50956A] to-[#7FD29A]'
              )}
            />
          </div>
        </div>
      )}

      {/* Expanded timeline */}
      <AnimatePresence>
        {isExpanded && subToolCalls.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.06] overflow-hidden"
          >
            <div className="p-4 pl-6">
              <SubToolTimeline tools={subToolCalls} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Timeline component showing subtool calls
function SubToolTimeline({ tools }: { tools: SubToolExecution[] }) {
  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[7px] top-3 bottom-3 w-[2px] bg-white/10 rounded-full" />

      <div className="space-y-3">
        {tools.map((tool, index) => (
          <SubToolTimelineItem key={tool.id} tool={tool} isLast={index === tools.length - 1} />
        ))}
      </div>
    </div>
  );
}

// Individual subtool item in timeline
function SubToolTimelineItem({ tool }: { tool: SubToolExecution; isLast: boolean }) {
  const [showDetails, setShowDetails] = useState(false);
  const { icon: Icon, title, category } = getToolMeta(tool.name);
  const primaryArg = getPrimaryArg(tool.name, tool.args);
  const statusConfig = getStatusConfig(tool.status);
  const duration = tool.completedAt
    ? formatDuration(tool.completedAt - tool.startedAt)
    : tool.status === 'running'
      ? formatDuration(Date.now() - tool.startedAt)
      : null;

  return (
    <div className="relative pl-6">
      {/* Status dot on timeline */}
      <div
        className={cn(
          'absolute left-0 top-3 w-4 h-4 rounded-full flex items-center justify-center',
          tool.status === 'running'
            ? 'bg-[#1D4ED8]/20'
            : tool.status === 'error'
              ? 'bg-[#FF5449]/20'
              : tool.status === 'success'
                ? 'bg-[#50956A]/20'
                : 'bg-white/10'
        )}
      >
        {tool.status === 'running' ? (
          <div className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />
        ) : tool.status === 'success' ? (
          <CheckCircle2 className="w-3 h-3 text-[#50956A]" />
        ) : tool.status === 'error' ? (
          <XCircle className="w-3 h-3 text-[#FF5449]" />
        ) : (
          <Circle className="w-2.5 h-2.5 text-white/30" />
        )}
      </div>

      {/* Subtool card - same UI as parent tools */}
      <div
        className={cn(
          'rounded-lg border overflow-hidden',
          tool.status === 'running'
            ? 'bg-[#101421]/80 border-[#1D4ED8]/20'
            : tool.status === 'error'
              ? 'bg-[#1A1212]/80 border-[#FF5449]/20'
              : tool.status === 'success'
                ? 'bg-[#0F1712]/80 border-[#50956A]/20'
                : 'bg-white/[0.02] border-white/[0.06]'
        )}
      >
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-left',
            tool.status === 'running' && 'codex-shimmer-row'
          )}
        >
          {/* Icon */}
          <div
            className={cn(
              'p-1.5 rounded-md flex-shrink-0',
              tool.status === 'running'
                ? 'bg-[#1D4ED8]/15'
                : tool.status === 'error'
                  ? 'bg-[#FF5449]/15'
                  : tool.status === 'success'
                    ? 'bg-[#50956A]/15'
                    : 'bg-white/[0.04]'
            )}
          >
            {tool.status === 'running' ? (
              <Loader2 className={cn('w-3.5 h-3.5 animate-spin', statusConfig.color)} />
            ) : (
              <Icon className={cn('w-3.5 h-3.5', statusConfig.color)} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/35">
              <span>{category}</span>
              <span className="text-white/15">&bull;</span>
              <span className="text-white/55">{title}</span>
            </div>
            {primaryArg && (
              <p
                className={cn(
                  'text-xs text-white/70 font-mono truncate mt-0.5',
                  tool.status === 'running' && 'codex-shimmer-text'
                )}
              >
                {primaryArg}
              </p>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {duration && (
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {duration}
              </span>
            )}
            {(tool.result || tool.error) && (
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 text-white/30 transition-transform',
                  showDetails && 'rotate-180'
                )}
              />
            )}
          </div>
        </button>

        {/* Expandable result/error */}
        <AnimatePresence>
          {showDetails && (tool.result || tool.error) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="border-t border-white/[0.04] overflow-hidden"
            >
              <div className="px-3 py-2">
                {tool.error ? (
                  <div className="text-xs text-[#FF5449] font-mono bg-[#FF5449]/10 rounded px-2 py-1">
                    {tool.error}
                  </div>
                ) : (
                  <pre className="text-[11px] text-white/50 font-mono overflow-x-auto max-h-32 overflow-y-auto">
                    {formatResult(tool.result)}
                  </pre>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Helper functions
function extractSubToolCalls(execution: ToolExecution): SubToolExecution[] {
  const result = execution.result as {
    subToolCalls?: SubToolExecution[];
    toolCalls?: SubToolExecution[];
    steps?: Array<{
      toolName?: string;
      name?: string;
      args?: unknown;
      result?: unknown;
      error?: string;
      status?: string;
      startedAt?: number;
      completedAt?: number;
    }>;
    output?: string;
  } | undefined;

  if (!result) return [];

  if (result.subToolCalls) return result.subToolCalls;
  if (result.toolCalls) return result.toolCalls;

  if (result.steps) {
    return result.steps.map((step, index) => ({
      id: `${execution.id}-step-${index}`,
      name: step.toolName || step.name || 'Unknown',
      args: (step.args as Record<string, unknown>) || {},
      result: step.result,
      error: step.error,
      status: normalizeStatus(step.status),
      startedAt: step.startedAt || execution.startedAt,
      completedAt: step.completedAt,
    }));
  }

  return [];
}

function normalizeStatus(status?: string): 'pending' | 'running' | 'success' | 'error' {
  if (!status) return 'pending';
  const lower = status.toLowerCase();
  if (lower === 'success' || lower === 'done' || lower === 'completed') return 'success';
  if (lower === 'error' || lower === 'failed') return 'error';
  if (lower === 'running' || lower === 'in_progress') return 'running';
  return 'pending';
}

function getTaskDescription(execution: ToolExecution): string {
  const args = execution.args || {};
  return (
    (args.description as string) ||
    (args.prompt as string) ||
    (args.task as string) ||
    (args.goal as string) ||
    ''
  );
}

function computeProgress(tools: SubToolExecution[]): { completed: number; total: number } {
  const completed = tools.filter((t) => t.status === 'success' || t.status === 'error').length;
  return { completed, total: tools.length };
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'running':
      return { color: 'text-[#93C5FD]', bgColor: 'bg-[#1D4ED8]/10' };
    case 'success':
      return { color: 'text-[#50956A]', bgColor: 'bg-[#50956A]/10' };
    case 'error':
      return { color: 'text-[#FF5449]', bgColor: 'bg-[#FF5449]/10' };
    default:
      return { color: 'text-white/40', bgColor: 'bg-white/[0.06]' };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatResult(result: unknown): string {
  if (result === null || result === undefined) return '';
  if (typeof result === 'string') {
    return result.length > 500 ? result.slice(0, 500) + '...' : result;
  }
  try {
    const json = JSON.stringify(result, null, 2);
    return json.length > 500 ? json.slice(0, 500) + '...' : json;
  } catch {
    return String(result);
  }
}
