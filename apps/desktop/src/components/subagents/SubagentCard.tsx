import { Check, Download, Loader2, FolderOpen, ToggleRight } from 'lucide-react';
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

interface SubagentCardProps {
  subagent: Subagent;
  isInstalling: boolean;
  onSelect: () => void;
  onInstall: () => void;
}

export function SubagentCard({
  subagent,
  isInstalling,
  onSelect,
  onInstall,
}: SubagentCardProps) {
  const CategoryIcon = CATEGORY_ICONS[subagent.category] || FileText;
  const categoryColor = CATEGORY_COLORS[subagent.category] || 'text-zinc-400';
  const isPlatform = subagent.source === 'platform';

  const handleInstallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!subagent.installed && !isInstalling) {
      onInstall();
    }
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all hover:border-zinc-600',
        'bg-zinc-800/50 border-zinc-700',
        subagent.installed && 'border-green-800/50 bg-green-950/20',
        isPlatform && !subagent.installed && 'border-violet-800/30 bg-violet-950/10'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <CategoryIcon className={cn('w-4 h-4', categoryColor)} />
          </div>
          <h3 className="font-medium text-zinc-100">{subagent.displayName}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isPlatform && (
            <span className="flex items-center gap-1 text-xs text-violet-400 bg-violet-950/50 px-2 py-0.5 rounded-full">
              <FolderOpen className="w-3 h-3" />
              Platform
            </span>
          )}
          {subagent.installed && (
            <span className="flex items-center gap-1 text-xs text-green-500 bg-green-950/50 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3" />
              Installed
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{subagent.description}</p>

      {/* Tags */}
      {subagent.tags && subagent.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {subagent.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-700/50 text-zinc-400"
            >
              {tag}
            </span>
          ))}
          {subagent.tags.length > 3 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-700/50 text-zinc-500">
              +{subagent.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Status and Actions */}
      <div className="flex items-center justify-between">
        {/* Category */}
        <span className="text-xs text-zinc-500 capitalize">
          {subagent.category}
        </span>

        {/* Install Button */}
        {!subagent.installed && (
          <button
            onClick={handleInstallClick}
            disabled={isInstalling}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              isInstalling
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : isPlatform
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
            )}
          >
            {isInstalling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isPlatform ? (
              <ToggleRight className="w-3.5 h-3.5" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {isInstalling ? 'Installing...' : isPlatform ? 'Enable' : 'Install'}
          </button>
        )}
      </div>
    </div>
  );
}
