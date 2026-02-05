import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Shield,
  Plus,
  Trash2,
  ChevronDown,
  Check,
  AlertTriangle,
  Info,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useToolPolicyStore,
  useCurrentProfile,
  useGlobalAllowList,
  useGlobalDenyList,
  useCustomRules,
} from '@/stores/tool-policy-store';
import type {
  ToolProfile,
  ToolRule,
  ToolRuleAction,
} from '@gemini-cowork/shared';

interface ToolPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROFILES: {
  id: ToolProfile;
  name: string;
  description: string;
  color: string;
}[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Read-only access, no shell or network',
    color: 'bg-blue-500',
  },
  {
    id: 'readonly',
    name: 'Read Only',
    description: 'File reading and search, no writes',
    color: 'bg-cyan-500',
  },
  {
    id: 'coding',
    name: 'Coding',
    description: 'Full coding tools, limited shell',
    color: 'bg-green-500',
  },
  {
    id: 'messaging',
    name: 'Messaging',
    description: 'Network access, limited file access',
    color: 'bg-purple-500',
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Research and network, read-only files',
    color: 'bg-indigo-500',
  },
  {
    id: 'full',
    name: 'Full Access',
    description: 'All tools enabled',
    color: 'bg-orange-500',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'User-defined rules',
    color: 'bg-gray-500',
  },
];

const TOOL_GROUPS = [
  { id: 'group:fs', name: 'File System', description: 'read, write, edit files' },
  { id: 'group:shell', name: 'Shell', description: 'execute commands' },
  { id: 'group:network', name: 'Network', description: 'fetch, search' },
  { id: 'group:research', name: 'Research', description: 'deep research' },
  { id: 'group:media', name: 'Media', description: 'image, video generation' },
  { id: 'group:computer', name: 'Computer', description: 'browser automation' },
  { id: 'group:mcp', name: 'MCP Tools', description: 'external tool servers' },
  { id: 'group:tasks', name: 'Tasks', description: 'todo management' },
  { id: 'group:memory', name: 'Memory', description: 'memory read/write' },
];

