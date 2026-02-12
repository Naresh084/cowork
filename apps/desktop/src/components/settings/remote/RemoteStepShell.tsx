import type { ReactNode } from 'react';
import { CheckCircle2, CircleDashed, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RemoteStepState = 'done' | 'active' | 'locked';

interface RemoteStepShellProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  state: RemoteStepState;
  children: ReactNode;
}

function StepStatePill({ state }: { state: RemoteStepState }) {
  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </span>
    );
  }

  if (state === 'locked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/55">
        <Lock className="h-3 w-3" />
        Locked
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#4B83FF]/40 bg-[#1D4ED8]/18 px-2 py-0.5 text-[11px] text-[#C9DAFF]">
      <CircleDashed className="h-3 w-3" />
      Action required
    </span>
  );
}

export function RemoteStepShell({
  step,
  totalSteps,
  title,
  description,
  state,
  children,
}: RemoteStepShellProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        state === 'done'
          ? 'border-emerald-400/25 bg-emerald-500/[0.06]'
          : state === 'locked'
            ? 'border-white/[0.08] bg-white/[0.01]'
            : 'border-[#3A76FF]/35 bg-[#1D4ED8]/[0.08]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-semibold',
              state === 'done'
                ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-200'
                : state === 'locked'
                  ? 'border-white/20 bg-white/[0.03] text-white/60'
                  : 'border-[#4B83FF]/50 bg-[#1D4ED8]/30 text-[#D7E3FF]',
            )}
          >
            {step}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">
              Step {step} of {totalSteps}
            </p>
            <h5 className="mt-0.5 text-sm font-semibold text-white/95">{title}</h5>
            <p className="mt-0.5 text-xs text-white/60">{description}</p>
          </div>
        </div>
        <StepStatePill state={state} />
      </div>

      <div className="mt-3">{children}</div>
    </div>
  );
}
