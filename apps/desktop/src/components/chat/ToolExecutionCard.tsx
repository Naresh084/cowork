import { useState } from 'react';
import {
  Palette,
  Globe,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { CodeBlock } from './CodeBlock';
import type { ToolExecution } from '../../stores/chat-store';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '../ui/Toast';
import { useAgentStore } from '../../stores/agent-store';
import { useChatStore } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { getToolMeta, getPrimaryArg } from './tool-metadata';

interface ToolExecutionCardProps {
  execution: ToolExecution;
  className?: string;
  isActive?: boolean;
}

const extractExecutionErrorMessage = (execution: ToolExecution): string | null => {
  if (execution.error && execution.error.trim().length > 0) {
    return execution.error.trim();
  }

  const result = execution.result;
  if (!result || typeof result !== 'object') {
    return null;
  }

  const resultAny = result as {
    error?: unknown;
    message?: unknown;
    errorMessage?: unknown;
    run?: { errorMessage?: unknown };
    summary?: { errorMessage?: unknown };
  };

  const direct =
    (typeof resultAny.error === 'string' && resultAny.error) ||
    (typeof resultAny.errorMessage === 'string' && resultAny.errorMessage) ||
    (typeof resultAny.message === 'string' && resultAny.message);
  if (direct && direct.trim().length > 0) return direct.trim();

  const nested =
    (typeof resultAny.run?.errorMessage === 'string' && resultAny.run.errorMessage) ||
    (typeof resultAny.summary?.errorMessage === 'string' && resultAny.summary.errorMessage);
  if (nested && nested.trim().length > 0) return nested.trim();

  return null;
};

export function ToolExecutionCard({ execution, className, isActive }: ToolExecutionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const { icon: Icon, title: displayName, category } = getToolMeta(execution.name, execution.args as Record<string, unknown>);
  const externalCliPresentation = getExternalCliPresentation(execution);
  const isExternalCliTool = Boolean(externalCliPresentation);
  const isWebSearch = isWebSearchTool(execution.name.toLowerCase());
  const { activeSessionId } = useSessionStore();
  const pendingPermission = useChatStore((state) =>
    state.getSessionState(activeSessionId).pendingPermissions.find((permission) => permission.toolCallId === execution.id)
  );
  const sourcesPreview = isWebSearch ? null : renderSourcesPreview(execution.result);
  const setPreviewArtifact = useAgentStore((state) => state.setPreviewArtifact);
  const a2uiPreview = renderA2uiPreview(execution.result, setPreviewArtifact);
  const designPreview = renderDesignPreview(execution.result, setPreviewArtifact);
  const safetyBlock = getSafetyBlock(execution.result);
  const argsText = safeJsonString(execution.args);
  const argsToolView = renderToolSpecificArgs(execution, externalCliPresentation);
  const specializedArgs = argsToolView?.node;
  const hideRawArgs = argsToolView?.hideRaw ?? false;
  const visibleError = extractExecutionErrorMessage(execution);
  const hasResultOrError = execution.result !== undefined || Boolean(visibleError);
  const externalCliResultNode = renderExternalCliResult(execution, externalCliPresentation);
  const toolView = renderToolSpecificResult(execution);
  const specializedResult = externalCliResultNode ?? toolView?.node;
  const hideRawResult = Boolean(externalCliResultNode) || (toolView?.hideRaw ?? false);
  // Only render mediaPreview if we don't have a specialized media view (to avoid duplicates)
  const isMediaTool = isMediaGenerationTool(execution.name.toLowerCase());
  const mediaPreview = isMediaTool ? null : renderMediaPreview(execution.result);

  const statusConfig = getStatusConfig(execution.status);
  const duration = execution.completedAt
    ? formatDuration(execution.completedAt - execution.startedAt)
    : null;

  const handleCopyArgs = async () => {
    try {
      await navigator.clipboard.writeText(argsText);
      setCopiedArgs(true);
      setTimeout(() => setCopiedArgs(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error('Failed to copy arguments', message);
    }
  };

  const handleCopyResult = async () => {
    if (!execution.result) return;
    try {
      await navigator.clipboard.writeText(safeJsonString(execution.result));
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error('Failed to copy result', message);
    }
  };

  // Get primary arg to display (like file path or command)
  const primaryArg = getPrimaryArg(execution.name, execution.args);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'tool-selectable rounded-xl border overflow-hidden transition-all duration-200 max-w-full',
        isExternalCliTool
          ? 'external-cli-card'
          : execution.status === 'running'
            ? 'bg-[#101421] border-[#1D4ED8]/30'
            : execution.status === 'error'
              ? 'bg-[#2A1414] border-[#FF5449]/30'
              : execution.status === 'success'
                ? 'bg-[#0F1712] border-[#50956A]/30'
                : 'bg-[#0F1014] border-white/[0.06]',
        isExternalCliTool && externalCliPresentation?.provider === 'codex' && 'external-cli-card--codex',
        isExternalCliTool && externalCliPresentation?.provider === 'claude' && 'external-cli-card--claude',
        isExternalCliTool && externalCliPresentation?.provider === 'shared' && 'external-cli-card--shared',
        isExternalCliTool && execution.status === 'running' && 'external-cli-card--running',
        isExternalCliTool && execution.status === 'error' && 'external-cli-card--error',
        isExternalCliTool && execution.status === 'success' && 'external-cli-card--success',
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-left',
          isActive && 'codex-shimmer-row',
          isExternalCliTool && 'external-cli-card__header'
        )}
      >
        {/* Icon */}
        {isExternalCliTool && externalCliPresentation ? (
          <ExternalCliAccent provider={externalCliPresentation.provider} compact={false} />
        ) : (
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
              <Icon className={cn('w-4 h-4', statusConfig.color)} />
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {isExternalCliTool && externalCliPresentation ? (
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/45">
              <span className={cn(
                'px-1.5 py-0.5 rounded-full border text-[10px] font-semibold tracking-[0.12em]',
                externalCliPresentation.provider === 'codex'
                  ? 'bg-[#1D4ED8]/18 text-[#A5C7FF] border-[#3B82F6]/40'
                  : externalCliPresentation.provider === 'claude'
                    ? 'bg-[#E85D45]/15 text-[#F8B4A8] border-[#E85D45]/35'
                    : 'bg-white/[0.08] text-white/70 border-white/[0.18]'
              )}>
                {externalCliPresentation.providerLabel}
              </span>
              <span className="text-white/25">•</span>
              <span className={cn('text-white/72 truncate', execution.status === 'running' && 'codex-shimmer-text')}>
                {externalCliPresentation.actionLabel}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/40">
              <span className="flex-shrink-0">{category}</span>
              <span className="text-white/20 flex-shrink-0">•</span>
              <span className={cn('text-white/70 truncate', !primaryArg && execution.status === 'running' && 'codex-shimmer-text')}>
                {displayName}
              </span>
            </div>
          )}
          {primaryArg && (
            <p
              className={cn(
                'text-sm text-white/80 font-mono truncate mt-0.5 max-w-full',
                execution.status === 'running' && 'codex-shimmer-text',
                isExternalCliTool && 'text-white/90'
              )}
              title={primaryArg}
            >
              {primaryArg}
            </p>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isExternalCliTool && externalCliPresentation && (
            <span className={cn(
              'external-cli-pill',
              externalCliPresentation.provider === 'codex'
                ? 'external-cli-pill--codex'
                : externalCliPresentation.provider === 'claude'
                  ? 'external-cli-pill--claude'
                  : 'external-cli-pill--shared'
            )}>
              Live
            </span>
          )}
          <StatusBadge status={execution.status} />
          {duration && (
            <span className="flex items-center gap-1 text-[11px] text-white/40">
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

      {execution.status === 'error' && visibleError && (
        <div className="px-3 pb-2">
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap break-words max-h-28 overflow-y-auto',
              isExternalCliTool
                ? 'border-[#F87171]/35 bg-[#7F1D1D]/35 text-[#FECACA]'
                : 'border-[#FF5449]/30 bg-[#FF5449]/12 text-[#FECACA]'
            )}
          >
            {visibleError}
          </div>
        </div>
      )}

      {pendingPermission && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F2B] border border-[#1D4ED8]/25 text-xs text-white/70">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#93C5FD]" />
            Waiting for approval to continue.
          </div>
        </div>
      )}

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.08] bg-[#0B0C10] overflow-hidden"
          >
            <div className="p-3 space-y-4">
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
                {specializedArgs ?? (!hideRawArgs ? (
                  <StructuredDataView value={execution.args} emptyLabel="No arguments supplied." />
                ) : null)}
              </div>

              {/* Result */}
              {hasResultOrError && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-white/40 uppercase tracking-wide">
                      {visibleError ? 'Error' : 'Result'}
                    </span>
                    {!visibleError && execution.result !== undefined && (
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
                  {visibleError ? (
                    <div className="px-3 py-2 rounded-lg bg-[#FF5449]/10 border border-[#FF5449]/20 text-sm text-[#FF5449] font-mono whitespace-pre-wrap">
                      {visibleError}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {safetyBlock && (
                        <div className="px-3 py-2 rounded-lg bg-[#FF5449]/10 border border-[#FF5449]/20 text-sm text-[#FF5449]">
                          Safety blocked: {safetyBlock}
                        </div>
                      )}
                      {specializedResult}
                      {mediaPreview}
                      {sourcesPreview}
                      {designPreview}
                      {a2uiPreview}
                      {!hideRawResult && (
                        <StructuredDataView value={execution.result} emptyLabel="No output returned." />
                      )}
                    </div>
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
  const { icon: Icon, title: displayName, category } = getToolMeta(execution.name, execution.args as Record<string, unknown>);
  const externalCliPresentation = getExternalCliPresentation(execution);
  const isExternalCliTool = Boolean(externalCliPresentation);
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
      {isExternalCliTool && externalCliPresentation ? (
        <ExternalCliAccent provider={externalCliPresentation.provider} compact />
      ) : (
        <div className={cn('p-1 rounded-lg', statusConfig.bgColor)}>
          {execution.status === 'running' ? (
            <Loader2 className={cn('w-3.5 h-3.5 animate-spin', statusConfig.color)} />
          ) : (
            <Icon className={cn('w-3.5 h-3.5', statusConfig.color)} />
          )}
        </div>
      )}
      <span className="text-[11px] uppercase tracking-wide text-white/40">
        {isExternalCliTool && externalCliPresentation ? externalCliPresentation.providerLabel : category}
      </span>
      <span className="text-white/20">•</span>
      <span className="text-sm text-white/90">
        {isExternalCliTool && externalCliPresentation ? externalCliPresentation.actionLabel : displayName}
      </span>
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
      return { color: 'text-[#93C5FD]', bgColor: 'bg-[#1D4ED8]/10', label: 'Running' };
    case 'success':
      return { color: 'text-[#50956A]', bgColor: 'bg-[#50956A]/10', label: 'Success' };
    case 'error':
      return { color: 'text-[#FF5449]', bgColor: 'bg-[#FF5449]/10', label: 'Error' };
    case 'pending':
    default:
      return { color: 'text-white/40', bgColor: 'bg-white/[0.06]', label: 'Pending' };
  }
}

function safeJsonString(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

function getSafetyBlock(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const resultAny = result as {
    blocked?: boolean;
    blockedReason?: string;
    safetyDecision?: string;
    safety_decision?: string;
  };
  if (resultAny.blocked) {
    return resultAny.blockedReason || 'Blocked by safety policy';
  }
  const decision = resultAny.safetyDecision || resultAny.safety_decision;
  if (decision && String(decision).toLowerCase().includes('block')) {
    return String(decision);
  }
  return null;
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

function buildPreview(content: string, maxLines = 24, maxChars = 4000) {
  const lines = content.split('\n');
  if (lines.length <= maxLines && content.length <= maxChars) {
    return { text: content, truncated: false, totalLines: lines.length };
  }

  const headLines = Math.min(Math.ceil(maxLines * 0.6), lines.length);
  const tailLines = Math.min(Math.floor(maxLines * 0.3), Math.max(0, lines.length - headLines));
  const head = lines.slice(0, headLines);
  const tail = tailLines > 0 ? lines.slice(-tailLines) : [];
  const preview = [...head, '…', ...tail].join('\n');

  return { text: preview, truncated: true, totalLines: lines.length };
}

interface StructuredDataRow {
  key: string;
  value: string;
}

interface StructuredDataSummary {
  rows: StructuredDataRow[];
  truncated: boolean;
}

function collectStructuredRows(value: unknown, maxRows = 28): StructuredDataSummary {
  const rows: StructuredDataRow[] = [];
  const visited = new WeakSet<object>();
  let truncated = false;

  const pushRow = (key: string, rawValue: unknown) => {
    if (rows.length >= maxRows) {
      truncated = true;
      return;
    }

    rows.push({
      key,
      value: formatStructuredValue(rawValue),
    });
  };

  const walk = (node: unknown, path: string) => {
    if (rows.length >= maxRows) {
      truncated = true;
      return;
    }

    if (node === null || node === undefined) {
      pushRow(path || 'value', node);
      return;
    }

    if (typeof node !== 'object') {
      pushRow(path || 'value', node);
      return;
    }

    if (visited.has(node)) {
      pushRow(path || 'value', '[circular]');
      return;
    }

    visited.add(node);

    if (Array.isArray(node)) {
      if (node.length === 0) {
        pushRow(path || 'value', '[empty list]');
        return;
      }
      node.forEach((item, index) => {
        walk(item, `${path}[${index}]`);
      });
      return;
    }

    const entries = Object.entries(node);
    if (entries.length === 0) {
      pushRow(path || 'value', '[empty object]');
      return;
    }

    entries.forEach(([key, child]) => {
      walk(child, path ? `${path}.${key}` : key);
    });
  };

  walk(value, '');

  return { rows, truncated };
}

function formatStructuredValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NaN';
  if (typeof value === 'string') {
    const collapsed = value.replace(/\s+/g, ' ').trim();
    return collapsed.length > 160 ? `${collapsed.slice(0, 157)}...` : collapsed;
  }
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return '[object]';
  return String(value);
}

function StructuredDataView({
  value,
  emptyLabel,
}: {
  value: unknown;
  emptyLabel: string;
}) {
  const { rows, truncated } = collectStructuredRows(value);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10] px-3 py-2 text-xs text-white/45">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10] overflow-hidden">
      <div className="max-h-64 overflow-y-auto">
        {rows.map((row, index) => (
          <div
            key={`${row.key}-${index}`}
            className="grid grid-cols-[minmax(120px,38%)_1fr] gap-2 px-3 py-2 border-b border-white/[0.05] last:border-b-0"
          >
            <div className="text-[11px] text-white/45 break-all">{row.key}</div>
            <div className="text-[12px] text-white/82 break-words">{row.value || '""'}</div>
          </div>
        ))}
      </div>
      {truncated && (
        <div className="px-3 py-1.5 text-[11px] text-white/45 border-t border-white/[0.05]">
          More fields hidden.
        </div>
      )}
    </div>
  );
}

type ToolView = { node: JSX.Element; hideRaw?: boolean };

function renderToolSpecificResult(execution: ToolExecution): ToolView | null {
  const name = execution.name.toLowerCase();
  if (isWebSearchTool(name)) {
    const searchResult = extractWebSearchResult(execution.result, execution.args);
    if (searchResult) {
      return {
        hideRaw: true,
        node: <WebSearchResultView result={searchResult} />,
      };
    }
  }

  if (isScheduleTaskTool(name)) {
    const scheduleResult = extractScheduleTaskResult(execution.result, execution.args);
    if (scheduleResult) {
      return {
        hideRaw: true,
        node: <ScheduleTaskResultView result={scheduleResult} />,
      };
    }
  }

  if (isShellTool(name)) {
    const command = String(execution.args.command ?? execution.args.cmd ?? '');
    const { output, exitCode, truncated } = extractShellOutput(execution.result);
    return {
      hideRaw: true,
      node: (
        <TerminalView
          command={command}
          output={output}
          exitCode={exitCode}
          truncated={truncated}
        />
      ),
    };
  }

  if (isReadFileTool(name)) {
    const path = String(execution.args.file_path ?? execution.args.path ?? '');
    const content = typeof execution.result === 'string' ? execution.result : formatResult(execution.result);
    return {
      hideRaw: true,
      node: (
        <FilePreviewView path={path} content={content} />
      ),
    };
  }

  if (isEditFileTool(name) || isWriteFileTool(name)) {
    const path = String(execution.args.file_path ?? execution.args.path ?? '');
    const oldString = String(execution.args.old_string ?? execution.args.oldString ?? '');
    const newString = String(execution.args.new_string ?? execution.args.newString ?? '');
    const content = String(execution.args.content ?? '');
    return {
      hideRaw: true,
      node: (
        <FileDiffView
          path={path}
          oldString={oldString}
          newString={newString}
          content={content}
        />
      ),
    };
  }

  if (isListTool(name)) {
    const entries = extractFileEntries(execution.result);
    if (entries) {
      return {
        hideRaw: true,
        node: <DirectoryListView entries={entries} />,
      };
    }
  }

  if (isSearchTool(name)) {
    const matches = extractSearchMatches(execution.result);
    if (matches) {
      return {
        hideRaw: true,
        node: <SearchResultsView matches={matches} />,
      };
    }
  }

  if (isHttpTool(name)) {
    const response = extractHttpResponse(execution.result);
    if (response) {
      return {
        hideRaw: true,
        node: <HttpResponseView response={response} />,
      };
    }
  }

  if (isMediaGenerationTool(name)) {
    const resultData = execution.result as {
      prompt?: string;
      images?: Array<{ path?: string; url?: string; mimeType?: string; data?: string }>;
      videos?: Array<{ path?: string; url?: string; mimeType?: string; data?: string }>;
    } | undefined;

    const isVideo = name.includes('video');
    const prompt = resultData?.prompt || String(execution.args.prompt || '');
    const mediaItems = isVideo ? resultData?.videos : resultData?.images;

    return {
      hideRaw: true,
      node: <MediaGenerationView prompt={prompt} items={mediaItems} isVideo={isVideo} />,
    };
  }

  if (name === 'deep_research') {
    const research = extractResearchResult(execution.result);
    if (research) {
      return {
        hideRaw: true,
        node: <ResearchResultView result={research} />,
      };
    }
  }

  if (name === 'computer_use') {
    const browser = extractBrowserRunResult(execution.result);
    if (browser) {
      return {
        hideRaw: true,
        node: <BrowserRunResultView result={browser} />,
      };
    }
  }

  return null;
}

interface ResearchEvidenceSummary {
  totalSources: number;
  avgConfidence: number;
  highConfidenceSources: number;
}

interface ResearchEvidenceItem {
  rank?: number;
  title: string;
  url: string;
  confidence?: number;
  sourceType?: string;
}

interface ResearchResultData {
  status: string;
  partial: boolean;
  interactionId?: string;
  pollAttempts?: number;
  retryAttempts?: number;
  reportPath?: string;
  evidence: ResearchEvidenceItem[];
  evidenceSummary?: ResearchEvidenceSummary;
  resumeToken?: {
    interactionId?: string;
    lastStatus?: string;
    lastProgress?: number;
  };
}

interface BrowserRunResultData {
  completed: boolean;
  blocked: boolean;
  blockedReason?: string;
  steps?: number;
  maxSteps?: number;
  finalUrl?: string;
  checkpointPath?: string;
  resumedFromCheckpoint?: boolean;
  actions: string[];
}

function extractResearchResult(result: unknown): ResearchResultData | null {
  if (!result || typeof result !== 'object') return null;
  const value = result as {
    status?: unknown;
    partial?: unknown;
    interactionId?: unknown;
    pollAttempts?: unknown;
    retryAttempts?: unknown;
    reportPath?: unknown;
    evidence?: unknown;
    evidenceSummary?: unknown;
    resumeToken?: unknown;
  };

  if (!('status' in value) && !('evidence' in value) && !('reportPath' in value)) {
    return null;
  }

  const evidence = Array.isArray(value.evidence)
    ? value.evidence
        .filter((item): item is ResearchEvidenceItem => !!item && typeof item === 'object')
        .map((item) => ({
          rank: typeof item.rank === 'number' ? item.rank : undefined,
          title: typeof item.title === 'string' ? item.title : 'Untitled source',
          url: typeof item.url === 'string' ? item.url : '',
          confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
          sourceType: typeof item.sourceType === 'string' ? item.sourceType : undefined,
        }))
    : [];

  return {
    status: typeof value.status === 'string' ? value.status : 'unknown',
    partial: Boolean(value.partial),
    interactionId: typeof value.interactionId === 'string' ? value.interactionId : undefined,
    pollAttempts: typeof value.pollAttempts === 'number' ? value.pollAttempts : undefined,
    retryAttempts: typeof value.retryAttempts === 'number' ? value.retryAttempts : undefined,
    reportPath: typeof value.reportPath === 'string' ? value.reportPath : undefined,
    evidence,
    evidenceSummary:
      value.evidenceSummary && typeof value.evidenceSummary === 'object'
        ? {
            totalSources: Number((value.evidenceSummary as { totalSources?: unknown }).totalSources) || evidence.length,
            avgConfidence:
              Number((value.evidenceSummary as { avgConfidence?: unknown }).avgConfidence) || 0,
            highConfidenceSources:
              Number((value.evidenceSummary as { highConfidenceSources?: unknown }).highConfidenceSources) || 0,
          }
        : undefined,
    resumeToken:
      value.resumeToken && typeof value.resumeToken === 'object'
        ? {
            interactionId:
              typeof (value.resumeToken as { interactionId?: unknown }).interactionId === 'string'
                ? String((value.resumeToken as { interactionId?: unknown }).interactionId)
                : undefined,
            lastStatus:
              typeof (value.resumeToken as { lastStatus?: unknown }).lastStatus === 'string'
                ? String((value.resumeToken as { lastStatus?: unknown }).lastStatus)
                : undefined,
            lastProgress:
              typeof (value.resumeToken as { lastProgress?: unknown }).lastProgress === 'number'
                ? Number((value.resumeToken as { lastProgress?: unknown }).lastProgress)
                : undefined,
          }
        : undefined,
  };
}

function extractBrowserRunResult(result: unknown): BrowserRunResultData | null {
  if (!result || typeof result !== 'object') return null;
  const value = result as {
    completed?: unknown;
    blocked?: unknown;
    blockedReason?: unknown;
    steps?: unknown;
    maxSteps?: unknown;
    finalUrl?: unknown;
    checkpointPath?: unknown;
    resumedFromCheckpoint?: unknown;
    actions?: unknown;
  };
  if (!('blocked' in value) && !('actions' in value) && !('finalUrl' in value)) {
    return null;
  }
  const actions = Array.isArray(value.actions)
    ? value.actions.map((item) => String(item || '')).filter(Boolean)
    : [];
  return {
    completed: Boolean(value.completed),
    blocked: Boolean(value.blocked),
    blockedReason: typeof value.blockedReason === 'string' ? value.blockedReason : undefined,
    steps: typeof value.steps === 'number' ? value.steps : undefined,
    maxSteps: typeof value.maxSteps === 'number' ? value.maxSteps : undefined,
    finalUrl: typeof value.finalUrl === 'string' ? value.finalUrl : undefined,
    checkpointPath: typeof value.checkpointPath === 'string' ? value.checkpointPath : undefined,
    resumedFromCheckpoint: Boolean(value.resumedFromCheckpoint),
    actions,
  };
}

function ResearchResultView({ result }: { result: ResearchResultData }) {
  const topSources = result.evidence.slice(0, 5);
  const avgConfidence = Math.round((result.evidenceSummary?.avgConfidence || 0) * 100);
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#101722] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-[#93C5FD]">Research Depth</div>
        <div className="text-[11px] text-white/50">
          status: <span className="text-white/80">{result.status}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
          <div className="text-white/40">sources</div>
          <div className="text-white/85">
            {result.evidenceSummary?.totalSources ?? result.evidence.length}
          </div>
        </div>
        <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
          <div className="text-white/40">avg confidence</div>
          <div className="text-white/85">{avgConfidence}%</div>
        </div>
        <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
          <div className="text-white/40">retries</div>
          <div className="text-white/85">{result.retryAttempts ?? 0}</div>
        </div>
      </div>
      {topSources.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-white/45">Top Evidence</div>
          {topSources.map((source, index) => (
            <a
              key={`${source.url}-${index}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border border-white/[0.08] bg-[#0B101A] px-2 py-1.5 hover:bg-[#0D1320]"
            >
              <div className="text-xs text-white/80 truncate">{source.title}</div>
              <div className="text-[10px] text-white/45 truncate">{source.url}</div>
            </a>
          ))}
        </div>
      )}
      {result.resumeToken?.interactionId && result.partial && (
        <div className="rounded-md border border-[#F59E0B]/35 bg-[#2A200D] px-2 py-1.5 text-[11px] text-[#FDE68A]">
          Partial output available. Resume token preserved for continuation.
        </div>
      )}
    </div>
  );
}

function BrowserRunResultView({ result }: { result: BrowserRunResultData }) {
  const replay = result.actions.slice(-6);
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#101722] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-[#93C5FD]">Browser Run Replay</div>
        <div
          className={cn(
            'text-[11px]',
            result.blocked ? 'text-[#FCA5A5]' : result.completed ? 'text-[#86EFAC]' : 'text-white/60',
          )}
        >
          {result.blocked ? 'blocked' : result.completed ? 'completed' : 'incomplete'}
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-white/60">
        <span>
          steps: {result.steps ?? 0}
          {typeof result.maxSteps === 'number' ? ` / ${result.maxSteps}` : ''}
        </span>
        {result.resumedFromCheckpoint && (
          <span className="px-1.5 py-0.5 rounded-full border border-[#3B82F6]/40 bg-[#1D4ED8]/20 text-[#BFDBFE]">
            resumed
          </span>
        )}
      </div>
      {result.blocked && (
        <div className="rounded-md border border-[#EF4444]/35 bg-[#3B1313] px-2 py-1.5 text-[11px] text-[#FECACA]">
          Failure explanation: {result.blockedReason || 'Safety or blocker policy interrupted this run.'}
        </div>
      )}
      {result.checkpointPath && (
        <div className="rounded-md border border-[#3B82F6]/35 bg-[#0E1C35] px-2 py-1.5 text-[11px] text-[#BFDBFE] break-all">
          Recovery checkpoint: {result.checkpointPath}
        </div>
      )}
      {result.finalUrl && (
        <a
          href={result.finalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[11px] text-[#93C5FD] hover:text-white truncate"
        >
          Final URL: {result.finalUrl}
        </a>
      )}
      {replay.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-white/45">Recent Actions</div>
          <div className="max-h-28 overflow-y-auto space-y-1">
            {replay.map((action, index) => (
              <div
                key={`${action}-${index}`}
                className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[11px] text-white/70 font-mono break-all"
              >
                {action}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface WebSearchSource {
  title: string;
  url: string;
  snippet?: string;
  domain?: string;
  confidence?: number;
}

interface WebSearchResultData {
  query: string;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  sources: WebSearchSource[];
}

function WebSearchArgsView({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-[#2563EB]/30 bg-[#0D1629] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#93C5FD]">Search Query</div>
      <div className="mt-1 text-sm text-white/90 break-words">
        {query || 'No query provided'}
      </div>
    </div>
  );
}

function WebSearchResultView({ result }: { result: WebSearchResultData }) {
  const topResults = result.sources.slice(0, 8);
  return (
    <div className="rounded-lg border border-[#2563EB]/30 bg-[#0D1629] p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-[#93C5FD]">Web Search</div>
          <div className="text-sm text-white/90 break-words">{result.query || 'Search query'}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px]">
          {result.provider && (
            <span className="px-2 py-0.5 rounded-full border border-white/[0.18] bg-white/[0.05] text-white/70">
              {result.provider}
            </span>
          )}
          {result.model && (
            <span className="px-2 py-0.5 rounded-full border border-white/[0.18] bg-white/[0.05] text-white/70">
              {result.model}
            </span>
          )}
          {result.fallbackUsed && (
            <span className="px-2 py-0.5 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#FDE68A]">
              Fallback
            </span>
          )}
        </div>
      </div>

      {topResults.length === 0 ? (
        <div className="rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-white/55">
          No search results returned.
        </div>
      ) : (
        <div className="space-y-2">
          {topResults.map((source, index) => (
            <a
              key={`${source.url}-${index}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-white/[0.08] bg-[#0A111F] px-2.5 py-2 hover:bg-[#0F1A32] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-white/85 truncate">{source.title || source.url}</div>
                {typeof source.confidence === 'number' && (
                  <div className="text-[10px] text-[#BFDBFE]">
                    {Math.round(source.confidence * 100)}%
                  </div>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-[#93C5FD] truncate">{source.domain || source.url}</div>
              {source.snippet && (
                <div className="mt-1 text-[11px] text-white/55 line-clamp-2">{source.snippet}</div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function isWebSearchTool(name: string): boolean {
  return (
    name === 'web_search'
    || name === 'google_grounded_search'
    || name.includes('grounded_search')
  );
}

function extractWebSearchResult(
  result: unknown,
  args: Record<string, unknown>,
): WebSearchResultData | null {
  const queryFromArgs = String(args.query ?? args.search ?? args.q ?? '').trim();
  if (!result || typeof result !== 'object') {
    if (!queryFromArgs) return null;
    return { query: queryFromArgs, sources: [] };
  }

  const payload = result as {
    query?: unknown;
    providerUsed?: unknown;
    provider?: unknown;
    model?: unknown;
    modelUsed?: unknown;
    fallbackUsed?: unknown;
    sources?: unknown;
    results?: unknown;
    items?: unknown;
  };

  const sourceCandidates = Array.isArray(payload.sources)
    ? payload.sources
    : Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload.items)
        ? payload.items
        : [];

  const sources: WebSearchSource[] = sourceCandidates
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => {
      const url = String(entry.url ?? entry.link ?? '').trim();
      const title = String(entry.title ?? entry.name ?? url).trim();
      const snippet = String(entry.snippet ?? entry.summary ?? entry.description ?? '').trim();
      const domain = extractDomain(url);
      const confidenceRaw = Number(entry.confidence ?? entry.score);
      return {
        title: title || url,
        url,
        snippet: snippet || undefined,
        domain: domain || undefined,
        confidence: Number.isFinite(confidenceRaw) ? confidenceRaw : undefined,
      };
    })
    .filter((source) => Boolean(source.url));

  const queryFromResult = String(payload.query ?? '').trim();
  const query = queryFromArgs || queryFromResult;

  if (!query && sources.length === 0) {
    return null;
  }

  return {
    query: query || 'Search query',
    provider: String(payload.providerUsed ?? payload.provider ?? '').trim() || undefined,
    model: String(payload.model ?? payload.modelUsed ?? '').trim() || undefined,
    fallbackUsed: Boolean(payload.fallbackUsed),
    sources,
  };
}

function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

type ExternalCliProvider = 'codex' | 'claude' | 'shared';
type ExternalCliAction = 'start' | 'progress' | 'respond' | 'cancel';

interface ExternalCliPresentation {
  provider: ExternalCliProvider;
  action: ExternalCliAction;
  providerLabel: string;
  actionLabel: string;
}

interface ExternalCliRunSummaryPreview {
  runId?: string;
  provider?: 'codex' | 'claude';
  status?: string;
  launchCommand?: string;
  startedAt?: number;
  updatedAt?: number;
  finishedAt?: number;
  latestProgress?: string | null;
  resultSummary?: string;
  errorMessage?: string;
  diagnostics?: {
    stdout?: string;
    stderr?: string;
    notes?: string[];
    exitCode?: number | null;
    exitSignal?: string | null;
    truncated?: boolean;
  };
  pendingInteraction?: {
    type?: string;
    prompt?: string;
  };
}

interface ExternalCliMonitoringHint {
  required?: boolean;
  terminal?: boolean;
  nextPollSeconds?: number | null;
  shouldRespond?: boolean;
  recommendation?: string;
}

function getExternalCliPresentation(execution: ToolExecution): ExternalCliPresentation | null {
  const name = execution.name.toLowerCase();
  let action: ExternalCliAction | null = null;
  if (name === 'start_codex_cli_run' || name === 'start_claude_cli_run') {
    action = 'start';
  } else if (name === 'external_cli_get_progress') {
    action = 'progress';
  } else if (name === 'external_cli_respond') {
    action = 'respond';
  } else if (name === 'external_cli_cancel_run') {
    action = 'cancel';
  }

  if (!action) return null;

  const provider = resolveExternalCliProvider(execution);
  const providerLabel = provider === 'codex'
    ? 'Codex'
    : provider === 'claude'
      ? 'Claude'
      : 'External';
  const actionLabel = action === 'start'
    ? 'CLI Launch'
    : action === 'progress'
      ? 'Progress Watch'
      : action === 'respond'
        ? 'HITL Response'
        : 'Run Control';

  return {
    provider,
    action,
    providerLabel,
    actionLabel,
  };
}

function resolveExternalCliProvider(execution: ToolExecution): ExternalCliProvider {
  const name = execution.name.toLowerCase();
  if (name === 'start_codex_cli_run') return 'codex';
  if (name === 'start_claude_cli_run') return 'claude';

  const argsProvider = typeof execution.args.provider === 'string' ? execution.args.provider.toLowerCase() : '';
  if (argsProvider === 'codex' || argsProvider === 'claude') return argsProvider;

  if (execution.result && typeof execution.result === 'object') {
    const resultAny = execution.result as {
      provider?: string;
      summary?: { provider?: string };
      run?: { provider?: string };
    };
    const provider = (resultAny.provider || resultAny.summary?.provider || resultAny.run?.provider || '').toLowerCase();
    if (provider === 'codex' || provider === 'claude') return provider;
  }

  return 'shared';
}

interface ScheduleTaskArgsData {
  name: string;
  prompt: string;
  scheduleLabel: string;
  timezone: string | null;
  workingDirectory: string | null;
  maxRuns: string | null;
  maxTurns: string | null;
}

interface ScheduleTaskResultData {
  workflowId: string | null;
  workflowVersion: string | null;
  name: string | null;
  schedule: string | null;
  maxRuns: string | null;
  maxTurns: string | null;
  timezone: string | null;
  defaultNotification: string | null;
  workingDirectory: string | null;
  message: string | null;
  prompt: string | null;
}

function ScheduleTaskArgsView({ args }: { args: ScheduleTaskArgsData }) {
  return (
    <div className="rounded-lg border border-[#3B82F6]/25 bg-[#0F1624]">
      <div className="px-3 py-2 border-b border-white/[0.08] flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#93C5FD]">
          Schedule Plan
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#1D4ED8]/20 text-[#BFDBFE] border border-[#3B82F6]/30">
          Pending Creation
        </span>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <ScheduleField label="Task Name" value={args.name || 'Untitled task'} />
          <ScheduleField label="Cadence" value={args.scheduleLabel} />
          <ScheduleField label="Timezone" value={args.timezone || 'Local timezone'} />
          <ScheduleField label="Working Dir" value={args.workingDirectory || 'Current workspace'} mono />
          <ScheduleField label="Run Limit" value={args.maxRuns || 'Unlimited'} />
          <ScheduleField label="Turns / Run" value={args.maxTurns || 'Default'} />
        </div>

        {args.prompt && (
          <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10] px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-white/45 mb-1">Task Prompt</div>
            <p className="text-xs text-white/80 whitespace-pre-wrap break-words">
              {truncateMiddle(args.prompt, 420)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleTaskResultView({ result }: { result: ScheduleTaskResultData }) {
  return (
    <div className="rounded-lg border border-[#50956A]/30 bg-[#0E1712]">
      <div className="px-3 py-2 border-b border-white/[0.08] flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#8FDCA9]">
          Scheduled Task Created
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#50956A]/20 text-[#B9F2CB] border border-[#50956A]/35">
          Active
        </span>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <ScheduleField label="Task Name" value={result.name || 'Untitled task'} />
          <ScheduleField label="Cadence" value={result.schedule || 'Not provided'} />
          <ScheduleField label="Timezone" value={result.timezone || 'Local timezone'} />
          <ScheduleField label="Run Limit" value={result.maxRuns || 'Unlimited'} />
          <ScheduleField label="Turns / Run" value={result.maxTurns || 'Default'} />
          <ScheduleField label="Delivery" value={result.defaultNotification || 'No default channel'} />
          <ScheduleField label="Workflow ID" value={result.workflowId || 'n/a'} mono />
          <ScheduleField
            label="Workflow Version"
            value={result.workflowVersion ? `v${result.workflowVersion}` : 'n/a'}
          />
          <ScheduleField
            label="Working Dir"
            value={result.workingDirectory || 'Current workspace'}
            mono
          />
        </div>

        {result.prompt && (
          <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10] px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-white/45 mb-1">Task Prompt</div>
            <p className="text-xs text-white/80 whitespace-pre-wrap break-words">
              {truncateMiddle(result.prompt, 420)}
            </p>
          </div>
        )}

        {result.message && (
          <div className="rounded-lg border border-[#50956A]/25 bg-[#102016] px-3 py-2 text-xs text-[#C4F0D3]">
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/45">{label}</div>
      <div className={cn('mt-0.5 text-white/90', mono && 'font-mono text-[11px] break-all')}>{value}</div>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isScheduleTaskTool(name: string): boolean {
  return name === 'schedule_task';
}

function extractScheduleTaskArgs(args: Record<string, unknown>): ScheduleTaskArgsData | null {
  if (!isRecord(args)) return null;

  const scheduleRecord = isRecord(args.schedule) ? args.schedule : null;
  const scheduleLabel = formatScheduleInput(scheduleRecord);
  const timezone = scheduleRecord && typeof scheduleRecord.timezone === 'string'
    ? scheduleRecord.timezone
    : null;

  return {
    name: typeof args.name === 'string' ? args.name : '',
    prompt: typeof args.prompt === 'string' ? args.prompt : '',
    scheduleLabel,
    timezone,
    workingDirectory: normalizeDisplayValue(args.workingDirectory),
    maxRuns: normalizeRunLimit(args.maxRuns),
    maxTurns: normalizeNumeric(args.maxTurns),
  };
}

function extractScheduleTaskResult(
  result: unknown,
  args: Record<string, unknown>,
): ScheduleTaskResultData | null {
  const root = isRecord(result) ? result : null;
  const payload = root && isRecord(root.data) ? root.data : root;
  if (!payload) return null;

  const argSchedule = isRecord(args.schedule) ? args.schedule : null;
  const schedule = normalizeDisplayValue(payload.schedule) || formatScheduleInput(argSchedule);
  const timezone = extractTimezone(schedule) || normalizeDisplayValue(argSchedule?.timezone);
  const defaultNotification = formatDefaultNotification(payload.defaultNotification);

  return {
    workflowId: normalizeDisplayValue(payload.workflowId),
    workflowVersion: normalizeNumeric(payload.workflowVersion),
    name: normalizeDisplayValue(payload.name) || normalizeDisplayValue(args.name),
    schedule,
    maxRuns: normalizeRunLimit(payload.maxRuns) || normalizeRunLimit(args.maxRuns),
    maxTurns: normalizeNumeric(args.maxTurns),
    timezone,
    defaultNotification,
    workingDirectory: normalizeDisplayValue(args.workingDirectory),
    message: normalizeDisplayValue(payload.message),
    prompt: normalizeDisplayValue(args.prompt),
  };
}

function formatScheduleInput(schedule: Record<string, unknown> | null): string {
  if (!schedule) return 'Not specified';

  const type = typeof schedule.type === 'string' ? schedule.type.toLowerCase() : '';
  const timezone = normalizeDisplayValue(schedule.timezone);
  const withTimezone = (value: string): string => timezone ? `${value} (${timezone})` : value;

  if (type === 'once') {
    const datetime = normalizeDisplayValue(schedule.datetime);
    return withTimezone(datetime ? `One-time at ${datetime}` : 'One-time');
  }

  if (type === 'daily') {
    const time = normalizeDisplayValue(schedule.time);
    return withTimezone(time ? `Every day at ${time}` : 'Daily');
  }

  if (type === 'weekly') {
    const day = normalizeDisplayValue(schedule.dayOfWeek);
    const time = normalizeDisplayValue(schedule.time);
    const dayLabel = day ? capitalize(day) : 'Weekly';
    return withTimezone(time ? `Every ${dayLabel} at ${time}` : `Every ${dayLabel}`);
  }

  if (type === 'interval') {
    const every = normalizeNumeric(schedule.every);
    return every ? `Every ${every} minute${every === '1' ? '' : 's'}` : 'Recurring interval';
  }

  if (type === 'cron') {
    const expression = normalizeDisplayValue(schedule.expression);
    return withTimezone(expression ? `Cron: ${expression}` : 'Cron schedule');
  }

  return 'Custom schedule';
}

function extractTimezone(schedule: string | null): string | null {
  if (!schedule) return null;
  const tzMatch = schedule.match(/\(([^)]+)\)\s*$/);
  if (!tzMatch) return null;
  return tzMatch[1]?.trim() || null;
}

function formatDefaultNotification(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const platform = normalizeDisplayValue(value.platform);
  const chatId = normalizeDisplayValue(value.chatId);
  if (!platform) return null;
  return chatId ? `${platform} (${chatId})` : platform;
}

function normalizeDisplayValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumeric(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function normalizeRunLimit(value: unknown): string | null {
  if (value === 'unlimited') return 'Unlimited';
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  if (typeof value === 'string' && value.trim().length > 0) {
    if (value.trim().toLowerCase() === 'unlimited') return 'Unlimited';
    return value.trim();
  }
  return null;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ExternalCliAccent({ provider, compact = false }: { provider: ExternalCliProvider; compact?: boolean }) {
  return (
    <div className={cn(
      'external-cli-accent',
      provider === 'codex' && 'external-cli-accent--codex',
      provider === 'claude' && 'external-cli-accent--claude',
      provider === 'shared' && 'external-cli-accent--shared',
      compact && 'external-cli-accent--compact'
    )}>
      <span className="external-cli-accent__dot" />
    </div>
  );
}

function renderToolSpecificArgs(
  execution: ToolExecution,
  presentation: ExternalCliPresentation | null,
): ToolView | null {
  if (isWebSearchTool(execution.name.toLowerCase())) {
    const query = String(execution.args.query ?? execution.args.search ?? execution.args.q ?? '').trim();
    return {
      hideRaw: true,
      node: <WebSearchArgsView query={query} />,
    };
  }

  if (isScheduleTaskTool(execution.name.toLowerCase())) {
    const scheduleArgs = extractScheduleTaskArgs(execution.args);
    if (scheduleArgs) {
      return {
        hideRaw: true,
        node: <ScheduleTaskArgsView args={scheduleArgs} />,
      };
    }
  }

  if (!presentation) {
    return null;
  }

  const args = execution.args as Record<string, unknown>;
  const workingDirectory = String(args.working_directory ?? args.workingDirectory ?? '');
  const prompt = String(args.prompt ?? '').trim();
  const runId = String(args.run_id ?? args.runId ?? '').trim();
  const provider = String(args.provider ?? '').trim();
  const responseText = String(args.response_text ?? args.responseText ?? '').trim();
  const createIfMissing = args.create_if_missing;
  const bypassPermission = args.bypassPermission ?? args.bypass_permission;

  return {
    hideRaw: true,
    node: (
      <div className="external-cli-args">
        {presentation.action === 'start' && (
          <>
            <div className="external-cli-args__grid">
              <ExternalCliField label="Working Dir" value={workingDirectory || 'not provided'} mono />
              <ExternalCliField
                label="Create Missing Dir"
                value={typeof createIfMissing === 'boolean' ? (createIfMissing ? 'true' : 'false') : 'unset'}
              />
              <ExternalCliField
                label="Bypass"
                value={typeof bypassPermission === 'boolean' ? (bypassPermission ? 'true' : 'false') : 'unset'}
              />
            </div>
            {prompt && (
              <div className="external-cli-args__prompt">
                <div className="external-cli-args__label">Prompt</div>
                <div className="external-cli-args__slide" title={prompt}>
                  <p className="external-cli-args__value external-cli-args__value--slide">{prompt}</p>
                </div>
              </div>
            )}
          </>
        )}

        {presentation.action === 'progress' && (
          <div className="external-cli-args__grid">
            <ExternalCliField label="Run ID" value={runId || 'latest run'} mono />
            <ExternalCliField label="Provider Filter" value={provider || 'auto'} />
          </div>
        )}

        {presentation.action === 'respond' && (
          <>
            <div className="external-cli-args__grid">
              <ExternalCliField label="Run ID" value={runId || 'latest waiting run'} mono />
            </div>
            {responseText && (
              <div className="external-cli-args__prompt">
                <div className="external-cli-args__label">Response Text</div>
                <p className="external-cli-args__value">{truncateMiddle(responseText, 220)}</p>
              </div>
            )}
          </>
        )}

        {presentation.action === 'cancel' && (
          <div className="external-cli-args__grid">
            <ExternalCliField label="Run ID" value={runId || 'latest active run'} mono />
            <ExternalCliField label="Provider Filter" value={provider || 'auto'} />
          </div>
        )}
      </div>
    ),
  };
}

function ExternalCliField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="external-cli-field">
      <div className="external-cli-field__label">{label}</div>
      <div className={cn('external-cli-field__value', mono && 'external-cli-field__value--mono')}>
        {value}
      </div>
    </div>
  );
}

function renderExternalCliResult(
  execution: ToolExecution,
  presentation: ExternalCliPresentation | null,
): JSX.Element | null {
  if (!presentation || execution.error) {
    return null;
  }

  const summary = extractExternalCliSummary(execution.result);
  const progress = extractExternalCliProgressEntries(execution.result);
  const monitoring = extractExternalCliMonitoringHint(execution.result);

  if (!summary && progress.length === 0 && !monitoring) {
    return null;
  }

  return (
    <div className="external-cli-result">
      <div className="external-cli-result__header">
        <span className="external-cli-result__title">External CLI Runtime</span>
        <span className={cn(
          'external-cli-result__status',
          summary?.status === 'completed' && 'external-cli-result__status--completed',
          summary?.status === 'failed' && 'external-cli-result__status--failed',
          summary?.status === 'running' && 'external-cli-result__status--running',
          summary?.status === 'waiting_user' && 'external-cli-result__status--waiting'
        )}>
          {summary?.status || execution.status}
        </span>
      </div>

      {summary && (
        <div className="external-cli-result__grid">
          <ExternalCliField label="Run ID" value={summary.runId || 'unknown'} mono />
          <ExternalCliField label="Provider" value={summary.provider || presentation.providerLabel} />
          <ExternalCliField label="Started" value={formatEpoch(summary.startedAt)} />
          <ExternalCliField label="Updated" value={formatEpoch(summary.updatedAt)} />
        </div>
      )}

      {summary?.launchCommand && (
        <div className="external-cli-result__summary">
          <div className="external-cli-result__label">Actual Command</div>
          <div className="external-cli-result__command" title={summary.launchCommand}>
            <p className="external-cli-result__command-text">{summary.launchCommand}</p>
          </div>
        </div>
      )}

      {summary?.pendingInteraction?.prompt && (
        <div className="external-cli-result__interaction">
          <div className="external-cli-result__interaction-label">Waiting For User</div>
          <p className="external-cli-result__interaction-text">{summary.pendingInteraction.prompt}</p>
        </div>
      )}

      {summary?.latestProgress && (
        <div className="external-cli-result__summary">
          <div className="external-cli-result__label">Latest Update</div>
          <p>{summary.latestProgress}</p>
        </div>
      )}

      {summary?.resultSummary && (
        <div className="external-cli-result__summary">
          <div className="external-cli-result__label">Result</div>
          <p>{summary.resultSummary}</p>
        </div>
      )}

      {summary?.errorMessage && (
        <div className="external-cli-result__error">{summary.errorMessage}</div>
      )}

      {summary?.diagnostics && (
        <div className="external-cli-result__summary">
          <div className="external-cli-result__label flex items-center justify-between gap-2">
            <span>Diagnostics</span>
            {summary.diagnostics.truncated ? (
              <span className="text-[10px] uppercase tracking-wide text-[#F59E0B]">truncated</span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10] px-2 py-1.5 text-white/65">
              Exit code: <span className="text-white/90">{formatExitCode(summary.diagnostics.exitCode)}</span>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10] px-2 py-1.5 text-white/65">
              Exit signal: <span className="text-white/90">{summary.diagnostics.exitSignal || 'none'}</span>
            </div>
          </div>
          {Array.isArray(summary.diagnostics.notes) && summary.diagnostics.notes.length > 0 && (
            <DiagnosticsLogBlock
              title="Notes"
              value={summary.diagnostics.notes.join('\n')}
            />
          )}
          {summary.diagnostics.stderr && summary.diagnostics.stderr.trim().length > 0 && (
            <DiagnosticsLogBlock title="stderr" value={summary.diagnostics.stderr} />
          )}
          {summary.diagnostics.stdout && summary.diagnostics.stdout.trim().length > 0 && (
            <DiagnosticsLogBlock title="stdout" value={summary.diagnostics.stdout} />
          )}
        </div>
      )}

      {monitoring && (
        <div className="external-cli-result__monitor">
          <span className="external-cli-result__monitor-label">Agent Monitoring</span>
          <span>
            {monitoring.terminal
              ? 'Terminal state reached.'
              : monitoring.nextPollSeconds
                ? `Next poll in ${monitoring.nextPollSeconds}s`
                : 'Continue polling.'}
          </span>
        </div>
      )}

      {progress.length > 0 && (
        <div className="external-cli-result__timeline">
          <div className="external-cli-result__label">Recent Progress</div>
          <div className="external-cli-result__events">
            {progress.slice(-6).map((entry, index) => (
              <div key={`${entry.timestamp ?? index}-${index}`} className="external-cli-result__event">
                <span className="external-cli-result__event-dot" />
                <span className="external-cli-result__event-time">{formatEpoch(entry.timestamp)}</span>
                <span className="external-cli-result__event-text">{entry.message || 'update'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function extractExternalCliSummary(result: unknown): ExternalCliRunSummaryPreview | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const resultAny = result as {
    run?: ExternalCliRunSummaryPreview;
    summary?: ExternalCliRunSummaryPreview;
    runId?: string;
    provider?: 'codex' | 'claude';
    status?: string;
    launchCommand?: string;
    startedAt?: number;
    updatedAt?: number;
    finishedAt?: number;
    latestProgress?: string | null;
    resultSummary?: string;
    errorMessage?: string;
    diagnostics?: ExternalCliRunSummaryPreview['diagnostics'];
    pendingInteraction?: { type?: string; prompt?: string };
  };

  const summary = resultAny.run || resultAny.summary;
  if (summary && typeof summary === 'object') {
    return summary;
  }

  if (!resultAny.runId && !resultAny.status && !resultAny.provider) {
    return null;
  }

  return {
    runId: resultAny.runId,
    provider: resultAny.provider,
    status: resultAny.status,
    launchCommand: resultAny.launchCommand,
    startedAt: resultAny.startedAt,
    updatedAt: resultAny.updatedAt,
    finishedAt: resultAny.finishedAt,
    latestProgress: resultAny.latestProgress,
    resultSummary: resultAny.resultSummary,
    errorMessage: resultAny.errorMessage,
    diagnostics: resultAny.diagnostics,
    pendingInteraction: resultAny.pendingInteraction,
  };
}

function DiagnosticsLogBlock({ title, value }: { title: string; value: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied', `${title} copied to clipboard`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Copy failed', message);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-white/[0.08] bg-[#0B0C10]">
      <div className="px-2 py-1.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-white/55">{title}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-[11px] text-white/65 hover:text-white"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>
      <pre className="max-h-52 overflow-auto p-2 text-xs leading-relaxed whitespace-pre-wrap text-white/78 select-text">
        {value}
      </pre>
    </div>
  );
}

function formatExitCode(code?: number | null): string {
  if (typeof code === 'number') return String(code);
  if (code === null) return 'null';
  return 'n/a';
}

function extractExternalCliProgressEntries(result: unknown): Array<{ timestamp?: number; message?: string }> {
  if (!result || typeof result !== 'object') {
    return [];
  }

  const resultAny = result as {
    recentProgress?: Array<{ timestamp?: number; message?: string }>;
    run?: { recentProgress?: Array<{ timestamp?: number; message?: string }> };
  };

  const entries = resultAny.recentProgress || resultAny.run?.recentProgress;
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : undefined,
      message: typeof entry.message === 'string' ? entry.message : undefined,
    }));
}

function extractExternalCliMonitoringHint(result: unknown): ExternalCliMonitoringHint | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const resultAny = result as {
    monitoring?: ExternalCliMonitoringHint;
    run?: { monitoring?: ExternalCliMonitoringHint };
  };

  const hint = resultAny.monitoring || resultAny.run?.monitoring;
  if (!hint || typeof hint !== 'object') {
    return null;
  }

  return hint;
}

function formatEpoch(value?: number): string {
  if (!value || !Number.isFinite(value)) {
    return 'n/a';
  }

  try {
    const date = new Date(value);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'n/a';
  }
}

function isShellTool(name: string) {
  return name.includes('execute') || name.includes('bash') || name.includes('shell');
}

function isReadFileTool(name: string) {
  return name.includes('read_file');
}

function isWriteFileTool(name: string) {
  return name.includes('write_file');
}

function isEditFileTool(name: string) {
  return name.includes('edit_file');
}

function isListTool(name: string) {
  return name.includes('ls') || name.includes('list_directory') || name.includes('glob');
}

function isSearchTool(name: string) {
  return name.includes('grep') || name.includes('search');
}

function isHttpTool(name: string) {
  return name.includes('fetch') || name.includes('http');
}

function isMediaGenerationTool(name: string) {
  return name.includes('generate_image') || name.includes('edit_image') || name.includes('generate_video');
}

function extractShellOutput(result: unknown) {
  if (!result || typeof result !== 'object') {
    return { output: typeof result === 'string' ? result : '', exitCode: null, truncated: false };
  }
  const resultAny = result as {
    output?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    truncated?: boolean;
  };
  const output = resultAny.output ?? [resultAny.stdout, resultAny.stderr].filter(Boolean).join('\n');
  return {
    output: output || '',
    exitCode: resultAny.exitCode ?? null,
    truncated: Boolean(resultAny.truncated),
  };
}

type FileEntry = { path: string; is_dir?: boolean; size?: number; modified_at?: string };

function extractFileEntries(result: unknown): FileEntry[] | null {
  if (!result) return null;
  const entries = Array.isArray(result) ? result : (result as { files?: unknown }).files;
  if (!Array.isArray(entries)) return null;
  return entries.filter((entry): entry is FileEntry => !!entry && typeof (entry as { path?: unknown }).path === 'string');
}

type SearchMatch = { path: string; line?: number; text?: string };

function extractSearchMatches(result: unknown): SearchMatch[] | null {
  if (!result) return null;
  const matches = Array.isArray(result) ? result : (result as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) return null;
  return matches.filter((entry): entry is SearchMatch => !!entry && typeof (entry as { path?: unknown }).path === 'string');
}

type HttpResponse = { status?: number | string; url?: string; body?: string };

function extractHttpResponse(result: unknown): HttpResponse | null {
  if (!result || typeof result !== 'object') return null;
  const resultAny = result as {
    status?: number | string;
    statusCode?: number | string;
    url?: string;
    body?: string;
    text?: string;
    response?: { status?: number; body?: string };
  };
  const body = resultAny.body ?? resultAny.text ?? resultAny.response?.body;
  const status = resultAny.status ?? resultAny.statusCode ?? resultAny.response?.status;
  if (!body && !status && !resultAny.url) return null;
  return {
    status,
    url: resultAny.url,
    body: body ? String(body) : undefined,
  };
}

function truncateMiddle(value: string, max = 120) {
  if (value.length <= max) return value;
  const head = Math.ceil(max * 0.6);
  const tail = Math.floor(max * 0.3);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function FilePreviewView({ path, content }: { path: string; content: string }) {
  const language = guessLanguage(path, content);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0B0C10]">
      <div className="px-3 py-2 text-xs text-white/50 border-b border-white/[0.06]">
        File preview {path ? `• ${path}` : ''}
      </div>
      <CodeBlock code={content} language={language} showLineNumbers={false} maxHeight={240} />
    </div>
  );
}

function FileDiffView({
  path,
  oldString,
  newString,
  content,
}: {
  path: string;
  oldString: string;
  newString: string;
  content: string;
}) {
  const hasEdit = oldString || newString;
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0B0C10]">
      <div className="px-3 py-2 text-xs text-white/50 border-b border-white/[0.06]">
        {hasEdit ? 'Edit preview' : 'File write'} {path ? `• ${path}` : ''}
      </div>
      {hasEdit ? (
        <div className="px-3 py-2 font-mono text-xs space-y-1">
          <div className="text-[#FF5449]">- {truncateMiddle(oldString || '[empty]')}</div>
          <div className="text-[#50956A]">+ {truncateMiddle(newString || '[empty]')}</div>
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-white/60">
          {content ? `Wrote ${content.length} characters.` : 'File created/updated.'}
        </div>
      )}
    </div>
  );
}

function DirectoryListView({ entries }: { entries: FileEntry[] }) {
  const displayed = entries.slice(0, 12);
  const remaining = Math.max(0, entries.length - displayed.length);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0B0C10]">
      <div className="px-3 py-2 text-xs text-white/50 border-b border-white/[0.06]">
        Directory listing
      </div>
      <div className="px-3 py-2 space-y-1 text-xs text-white/70">
        {displayed.map((entry) => (
          <div key={entry.path} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {entry.is_dir ? '📁' : '📄'} {entry.path}
            </span>
            {entry.size !== undefined && !entry.is_dir && (
              <span className="text-white/40">{formatBytes(entry.size)}</span>
            )}
          </div>
        ))}
        {remaining > 0 && (
          <div className="text-white/40">+{remaining} more items</div>
        )}
      </div>
    </div>
  );
}

function SearchResultsView({ matches }: { matches: SearchMatch[] }) {
  const grouped = matches.reduce<Record<string, SearchMatch[]>>((acc, match) => {
    acc[match.path] = acc[match.path] ?? [];
    acc[match.path].push(match);
    return acc;
  }, {});

  const files = Object.keys(grouped).slice(0, 6);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0B0C10]">
      <div className="px-3 py-2 text-xs text-white/50 border-b border-white/[0.06]">
        Search results
      </div>
      <div className="px-3 py-2 space-y-2 text-xs text-white/70">
        {files.map((file) => (
          <div key={file}>
            <div className="text-white/60 font-medium">{file}</div>
            {grouped[file].slice(0, 3).map((match, idx) => (
              <div key={`${file}-${idx}`} className="text-white/40">
                {match.line ? `${match.line}: ` : ''}{match.text}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function HttpResponseView({ response }: { response: HttpResponse }) {
  const preview = response.body ? buildPreview(response.body, 12, 1200) : null;
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0B0C10]">
      <div className="px-3 py-2 text-xs text-white/50 border-b border-white/[0.06] flex items-center justify-between">
        <span>HTTP response</span>
        {response.status && <span>Status {response.status}</span>}
      </div>
      {response.url && (
        <div className="px-3 py-2 text-xs text-white/40 border-b border-white/[0.06] break-all">
          {response.url}
        </div>
      )}
      {response.body && (
        <pre className="px-3 py-2 text-xs text-white/70 whitespace-pre-wrap">
          {preview?.text ?? response.body}
        </pre>
      )}
    </div>
  );
}

function TerminalView({ command, output, exitCode, truncated }: { command: string; output: string; exitCode: number | null; truncated: boolean }) {
  const preview = buildPreview(output || 'No output', 16, 2000);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0B0C10]">
      <div className="px-3 py-2 text-xs text-white/50 border-b border-white/[0.06] flex items-center justify-between">
        <span>Terminal</span>
        {exitCode !== null && <span>Exit {exitCode}</span>}
      </div>
      <div className="px-3 py-2 font-mono text-xs text-white/80 border-b border-white/[0.06]">
        $ {command || 'command'}
      </div>
      <pre className="px-3 py-2 text-xs text-white/70 whitespace-pre-wrap">
        {preview.text}
      </pre>
      {preview.truncated && (
        <div className="px-3 pb-2 text-[11px] text-white/40">
          Output truncated{truncated ? ' by tool' : ''}.
        </div>
      )}
    </div>
  );
}

type MediaItem = { path?: string; url?: string; mimeType?: string; data?: string };

function MediaGenerationView({
  prompt,
  items,
  isVideo,
}: {
  prompt: string;
  items?: MediaItem[];
  isVideo: boolean;
}) {
  const mediaItems = items ?? [];

  // Helper to get the source URL for media - prefer base64 data, fallback to path/url
  const getMediaSrc = (item: MediaItem): string => {
    // Prefer base64 data for reliable display
    if (item.data) {
      return `data:${item.mimeType || (isVideo ? 'video/mp4' : 'image/png')};base64,${item.data}`;
    }
    // Fallback to path with Tauri's asset protocol
    if (item.path) {
      return convertFileSrc(item.path);
    }
    // Fallback to URL
    if (item.url) {
      return item.url;
    }
    return '';
  };

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0B0C10]">
      <div className="px-3 py-2 text-xs text-white/50 border-b border-white/[0.06]">
        {isVideo ? 'Video Generation' : 'Image Generation'}
      </div>

      {/* Prompt display */}
      <div className="px-3 py-2 border-b border-white/[0.06] overflow-hidden">
        <div className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Prompt</div>
        <p className="text-sm text-white/80 whitespace-pre-wrap break-words overflow-wrap-anywhere" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{prompt}</p>
      </div>

      {/* Media display */}
      {mediaItems.length > 0 && (
        <div className="p-3">
          {isVideo ? (
            <div className="space-y-3">
              {mediaItems.map((item, idx) => {
                const src = getMediaSrc(item);
                if (!src) return null;
                return (
                  <video
                    key={`video-${idx}`}
                    src={src}
                    controls
                    className="w-full rounded-lg border border-white/[0.08]"
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {mediaItems.slice(0, 4).map((item, idx) => {
                const src = getMediaSrc(item);
                if (!src) return null;
                return (
                  <img
                    key={`image-${idx}`}
                    src={src}
                    alt={`Generated ${idx + 1}`}
                    className="w-full rounded-lg border border-white/[0.08] object-cover"
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {mediaItems.length === 0 && (
        <div className="px-3 py-4 text-center text-sm text-white/40">
          No media generated
        </div>
      )}
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function guessLanguage(path: string, content: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return getResultLanguage(content);
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'js' || ext === 'jsx') return 'javascript';
  if (ext === 'json') return 'json';
  if (ext === 'py') return 'python';
  if (ext === 'rs') return 'rust';
  if (ext === 'go') return 'go';
  if (ext === 'md') return 'markdown';
  if (ext === 'css') return 'css';
  if (ext === 'html') return 'html';
  return 'text';
}

function renderMediaPreview(result: unknown) {
  if (!result || typeof result !== 'object') return null;

  type MediaPreviewItem = { data?: string; mimeType?: string; path?: string; url?: string };
  const resultAny = result as {
    images?: MediaPreviewItem[];
    generatedImages?: Array<{ image?: { imageBytes?: string; mimeType?: string } }>;
    videos?: MediaPreviewItem[];
    generatedVideos?: Array<{ video?: { videoBytes?: string; mimeType?: string; uri?: string } }>;
  };

  const images: MediaPreviewItem[] =
    resultAny.images
      ?? resultAny.generatedImages?.map((img) => ({
        data: img.image?.imageBytes,
        mimeType: img.image?.mimeType || 'image/png',
      }))
      ?? [];

  const videos: MediaPreviewItem[] =
    resultAny.videos
      ?? resultAny.generatedVideos?.map((vid) => ({
        data: vid.video?.videoBytes,
        mimeType: vid.video?.mimeType || 'video/mp4',
        url: vid.video?.uri,
      }))
      ?? [];

  if (images.length === 0 && videos.length === 0) return null;

  // Helper to resolve media source - use convertFileSrc for local paths
  const getMediaSrc = (item: MediaPreviewItem): string => {
    if (item.data) {
      return `data:${item.mimeType || 'application/octet-stream'};base64,${item.data}`;
    }
    if (item.path) {
      return convertFileSrc(item.path);
    }
    if (item.url) {
      return item.url;
    }
    return '';
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.slice(0, 4).map((img, idx) => {
            const src = getMediaSrc(img);
            if (!src) return null;
            return (
              <img
                key={`img-${idx}`}
                src={src}
                alt="Generated"
                className="w-full rounded-lg border border-white/[0.08] object-cover"
              />
            );
          })}
        </div>
      )}
      {videos.length > 0 && (
        <div className="space-y-2">
          {videos.slice(0, 2).map((vid, idx) => {
            const src = getMediaSrc(vid);
            if (!src) return null;
            return (
              <video
                key={`vid-${idx}`}
                src={src}
                controls
                className="w-full rounded-lg border border-white/[0.08]"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderSourcesPreview(result: unknown) {
  if (!result || typeof result !== 'object') return null;
  const resultAny = result as { sources?: Array<{ title?: string; url?: string }> };
  if (!resultAny.sources || resultAny.sources.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-white/40 uppercase tracking-wide">Sources</div>
      <div className="flex flex-wrap gap-2">
        {resultAny.sources.slice(0, 6).map((source, idx) => (
          <a
            key={`src-${idx}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white/[0.04] rounded-md hover:bg-white/[0.08] transition-colors"
          >
            <Globe className="w-3 h-3" />
            {source.title || source.url}
          </a>
        ))}
      </div>
    </div>
  );
}

function renderA2uiPreview(
  result: unknown,
  setPreviewArtifact: (artifact: { id: string; path: string; type: 'created' | 'modified' | 'deleted' | 'touched'; content?: string; timestamp: number }) => void
) {
  if (!result || typeof result !== 'object') return null;
  const resultAny = result as { a2ui?: unknown; ui?: unknown };
  const payload = resultAny.a2ui ?? resultAny.ui;
  if (!payload) return null;

  const content = JSON.stringify(payload, null, 2);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() =>
          setPreviewArtifact({
            id: `a2ui-${Date.now()}`,
            path: 'a2ui-preview.json',
            type: 'created',
            content,
            timestamp: Date.now(),
          })
        }
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1D4ED8]/20 text-[#93C5FD] hover:bg-[#1D4ED8]/30 transition-colors"
      >
        <Eye className="w-4 h-4" />
        Open UI Preview
      </button>
    </div>
  );
}

function renderDesignPreview(
  result: unknown,
  setPreviewArtifact: (artifact: { id: string; path: string; type: 'created' | 'modified' | 'deleted' | 'touched'; content?: string; timestamp: number }) => void
) {
  const payload = extractDesignPreviewPayload(result);
  if (!payload) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() =>
          setPreviewArtifact({
            id: `design-${Date.now()}`,
            path: payload.path,
            type: 'created',
            content: payload.content,
            timestamp: Date.now(),
          })
        }
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FFB347]/20 text-[#FFB347] hover:bg-[#FFB347]/30 transition-colors"
      >
        <Palette className="w-4 h-4" />
        Open Design Preview
      </button>
    </div>
  );
}

function extractDesignPreviewPayload(result: unknown): { path: string; content: string } | null {
  if (!result || typeof result !== 'object') return null;
  const resultAny = result as Record<string, unknown>;
  const design = resultAny.design as Record<string, unknown> | undefined;
  const code = resultAny.code as Record<string, unknown> | undefined;

  const html = (resultAny.html || design?.html || code?.html) as string | undefined;
  const css = (resultAny.css || design?.css || code?.css) as string | undefined;
  const svg = (resultAny.svg || design?.svg) as string | undefined;
  const previewUrl = (resultAny.previewUrl || (resultAny.preview as { url?: string } | undefined)?.url) as string | undefined;

  if (html || css) {
    const htmlContent = html
      ? html
      : `<html><head>${css ? `<style>${css}</style>` : ''}</head><body></body></html>`;
    const combined = css && html && !html.includes('<style')
      ? htmlContent.replace(/<head>/i, `<head><style>${css}</style>`)
      : htmlContent;
    return { path: 'stitch-design.html', content: combined };
  }

  if (svg) {
    const wrappedSvg = `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#fff;">${svg}</body></html>`;
    return { path: 'stitch-design.svg.html', content: wrappedSvg };
  }

  if (previewUrl) {
    const previewHtml = `<html><body style="margin:0;"><iframe src="${previewUrl}" style="width:100%;height:100%;border:0;"></iframe></body></html>`;
    return { path: 'stitch-preview.html', content: previewHtml };
  }

  return null;
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