function ProfileSelector({
  currentProfile,
  onSelect,
  isLoading,
}: {
  currentProfile: ToolProfile;
  onSelect: (profile: ToolProfile) => void;
  isLoading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const current = PROFILES.find((p) => p.id === currentProfile) || PROFILES[2];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          'w-full flex items-center justify-between p-4 rounded-xl',
          'bg-white/[0.04] border border-white/[0.08]',
          'hover:bg-white/[0.06] transition-colors',
          isLoading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-3 h-3 rounded-full', current.color)} />
          <div className="text-left">
            <div className="text-sm font-medium text-white/90">{current.name}</div>
            <div className="text-xs text-white/50">{current.description}</div>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-white/40 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-full left-0 right-0 mt-2 py-1 rounded-xl bg-[#1A1B21] border border-white/[0.08] shadow-xl z-20 max-h-64 overflow-y-auto"
            >
              {PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    onSelect(profile.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5',
                    'hover:bg-white/[0.06] transition-colors',
                    profile.id === currentProfile && 'bg-white/[0.04]'
                  )}
                >
                  <div className={cn('w-3 h-3 rounded-full', profile.color)} />
                  <div className="flex-1 text-left">
                    <div className="text-sm text-white/90">{profile.name}</div>
                    <div className="text-xs text-white/50">{profile.description}</div>
                  </div>
                  {profile.id === currentProfile && (
                    <Check className="w-4 h-4 text-[#10B981]" />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolList({
  title,
  tools,
  onAdd,
  onRemove,
  type,
}: {
  title: string;
  tools: string[];
  onAdd: (tool: string) => void;
  onRemove: (tool: string) => void;
  type: 'allow' | 'deny';
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTool, setNewTool] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleAdd = () => {
    if (newTool.trim()) {
      onAdd(newTool.trim());
      setNewTool('');
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewTool('');
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-white/80">{title}</h4>
        <button
          onClick={() => setIsAdding(true)}
          className="p-1 rounded hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        {tools.length === 0 && !isAdding && (
          <p className="text-xs text-white/40 py-2">No tools configured</p>
        )}

        {tools.map((tool) => (
          <div
            key={tool}
            className={cn(
              'flex items-center justify-between px-3 py-1.5 rounded-lg',
              'bg-white/[0.02] border border-white/[0.04]',
              type === 'allow' && 'border-l-2 border-l-[#10B981]',
              type === 'deny' && 'border-l-2 border-l-red-500'
            )}
          >
            <span className="text-sm text-white/70 font-mono">{tool}</span>
            <button
              onClick={() => onRemove(tool)}
              className="p-1 rounded hover:bg-white/[0.08] text-white/30 hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {isAdding && (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newTool}
              onChange={(e) => setNewTool(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!newTool.trim()) {
                  setIsAdding(false);
                }
              }}
              placeholder="Tool name or group:..."
              className={cn(
                'flex-1 px-3 py-1.5 rounded-lg text-sm font-mono',
                'bg-white/[0.04] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:border-[#4C71FF]/50'
              )}
            />
            <button
              onClick={handleAdd}
              disabled={!newTool.trim()}
              className="p-1.5 rounded-lg bg-[#4C71FF] text-white disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Quick add groups */}
      <div className="mt-3 pt-3 border-t border-white/[0.06]">
        <p className="text-xs text-white/40 mb-2">Quick add groups:</p>
        <div className="flex flex-wrap gap-1">
          {TOOL_GROUPS.slice(0, 5).map((group) => (
            <button
              key={group.id}
              onClick={() => onAdd(group.id)}
              disabled={tools.includes(group.id)}
              className={cn(
                'px-2 py-0.5 rounded text-xs',
                'bg-white/[0.04] text-white/50',
                'hover:bg-white/[0.08] hover:text-white/70',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                'transition-colors'
              )}
              title={group.description}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RulesList({
  rules,
  onRemove,
  onAdd,
}: {
  rules: ToolRule[];
  onRemove: (index: number) => void;
  onAdd: (rule: Omit<ToolRule, 'priority'>) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newRule, setNewRule] = useState({
    tool: '',
    action: 'allow' as ToolRuleAction,
  });

  const handleAdd = () => {
    if (newRule.tool.trim()) {
      onAdd({
        tool: newRule.tool.trim(),
        action: newRule.action,
      });
      setNewRule({ tool: '', action: 'allow' });
      setIsAdding(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-white/80">Custom Rules</h4>
        <button
          onClick={() => setIsAdding(true)}
          className="p-1 rounded hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        {rules.length === 0 && !isAdding && (
          <p className="text-xs text-white/40 py-2">No custom rules</p>
        )}

        {rules.map((rule, index) => (
          <div
            key={index}
            className={cn(
              'flex items-center justify-between px-3 py-2 rounded-lg',
              'bg-white/[0.02] border border-white/[0.04]'
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium uppercase',
                  rule.action === 'allow' && 'bg-[#10B981]/20 text-[#10B981]',
                  rule.action === 'deny' && 'bg-red-500/20 text-red-400',
                  rule.action === 'ask' && 'bg-yellow-500/20 text-yellow-400'
                )}
              >
                {rule.action}
              </span>
              <span className="text-sm text-white/70 font-mono">{rule.tool}</span>
            </div>
            <button
              onClick={() => onRemove(index)}
              className="p-1 rounded hover:bg-white/[0.08] text-white/30 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {isAdding && (
          <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2">
              <select
                value={newRule.action}
                onChange={(e) =>
                  setNewRule({ ...newRule, action: e.target.value as ToolRuleAction })
                }
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm',
                  'bg-white/[0.04] border border-white/[0.08]',
                  'text-white/90',
                  'focus:outline-none focus:border-[#4C71FF]/50'
                )}
              >
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="ask">Ask</option>
              </select>
              <input
                type="text"
                value={newRule.tool}
                onChange={(e) => setNewRule({ ...newRule, tool: e.target.value })}
                placeholder="Tool name or pattern"
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-lg text-sm font-mono',
                  'bg-white/[0.04] border border-white/[0.08]',
                  'text-white/90 placeholder:text-white/30',
                  'focus:outline-none focus:border-[#4C71FF]/50'
                )}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewRule({ tool: '', action: 'allow' });
                }}
                className="px-3 py-1 rounded-lg text-sm bg-white/[0.06] text-white/70"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newRule.tool.trim()}
                className="px-3 py-1 rounded-lg text-sm bg-[#4C71FF] text-white disabled:opacity-50"
              >
                Add Rule
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolPolicyModal({ isOpen, onClose }: ToolPolicyModalProps) {
  const {
    isLoading,
    error,
    loadPolicy,
    setProfile,
    addToGlobalAllow,
    removeFromGlobalAllow,
    addToGlobalDeny,
    removeFromGlobalDeny,
    addRule,
    removeRule,
    resetPolicy,
    clearError,
  } = useToolPolicyStore();

  const currentProfile = useCurrentProfile();
  const globalAllow = useGlobalAllowList();
  const globalDeny = useGlobalDenyList();
  const customRules = useCustomRules();

  // Load policy when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPolicy();
    }
  }, [isOpen, loadPolicy]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleReset = async () => {
    if (confirm('Reset all tool policies to defaults? This cannot be undone.')) {
      await resetPolicy();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              'w-[560px] max-h-[85vh] overflow-hidden rounded-2xl',
              'bg-[#111218] border border-white/[0.08]',
              'shadow-2xl shadow-black/60',
              'flex flex-col'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#4C71FF]/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-[#8CA2FF]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white/90">Tool Policy</h2>
                  <p className="text-xs text-white/40">
                    Control which tools the agent can use
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Error Display */}
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <p className="text-sm text-red-400">{error}</p>
                    <button
                      onClick={clearError}
                      className="ml-auto p-1 hover:bg-white/[0.06] rounded"
                    >
                      <X className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              )}

              {/* Profile Selection */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Access Profile
                </label>
                <ProfileSelector
                  currentProfile={currentProfile}
                  onSelect={setProfile}
                  isLoading={isLoading}
                />
              </div>

              {/* Global Allow List */}
              <ToolList
                title="Always Allow"
                tools={globalAllow}
                onAdd={addToGlobalAllow}
                onRemove={removeFromGlobalAllow}
                type="allow"
              />

              {/* Global Deny List */}
              <ToolList
                title="Always Deny"
                tools={globalDeny}
                onAdd={addToGlobalDeny}
                onRemove={removeFromGlobalDeny}
                type="deny"
              />

              {/* Custom Rules */}
              <RulesList
                rules={customRules}
                onAdd={addRule}
                onRemove={removeRule}
              />

              {/* Info Note */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[#4C71FF]/10 border border-[#4C71FF]/20">
                <Info className="w-4 h-4 text-[#8CA2FF] flex-shrink-0 mt-0.5" />
                <div className="text-xs text-[#8CA2FF] space-y-1">
                  <p>
                    <strong>Evaluation order:</strong> Global Deny → Global Allow → Custom Rules → Profile Defaults
                  </p>
                  <p>
                    Use <code className="px-1 py-0.5 bg-white/10 rounded">group:*</code> prefixes
                    for tool categories (e.g., group:fs, group:shell)
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08]">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset to defaults
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm bg-[#4C71FF] text-white hover:bg-[#5B7FFF] transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
