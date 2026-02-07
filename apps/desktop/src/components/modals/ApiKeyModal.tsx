import React, { useState, useEffect } from 'react';
import { KeyRound, AlertCircle, Loader2, X } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { resolveActiveSoul, useSettingsStore } from '../../stores/settings-store';
import { cn } from '../../lib/utils';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  moonshot: 'Moonshot (Kimi)',
  glm: 'GLM',
  deepseek: 'DeepSeek',
  lmstudio: 'LM Studio',
};

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage?: string | null;
}

export function ApiKeyModal({ isOpen, onClose, errorMessage }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(errorMessage || null);
  const { activeProvider, setProviderApiKey, validateProviderConnection, applyRuntimeConfig } = useAuthStore();

  useEffect(() => {
    if (errorMessage) setError(errorMessage);
  }, [errorMessage]);

  useEffect(() => {
    if (isOpen) {
      setApiKey('');
      setIsValidating(false);
    }
  }, [isOpen]);

  const providerLabel = PROVIDER_LABELS[activeProvider] || activeProvider;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || isValidating) return;

    setError(null);
    setIsValidating(true);

    try {
      const isValid = await validateProviderConnection(activeProvider, apiKey.trim());
      if (!isValid) {
        setError(`Invalid ${providerLabel} API key. Please check and try again.`);
        setIsValidating(false);
        return;
      }

      await setProviderApiKey(activeProvider, apiKey.trim());
      const settingsState = useSettingsStore.getState();
      const activeSoul = resolveActiveSoul(
        settingsState.souls,
        settingsState.activeSoulId,
        settingsState.defaultSoulId,
      );
      await applyRuntimeConfig({
        activeProvider: settingsState.activeProvider,
        providerBaseUrls: settingsState.providerBaseUrls,
        externalSearchProvider: settingsState.externalSearchProvider,
        mediaRouting: settingsState.mediaRouting,
        specializedModels: settingsState.specializedModelsV2,
        sandbox: settingsState.commandSandbox,
        activeSoul,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setIsValidating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md p-6 rounded-2xl bg-[#1A1A1E] border border-white/10 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-orange-500/20">
            <KeyRound className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-white">Update Provider API Key</h2>
            <p className="text-sm text-white/50">{providerLabel} credentials may be invalid or expired</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="api-key" className="block text-sm font-medium text-white/70 mb-2">
              {providerLabel} API Key
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              autoFocus
              className={cn(
                'w-full px-4 py-3 rounded-xl',
                'bg-white/5 border border-white/10',
                'text-white placeholder:text-white/30',
                'focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20',
                'transition-colors',
              )}
            />
          </div>

          <button
            type="submit"
            disabled={!apiKey.trim() || isValidating}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
              'bg-gradient-to-r from-orange-500 to-amber-500',
              'text-white font-medium',
              'hover:from-orange-600 hover:to-amber-600',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all duration-200',
            )}
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validating...
              </>
            ) : (
              'Save API Key'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
