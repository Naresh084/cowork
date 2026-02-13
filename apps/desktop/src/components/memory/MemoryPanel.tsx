/**
 * MemoryPanel - Main UI for viewing and managing memories
 *
 * Displays memories grouped by category with search and filtering
 */

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Search,
  Plus,
  Trash2,
  Edit2,
  Folder,
  Bookmark,
  Lightbulb,
  FileText,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMemoryStore,
  useMemories,
  useMemoryGroups,
  useIsLoadingMemory,
  useSelectedGroup,
  useMemorySearchQuery,
  useSelectedMemoryId,
  useMemoryError,
  type MemoryGroup,
  type Memory,
} from '../../stores/memory-store';
import { useSessionStore } from '../../stores/session-store';
import { MemoryInspector } from './MemoryInspector';

// Group icons mapping
const GROUP_ICONS: Record<MemoryGroup, React.ComponentType<{ className?: string }>> = {
  preferences: Settings,
  learnings: Lightbulb,
  context: FileText,
  instructions: Bookmark,
};

// Group colors
const GROUP_COLORS: Record<MemoryGroup, string> = {
  preferences: 'text-[#9B59B6]',
  learnings: 'text-[#F5C400]',
  context: 'text-[#1D4ED8]',
  instructions: 'text-[#27AE60]',
};

// Group descriptions
const GROUP_DESCRIPTIONS: Record<MemoryGroup, string> = {
  preferences: 'Coding style and tool preferences',
  learnings: 'Patterns and debugging tips',
  context: 'Architecture and project history',
  instructions: 'Custom guidelines for the agent',
};

interface MemoryPanelProps {
  onCreateMemory?: () => void;
  onEditMemory?: (memory: Memory) => void;
}

