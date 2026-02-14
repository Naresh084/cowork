// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore, type RightPanelSections } from '../../stores/settings-store';
import { motion, AnimatePresence } from 'framer-motion';

interface CollapsibleSectionProps {
  id: keyof RightPanelSections;
  title: string;
  icon: LucideIcon;
  badge?: string | number;
  actions?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSection({
  id,
  title,
  icon: Icon,
  badge,
  actions,
  children,
}: CollapsibleSectionProps) {
  const { rightPanelSections, toggleRightPanelSection } = useSettingsStore();
  const isExpanded = rightPanelSections[id];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] mb-2 last:mb-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => toggleRightPanelSection(id)}
          aria-expanded={isExpanded}
          className={cn(
            'min-w-0 flex-1 flex items-center gap-2 text-left',
            'hover:text-white/90 transition-colors',
            'focus:outline-none'
          )}
        >
          <ChevronRight
            className={cn(
              'w-4 h-4 text-white/40 transition-transform duration-200',
              isExpanded && 'rotate-90'
            )}
          />
          <Icon className="w-4 h-4 text-white/50" />
          <span className="text-xs font-semibold text-white/70 uppercase tracking-wide truncate">{title}</span>
          {badge !== undefined && badge !== 0 && (
            <span className="text-[11px] text-white/40 ml-1">{badge}</span>
          )}
        </button>

        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </div>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
