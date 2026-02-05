import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectorStore } from '../../stores/connector-store';
import type { ConnectorCategory } from '@gemini-cowork/shared';

const CATEGORIES: Array<{ value: ConnectorCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'google', label: 'Google' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'communication', label: 'Communication' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'developer', label: 'Developer' },
  { value: 'database', label: 'Database' },
  { value: 'ai-search', label: 'AI Search' },
  { value: 'utility', label: 'Utility' },
];

export function ConnectorsHeader() {
  const {
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setCategory,
    activeTab,
    setActiveTab,
    getInstalledCount,
    getConnectedCount,
    availableConnectors,
  } = useConnectorStore();

  const installedCount = getInstalledCount();
  const connectedCount = getConnectedCount();
  const totalCount = availableConnectors.filter(c => c.source.type === 'bundled').length;

  return (
    <div className="px-6 py-4 border-b border-zinc-800 space-y-4">
      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search connectors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
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
            Marketplace ({totalCount})
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
            {connectedCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-green-600 text-white rounded-full">
                {connectedCount} online
              </span>
            )}
          </button>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
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
