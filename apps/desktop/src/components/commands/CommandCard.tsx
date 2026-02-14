// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { Check, Download, Loader2, FolderOpen, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommandManifest, CommandCategory } from '../../stores/command-store';
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
  setup: 'text-[#1D4ED8]',
  memory: 'text-[#9B59B6]',
  utility: 'text-[#F5C400]',
  workflow: 'text-[#27AE60]',
  custom: 'text-white/60',
};

interface CommandCardProps {
  command: CommandManifest;
  isInstalled: boolean;
  isInstalling: boolean;
  onSelect: () => void;
  onInstall: () => void;
  onEnable?: () => void;
}

export function CommandCard({
  command,
  isInstalled,
  isInstalling,
  onSelect,
  onInstall,
  onEnable,
}: CommandCardProps) {
  const CategoryIcon = CATEGORY_ICONS[command.frontmatter.category] || FileText;
  const categoryColor = CATEGORY_COLORS[command.frontmatter.category] || 'text-zinc-400';
  const emoji = command.frontmatter.metadata?.emoji;
  const isPlatform = command.source.type === 'platform';

  const handleInstallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlatform && onEnable) {
      onEnable();
    } else if (!isInstalled && !isInstalling) {
      onInstall();
    }
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all hover:border-zinc-600',
        'bg-zinc-800/50 border-zinc-700',
        isInstalled && 'border-green-800/50 bg-green-950/20',
        isPlatform && !isInstalled && 'border-violet-800/30 bg-violet-950/10'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            {emoji ? (
              <span className="text-lg">{emoji}</span>
            ) : (
              <CategoryIcon className={cn('w-4 h-4', categoryColor)} />
            )}
          </div>
          <h3 className="font-medium text-zinc-100">/{command.frontmatter.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isPlatform && (
            <span className="flex items-center gap-1 text-xs text-violet-400 bg-violet-950/50 px-2 py-0.5 rounded-full">
              <FolderOpen className="w-3 h-3" />
              Platform
            </span>
          )}
          {isInstalled && (
            <span className="flex items-center gap-1 text-xs text-green-500 bg-green-950/50 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3" />
              {isPlatform ? 'Enabled' : 'Installed'}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{command.frontmatter.description}</p>

      {/* Status and Actions */}
      <div className="flex items-center justify-between">
        {/* Category */}
        <span className="text-xs text-zinc-500 capitalize">
          {command.frontmatter.category}
        </span>

        {/* Install/Enable Button */}
        {!isInstalled && (
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
