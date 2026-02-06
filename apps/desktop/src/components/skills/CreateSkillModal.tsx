import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Wand2, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSkillStore } from '../../stores/skill-store';
import type { SkillCategory } from '@gemini-cowork/shared';

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (skillId: string) => void;
}

const CATEGORIES: Array<{ value: SkillCategory | 'custom'; label: string }> = [
  { value: 'custom', label: 'Custom' },
  { value: 'development', label: 'Development' },
  { value: 'devops', label: 'DevOps' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'research', label: 'Research' },
  { value: 'creative', label: 'Creative' },
  { value: 'automation', label: 'Automation' },
];

const EMOJI_OPTIONS = ['📦', '🔧', '⚡', '🚀', '🎯', '💡', '🔍', '📊', '🤖', '🌐', '📝', '🔒'];

export function CreateSkillModal({ isOpen, onClose, onCreated }: CreateSkillModalProps) {
  const { createSkill, error, clearError } = useSkillStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('📦');
  const [category, setCategory] = useState<SkillCategory | 'custom'>('custom');
  const [content, setContent] = useState('');
  const [showRequirements, setShowRequirements] = useState(false);
  const [bins, setBins] = useState('');
  const [envVars, setEnvVars] = useState('');
  const [os, setOs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setIsSubmitting(true);

    try {
      const requirements = showRequirements
        ? {
            bins: bins
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            env: envVars
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            os: os.length > 0 ? os : undefined,
          }
        : undefined;

      const skillId = await createSkill({
        name,
        description,
        emoji,
        category,
        content,
        requirements,
      });

      // Reset form
      setName('');
      setDescription('');
      setEmoji('📦');
      setCategory('custom');
      setContent('');
      setBins('');
      setEnvVars('');
      setOs([]);
      setShowRequirements(false);

      onCreated?.(skillId);
      onClose();
    } catch {
      // Error is handled by the store
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleOs = (osName: string) => {
    setOs((prev) =>
      prev.includes(osName) ? prev.filter((o) => o !== osName) : [...prev, osName]
    );
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
                <Wand2 className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-zinc-100">Create Custom Skill</h2>
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

              {/* Name and Emoji row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase())}
                    placeholder="my-custom-skill"
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
                <div className="w-32">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Emoji</label>
                  <div className="relative">
                    <select
                      value={emoji}
                      onChange={(e) => setEmoji(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-center text-xl"
                    >
                      {EMOJI_OPTIONS.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </div>
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
                  placeholder="A custom skill that does something useful..."
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SkillCategory | 'custom')}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Skill Instructions (Markdown) <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`# My Custom Skill

Use this skill when you need to...

## Usage
\`\`\`bash
my-command --flag
\`\`\`

## Guidelines
- Always do X before Y
- Never do Z`}
                  className="w-full h-64 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                  required
                />
              </div>

              {/* Requirements (collapsible) */}
              <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRequirements(!showRequirements)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                >
                  <span className="text-sm font-medium text-zinc-300">
                    Requirements (Optional)
                  </span>
                  {showRequirements ? (
                    <Minus className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <Plus className="w-4 h-4 text-zinc-400" />
                  )}
                </button>

                {showRequirements && (
                  <div className="p-4 space-y-4 bg-zinc-800/30">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Required Binaries (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={bins}
                        onChange={(e) => setBins(e.target.value)}
                        placeholder="my-cli, other-tool"
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Environment Variables (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={envVars}
                        onChange={(e) => setEnvVars(e.target.value)}
                        placeholder="MY_API_KEY, ANOTHER_VAR"
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Platforms
                      </label>
                      <div className="flex gap-4">
                        {['darwin', 'linux', 'win32'].map((platform) => (
                          <label key={platform} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={os.includes(platform)}
                              onChange={() => toggleOs(platform)}
                              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-sm text-zinc-300">
                              {platform === 'darwin'
                                ? 'macOS'
                                : platform === 'linux'
                                  ? 'Linux'
                                  : 'Windows'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
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
                disabled={isSubmitting || !name || !description || !content || !isNameValid}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Create Skill
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
