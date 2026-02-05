/**
 * MemoryGroups - Manage memory group categories
 *
 * Allows creating and deleting custom memory groups
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FolderPlus,
  Trash2,
  Settings,
  Lightbulb,
  FileText,
  Bookmark,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMemoryStore,
  useMemoryGroups,
  type MemoryGroup,
} from '../../stores/memory-store';

// Group icons mapping - default groups have specific icons
const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  preferences: Settings,
  learnings: Lightbulb,
  context: FileText,
  instructions: Bookmark,
};

// Group colors - default groups have specific colors
const GROUP_COLORS: Record<string, string> = {
  preferences: 'text-[#9B59B6]',
  learnings: 'text-[#F5C400]',
  context: 'text-[#4C71FF]',
  instructions: 'text-[#27AE60]',
};

// Default groups that cannot be deleted
const DEFAULT_GROUPS: MemoryGroup[] = ['preferences', 'learnings', 'context', 'instructions'];

interface MemoryGroupsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MemoryGroups({ isOpen, onClose }: MemoryGroupsProps) {
  const groups = useMemoryGroups();
  const { createGroup, deleteGroup, getMemoriesByGroup } = useMemoryStore();

  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateGroup = useCallback(async () => {
    const name = newGroupName.trim().toLowerCase().replace(/\s+/g, '-');

    if (!name) {
      setError('Group name is required');
      return;
    }

    if (groups.includes(name as MemoryGroup)) {
      setError('Group already exists');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      setError('Group name can only contain letters, numbers, and hyphens');
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      await createGroup(name);
      setNewGroupName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  }, [newGroupName, groups, createGroup]);

  const handleDeleteGroup = useCallback(async (groupName: string) => {
    if (DEFAULT_GROUPS.includes(groupName as MemoryGroup)) {
      setError('Cannot delete default groups');
      return;
    }

    const memoriesInGroup = getMemoriesByGroup(groupName as MemoryGroup);
    if (memoriesInGroup.length > 0) {
      const confirmed = window.confirm(
        `This group contains ${memoriesInGroup.length} memories. Are you sure you want to delete it?`
      );
      if (!confirmed) return;
    }

    try {
      await deleteGroup(groupName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [getMemoriesByGroup, deleteGroup]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
              'w-[420px] max-h-[70vh] rounded-2xl overflow-hidden',
              'bg-[#1C1C20] border border-white/[0.10]',
              'shadow-2xl shadow-black/60',
              'flex flex-col'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#4C71FF]/20 flex items-center justify-center">
                  <Folder className="w-5 h-5 text-[#4C71FF]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Memory Groups</h3>
                  <p className="text-xs text-white/40">Organize your memories by category</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Error Message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 px-4 py-3 rounded-xl bg-[#FF5449]/10 border border-[#FF5449]/20"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[#FF5449]">{error}</p>
                      <button
                        onClick={() => setError(null)}
                        className="text-[#FF5449] hover:text-white text-xs"
                      >
                        Dismiss
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Create New Group */}
              <div className="mb-4">
                <label className="text-xs font-medium text-white/50 mb-2 block">
                  Create New Group
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                    placeholder="e.g., decisions, notes"
                    className={cn(
                      'flex-1 px-4 py-2.5 rounded-xl',
                      'bg-[#0D0D0F] border border-white/[0.06]',
                      'text-sm text-white/90 placeholder:text-white/30',
                      'focus:outline-none focus:border-[#4C71FF]/40'
                    )}
                  />
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCreateGroup}
                    disabled={isCreating || !newGroupName.trim()}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-xl',
                      'bg-[#4C71FF]/20 text-[#8CA2FF]',
                      'hover:bg-[#4C71FF]/30 transition-colors',
                      (isCreating || !newGroupName.trim()) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span className="text-sm">Add</span>
                  </motion.button>
                </div>
              </div>

              {/* Groups List */}
              <div>
                <label className="text-xs font-medium text-white/50 mb-2 block">
                  Available Groups
                </label>
                <div className="space-y-1">
                  {groups.map((group) => {
                    const Icon = GROUP_ICONS[group] || Folder;
                    const color = GROUP_COLORS[group] || 'text-white/60';
                    const isDefault = DEFAULT_GROUPS.includes(group as MemoryGroup);
                    const memoriesInGroup = getMemoriesByGroup(group);

                    return (
                      <motion.div
                        key={group}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'flex items-center justify-between px-4 py-3 rounded-xl',
                          'bg-white/[0.02] border border-white/[0.06]',
                          'hover:bg-white/[0.04] transition-colors'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
                            <Icon className={cn('w-4 h-4', color)} />
                          </div>
                          <div>
                            <span className="text-sm text-white/80 capitalize">{group}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-white/30">
                                {memoriesInGroup.length} memories
                              </span>
                              {isDefault && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#4C71FF]/20 text-[#8CA2FF]">
                                  default
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {!isDefault && (
                          <button
                            onClick={() => handleDeleteGroup(group)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-[#FF5449] hover:bg-[#FF5449]/10 transition-colors"
                            title="Delete group"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/[0.08]">
              <p className="text-xs text-white/30">
                Default groups (preferences, learnings, context, instructions) cannot be deleted.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
