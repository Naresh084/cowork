// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { cn } from '@/lib/utils';
import type { SkillLifecycleInfo } from '../../stores/skill-store';

interface SkillLifecycleBadgesProps {
  info: SkillLifecycleInfo | null;
  compact?: boolean;
}

const LIFECYCLE_META: Record<
  SkillLifecycleInfo['lifecycle'],
  { label: string; className: string }
> = {
  draft: {
    label: 'Draft',
    className: 'border-zinc-600/60 bg-zinc-800/80 text-zinc-300',
  },
  verified: {
    label: 'Verified',
    className: 'border-blue-700/60 bg-blue-950/40 text-blue-300',
  },
  published: {
    label: 'Published',
    className: 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300',
  },
  deprecated: {
    label: 'Deprecated',
    className: 'border-amber-700/60 bg-amber-950/40 text-amber-300',
  },
};

const TRUST_META: Record<
  SkillLifecycleInfo['trustLevel'],
  { label: string; className: string }
> = {
  unverified: {
    label: 'Unverified',
    className: 'border-zinc-600/60 bg-zinc-800/80 text-zinc-300',
  },
  community: {
    label: 'Community',
    className: 'border-violet-700/60 bg-violet-950/40 text-violet-300',
  },
  verified: {
    label: 'Verified Source',
    className: 'border-blue-700/60 bg-blue-950/40 text-blue-300',
  },
  official: {
    label: 'Official',
    className: 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300',
  },
};

export function SkillLifecycleBadges({
  info,
  compact = false,
}: SkillLifecycleBadgesProps) {
  if (!info) return null;

  const lifecycleMeta = LIFECYCLE_META[info.lifecycle];
  const trustMeta = TRUST_META[info.trustLevel];
  const confidence = `${Math.round(info.confidence * 100)}%`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
          lifecycleMeta.className,
        )}
      >
        {lifecycleMeta.label}
      </span>
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
          trustMeta.className,
        )}
      >
        {trustMeta.label}
      </span>
      {!compact && (
        <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
          confidence {confidence}
        </span>
      )}
    </div>
  );
}
