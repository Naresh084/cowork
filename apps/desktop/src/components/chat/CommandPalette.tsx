/**
 * CommandPalette - Auto-suggest UI for slash commands
 *
 * Shows when user types "/" at the start of the input
 * Provides fuzzy matching and keyboard navigation
 */

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command as CommandIcon,
  FileText,
  HelpCircle,
  Brain,
  Settings,
  Zap,
  FolderCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommandStore, type Command, type CommandCategory } from '../../stores/command-store';

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

interface CommandPaletteProps {
  onSelect: (command: Command) => void;
  onClose: () => void;
}

export function CommandPalette({ onSelect, onClose }: CommandPaletteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const {
    isPaletteOpen,
    paletteQuery,
    selectedIndex,
    setSelectedIndex,
    getFilteredCommands,
  } = useCommandStore();

  const filteredCommands = getFilteredCommands();

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
            {paletteQuery ? `Searching: ${paletteQuery}` : 'Available Commands'}
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
            const CategoryIcon = CATEGORY_ICONS[command.category] || HelpCircle;
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
                  <CategoryIcon
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

/**
 * CommandPaletteOverlay - Full-screen command palette
 * Used when user presses Cmd+K or similar
 */
export function CommandPaletteOverlay({ onClose }: { onClose: () => void }) {
  const {
    isPaletteOpen,
    paletteQuery,
    setPaletteQuery,
    selectedIndex,
    setSelectedIndex,
    getFilteredCommands,
    executeCommand,
  } = useCommandStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const filteredCommands = getFilteredCommands();

  // Focus input on open
  useEffect(() => {
    if (isPaletteOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isPaletteOpen]);

  const handleSelect = async (command: Command) => {
    // For commands that need arguments, we might show a form
    // For now, execute directly if no required args
    const hasRequiredArgs = command.arguments.some((arg) => arg.required);

    if (!hasRequiredArgs) {
      await executeCommand(command.name, {});
    }

    onClose();
  };

  if (!isPaletteOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'w-[560px] max-h-[480px] rounded-2xl overflow-hidden',
            'bg-[#1A1A1E] border border-white/[0.10]',
            'shadow-2xl shadow-black/60'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
            <CommandIcon className="w-5 h-5 text-[#4C71FF]" />
            <input
              ref={inputRef}
              type="text"
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
              placeholder="Search commands..."
              className={cn(
                'flex-1 bg-transparent text-white',
                'placeholder:text-white/30 focus:outline-none',
                'text-base'
              )}
            />
            <kbd className="px-2 py-1 rounded text-xs bg-white/[0.06] text-white/40 border border-white/[0.08]">
              Esc
            </kbd>
          </div>

          {/* Command List */}
          <div className="max-h-[360px] overflow-y-auto py-2">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <HelpCircle className="w-8 h-8 mx-auto mb-3 text-white/20" />
                <p className="text-sm text-white/40">
                  No commands found matching "{paletteQuery}"
                </p>
              </div>
            ) : (
              filteredCommands.map((command, index) => {
                const CategoryIcon = CATEGORY_ICONS[command.category] || HelpCircle;
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={command.name}
                    onClick={() => handleSelect(command)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'w-full flex items-center gap-4 px-4 py-3',
                      'text-left transition-colors',
                      isSelected ? 'bg-[#4C71FF]/15' : 'hover:bg-white/[0.04]'
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center',
                        isSelected ? 'bg-[#4C71FF]/20' : 'bg-white/[0.04]'
                      )}
                    >
                      <CategoryIcon
                        className={cn(
                          'w-5 h-5',
                          isSelected ? 'text-[#4C71FF]' : CATEGORY_COLORS[command.category]
                        )}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'font-medium',
                            isSelected ? 'text-white' : 'text-white/80'
                          )}
                        >
                          /{command.name}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] capitalize',
                            'bg-white/[0.04] border border-white/[0.06]',
                            CATEGORY_COLORS[command.category]
                          )}
                        >
                          {command.category}
                        </span>
                      </div>
                      <p className="text-sm text-white/50 mt-0.5 line-clamp-1">
                        {command.description}
                      </p>
                    </div>

                    {isSelected && (
                      <kbd className="px-2 py-1 rounded text-xs bg-white/[0.06] text-white/40 border border-white/[0.08]">
                        Enter
                      </kbd>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
