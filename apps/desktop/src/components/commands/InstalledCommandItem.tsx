import { Trash2, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Command, CommandCategory } from '../../stores/command-store';
import {
  FolderCog,
  Brain,
  Settings,
  Zap,
  FileText,
} from 'lucide-react';

// Category icons mapping
const CATEGORY_ICONS: Record<CommandCategory, React.ComponentType<{ className?: string }>> = {
  setup: FolderCog,
  memory: Brain,
  utility: Settings,
  workflow: Zap,
  custom: FileText,
};

// Category colors
const CATEGORY_COLORS: Record<CommandCategory, string> = {
  setup: 'text-[#4C71FF]',
  memory: 'text-[#9B59B6]',
  utility: 'text-[#F5C400]',
  workflow: 'text-[#27AE60]',
  custom: 'text-white/60',
};

interface InstalledCommandItemProps {
  command: Command;
  isUninstalling: boolean;
  onUninstall: () => void;
  onSelect: () => void;
}

export function InstalledCommandItem({
  command,
  isUninstalling,
  onUninstall,
  onSelect,
}: InstalledCommandItemProps) {
  const CategoryIcon = CATEGORY_ICONS[command.category] || FileText;
  const categoryColor = CATEGORY_COLORS[command.category] || 'text-zinc-400';

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
          <span className="font-medium text-zinc-100 truncate block">/{command.name}</span>
          <span className="text-xs text-zinc-500 truncate block">{command.description}</span>
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
        <span className="text-xs text-zinc-500 capitalize">{command.category}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Uninstall */}
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
      </div>
    </div>
  );
}
