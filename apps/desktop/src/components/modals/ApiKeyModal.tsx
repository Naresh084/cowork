import React, { useState, useEffect } from 'react';
import { KeyRound, AlertCircle, Loader2, X } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { cn } from '../../lib/utils';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage?: string | null;
}

export function ApiKeyModal({ isOpen, onClose, errorMessage }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(errorMessage || null);
  const { setApiKey: saveApiKey, validateApiKey } = useAuthStore();

  useEffect(() => {
    if (errorMessage) setError(errorMessage);
  }, [errorMessage]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setApiKey('');
      setIsValidating(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || isValidating) return;

    setError(null);
    setIsValidating(true);

    try {
      const isValid = await validateApiKey(apiKey);
      if (!isValid) {
        setError('Invalid API key. Please check and try again.');
        setIsValidating(false);
        return;
      }

      await saveApiKey(apiKey);
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md p-6 rounded-2xl bg-[#1A1A1E] border border-white/10 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-orange-500/20">
            <KeyRound className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-white">Update API Key</h2>
            <p className="text-sm text-white/50">
              Your API key may be invalid or expired
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="api-key"
              className="block text-sm font-medium text-white/70 mb-2"
            >
              API Key
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
                'transition-colors'
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
              'transition-all duration-200'
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

        {/* Help text */}
        <p className="mt-4 text-xs text-white/40 text-center">
          Get your API key from{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300 underline"
          >
            Google AI Studio
          </a>
        </p>
      </div>
    </div>
  );
}
