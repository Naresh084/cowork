// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Bot, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';
import type { SubagentCategory } from '../../stores/subagent-store';
import { useSubagentStore } from '../../stores/subagent-store';
import { useSessionStore } from '../../stores/session-store';

interface CreateSubagentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (subagentName: string) => void;
}

const CATEGORIES: Array<{ value: SubagentCategory; label: string }> = [
  { value: 'custom', label: 'Custom' },
  { value: 'research', label: 'Research' },
  { value: 'development', label: 'Development' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'productivity', label: 'Productivity' },
];

export function CreateSubagentModal({ isOpen, onClose, onCreated }: CreateSubagentModalProps) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [category, setCategory] = useState<SubagentCategory>('custom');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tags, setTags] = useState('');
  const [tools, setTools] = useState('');
  const [model, setModel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { loadSubagents } = useSubagentStore();
  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const input = {
        name,
        displayName,
        description,
        systemPrompt,
        category: category === 'custom' ? undefined : category,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        tools: tools ? tools.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        model: model || undefined,
      };

      await invoke<string>('deep_subagent_create', {
        input,
        workingDirectory: workingDirectory || undefined,
      });

      // Reload subagents to show the new one
      await loadSubagents(workingDirectory || undefined, { force: true });

      // Reset form
      setName('');
      setDisplayName('');
      setDescription('');
      setSystemPrompt('');
      setCategory('custom');
      setTags('');
      setTools('');
      setModel('');
      setShowAdvanced(false);

      onCreated?.(name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subagent');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validate name as kebab-case
  const isNameValid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name === '';

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-[calc(100vw-4rem)] h-[calc(100vh-4rem)] md:w-[calc(100vw-8rem)] md:h-[calc(100vh-8rem)] lg:w-[calc(100vw-12rem)] lg:h-[calc(100vh-12rem)] bg-zinc-900 rounded-xl flex flex-col overflow-hidden border border-zinc-800 shadow-2xl shadow-black/60"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <Bot className="w-5 h-5 text-[#06B6D4]" />
                <h2 className="text-lg font-semibold text-zinc-100">Create Custom Subagent</h2>
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
                    Subagent Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase())}
                    placeholder="my-subagent"
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
                    placeholder="My Subagent"
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
                  placeholder="A specialized subagent for..."
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  System Prompt <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are a specialized assistant that..."
                  rows={6}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
                  required
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Define the role, responsibilities, and behavior of your subagent.
                </p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SubagentCategory)}
                  className="app-select app-select--compact w-full bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
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
                    {/* Tags */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Tags (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="analysis, security, code"
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Tools */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Allowed Tools (comma-separated, leave empty for all)
                      </label>
                      <input
                        type="text"
                        value={tools}
                        onChange={(e) => setTools(e.target.value)}
                        placeholder="read_file, search_code, write_file"
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Model Override */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Model Override (optional)
                      </label>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="gemini-2.0-flash"
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Info Note */}
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <p className="text-sm text-zinc-400">
                  <span className="text-zinc-300 font-medium">Note:</span> Custom subagents are stored in{' '}
                  <code className="px-1 py-0.5 rounded bg-zinc-700 text-[#06B6D4]">~/.cowork/subagents/</code>{' '}
                  and are available globally. They will be automatically included in the agent's delegation options.
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
                disabled={isSubmitting || !name || !displayName || !description || !systemPrompt || !isNameValid}
                className="px-6 py-2 bg-[#06B6D4] hover:bg-[#0284C7] disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" />
                    Create Subagent
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
