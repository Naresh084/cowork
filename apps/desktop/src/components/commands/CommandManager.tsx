/**
 * CommandManager - View available slash commands
 *
 * Shows all available commands as a reference.
 * Commands are pure prompt templates - type "/" in chat to use them.
 */

import { useState, useEffect } from 'react';
import { X, Command, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommandStore, type SlashCommand } from '../../stores/command-store';
import { motion, AnimatePresence } from 'framer-motion';

interface CommandManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandManager({ isOpen, onClose }: CommandManagerProps) {
  const { commands } = useCommandStore();
  const [selectedCommand, setSelectedCommand] = useState<SlashCommand | null>(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedCommand) {
          setSelectedCommand(null);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, selectedCommand, onClose]);

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
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-4 md:inset-8 lg:inset-16 bg-zinc-900 rounded-xl z-50 flex flex-col overflow-hidden border border-zinc-800 shadow-2xl max-w-4xl mx-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#4C71FF]/20 flex items-center justify-center">
                  <Terminal className="w-5 h-5 text-[#4C71FF]" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">
                    Slash Commands
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Type "/" in chat to use these commands
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid gap-4">
                {commands.map((cmd) => (
                  <CommandCard
                    key={cmd.name}
                    command={cmd}
                    isSelected={selectedCommand?.name === cmd.name}
                    onClick={() => setSelectedCommand(
                      selectedCommand?.name === cmd.name ? null : cmd
                    )}
                  />
                ))}
              </div>

              {/* Tip */}
              <div className="mt-6 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <p className="text-sm text-zinc-400">
                  <span className="text-zinc-300 font-medium">Tip:</span>{' '}
                  You can add additional instructions after any command.
                  For example: <code className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">/init focus on the API layer</code>
                </p>
              </div>
            </div>

            {/* Selected Command Details */}
            <AnimatePresence>
              {selectedCommand && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-zinc-800 bg-zinc-850 overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-zinc-100">
                        /{selectedCommand.name}
                      </h3>
                      <button
                        onClick={() => setSelectedCommand(null)}
                        className="text-zinc-400 hover:text-zinc-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-zinc-400 mb-4">
                      {selectedCommand.description}
                    </p>
                    {selectedCommand.aliases.length > 0 && (
                      <div className="text-sm text-zinc-500">
                        <span className="text-zinc-400">Aliases:</span>{' '}
                        {selectedCommand.aliases.map((a) => `/${a}`).join(', ')}
                      </div>
                    )}
                    {selectedCommand.prompt && (
                      <div className="mt-4">
                        <p className="text-sm text-zinc-400 mb-2">Prompt Preview:</p>
                        <pre className="text-xs text-zinc-500 bg-zinc-800 p-3 rounded-lg overflow-auto max-h-48">
                          {selectedCommand.prompt.slice(0, 500)}
                          {selectedCommand.prompt.length > 500 && '...'}
                        </pre>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Simple command card component
function CommandCard({
  command,
  isSelected,
  onClick,
}: {
  command: SlashCommand;
  isSelected: boolean;
  onClick: () => void;
}) {
  const categoryColors: Record<string, string> = {
    setup: 'text-[#4C71FF] bg-[#4C71FF]/10',
    memory: 'text-purple-400 bg-purple-400/10',
    utility: 'text-yellow-400 bg-yellow-400/10',
    workflow: 'text-green-400 bg-green-400/10',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-4 p-4 rounded-lg text-left transition-colors',
        isSelected
          ? 'bg-[#4C71FF]/10 border border-[#4C71FF]/30'
          : 'bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-800'
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center',
        categoryColors[command.category] || 'text-zinc-400 bg-zinc-700'
      )}>
        <Command className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-zinc-100">/{command.name}</span>
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs capitalize',
            categoryColors[command.category] || 'text-zinc-400 bg-zinc-700'
          )}>
            {command.category}
          </span>
          {command.action && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-700 text-zinc-400">
              action
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-400">{command.description}</p>
      </div>
    </button>
  );
}
