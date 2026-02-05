/**
 * CommandPalette - Auto-suggest UI for slash commands
 *
 * Shows when user types "/" at the start of the input.
 * Provides fuzzy matching and keyboard navigation.
 * On select: inserts command into input (user presses Enter to send).
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command as CommandIcon,
  FileText,
  HelpCircle,
  Brain,
  Settings,
  Zap,
  FolderCog,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommandStore, type SlashCommand, type CommandCategory } from '../../stores/command-store';

// Category icons mapping
const CATEGORY_ICONS: Record<CommandCategory, React.ComponentType<{ className?: string }>> = {
  setup: FolderCog,
  memory: Brain,
  utility: Settings,
  workflow: Zap,
  custom: FileText,
};

// Icon mapping by command name (for specific icons)
const COMMAND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  init: FileText,
  help: HelpCircle,
  clear: Trash2,
  memory: Brain,
};

// Category colors
const CATEGORY_COLORS: Record<CommandCategory, string> = {
  setup: 'text-[#4C71FF]',
  memory: 'text-[#9B59B6]',
  utility: 'text-[#F5C400]',
  workflow: 'text-[#27AE60]',
  custom: 'text-white/60',
};

interface CommandPaletteProps {
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function CommandPalette({ onSelect, onClose }: CommandPaletteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const {
    isPaletteOpen,
    paletteQuery,
    selectedIndex,
    setSelectedIndex,
    availableCommands,
  } = useCommandStore();

  // Compute installed commands - show MANAGED commands (same logic as sidebar)
  // This is simpler and doesn't rely on installedCommandConfigs being in sync
  const commands = useMemo((): SlashCommand[] => {
    // Filter to only managed commands (installed by user)
    const managedCommands = availableCommands.filter((c) => c.source.type === 'managed');

    // Convert to SlashCommand format
    return managedCommands
      .map((cmd) => ({
        name: cmd.frontmatter.name,
        displayName: cmd.frontmatter.displayName,
        description: cmd.frontmatter.description,
        aliases: cmd.frontmatter.aliases || [],
        category: cmd.frontmatter.category,
        icon: cmd.frontmatter.icon,
        prompt: cmd.prompt,
        action: cmd.frontmatter.action,
        priority: cmd.frontmatter.priority,
      }))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [availableCommands]);

  // Filter commands based on palette query
  const filteredCommands = useMemo(() => {
    const q = paletteQuery.toLowerCase();
    if (!q) {
      return commands;
    }
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.displayName.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [commands, paletteQuery]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isPaletteOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(Math.min(selectedIndex + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(Math.max(selectedIndex - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
          }
          break;
      }
    },
    [isPaletteOpen, selectedIndex, filteredCommands, setSelectedIndex, onSelect, onClose]
  );

  // Add keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredCommands.length > 0) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredCommands.length]);

  // Debug: Log state when palette should be open
  if (isPaletteOpen) {
    console.log('[CommandPalette] Debug:', {
      isPaletteOpen,
      availableCommandsCount: availableCommands.length,
      managedCommandsCount: commands.length,
      managedNames: commands.map(c => c.name),
      filteredCommandsCount: filteredCommands.length,
      paletteQuery,
    });
  }

  if (!isPaletteOpen || filteredCommands.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className={cn(
          'absolute bottom-full left-0 right-0 mb-2 z-50',
          'max-h-[320px] overflow-hidden',
          'rounded-xl border border-white/[0.08]',
          'bg-[#1A1A1E]/95 backdrop-blur-xl',
          'shadow-2xl shadow-black/40'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
          <CommandIcon className="w-3.5 h-3.5 text-[#4C71FF]" />
          <span className="text-xs text-white/50">
            {paletteQuery ? `Searching: ${paletteQuery}` : 'Commands'}
          </span>
          <div className="flex-1" />
          <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-white/40 border border-white/[0.08]">
            ↑↓
          </kbd>
          <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-white/40 border border-white/[0.08]">
            Enter
          </kbd>
        </div>

        {/* Command List */}
        <div
          ref={listRef}
          className="overflow-y-auto max-h-[260px] py-1"
        >
          {filteredCommands.map((command, index) => {
            // Use specific icon if available, otherwise category icon
            const IconComponent = COMMAND_ICONS[command.name] || CATEGORY_ICONS[command.category] || HelpCircle;
            const categoryColor = CATEGORY_COLORS[command.category] || 'text-white/60';
            const isSelected = index === selectedIndex;

            return (
              <motion.button
                key={command.name}
                data-index={index}
                onClick={() => onSelect(command)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  'w-full flex items-start gap-3 px-3 py-2.5',
                  'text-left transition-colors duration-100',
                  isSelected
                    ? 'bg-[#4C71FF]/15'
                    : 'hover:bg-white/[0.04]'
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-[#4C71FF]/20' : 'bg-white/[0.04]'
                  )}
                >
                  <IconComponent
                    className={cn('w-4 h-4', isSelected ? 'text-[#4C71FF]' : categoryColor)}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isSelected ? 'text-white' : 'text-white/80'
                      )}
                    >
                      /{command.name}
                    </span>
                    {command.aliases.length > 0 && (
                      <span className="text-[10px] text-white/30">
                        ({command.aliases.map((a) => `/${a}`).join(', ')})
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      'text-xs mt-0.5 line-clamp-1',
                      isSelected ? 'text-white/60' : 'text-white/40'
                    )}
                  >
                    {command.description}
                  </p>
                </div>

                {/* Category Badge */}
                <div
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] capitalize',
                    'bg-white/[0.04] border border-white/[0.06]',
                    categoryColor
                  )}
                >
                  {command.category}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 border-t border-white/[0.06] text-[10px] text-white/30">
          Type to filter • Press Enter to select • Esc to close
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