export function MemoryPanel({ onCreateMemory, onEditMemory }: MemoryPanelProps) {
  const memories = useMemories();
  const groups = useMemoryGroups();
  const isLoading = useIsLoadingMemory();
  const selectedGroup = useSelectedGroup();
  const searchQuery = useMemorySearchQuery();
  const selectedMemoryId = useSelectedMemoryId();
  const error = useMemoryError();

  const {
    loadMemories,
    loadGroups,
    deleteMemory,
    setSelectedGroup,
    setSearchQuery,
    selectMemory,
    getFilteredMemories,
    clearError,
  } = useMemoryStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  // Load memories when working directory changes
  useEffect(() => {
    if (workingDirectory) {
      loadMemories(workingDirectory);
      loadGroups(workingDirectory);
    }
  }, [workingDirectory, loadMemories, loadGroups]);

  const filteredMemories = getFilteredMemories();
  const selectedMemory = selectedMemoryId
    ? memories.find((entry) => entry.id === selectedMemoryId) || null
    : null;

  const handleDeleteMemory = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this memory?')) {
      await deleteMemory(id);
    }
  }, [deleteMemory]);

  const handleRefresh = useCallback(() => {
    if (workingDirectory) {
      loadMemories(workingDirectory);
    }
  }, [workingDirectory, loadMemories]);

  // Group memories by category for display
  const memoriesByGroup = filteredMemories.reduce((acc, memory) => {
    if (!acc[memory.group]) {
      acc[memory.group] = [];
    }
    acc[memory.group].push(memory);
    return acc;
  }, {} as Record<MemoryGroup, Memory[]>);

  if (!workingDirectory) {
    return (
      <div className="p-4 text-center">
        <Brain className="w-8 h-8 mx-auto mb-3 text-white/20" />
        <p className="text-sm text-white/40">
          Select a working directory to view memories
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-[#9B59B6]" />
          <span className="text-sm font-medium text-white/80">Memories</span>
          <span className="text-xs text-white/40">({memories.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className={cn(
              'p-1.5 rounded-lg',
              'text-white/40 hover:text-white hover:bg-white/[0.06]',
              'transition-colors',
              isLoading && 'animate-spin'
            )}
            title="Refresh memories"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {onCreateMemory && (
            <button
              onClick={onCreateMemory}
              className={cn(
                'p-1.5 rounded-lg',
                'text-white/40 hover:text-white hover:bg-white/[0.06]',
                'transition-colors'
              )}
              title="Create memory"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-white/[0.06]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className={cn(
              'w-full pl-9 pr-3 py-2 rounded-lg',
              'bg-white/[0.04] border border-white/[0.08]',
              'text-sm text-white/80 placeholder:text-white/30',
              'focus:outline-none focus:border-[#1D4ED8]/40'
            )}
          />
        </div>
      </div>

      {/* Group Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] overflow-x-auto">
        <button
          onClick={() => setSelectedGroup('all')}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs whitespace-nowrap',
            'transition-colors',
            selectedGroup === 'all'
              ? 'bg-white/[0.12] text-white'
              : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
          )}
        >
          All
        </button>
        {groups.map((group) => {
          const Icon = GROUP_ICONS[group] || Folder;
          const color = GROUP_COLORS[group] || 'text-white/60';
          return (
            <button
              key={group}
              onClick={() => setSelectedGroup(group)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap',
                'transition-colors',
                selectedGroup === group
                  ? 'bg-white/[0.12] text-white'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
              )}
            >
              <Icon className={cn('w-3 h-3', color)} />
              <span className="capitalize">{group}</span>
            </button>
          );
        })}
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 bg-[#FF5449]/10 border-b border-[#FF5449]/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#FF5449]">{error}</p>
              <button
                onClick={clearError}
                className="text-[#FF5449] hover:text-white text-xs"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 text-white/30 animate-spin" />
            <p className="text-sm text-white/40">Loading memories...</p>
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="p-4 text-center">
            <Brain className="w-6 h-6 mx-auto mb-2 text-white/20" />
            <p className="text-sm text-white/40">
              {searchQuery ? 'No memories match your search' : 'No memories yet'}
            </p>
            {onCreateMemory && !searchQuery && (
              <button
                onClick={onCreateMemory}
                className={cn(
                  'mt-3 px-3 py-1.5 rounded-lg text-xs',
                  'bg-[#1D4ED8]/20 text-[#93C5FD]',
                  'hover:bg-[#1D4ED8]/30 transition-colors'
                )}
              >
                Create your first memory
              </button>
            )}
          </div>
        ) : selectedGroup === 'all' ? (
          // Show grouped view when "All" is selected
          <div className="p-2 space-y-3">
            {groups.map((group) => {
              const groupMemories = memoriesByGroup[group];
              if (!groupMemories || groupMemories.length === 0) return null;

              const Icon = GROUP_ICONS[group] || Folder;
              const color = GROUP_COLORS[group] || 'text-white/60';
              const description = GROUP_DESCRIPTIONS[group] || '';

              return (
                <div key={group} className="rounded-xl border border-white/[0.06] overflow-hidden">
                  {/* Group Header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02]">
                    <Icon className={cn('w-4 h-4', color)} />
                    <span className="text-xs font-medium text-white/70 capitalize">{group}</span>
                    <span className="text-[10px] text-white/30">({groupMemories.length})</span>
                    <span className="flex-1" />
                    <span className="text-[10px] text-white/30">{description}</span>
                  </div>

                  {/* Group Memories */}
                  <div className="divide-y divide-white/[0.04]">
                    {groupMemories.map((memory) => (
                      <MemoryItem
                        key={memory.id}
                        memory={memory}
                        isSelected={selectedMemoryId === memory.id}
                        onSelect={() => selectMemory(memory.id)}
                        onEdit={onEditMemory ? () => onEditMemory(memory) : undefined}
                        onDelete={(e) => handleDeleteMemory(memory.id, e)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Show flat list when specific group is selected
          <div className="divide-y divide-white/[0.04]">
            {filteredMemories.map((memory) => (
              <MemoryItem
                key={memory.id}
                memory={memory}
                isSelected={selectedMemoryId === memory.id}
                onSelect={() => selectMemory(memory.id)}
                onEdit={onEditMemory ? () => onEditMemory(memory) : undefined}
                onDelete={(e) => handleDeleteMemory(memory.id, e)}
              />
            ))}
          </div>
        )}
      </div>

      <MemoryInspector memory={selectedMemory} sessionId={activeSessionId} />
    </div>
  );
}

// Individual memory item component
interface MemoryItemProps {
  memory: Memory;
  isSelected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function MemoryItem({ memory, isSelected, onSelect, onEdit, onDelete }: MemoryItemProps) {
  const Icon = GROUP_ICONS[memory.group] || Folder;
  const color = GROUP_COLORS[memory.group] || 'text-white/60';

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}
      className={cn(
        'group w-full flex items-start gap-3 px-3 py-2.5 text-left',
        'transition-colors',
        isSelected && 'bg-[#1D4ED8]/10'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
          isSelected ? 'bg-[#1D4ED8]/20' : 'bg-white/[0.04]'
        )}
      >
        <Icon className={cn('w-3.5 h-3.5', isSelected ? 'text-[#1D4ED8]' : color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-medium truncate',
              isSelected ? 'text-white' : 'text-white/80'
            )}
          >
            {memory.title}
          </span>
          {memory.source === 'auto' && (
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#9B59B6]/20 text-[#9B59B6]">
              auto
            </span>
          )}
        </div>
        <p className="text-xs text-white/40 line-clamp-2 mt-0.5">
          {memory.content.slice(0, 100)}
          {memory.content.length > 100 && '...'}
        </p>
        {memory.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {memory.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[9px] bg-white/[0.06] text-white/40"
              >
                {tag}
              </span>
            ))}
            {memory.tags.length > 3 && (
              <span className="text-[9px] text-white/30">+{memory.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1 rounded text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onDelete}
          className="p-1 rounded text-white/40 hover:text-[#FF5449] hover:bg-[#FF5449]/10 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.button>
  );
}
