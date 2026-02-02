import React, { useState } from 'react';
import { KeyRound, ArrowRight, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';

export function Onboarding() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const { setApiKey: saveApiKey, validateApiKey } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || isValidating) return;

    setError(null);
    setIsValidating(true);

    try {
      // Validate API key format first
      if (!apiKey.startsWith('AI') || apiKey.length < 30) {
        setError('Invalid API key format. Key should start with "AI" and be at least 30 characters.');
        setIsValidating(false);
        return;
      }

      // Validate with the Gemini API
      const isValid = await validateApiKey(apiKey).catch(() => false);
      if (!isValid) {
        setError('Invalid API key. Please check your key and try again.');
        setIsValidating(false);
        return;
      }

      // Only save if validation succeeded
      await saveApiKey(apiKey);

      // Fetch available models from Google API
      const { fetchModels } = useSettingsStore.getState();
      fetchModels(apiKey).catch(console.error); // Non-blocking, don't wait
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to save: ${message}`);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to Gemini Cowork
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Enter your Gemini API key to get started
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className={cn(
                'w-full px-4 py-3 rounded-xl',
                'bg-gray-50 dark:bg-gray-900',
                'border border-gray-200 dark:border-gray-800',
                'text-gray-900 dark:text-white placeholder:text-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500',
                'transition-all duration-200',
                error && 'border-red-500 focus:ring-red-500/50 focus:border-red-500'
              )}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!apiKey.trim() || isValidating}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
              'bg-primary-500 hover:bg-primary-600 text-white',
              'font-medium',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'shadow-sm hover:shadow-md'
            )}
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Help Link */}
        <div className="mt-6 text-center">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 transition-colors"
          >
            Get your API key from Google AI Studio
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Note */}
        <div className="mt-8 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Your API key is stored securely in your system's keychain and never
            sent anywhere except to Google's API.
          </p>
        </div>
      </div>
    </div>
  );
}
