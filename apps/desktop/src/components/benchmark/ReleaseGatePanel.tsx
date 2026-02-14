// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBenchmarkStore } from '@/stores/benchmark-store';

function statusMeta(status: 'pass' | 'fail' | 'warning' | null) {
  if (status === 'pass') {
    return {
      label: 'PASS',
      icon: CheckCircle2,
      className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    };
  }
  if (status === 'fail') {
    return {
      label: 'FAIL',
      icon: ShieldAlert,
      className: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
    };
  }
  if (status === 'warning') {
    return {
      label: 'WARNING',
      icon: AlertTriangle,
      className: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    };
  }
  return {
    label: 'UNKNOWN',
    icon: CircleDashed,
    className: 'text-white/60 bg-white/[0.04] border-white/[0.12]',
  };
}

export function ReleaseGatePanel() {
  const releaseGateStatus = useBenchmarkStore((state) => state.releaseGateStatus);
  const refreshReleaseGateStatus = useBenchmarkStore((state) => state.refreshReleaseGateStatus);

  const meta = useMemo(
    () => statusMeta(releaseGateStatus?.status ?? null),
    [releaseGateStatus?.status],
  );
  const Icon = meta.icon;

  useEffect(() => {
    if (!releaseGateStatus) {
      void refreshReleaseGateStatus();
    }
  }, [refreshReleaseGateStatus, releaseGateStatus]);

  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white/90">Release Gate</h3>
          <p className="text-xs text-white/55">Hard-fail criteria for launch readiness</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshReleaseGateStatus()}
          className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05]"
        >
          Refresh
        </button>
      </div>

      <div className={cn('mt-3 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs', meta.className)}>
        <Icon className="h-3.5 w-3.5" />
        <span className="font-semibold tracking-wide">{meta.label}</span>
      </div>

      <div className="mt-4 space-y-2">
        {(releaseGateStatus?.reasons?.length ?? 0) > 0 ? (
          releaseGateStatus!.reasons.map((reason, index) => (
            <div
              key={`${reason}-${index}`}
              className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/70"
            >
              {reason}
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/50">
            No blocking reasons reported.
          </div>
        )}
      </div>
    </section>
  );
}
