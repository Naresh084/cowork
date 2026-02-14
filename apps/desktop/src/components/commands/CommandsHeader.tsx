// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { Search, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommandStore, type CommandCategory } from '../../stores/command-store';

const CATEGORIES: Array<{ value: CommandCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'setup', label: 'Setup' },
  { value: 'memory', label: 'Memory' },
  { value: 'utility', label: 'Utility' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'custom', label: 'Custom' },
];

interface CommandsHeaderProps {
  onCreateClick?: () => void;
}

export function CommandsHeader({ onCreateClick }: CommandsHeaderProps) {
  const {
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setCategory,
    activeTab,
    setActiveTab,
    getInstalledCount,
    availableCommands,
  } = useCommandStore();

  const installedCount = getInstalledCount();
  // Count bundled commands (available for install)
  const bundledCount = availableCommands.filter((c) => c.source.type === 'bundled').length;

  return (
    <div className="px-6 py-4 border-b border-zinc-800 space-y-4">
      {/* Search and Create Button */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Create Command
        </button>
      </div>

      {/* Tabs and Categories */}
      <div className="flex items-center justify-between">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
          <button
            onClick={() => setActiveTab('available')}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTab === 'available'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            Available ({bundledCount})
          </button>
          <button
            onClick={() => setActiveTab('installed')}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTab === 'installed'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            Installed ({installedCount})
          </button>
        </div>

        {/* Categories */}
        <div className="flex gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                selectedCategory === cat.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
