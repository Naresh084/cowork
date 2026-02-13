import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Clock3,
  Keyboard,
  ListChecks,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  FileEdit,
  FolderOpen,
  Globe,
  Wrench,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '../ui/Dialog';
import {
  useChatStore,
  type ExtendedPermissionRequest,
} from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { toast } from '../ui/Toast';

interface PermissionDialogProps {
  request: ExtendedPermissionRequest;
  queue: ExtendedPermissionRequest[];
  onSelectRequest: (requestId: string) => void;
  onClose?: () => void;
}

type BatchScope = 'single' | 'same_tool' | 'all';

const PERMISSION_TYPE_CONFIG = {
  file: {
    icon: FileEdit,
    label: 'File Access',
    description: 'Read or modify files',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  shell: {
    icon: Terminal,
    label: 'Shell Command',
    description: 'Execute a terminal command',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  network: {
    icon: Globe,
    label: 'Network Access',
    description: 'Make network requests',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  mcp: {
    icon: Wrench,
    label: 'MCP Tool',
    description: 'Use an external tool',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  directory: {
    icon: FolderOpen,
    label: 'Directory Access',
    description: 'Access a directory',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
  },
} as const;

const RISK_LEVEL_CONFIG = {
  low: {
    icon: ShieldCheck,
    label: 'Low Risk',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    description: 'This action is generally safe',
  },
  medium: {
    icon: Shield,
    label: 'Medium Risk',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    description: 'Review before allowing',
  },
  high: {
    icon: ShieldAlert,
    label: 'High Risk',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    description: 'This action could be destructive',
  },
};

const DEFAULT_TIMEOUT_MS_BY_RISK: Record<'low' | 'medium' | 'high', number> = {
  low: 90_000,
  medium: 60_000,
  high: 30_000,
};

const BATCH_SCOPE_OPTIONS: Array<{
  value: BatchScope;
  label: string;
  description: string;
}> = [
  {
    value: 'single',
    label: 'Current only',
    description: 'Apply to only the selected request.',
  },
  {
    value: 'same_tool',
    label: 'Same tool',
    description: 'Apply to requests using this tool.',
  },
  {
    value: 'all',
    label: 'All queued',
    description: 'Apply to every pending request in this session.',
  },
];

function sortPermissionQueue(
  requests: ExtendedPermissionRequest[],
): ExtendedPermissionRequest[] {
  return [...requests].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }
    return left.id.localeCompare(right.id);
  });
}

function getTimeoutMs(request: ExtendedPermissionRequest): number {
  const risk = request.riskLevel || 'medium';
  return DEFAULT_TIMEOUT_MS_BY_RISK[risk];
}

function getRequestCreatedAt(request: ExtendedPermissionRequest): number {
  const ts = Number(request.createdAt);
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
}

function getDecisionTargets(
  request: ExtendedPermissionRequest,
  queue: ExtendedPermissionRequest[],
  scope: BatchScope,
): ExtendedPermissionRequest[] {
  if (scope === 'all') return queue;
  if (scope === 'same_tool') {
    const selectedTool = request.toolName || '';
    if (!selectedTool) return [request];
    const sameToolRequests = queue.filter(
      (pending) => (pending.toolName || '') === selectedTool,
    );
    return sameToolRequests.length > 0 ? sameToolRequests : [request];
  }
  return [request];
}

export function PermissionDialog({
  request,
  queue,
  onSelectRequest,
  onClose,
}: PermissionDialogProps) {
  const { respondToPermission } = useChatStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchScope, setBatchScope] = useState<BatchScope>('single');
  const [timeoutDeadlineAt, setTimeoutDeadlineAt] = useState<number>(
    () => getRequestCreatedAt(request) + getTimeoutMs(request),
  );
  const [timeoutSecondsRemaining, setTimeoutSecondsRemaining] = useState(0);
  const autoTimedOutRequestRef = useRef<string | null>(null);

  const sortedQueue = useMemo(() => sortPermissionQueue(queue), [queue]);
  const selectedQueueIndex = useMemo(
    () => sortedQueue.findIndex((pending) => pending.id === request.id),
    [sortedQueue, request.id],
  );
  const selectionLabel =
    selectedQueueIndex >= 0
      ? `${selectedQueueIndex + 1} / ${sortedQueue.length}`
      : `1 / ${sortedQueue.length}`;

  const permissionType = getPermissionType(request);
  const typeConfig = PERMISSION_TYPE_CONFIG[permissionType];
  const riskConfig = RISK_LEVEL_CONFIG[request.riskLevel || 'medium'];
  const scopeTargets = useMemo(
    () => getDecisionTargets(request, sortedQueue, batchScope),
    [request, sortedQueue, batchScope],
  );

  const updateSelection = useCallback(
    (offset: number) => {
      if (sortedQueue.length <= 1) return;
      const currentIndex =
        selectedQueueIndex >= 0 ? selectedQueueIndex : 0;
      const nextIndex =
        (currentIndex + offset + sortedQueue.length) % sortedQueue.length;
      const nextRequest = sortedQueue[nextIndex];
      if (nextRequest) {
        onSelectRequest(nextRequest.id);
      }
    },
    [onSelectRequest, selectedQueueIndex, sortedQueue],
  );

  const resolveDecision = useCallback(
    async (
      decision: 'allow' | 'deny' | 'allow_once' | 'allow_session',
      options?: { scopeOverride?: BatchScope; source?: 'manual' | 'timeout' },
    ) => {
      setIsProcessing(true);
      const source = options?.source || 'manual';
      const effectiveScope = options?.scopeOverride || batchScope;
      const targets = getDecisionTargets(request, sortedQueue, effectiveScope);
      const targetIds = new Set(targets.map((target) => target.id));
      const failedTargets: Array<{ id: string; message: string }> = [];
      let resolvedCount = 0;

      for (const target of targets) {
        try {
          await respondToPermission(
            target.sessionId,
            target.id,
            decision,
          );
          resolvedCount += 1;
        } catch (error) {
          failedTargets.push({
            id: target.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (resolvedCount > 0 && source === 'timeout') {
        toast.warning(
          'Permission auto-denied',
          'A queued permission expired and was denied to keep execution safe.',
        );
      } else if (resolvedCount > 1) {
        toast.success(
          `${resolvedCount} permissions updated`,
          `Applied "${decision}" with scope "${effectiveScope}".`,
        );
      }

      if (failedTargets.length > 0) {
        const details = failedTargets
          .map((failure) => `${failure.id}: ${failure.message}`)
          .join('\n');
        toast.error('Failed to update one or more permissions', details);
      }

      if (failedTargets.length === 0) {
        const remaining = sortedQueue.filter(
          (queued) => !targetIds.has(queued.id),
        );
        if (remaining.length === 0) {
          setIsProcessing(false);
          onClose?.();
          return;
        } else {
          onSelectRequest(remaining[0].id);
        }
      }

      setIsProcessing(false);
    },
    [batchScope, onClose, onSelectRequest, request, respondToPermission, sortedQueue],
  );

  useEffect(() => {
    const nextDeadline = getRequestCreatedAt(request) + getTimeoutMs(request);
    setTimeoutDeadlineAt(nextDeadline);
    autoTimedOutRequestRef.current = null;
  }, [request.createdAt, request.id, request.riskLevel]);

  useEffect(() => {
    const updateTimer = () => {
      const remainingMs = Math.max(0, timeoutDeadlineAt - Date.now());
      setTimeoutSecondsRemaining(Math.ceil(remainingMs / 1000));
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 1_000);
    return () => window.clearInterval(timer);
  }, [timeoutDeadlineAt]);

  useEffect(() => {
    if (timeoutSecondsRemaining > 0 || isProcessing) return;
    if (autoTimedOutRequestRef.current === request.id) return;
    autoTimedOutRequestRef.current = request.id;
    void resolveDecision('deny', {
      scopeOverride: 'single',
      source: 'timeout',
    });
  }, [isProcessing, request.id, resolveDecision, timeoutSecondsRemaining]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isProcessing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'arrowdown') {
        event.preventDefault();
        updateSelection(1);
        return;
      }
      if (key === 'arrowup') {
        event.preventDefault();
        updateSelection(-1);
        return;
      }
      if (key === 'a') {
        event.preventDefault();
        void resolveDecision('allow_once');
        return;
      }
      if (key === 's') {
        event.preventDefault();
        void resolveDecision('allow_session');
        return;
      }
      if (key === 'd') {
        event.preventDefault();
        void resolveDecision('deny');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isProcessing, resolveDecision, updateSelection]);

  const timeoutLabel =
    timeoutSecondsRemaining > 0
      ? `${timeoutSecondsRemaining}s`
      : 'expiring';

  return (
    <Dialog
      open={true}
      onClose={() => {
        void resolveDecision('deny', { scopeOverride: 'single' });
      }}
      className="max-w-3xl"
    >
      <DialogHeader>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Permission Queue</DialogTitle>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs text-amber-200">
              <Clock3 className="h-3.5 w-3.5" />
              Safe default in {timeoutLabel}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1">
              <ListChecks className="h-3.5 w-3.5" />
              Queue {selectionLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1">
              <ArrowDownUp className="h-3.5 w-3.5" />
              Batch target: {scopeTargets.length}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1">
              <Keyboard className="h-3.5 w-3.5" />
              A allow once, S allow session, D deny
            </span>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="space-y-4">
        {sortedQueue.length > 1 && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-white/55">
                Pending Approvals
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateSelection(-1)}
                  className="rounded-md border border-white/[0.1] px-2 py-1 text-xs text-white/70 hover:bg-white/[0.06]"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => updateSelection(1)}
                  className="rounded-md border border-white/[0.1] px-2 py-1 text-xs text-white/70 hover:bg-white/[0.06]"
                >
                  Next
                </button>
              </div>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {sortedQueue.map((queuedRequest, index) => {
                const selected = queuedRequest.id === request.id;
                return (
                  <button
                    key={queuedRequest.id}
                    type="button"
                    onClick={() => onSelectRequest(queuedRequest.id)}
                    className={cn(
                      'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
                      selected
                        ? 'border-[#1D4ED8]/55 bg-[#1D4ED8]/16'
                        : 'border-white/[0.08] bg-[#0F1117] hover:border-white/[0.16] hover:bg-white/[0.04]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-white/65">
                      <span>#{index + 1}</span>
                      <span className="font-mono">{queuedRequest.toolName || queuedRequest.type}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-white/75">
                      {queuedRequest.resource}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Permission Type Header */}
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl border',
            typeConfig.bgColor,
            typeConfig.borderColor
          )}
        >
          <div className={cn('p-2 rounded-lg', typeConfig.bgColor)}>
            <typeConfig.icon className={cn('w-6 h-6', typeConfig.color)} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{typeConfig.label}</h3>
            <p className="text-sm text-gray-400">{typeConfig.description}</p>
          </div>
        </div>

        {/* Tool/Resource Details */}
        <div className="p-3 rounded-xl bg-gray-800/50 border border-gray-700/50">
          {request.toolName && (
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Tool
              </span>
              <p className="text-sm text-white font-mono mt-0.5">{request.toolName}</p>
            </div>
          )}

          {request.resource && (
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Resource
              </span>
              <pre className="text-sm text-white font-mono mt-0.5 whitespace-pre-wrap break-all bg-gray-900/50 p-2 rounded-lg">
                {request.resource}
              </pre>
            </div>
          )}

          {request.reason && (
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Reason
              </span>
              <p className="text-sm text-white mt-0.5">{request.reason}</p>
            </div>
          )}

          {(request.policyAction || request.policyReason || request.policyReasonCode) && (
            <div className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-2.5">
              <span className="text-xs font-medium text-blue-200 uppercase tracking-wide">
                Policy Decision
              </span>
              {request.policyAction && (
                <p className="text-sm text-blue-100 mt-0.5">
                  Action: <span className="font-mono">{request.policyAction}</span>
                </p>
              )}
              {request.policyReason && (
                <p className="text-sm text-blue-100 mt-0.5">{request.policyReason}</p>
              )}
              {request.policyReasonCode && (
                <p className="text-xs text-blue-200/80 mt-1 font-mono">
                  code: {request.policyReasonCode}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Risk Level */}
        <div
          className={cn(
            'flex items-center gap-2 p-2.5 rounded-lg border',
            riskConfig.bgColor,
            request.riskLevel === 'high'
              ? 'border-red-500/30'
              : request.riskLevel === 'low'
                ? 'border-green-500/30'
                : 'border-amber-500/30'
          )}
        >
          <riskConfig.icon className={cn('w-5 h-5', riskConfig.color)} />
          <div>
            <span className={cn('text-sm font-medium', riskConfig.color)}>
              {riskConfig.label}
            </span>
            <span className="text-sm text-gray-400 ml-2">
              {riskConfig.description}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-white/55">
            Apply Decision Scope
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {BATCH_SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setBatchScope(option.value)}
                className={cn(
                  'rounded-lg border px-2.5 py-2 text-left transition-colors',
                  batchScope === option.value
                    ? 'border-[#1D4ED8]/55 bg-[#1D4ED8]/16'
                    : 'border-white/[0.08] bg-[#0F1117] hover:border-white/[0.16] hover:bg-white/[0.04]',
                )}
              >
                <p className="text-xs font-medium text-white/85">{option.label}</p>
                <p className="mt-1 text-[11px] text-white/55">{option.description}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/50">
            Current selection affects <span className="font-semibold text-white/80">{scopeTargets.length}</span>{' '}
            request{scopeTargets.length === 1 ? '' : 's'}.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={() => {
              void resolveDecision('deny');
            }}
            disabled={isProcessing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-gray-700 hover:bg-gray-600 text-white',
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <XCircle className="w-4 h-4" />
            Deny
          </button>
          <button
            onClick={() => {
              void resolveDecision('allow_once');
            }}
            disabled={isProcessing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-white/10 hover:bg-white/15 text-white',
              'border border-white/10',
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            Allow Once
          </button>
          <button
            onClick={() => {
              void resolveDecision('allow_session');
            }}
            disabled={isProcessing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-blue-600 hover:bg-blue-700 text-white',
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            Allow Session
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getPermissionType(
  request: ExtendedPermissionRequest
): keyof typeof PERMISSION_TYPE_CONFIG {
  // Determine type based on request properties
  if (request.type) {
    const typeMap: Record<string, keyof typeof PERMISSION_TYPE_CONFIG> = {
      file_read: 'file',
      file_write: 'file',
      file_delete: 'file',
      shell_execute: 'shell',
      network_request: 'network',
      clipboard_read: 'file',
      clipboard_write: 'file',
    };
    return typeMap[request.type] || 'shell';
  }

  // Fallback based on toolName
  if (request.toolName) {
    if (request.toolName.includes('file') || request.toolName.includes('File')) {
      return 'file';
    }
    if (request.toolName.includes('shell') || request.toolName.includes('bash')) {
      return 'shell';
    }
    if (request.toolName.includes('http') || request.toolName.includes('fetch')) {
      return 'network';
    }
    if (request.toolName.includes('mcp_')) {
      return 'mcp';
    }
  }

  return 'shell';
}

// Container that shows all pending permission dialogs
export function PermissionDialogContainer() {
  const { activeSessionId } = useSessionStore();
  const pendingPermissions = useChatStore((state) =>
    state.getSessionState(activeSessionId).pendingPermissions,
  );
  const [selectedPermissionId, setSelectedPermissionId] = useState<string | null>(null);
  const sortedQueue = useMemo(
    () => sortPermissionQueue(pendingPermissions),
    [pendingPermissions],
  );

  useEffect(() => {
    if (sortedQueue.length === 0) {
      setSelectedPermissionId(null);
      return;
    }
    if (!selectedPermissionId || !sortedQueue.some((item) => item.id === selectedPermissionId)) {
      setSelectedPermissionId(sortedQueue[0].id);
    }
  }, [selectedPermissionId, sortedQueue]);

  const currentRequest =
    sortedQueue.find((pending) => pending.id === selectedPermissionId) ??
    sortedQueue[0];

  if (!currentRequest) {
    return null;
  }

  return (
    <PermissionDialog
      request={currentRequest}
      queue={sortedQueue}
      onSelectRequest={setSelectedPermissionId}
    />
  );
}
