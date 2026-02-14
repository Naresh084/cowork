// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type TimelineBadgeTone = 'neutral' | 'active' | 'warning' | 'success' | 'error';

interface TimelineBadgeProps {
  tone?: TimelineBadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<TimelineBadgeTone, string> = {
  neutral: 'border-white/[0.15] bg-white/[0.04] text-white/70',
  active: 'border-[#1D4ED8]/45 bg-[#1D4ED8]/20 text-[#BFDBFE]',
  warning: 'border-[#F5C400]/45 bg-[#F5C400]/15 text-[#FDE68A]',
  success: 'border-[#50956A]/45 bg-[#50956A]/15 text-[#BBF7D0]',
  error: 'border-[#FF5449]/45 bg-[#FF5449]/15 text-[#FCA5A5]',
};

export function TimelineBadge({
  tone = 'neutral',
  icon,
  children,
  className,
}: TimelineBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
