import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  KeyRound,
  ArrowRight,
  Loader2,
  ExternalLink,
  AlertCircle,
  User,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { BrandMark } from '../icons/BrandMark';

const onboardingHero = new URL('../../assets/onboarding/image_2.png', import.meta.url).href;

export function Onboarding() {
  const [userName, setUserName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const { setApiKey: saveApiKey, validateApiKey, isAuthenticated } = useAuthStore();
  const { updateSetting, userName: existingUserName } = useSettingsStore();

  const needsOnlyName = isAuthenticated && !existingUserName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isValidating) return;

    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (needsOnlyName) {
      updateSetting('userName', userName.trim());
      return;
    }

    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    setError(null);
    setIsValidating(true);

    try {
      if (!apiKey.startsWith('AI') || apiKey.length < 30) {
        setError('Invalid API key format. Should start with "AI" and be at least 30 characters.');
        setIsValidating(false);
        return;
      }

      const isValid = await validateApiKey(apiKey).catch(() => false);
      if (!isValid) {
        setError('Invalid API key. Please check and try again.');
        setIsValidating(false);
        return;
      }

      updateSetting('userName', userName.trim());
      await saveApiKey(apiKey);

      const { fetchModels } = useSettingsStore.getState();
      fetchModels(apiKey).catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#060A15] text-white">
      <div className="grid h-full lg:grid-cols-[1.12fr_0.88fr]">
        <motion.aside
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative hidden overflow-hidden lg:block"
        >
          <img
            src={onboardingHero}
            alt="Cowork onboarding visual"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#060A15]/55 via-[#060A15]/25 to-[#060A15]/70" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(147,197,253,0.25),transparent_45%),radial-gradient(circle_at_70%_80%,rgba(29,78,216,0.2),transparent_40%)]" />

          <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
            <div className="inline-flex items-center gap-3 w-fit">
              <BrandMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-wide text-white/90">Cowork</span>
            </div>

            <div className="max-w-xl space-y-8">
              <div className="space-y-4">
                <p className="inline-flex items-center gap-2 rounded-full border border-[#93C5FD]/35 bg-[#1D4ED8]/20 px-3 py-1 text-xs font-medium uppercase tracking-wider text-[#DBEAFE]">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Desktop Assistant
                </p>
                <h1 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
                  Build, automate, and ship faster in one workspace.
                </h1>
                <p className="max-w-lg text-sm leading-relaxed text-white/75 xl:text-base">
                  Cowork keeps your coding flow uninterrupted with tooling, memory, and execution in a single
                  desktop environment.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
                  <CheckCircle2 className="mb-2 h-4 w-4 text-[#93C5FD]" />
                  <p className="text-sm text-white/85">Context-aware coding assistance</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
                  <CheckCircle2 className="mb-2 h-4 w-4 text-[#93C5FD]" />
                  <p className="text-sm text-white/85">Local-first workflow and storage</p>
                </div>
              </div>
            </div>
          </div>
        </motion.aside>

        <section className="relative flex h-full items-center justify-center px-6 py-8 sm:px-10 lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.16),transparent_45%),radial-gradient(circle_at_20%_80%,rgba(79,70,229,0.12),transparent_40%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:30px_30px] opacity-35" />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-xl"
          >
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <BrandMark className="h-8 w-8" />
              <span className="text-lg font-semibold text-white/95">Cowork</span>
            </div>

            <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm lg:hidden">
              <img
                src={onboardingHero}
                alt="Cowork visual"
                className="h-40 w-full rounded-xl object-cover"
              />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-semibold text-white">Welcome to Cowork</h2>
              <p className="text-sm leading-relaxed text-white/65">
                {needsOnlyName
                  ? "Let's personalize your workspace."
                  : 'Set up your profile and connect your API key to get started.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/75">Your Name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-white/35" />
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter your name"
                    className={cn(
                      'w-full rounded-xl border bg-[#0A1021]/80 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-white/35',
                      'border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35',
                      'transition-colors duration-200',
                      error && !userName.trim() && 'border-[#FF5449] focus:border-[#FF5449] focus:ring-[#FF5449]/35'
                    )}
                  />
                </div>
              </div>

              {!needsOnlyName && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/75">API Key</label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-white/35" />
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="AI..."
                      className={cn(
                        'w-full rounded-xl border bg-[#0A1021]/80 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-white/35',
                        'border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35',
                        'transition-colors duration-200',
                        error && !apiKey.trim() && 'border-[#FF5449] focus:border-[#FF5449] focus:ring-[#FF5449]/35'
                      )}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-[#FF5449]/30 bg-[#FF5449]/10 px-3.5 py-3 text-sm text-[#FF9A93]">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isValidating}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white',
                  'bg-gradient-to-r from-[#1E3A8A] via-[#1D4ED8] to-[#3B82F6]',
                  'shadow-lg shadow-[#1D4ED8]/30 transition-all duration-200',
                  'hover:translate-y-[-1px] hover:shadow-xl hover:shadow-[#1D4ED8]/40',
                  'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0'
                )}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    Get Started
                    <ArrowRight className="h-4.5 w-4.5" />
                  </>
                )}
              </button>

              {!needsOnlyName && (
                <div className="pt-1 text-center">
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[#93C5FD] transition-colors hover:text-[#DBEAFE]"
                  >
                    Get your API key from Google AI Studio
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </form>

            <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#93C5FD]" />
              <p className="text-xs leading-relaxed text-white/55">
                {needsOnlyName
                  ? 'Your name is saved locally to personalize your workspace.'
                  : 'Your API key and secrets are stored locally with restrictive file permissions and are only used for API requests.'}
              </p>
            </div>

          </motion.div>

          <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
            <p className="text-xs tracking-wide text-white/25">{`Cowork v${__APP_VERSION__}`}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
