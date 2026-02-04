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

export function ToolExecutionCard({ execution, className, isActive }: ToolExecutionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [argsExpanded, setArgsExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);

  const { icon: Icon, title: displayName, category } = getToolMeta(execution.name);
  const { activeSessionId } = useSessionStore();
  const pendingPermission = useChatStore((state) =>
    state.getSessionState(activeSessionId).pendingPermissions.find((permission) => permission.toolCallId === execution.id)
  );
  const sourcesPreview = renderSourcesPreview(execution.result);
  const setPreviewArtifact = useAgentStore((state) => state.setPreviewArtifact);
  const a2uiPreview = renderA2uiPreview(execution.result, setPreviewArtifact);
  const designPreview = renderDesignPreview(execution.result, setPreviewArtifact);
  const safetyBlock = getSafetyBlock(execution.result);
  const argsText = JSON.stringify(execution.args, null, 2);
  const argsPreview = buildPreview(argsText);
  const argsDisplay = argsExpanded ? argsText : argsPreview.text;
  const resultText = formatResult(execution.result);
  const resultPreview = buildPreview(resultText);
  const resultDisplay = resultExpanded ? resultText : resultPreview.text;
  const toolView = renderToolSpecificResult(execution);
  const specializedResult = toolView?.node;
  const hideRawResult = toolView?.hideRaw ?? false;
  // Only render mediaPreview if we don't have a specialized media view (to avoid duplicates)
  const isMediaTool = isMediaGenerationTool(execution.name.toLowerCase());
  const mediaPreview = isMediaTool ? null : renderMediaPreview(execution.result);

  const statusConfig = getStatusConfig(execution.status);
  const duration = execution.completedAt
    ? formatDuration(execution.completedAt - execution.startedAt)
    : null;

  const handleCopyArgs = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(execution.args, null, 2));
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
      const resultText = typeof execution.result === 'string'
        ? execution.result
        : JSON.stringify(execution.result, null, 2);
      await navigator.clipboard.writeText(resultText);
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
        'rounded-xl border overflow-hidden transition-all duration-200 max-w-full',
        execution.status === 'running'
          ? 'bg-[#101421] border-[#4C71FF]/30'
          : execution.status === 'error'
            ? 'bg-[#2A1414] border-[#FF5449]/30'
            : execution.status === 'success'
              ? 'bg-[#0F1712] border-[#50956A]/30'
              : 'bg-[#0F1014] border-white/[0.06]',
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-left',
          isActive && 'codex-shimmer-row'
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            'p-2 rounded-lg flex-shrink-0',
            execution.status === 'running'
              ? 'bg-[#4C71FF]/20'
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

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/40">
            <span className="flex-shrink-0">{category}</span>
            <span className="text-white/20 flex-shrink-0">•</span>
            <span className={cn('text-white/70 truncate', !primaryArg && execution.status === 'running' && 'codex-shimmer-text')}>
              {displayName}
            </span>
          </div>
          {primaryArg && (
            <p
              className={cn(
                'text-sm text-white/80 font-mono truncate mt-0.5 max-w-full',
                execution.status === 'running' && 'codex-shimmer-text'
              )}
              title={primaryArg}
            >
              {primaryArg}
            </p>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 flex-shrink-0">
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

      {pendingPermission && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F2B] border border-[#4C71FF]/25 text-xs text-white/70">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8CA2FF]" />
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
                <CodeBlock
                  code={argsDisplay}
                  language="json"
                  showLineNumbers={false}
                  maxHeight={180}
                />
                {argsPreview.truncated && (
                  <button
                    onClick={() => setArgsExpanded((prev) => !prev)}
                    className="mt-2 text-xs text-white/50 hover:text-white/80 transition-colors"
                  >
                    {argsExpanded
                      ? 'Collapse arguments'
                      : `Expand arguments (${argsPreview.totalLines} lines)`}
                  </button>
                )}
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
                        <>
                          <CodeBlock
                            code={resultDisplay}
                            language={getResultLanguage(execution.result)}
                            showLineNumbers={false}
                            maxHeight={240}
                          />
                          {resultPreview.truncated && (
                            <button
                              onClick={() => setResultExpanded((prev) => !prev)}
                              className="text-xs text-white/50 hover:text-white/80 transition-colors"
                            >
                              {resultExpanded
                                ? 'Collapse output'
                                : `Expand output (${resultPreview.totalLines} lines)`}
                            </button>
                          )}
                        </>
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
  const { icon: Icon, title: displayName, category } = getToolMeta(execution.name);
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
      <span className="text-[11px] uppercase tracking-wide text-white/40">
        {category}
      </span>
      <span className="text-white/20">•</span>
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
      return { color: 'text-[#8CA2FF]', bgColor: 'bg-[#4C71FF]/10', label: 'Running' };
    case 'success':
      return { color: 'text-[#50956A]', bgColor: 'bg-[#50956A]/10', label: 'Success' };
    case 'error':
      return { color: 'text-[#FF5449]', bgColor: 'bg-[#FF5449]/10', label: 'Error' };
    case 'pending':
    default:
      return { color: 'text-white/40', bgColor: 'bg-white/[0.06]', label: 'Pending' };
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

type ToolView = { node: JSX.Element; hideRaw?: boolean };

function renderToolSpecificResult(execution: ToolExecution): ToolView | null {
  const name = execution.name.toLowerCase();

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

  return null;
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
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4C71FF]/20 text-[#8CA2FF] hover:bg-[#4C71FF]/30 transition-colors"
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
