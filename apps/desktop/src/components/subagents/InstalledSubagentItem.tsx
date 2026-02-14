// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { Trash2, Check, Loader2, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Subagent, SubagentCategory } from '../../stores/subagent-store';
import {
  Search,
  Code,
  BarChart2,
  Zap,
  FileText,
} from 'lucide-react';

// Category icons mapping
const CATEGORY_ICONS: Record<SubagentCategory, React.ComponentType<{ className?: string }>> = {
  research: Search,
  development: Code,
  analysis: BarChart2,
  productivity: Zap,
  custom: FileText,
};

// Category colors
const CATEGORY_COLORS: Record<SubagentCategory, string> = {
  research: 'text-[#06B6D4]',
  development: 'text-[#27AE60]',
  analysis: 'text-[#F39C12]',
  productivity: 'text-[#9B59B6]',
  custom: 'text-white/60',
};

interface InstalledSubagentItemProps {
  subagent: Subagent;
  isUninstalling: boolean;
  onUninstall: () => void;
  onSelect: () => void;
}

export function InstalledSubagentItem({
  subagent,
  isUninstalling,
  onUninstall,
  onSelect,
}: InstalledSubagentItemProps) {
  const CategoryIcon = CATEGORY_ICONS[subagent.category] || FileText;
  const categoryColor = CATEGORY_COLORS[subagent.category] || 'text-zinc-400';
  const isPlatform = subagent.source === 'platform';

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer'
      )}
      onClick={onSelect}
    >
      {/* Icon and Name */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <CategoryIcon className={cn('w-4 h-4', categoryColor)} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-100 truncate">{subagent.displayName}</span>
            {isPlatform && (
              <span className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-950/50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                <FolderOpen className="w-2.5 h-2.5" />
                Platform
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500 truncate block">{subagent.description}</span>
        </div>
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        <span className="flex items-center gap-1 text-xs text-green-500 bg-green-950/50 px-2 py-0.5 rounded-full">
          <Check className="w-3 h-3" />
          Installed
        </span>
      </div>

      {/* Category */}
      <div className="flex-shrink-0 w-24 text-center">
        <span className="text-xs text-zinc-500 capitalize">{subagent.category}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Uninstall - hidden for platform subagents (read-only) */}
        {!isPlatform && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUninstall();
            }}
            disabled={isUninstalling}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              isUninstalling
                ? 'text-zinc-600 cursor-not-allowed'
                : 'text-zinc-500 hover:text-red-400 hover:bg-zinc-800'
            )}
            title="Uninstall"
          >
            {isUninstalling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
