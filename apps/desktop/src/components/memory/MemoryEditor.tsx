/**
 * MemoryEditor - Create and edit memory entries
 *
 * Modal dialog for creating new memories or editing existing ones
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Brain,
  Tag,
  Settings,
  Lightbulb,
  FileText,
  Bookmark,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMemoryStore,
  useMemoryGroups,
  useIsCreatingMemory,
  type MemoryGroup,
  type Memory,
  type CreateMemoryInput,
} from '../../stores/memory-store';

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

interface MemoryEditorProps {
  isOpen: boolean;
  onClose: () => void;
  memory?: Memory; // If provided, we're editing; otherwise creating
}

export function MemoryEditor({ isOpen, onClose, memory }: MemoryEditorProps) {
  const groups = useMemoryGroups();
  const isCreating = useIsCreatingMemory();
  const { createMemory, updateMemory } = useMemoryStore();

  const isEditing = !!memory;

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [group, setGroup] = useState<MemoryGroup>('preferences');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initialize form when memory changes
  useEffect(() => {
    if (memory) {
      setTitle(memory.title);
      setContent(memory.content);
      setGroup(memory.group);
      setTagsInput(memory.tags.join(', '));
    } else {
      // Reset form for new memory
      setTitle('');
      setContent('');
      setGroup('preferences');
      setTagsInput('');
    }
    setError(null);
  }, [memory, isOpen]);

  const handleSubmit = useCallback(async () => {
    // Validate
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!content.trim()) {
      setError('Content is required');
      return;
    }

    setError(null);

    // Parse tags
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      if (isEditing && memory) {
        await updateMemory(memory.id, {
          title: title.trim(),
          content: content.trim(),
          group,
          tags,
        });
      } else {
        const input: CreateMemoryInput = {
          title: title.trim(),
          content: content.trim(),
          group,
          tags,
          source: 'manual',
        };
        await createMemory(input);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [title, content, group, tagsInput, isEditing, memory, createMemory, updateMemory, onClose]);

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
              'w-[520px] max-h-[80vh] rounded-2xl overflow-hidden',
              'bg-[#1C1C20] border border-white/[0.10]',
              'shadow-2xl shadow-black/60',
              'flex flex-col'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#9B59B6]/20 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-[#9B59B6]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {isEditing ? 'Edit Memory' : 'Create Memory'}
                  </h3>
                  <p className="text-xs text-white/40">
                    {isEditing
                      ? 'Update the memory content'
                      : 'Add knowledge for the agent to remember'}
                  </p>
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
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Error Message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 py-3 rounded-xl bg-[#FF5449]/10 border border-[#FF5449]/20"
                  >
                    <p className="text-sm text-[#FF5449]">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Title */}
              <div>
                <label className="text-xs font-medium text-white/50 mb-2 block">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Prefer TypeScript strict mode"
                  className={cn(
                    'w-full px-4 py-3 rounded-xl',
                    'bg-[#0D0D0F] border border-white/[0.06]',
                    'text-sm text-white/90 placeholder:text-white/30',
                    'focus:outline-none focus:border-[#1D4ED8]/40'
                  )}
                />
              </div>

              {/* Group Selector */}
              <div>
                <label className="text-xs font-medium text-white/50 mb-2 block">
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const Icon = GROUP_ICONS[g] || Brain;
                    const color = GROUP_COLORS[g] || 'text-white/60';
                    const isSelected = group === g;

                    return (
                      <button
                        key={g}
                        onClick={() => setGroup(g)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                          'border transition-colors',
                          isSelected
                            ? 'bg-white/[0.08] border-white/[0.12] text-white'
                            : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.04]'
                        )}
                      >
                        <Icon className={cn('w-4 h-4', isSelected ? color : 'text-white/40')} />
                        <span className="capitalize">{g}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="text-xs font-medium text-white/50 mb-2 block">
                  Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write the memory content. Supports markdown."
                  rows={6}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl',
                    'bg-[#0D0D0F] border border-white/[0.06]',
                    'text-sm text-white/90 placeholder:text-white/30',
                    'focus:outline-none focus:border-[#1D4ED8]/40',
                    'resize-none'
                  )}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-medium text-white/50 mb-2 block">
                  <div className="flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Tags (comma-separated)</span>
                  </div>
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g., typescript, style, convention"
                  className={cn(
                    'w-full px-4 py-3 rounded-xl',
                    'bg-[#0D0D0F] border border-white/[0.06]',
                    'text-sm text-white/90 placeholder:text-white/30',
                    'focus:outline-none focus:border-[#1D4ED8]/40'
                  )}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.08]">
              <button
                onClick={onClose}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm',
                  'text-white/60 hover:text-white hover:bg-white/[0.06]',
                  'transition-colors'
                )}
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSubmit}
                disabled={isCreating}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm',
                  'bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8]',
                  'text-white font-medium',
                  'shadow-lg shadow-[#1D4ED8]/25',
                  'hover:shadow-xl hover:shadow-[#1D4ED8]/35',
                  'transition-shadow duration-200',
                  isCreating && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Save className="w-4 h-4" />
                {isCreating ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Memory'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
