import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore, type ExtendedPermissionRequest } from '../../stores/chat-store';

interface PermissionWorkbenchProps {
  sessionId: string;
}

const PERMISSION_TIMEOUT_MS_BY_RISK: Record<'low' | 'medium' | 'high', number> = {
  low: 90_000,
  medium: 60_000,
  high: 30_000,
};

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

function getPermissionTypeLabel(request: ExtendedPermissionRequest): string {
  if (request.type.startsWith('file_')) return 'File access';
  if (request.type === 'shell_execute') return 'Command execution';
  if (request.type === 'network_request') return 'Network request';
  if (request.type.startsWith('clipboard_')) return 'Clipboard access';
  return 'Permission request';
}

function getRiskConfig(risk: 'low' | 'medium' | 'high') {
  if (risk === 'high') {
    return {
      icon: ShieldAlert,
      pillClass: 'bg-[#FF5449]/12 text-[#FCA5A5] border-[#FF5449]/30',
      surfaceClass: 'border-[#FF5449]/25 bg-[#FF5449]/10',
      label: 'High risk',
    };
  }
  if (risk === 'low') {
    return {
      icon: ShieldCheck,
      pillClass: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
      surfaceClass: 'border-emerald-500/25 bg-emerald-500/10',
      label: 'Low risk',
    };
  }
  return {
    icon: Shield,
    pillClass: 'bg-[#1D4ED8]/12 text-[#93C5FD] border-[#1D4ED8]/30',
    surfaceClass: 'border-[#1D4ED8]/25 bg-[#1D4ED8]/10',
    label: 'Review required',
  };
}

