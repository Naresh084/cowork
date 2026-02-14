// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { cn } from '../../lib/utils';

export type ReliabilityTone = 'healthy' | 'degraded' | 'unhealthy' | 'active' | 'idle';

interface ReliabilityLabelProps {
  label: string;
  tone?: ReliabilityTone;
  className?: string;
}

const toneClasses: Record<ReliabilityTone, { dot: string; text: string }> = {
  healthy: { dot: 'bg-[#50956A]', text: 'text-[#BBF7D0]' },
  degraded: { dot: 'bg-[#F5C400]', text: 'text-[#FDE68A]' },
  unhealthy: { dot: 'bg-[#FF5449]', text: 'text-[#FCA5A5]' },
  active: { dot: 'bg-[#1D4ED8]', text: 'text-[#BFDBFE]' },
  idle: { dot: 'bg-white/45', text: 'text-white/65' },
};

export function ReliabilityLabel({
  label,
  tone = 'idle',
  className,
}: ReliabilityLabelProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', toneClasses[tone].text, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', toneClasses[tone].dot)} />
      {label}
    </span>
  );
}
