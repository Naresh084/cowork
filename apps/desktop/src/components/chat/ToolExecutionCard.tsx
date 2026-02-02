import { useState } from 'react';
import {
  Terminal,
  FileEdit,
  FileSearch,
  FolderOpen,
  Globe,
  Wrench,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { CodeBlock } from './CodeBlock';
import type { ToolExecution } from '../../stores/chat-store';
import { motion, AnimatePresence } from 'framer-motion';

// Tool type icons
const TOOL_ICONS: Record<string, typeof Terminal> = {
  bash: Terminal,
  shell: Terminal,
  execute_command: Terminal,
  read_file: FileSearch,
  write_file: FileEdit,
  edit_file: FileEdit,
  list_directory: FolderOpen,
  search_files: FileSearch,
  glob: FileSearch,
  grep: FileSearch,
  fetch: Globe,
  http: Globe,
  default: Wrench,
};

// Tool display names
const TOOL_NAMES: Record<string, string> = {
  bash: 'Shell Command',
  shell: 'Shell Command',
  execute_command: 'Execute Command',
  read_file: 'Read File',
  write_file: 'Write File',
  edit_file: 'Edit File',
  list_directory: 'List Directory',
  search_files: 'Search Files',
  glob: 'Find Files',
  grep: 'Search Content',
  fetch: 'HTTP Request',
  http: 'HTTP Request',
};

interface ToolExecutionCardProps {
  execution: ToolExecution;
  className?: string;
}

export function ToolExecutionCard({ execution, className }: ToolExecutionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const Icon = TOOL_ICONS[execution.name.toLowerCase()] || TOOL_ICONS.default;
  const displayName = TOOL_NAMES[execution.name.toLowerCase()] || execution.name;

  const statusConfig = getStatusConfig(execution.status);
  const duration = execution.completedAt
    ? formatDuration(execution.completedAt - execution.startedAt)
    : null;

  const handleCopyArgs = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(execution.args, null, 2));
      setCopiedArgs(true);
      setTimeout(() => setCopiedArgs(false), 2000);
    } catch (error) {
      console.error('Failed to copy args:', error);
    }
  };

  const handleCopyResult = async () => {
    if (!execution.result) return;
    try {
      const resultText = typeof execution.result === 'string'
        ? execution.result
        : JSON.stringify(execution.result, null, 2);
      await navigator.clipboard.writeText(resultText);
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
    } catch (error) {
      console.error('Failed to copy result:', error);
    }
  };

  // Get primary arg to display (like file path or command)
  const primaryArg = getPrimaryArg(execution.name, execution.args);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border overflow-hidden transition-all duration-200',
        execution.status === 'running'
          ? 'bg-[#6B6EF0]/5 border-[#6B6EF0]/20'
          : execution.status === 'error'
            ? 'bg-[#FF5449]/5 border-[#FF5449]/20'
            : execution.status === 'success'
              ? 'bg-[#50956A]/5 border-[#50956A]/20'
              : 'bg-white/[0.02] border-white/[0.06]',
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        {/* Icon */}
        <div
          className={cn(
            'p-2 rounded-xl flex-shrink-0',
            execution.status === 'running'
              ? 'bg-[#6B6EF0]/20'
              : execution.status === 'error'
                ? 'bg-[#FF5449]/20'
                : execution.status === 'success'
                  ? 'bg-[#50956A]/20'
                  : 'bg-white/[0.06]'
          )}
        >
          <Icon className={cn('w-4 h-4', statusConfig.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/90">{displayName}</span>
            <StatusBadge status={execution.status} />
          </div>
          {primaryArg && (
            <p className="text-xs text-white/40 font-mono truncate mt-0.5">
              {primaryArg}
            </p>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {duration && (
            <span className="flex items-center gap-1 text-xs text-white/30">
              <Clock className="w-3 h-3" />
              {duration}
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-white/30" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/30" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.06] overflow-hidden"
          >
            <div className="p-3 space-y-3">
              {/* Arguments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-white/40 uppercase tracking-wide">
                    Arguments
                  </span>
                  <button
                    onClick={handleCopyArgs}
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
                      'transition-colors',
                      copiedArgs
                        ? 'text-[#50956A]'
                        : 'text-white/30 hover:text-white/60'
                    )}
                  >
                    {copiedArgs ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <CodeBlock
                  code={JSON.stringify(execution.args, null, 2)}
                  language="json"
                  showLineNumbers={false}
                  maxHeight={200}
                />
              </div>

              {/* Result */}
              {(execution.result !== undefined || execution.error) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-white/40 uppercase tracking-wide">
                      {execution.error ? 'Error' : 'Result'}
                    </span>
                    {!execution.error && execution.result !== undefined && (
                      <button
                        onClick={handleCopyResult}
                        className={cn(
                          'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
                          'transition-colors',
                          copiedResult
                            ? 'text-[#50956A]'
                            : 'text-white/30 hover:text-white/60'
                        )}
                      >
                        {copiedResult ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  {execution.error ? (
                    <div className="px-3 py-2 rounded-lg bg-[#FF5449]/10 border border-[#FF5449]/20 text-sm text-[#FF5449] font-mono whitespace-pre-wrap">
                      {execution.error}
                    </div>
                  ) : (
                    <CodeBlock
                      code={formatResult(execution.result)}
                      language={getResultLanguage(execution.result)}
                      showLineNumbers={false}
                      maxHeight={300}
                    />
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Compact inline version for streaming
interface ToolExecutionInlineProps {
  execution: ToolExecution;
  className?: string;
}

export function ToolExecutionInline({ execution, className }: ToolExecutionInlineProps) {
  const Icon = TOOL_ICONS[execution.name.toLowerCase()] || TOOL_ICONS.default;
  const displayName = TOOL_NAMES[execution.name.toLowerCase()] || execution.name;
  const statusConfig = getStatusConfig(execution.status);
  const primaryArg = getPrimaryArg(execution.name, execution.args);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl',
        'bg-white/[0.04] border border-white/[0.08]',
        className
      )}
    >
      <div className={cn('p-1 rounded-lg', statusConfig.bgColor)}>
        {execution.status === 'running' ? (
          <Loader2 className={cn('w-3.5 h-3.5 animate-spin', statusConfig.color)} />
        ) : (
          <Icon className={cn('w-3.5 h-3.5', statusConfig.color)} />
        )}
      </div>
      <span className="text-sm text-white/90">{displayName}</span>
      {primaryArg && (
        <span className="text-xs text-white/40 font-mono truncate max-w-[200px]">
          {primaryArg}
        </span>
      )}
      {execution.status === 'success' && (
        <CheckCircle2 className="w-3.5 h-3.5 text-[#50956A]" />
      )}
      {execution.status === 'error' && (
        <XCircle className="w-3.5 h-3.5 text-[#FF5449]" />
      )}
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: ToolExecution['status'] }) {
  const config = getStatusConfig(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium',
        config.bgColor,
        config.color
      )}
    >
      {status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'success' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'error' && <XCircle className="w-3 h-3" />}
      {status === 'pending' && <Clock className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

// Helper functions
function getStatusConfig(status: ToolExecution['status']) {
  switch (status) {
    case 'running':
      return { color: 'text-[#8B8EFF]', bgColor: 'bg-[#6B6EF0]/10', label: 'Running' };
    case 'success':
      return { color: 'text-[#50956A]', bgColor: 'bg-[#50956A]/10', label: 'Success' };
    case 'error':
      return { color: 'text-[#FF5449]', bgColor: 'bg-[#FF5449]/10', label: 'Error' };
    case 'pending':
    default:
      return { color: 'text-white/40', bgColor: 'bg-white/[0.06]', label: 'Pending' };
  }
}

function getPrimaryArg(toolName: string, args: Record<string, unknown>): string | null {
  const lowerName = toolName.toLowerCase();

  if (lowerName.includes('file') || lowerName.includes('read') || lowerName.includes('write')) {
    return (args.path || args.file_path || args.filePath || args.file) as string || null;
  }

  if (lowerName.includes('bash') || lowerName.includes('shell') || lowerName.includes('command')) {
    return (args.command || args.cmd) as string || null;
  }

  if (lowerName.includes('directory') || lowerName.includes('list')) {
    return (args.path || args.directory || args.dir) as string || null;
  }

  if (lowerName.includes('search') || lowerName.includes('grep')) {
    return (args.pattern || args.query || args.search) as string || null;
  }

  if (lowerName.includes('glob')) {
    return (args.pattern || args.glob) as string || null;
  }

  if (lowerName.includes('http') || lowerName.includes('fetch')) {
    return (args.url || args.endpoint) as string || null;
  }

  return null;
}

function formatResult(result: unknown): string {
  if (result === null || result === undefined) {
    return 'null';
  }

  if (typeof result === 'string') {
    return result;
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function getResultLanguage(result: unknown): string {
  if (typeof result === 'string') {
    // Try to detect language from content
    if (result.trim().startsWith('{') || result.trim().startsWith('[')) {
      return 'json';
    }
    if (result.includes('<!DOCTYPE') || result.includes('<html')) {
      return 'html';
    }
    return 'text';
  }

  return 'json';
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