export function PermissionWorkbench({ sessionId }: PermissionWorkbenchProps) {
  const pendingPermissions = useChatStore((state) =>
    state.getSessionState(sessionId).pendingPermissions,
  );
  const respondToPermission = useChatStore((state) => state.respondToPermission);

  const sortedQueue = useMemo(
    () => sortPermissionQueue(pendingPermissions),
    [pendingPermissions],
  );
  const [selectedPermissionId, setSelectedPermissionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (sortedQueue.length === 0) {
      setSelectedPermissionId(null);
      return;
    }
    if (!selectedPermissionId || !sortedQueue.some((item) => item.id === selectedPermissionId)) {
      setSelectedPermissionId(sortedQueue[0].id);
    }
  }, [selectedPermissionId, sortedQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedRequest =
    sortedQueue.find((item) => item.id === selectedPermissionId) ?? sortedQueue[0] ?? null;

  const oldest = sortedQueue[0];
  const oldestRisk = oldest?.riskLevel || 'medium';
  const oldestBudget = PERMISSION_TIMEOUT_MS_BY_RISK[oldestRisk];
  const oldestAgeMs = oldest ? Math.max(0, nowTs - oldest.createdAt) : 0;
  const oldestRemainingSeconds = oldest
    ? Math.max(0, Math.ceil((oldestBudget - oldestAgeMs) / 1000))
    : 0;

  const decide = useCallback(
    async (decision: 'deny' | 'allow_once' | 'allow_session') => {
      if (!selectedRequest || isSubmitting) return;
      setIsSubmitting(true);
      try {
        await respondToPermission(sessionId, selectedRequest.id, decision);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, respondToPermission, selectedRequest, sessionId],
  );

  useEffect(() => {
    if (!selectedRequest) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        void decide('allow_once');
        return;
      }
      if (key === 's') {
        event.preventDefault();
        void decide('allow_session');
        return;
      }
      if (key === 'd') {
        event.preventDefault();
        void decide('deny');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [decide, selectedRequest]);

  if (!selectedRequest) return null;

  const risk = selectedRequest.riskLevel || 'medium';
  const riskConfig = getRiskConfig(risk);
  const RiskIcon = riskConfig.icon;
  const highRiskCount = sortedQueue.filter((request) => request.riskLevel === 'high').length;

  return (
    <div className="h-full overflow-hidden px-4 pb-3 pt-2">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="h-full rounded-2xl border border-[#1D4ED8]/25 bg-[#0B0F1D]/70 backdrop-blur-sm overflow-hidden"
      >
        <div className="border-b border-white/[0.08] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/90">Approval Required</p>
              <p className="text-xs text-white/60">
                {sortedQueue.length} pending request{sortedQueue.length === 1 ? '' : 's'}
                {highRiskCount > 0 ? ` · ${highRiskCount} high risk` : ''}
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/12 px-3 py-1 text-[11px] text-amber-200">
              <Clock3 className="h-3.5 w-3.5" />
              Oldest timeout in {oldestRemainingSeconds}s
            </div>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/[0.10] bg-white/[0.03] px-2 py-1 text-[11px] text-white/60">
            <AlertTriangle className="h-3.5 w-3.5 text-[#F5C400]" />
            A allow once · S allow session · D deny
          </div>
        </div>

        <div className="grid h-[calc(100%-82px)] min-h-0 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-white/[0.08] p-3 lg:border-b-0 lg:border-r overflow-y-auto">
            <div className="space-y-2">
              {sortedQueue.map((request, index) => {
                const active = request.id === selectedRequest.id;
                const requestRisk = request.riskLevel || 'medium';
                const requestConfig = getRiskConfig(requestRisk);
                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setSelectedPermissionId(request.id)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2 text-left transition-colors',
                      active
                        ? 'border-[#1D4ED8]/65 bg-[#1D4ED8]/15'
                        : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-white/45">#{index + 1}</span>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', requestConfig.pillClass)}>
                        {requestConfig.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-white/85">
                      {request.toolName || getPermissionTypeLabel(request)}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-white/55">
                      {request.resource || 'No resource provided'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-4">
            <div className={cn('rounded-xl border p-3', riskConfig.surfaceClass)}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-lg bg-white/[0.06] p-2">
                  <RiskIcon className="h-4 w-4 text-white/85" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white/92">
                    {selectedRequest.toolName || getPermissionTypeLabel(selectedRequest)}
                  </p>
                  <p className="text-xs text-white/55">{getPermissionTypeLabel(selectedRequest)}</p>
                </div>
                <span className={cn('ml-auto rounded-full border px-2.5 py-1 text-xs', riskConfig.pillClass)}>
                  {riskConfig.label}
                </span>
              </div>

              <div className="mt-3 grid gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/45">Resource</p>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-white/[0.08] bg-[#0A0D17] p-2 text-xs text-white/80 whitespace-pre-wrap break-all font-mono">
                    {selectedRequest.resource || 'Not provided'}
                  </pre>
                </div>
                {selectedRequest.reason ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-white/45">Reason</p>
                    <p className="mt-1 text-sm text-white/80">{selectedRequest.reason}</p>
                  </div>
                ) : null}
                {selectedRequest.policyReason || selectedRequest.policyAction ? (
                  <div className="rounded-lg border border-[#1D4ED8]/35 bg-[#1D4ED8]/10 p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-[#BFDBFE]">Policy</p>
                    {selectedRequest.policyAction ? (
                      <p className="mt-1 text-xs text-[#DBEAFE]">
                        Action: <span className="font-mono">{selectedRequest.policyAction}</span>
                      </p>
                    ) : null}
                    {selectedRequest.policyReason ? (
                      <p className="mt-1 text-xs text-[#DBEAFE]/90">{selectedRequest.policyReason}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void decide('deny')}
                className="inline-flex items-center gap-2 rounded-xl border border-[#FF5449]/30 bg-[#FF5449]/12 px-3.5 py-2 text-sm text-[#FCA5A5] hover:bg-[#FF5449]/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="h-4 w-4" />
                Deny
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void decide('allow_once')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-3.5 py-2 text-sm text-white/85 hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="h-4 w-4" />
                Allow once
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void decide('allow_session')}
                className="inline-flex items-center gap-2 rounded-xl border border-[#1D4ED8]/40 bg-[#1D4ED8] px-3.5 py-2 text-sm text-white hover:bg-[#1E40AF] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="h-4 w-4" />
                Allow session
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
