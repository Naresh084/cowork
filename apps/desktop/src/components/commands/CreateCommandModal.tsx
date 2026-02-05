import { useState } from 'react';
import { X, Wand2, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { CommandCategory } from '../../stores/command-store';

interface CreateCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (commandName: string) => void;
}

const CATEGORIES: Array<{ value: CommandCategory; label: string }> = [
  { value: 'custom', label: 'Custom' },
  { value: 'setup', label: 'Setup' },
  { value: 'memory', label: 'Memory' },
  { value: 'utility', label: 'Utility' },
  { value: 'workflow', label: 'Workflow' },
];

const COMMAND_TYPES = [
  { value: 'system', label: 'System', description: 'Runs without AI agent' },
  { value: 'agent', label: 'Agent', description: 'Runs with AI agent' },
  { value: 'hybrid', label: 'Hybrid', description: 'Combines system and agent' },
];

export function CreateCommandModal({ isOpen, onClose, onCreated }: CreateCommandModalProps) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CommandCategory>('custom');
  const [commandType, setCommandType] = useState<'system' | 'agent' | 'hybrid'>('system');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aliases, setAliases] = useState('');
  const [requiresSession, setRequiresSession] = useState(false);
  const [requiresWorkingDir, setRequiresWorkingDir] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // In a real implementation, this would call the backend to create the command
      // For now, we'll just show a message
      // TODO: Implement command creation via IPC

      // Simulate command creation
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reset form
      setName('');
      setDisplayName('');
      setDescription('');
      setCategory('custom');
      setCommandType('system');
      setAliases('');
      setRequiresSession(false);
      setRequiresWorkingDir(false);
      setShowAdvanced(false);

      onCreated?.(name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create command');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validate name as kebab-case
  const isNameValid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name === '';

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
            className="fixed inset-0 bg-black/60 z-[60]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-8 md:inset-16 lg:inset-24 bg-zinc-900 rounded-xl z-[60] flex flex-col overflow-hidden border border-zinc-800 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <Wand2 className="w-5 h-5 text-[#4C71FF]" />
                <h2 className="text-lg font-semibold text-zinc-100">Create Custom Command</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Error display */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Name and Display Name row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Command Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase())}
                    placeholder="my-command"
                    className={cn(
                      'w-full px-4 py-2 bg-zinc-800 border rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500',
                      !isNameValid && name ? 'border-red-500' : 'border-zinc-700'
                    )}
                    required
                  />
                  {!isNameValid && name && (
                    <p className="mt-1 text-xs text-red-400">
                      Must be kebab-case (lowercase letters, numbers, hyphens)
                    </p>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Display Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="My Command"
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Description <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A custom command that does something useful..."
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Category and Type row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CommandCategory)}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Type</label>
                  <select
                    value={commandType}
                    onChange={(e) => setCommandType(e.target.value as 'system' | 'agent' | 'hybrid')}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {COMMAND_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label} - {type.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Advanced Options (collapsible) */}
              <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                >
                  <span className="text-sm font-medium text-zinc-300">
                    Advanced Options
                  </span>
                  {showAdvanced ? (
                    <Minus className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <Plus className="w-4 h-4 text-zinc-400" />
                  )}
                </button>

                {showAdvanced && (
                  <div className="p-4 space-y-4 bg-zinc-800/30">
                    {/* Aliases */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Aliases (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={aliases}
                        onChange={(e) => setAliases(e.target.value)}
                        placeholder="mc, my-cmd"
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Checkboxes */}
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requiresSession}
                          onChange={(e) => setRequiresSession(e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm text-zinc-300">Requires Active Session</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requiresWorkingDir}
                          onChange={(e) => setRequiresWorkingDir(e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm text-zinc-300">Requires Working Directory</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Info Note */}
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <p className="text-sm text-zinc-400">
                  <span className="text-zinc-300 font-medium">Note:</span> Custom commands are stored in{' '}
                  <code className="px-1 py-0.5 rounded bg-zinc-700 text-[#4C71FF]">.cowork/commands/</code>{' '}
                  in your working directory. After creation, you can edit the command handler file to define its behavior.
                </p>
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !name || !displayName || !description || !isNameValid}
                className="px-6 py-2 bg-[#4C71FF] hover:bg-[#5C81FF] disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Create Command
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
