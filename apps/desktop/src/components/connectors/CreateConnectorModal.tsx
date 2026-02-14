// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Trash2,
  Server,
  Globe,
  Key,
  Loader2,
  Check,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useConnectorStore } from '../../stores/connector-store';

// ============================================================================
// Types
// ============================================================================

interface CreateConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

interface SecretDefinition {
  key: string;
  description: string;
  required: boolean;
  placeholder?: string;
  link?: string;
}

type TransportType = 'stdio' | 'http';
type AuthType = 'none' | 'env';

// ============================================================================
// Validation
// ============================================================================

const validateName = (value: string): string | null => {
  if (!value) return 'Name is required';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
    return 'Name must be kebab-case (lowercase letters, numbers, hyphens)';
  }
  if (value.length > 64) return 'Name must be 64 characters or less';
  return null;
};

// ============================================================================
// CreateConnectorModal Component
// ============================================================================

export function CreateConnectorModal({
  isOpen,
  onClose,
  onCreated,
}: CreateConnectorModalProps) {
  const { createCustomConnector } = useConnectorStore();

  // Step tracking
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Basic Info
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');

  // Step 2: Transport
  const [transportType, setTransportType] = useState<TransportType>('stdio');
  const [command, setCommand] = useState('npx');
  const [args, setArgs] = useState('-y @modelcontextprotocol/server-');
  const [url, setUrl] = useState('');

  // Step 3: Authentication
  const [authType, setAuthType] = useState<AuthType>('none');
  const [secrets, setSecrets] = useState<SecretDefinition[]>([]);

  // ==========================================================================
  // Validation Helpers
  // ==========================================================================

  const isStep1Valid = useCallback(() => {
    return name && displayName && description && !validateName(name);
  }, [name, displayName, description]);

  const isStep2Valid = useCallback(() => {
    if (transportType === 'stdio') {
      return !!command;
    }
    return !!url && (url.startsWith('http://') || url.startsWith('https://'));
  }, [transportType, command, url]);

  const isStep3Valid = useCallback(() => {
    if (authType === 'none') return true;
    // All secrets must have a key and description
    return secrets.every((s) => s.key && s.description);
  }, [authType, secrets]);

  // ==========================================================================
  // Secrets Management
  // ==========================================================================

  const addSecret = () => {
    setSecrets([
      ...secrets,
      {
        key: '',
        description: '',
        required: true,
      },
    ]);
  };

  const removeSecret = (index: number) => {
    setSecrets(secrets.filter((_, i) => i !== index));
  };

  const updateSecret = (index: number, updates: Partial<SecretDefinition>) => {
    setSecrets(
      secrets.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  // ==========================================================================
  // Form Submission
  // ==========================================================================

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const params = {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        displayName,
        description,
        icon: 'Plug',
        category: 'custom' as const,
        tags: ['custom'],
        transport:
          transportType === 'stdio'
            ? {
                type: 'stdio' as const,
                command,
                args: args.split(/\s+/).filter(Boolean),
              }
            : {
                type: 'http' as const,
                url,
              },
        auth:
          authType === 'none'
            ? { type: 'none' as const }
            : { type: 'env' as const, secrets },
      };

      await createCustomConnector(params);

      // Success!
      onCreated?.();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setName('');
    setDisplayName('');
    setDescription('');
    setTransportType('stdio');
    setCommand('npx');
    setArgs('-y @modelcontextprotocol/server-');
    setUrl('');
    setAuthType('none');
    setSecrets([]);
    setError(null);
  };

  // Reset state when modal closes
  const handleClose = () => {
    resetForm();
    onClose();
  };

  // ==========================================================================
  // Step Navigation
  // ==========================================================================

  const canGoNext = () => {
    if (step === 1) return isStep1Valid();
    if (step === 2) return isStep2Valid();
    if (step === 3) return isStep3Valid();
    return false;
  };

  const goNext = () => {
    if (step < 3 && canGoNext()) {
      setStep(step + 1);
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  if (!isOpen) return null;

  const nameError = name ? validateName(name) : null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg mx-4 bg-zinc-900 rounded-xl flex flex-col overflow-hidden border border-zinc-800 shadow-2xl shadow-black/60 max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center">
                  <Plug className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">
                    Add Custom MCP Server
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Step {step} of 3
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2 px-6 py-4 border-b border-zinc-800/50">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                      s === step
                        ? 'bg-blue-600 text-white'
                        : s < step
                        ? 'bg-green-600 text-white'
                        : 'bg-zinc-800 text-zinc-500'
                    )}
                  >
                    {s < step ? <Check className="w-4 h-4" /> : s}
                  </div>
                  {s < 3 && (
                    <div
                      className={cn(
                        'w-12 h-0.5 mx-1',
                        s < step ? 'bg-green-600' : 'bg-zinc-800'
                      )}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 min-h-0">
              {/* Error Alert */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Step 1: Basic Info */}
              {step === 1 && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-300">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <p className="text-xs text-zinc-500">
                      Unique identifier (kebab-case)
                    </p>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase())}
                      placeholder="my-mcp-server"
                      className={cn(
                        'w-full px-3 py-2 bg-zinc-800 border rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm',
                        nameError ? 'border-red-500' : 'border-zinc-700'
                      )}
                    />
                    {nameError && (
                      <p className="text-xs text-red-400">{nameError}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-300">
                      Display Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="My MCP Server"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-300">
                      Description <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What does this MCP server do?"
                      rows={3}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                    />
                  </div>
                </>
              )}

              {/* Step 2: Transport */}
              {step === 2 && (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-300">
                      Transport Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setTransportType('stdio')}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors',
                          transportType === 'stdio'
                            ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                            : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                        )}
                      >
                        <Server className="w-6 h-6" />
                        <span className="text-sm font-medium">Stdio</span>
                        <span className="text-xs text-zinc-500">Local process</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTransportType('http')}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors',
                          transportType === 'http'
                            ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                            : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                        )}
                      >
                        <Globe className="w-6 h-6" />
                        <span className="text-sm font-medium">HTTP/SSE</span>
                        <span className="text-xs text-zinc-500">Remote server</span>
                      </button>
                    </div>
                  </div>

                  {transportType === 'stdio' ? (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-zinc-300">
                          Command <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                          placeholder="npx"
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-zinc-300">
                          Arguments
                        </label>
                        <input
                          type="text"
                          value={args}
                          onChange={(e) => setArgs(e.target.value)}
                          placeholder="-y @modelcontextprotocol/server-fetch"
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                        />
                        <p className="text-xs text-zinc-500">
                          Space-separated. Use {'${VAR}'} for environment variables.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-zinc-300">
                        Server URL <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://mcp-server.example.com/sse"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Step 3: Authentication */}
              {step === 3 && (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-300">
                      Authentication
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthType('none');
                          setSecrets([]);
                        }}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors',
                          authType === 'none'
                            ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                            : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                        )}
                      >
                        <Check className="w-6 h-6" />
                        <span className="text-sm font-medium">None</span>
                        <span className="text-xs text-zinc-500">No auth needed</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthType('env')}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors',
                          authType === 'env'
                            ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                            : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                        )}
                      >
                        <Key className="w-6 h-6" />
                        <span className="text-sm font-medium">API Keys</span>
                        <span className="text-xs text-zinc-500">Environment vars</span>
                      </button>
                    </div>
                  </div>

                  {authType === 'env' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-zinc-300">
                          Required Secrets
                        </label>
                        <button
                          type="button"
                          onClick={addSecret}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      </div>

                      {secrets.length === 0 ? (
                        <div className="text-center py-6 text-zinc-500 text-sm border border-dashed border-zinc-700 rounded-xl">
                          No secrets defined. Click "Add" to add one.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {secrets.map((secret, index) => (
                            <div
                              key={index}
                              className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-2"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={secret.key}
                                  onChange={(e) =>
                                    updateSecret(index, {
                                      key: e.target.value
                                        .toUpperCase()
                                        .replace(/[^A-Z0-9_]/g, '_'),
                                    })
                                  }
                                  placeholder="API_KEY"
                                  className="flex-1 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 text-sm font-mono placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeSecret(index)}
                                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={secret.description}
                                onChange={(e) =>
                                  updateSecret(index, { description: e.target.value })
                                }
                                placeholder="Description of this secret"
                                className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <label className="flex items-center gap-2 text-xs text-zinc-400">
                                <input
                                  type="checkbox"
                                  checked={secret.required}
                                  onChange={(e) =>
                                    updateSecret(index, { required: e.target.checked })
                                  }
                                  className="rounded border-zinc-600"
                                />
                                Required
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800">
              <button
                onClick={step > 1 ? goBack : handleClose}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {step > 1 ? 'Back' : 'Cancel'}
              </button>

              {step < 3 ? (
                <button
                  onClick={goNext}
                  disabled={!canGoNext()}
                  className={cn(
                    'flex items-center gap-1 px-4 py-2 rounded-lg font-medium transition-colors',
                    canGoNext()
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  )}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !isStep3Valid()}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                    isStep3Valid() && !isCreating
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  )}
                >
                  {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isCreating ? 'Creating...' : 'Create Connector'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
