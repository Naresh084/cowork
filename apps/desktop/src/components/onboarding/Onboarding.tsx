import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROVIDERS, useAuthStore, type ProviderId } from '@/stores/auth-store';
import { resolveActiveSoul, useSettingsStore } from '@/stores/settings-store';
import { BrandMark } from '../icons/BrandMark';

const onboardingHero = new URL('../../assets/onboarding/image_2.png', import.meta.url).href;

const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  moonshot: 'Moonshot (Kimi)',
  glm: 'GLM',
  deepseek: 'DeepSeek',
  lmstudio: 'LM Studio',
};

export function Onboarding() {
  const { activeProvider, providerApiKeys, setProviderApiKey, applyRuntimeConfig } = useAuthStore();
  const { userName: existingUserName, setActiveProvider: setProviderInSettings, updateSetting } =
    useSettingsStore();

  const [userName, setUserName] = useState(existingUserName || '');
  const [provider, setProvider] = useState<ProviderId>(activeProvider || 'google');
  const [providerKey, setProviderKey] = useState(providerApiKeys[activeProvider] || '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleProviderChange = (nextProvider: ProviderId) => {
    setProvider(nextProvider);
    setProviderKey(providerApiKeys[nextProvider] || '');
  };

  const handleComplete = async () => {
    if (isSaving) return;

    const trimmedName = userName.trim();
    const trimmedProviderKey = providerKey.trim();

    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }

    if (provider !== 'lmstudio' && !trimmedProviderKey) {
      setError('Please enter your provider API key.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await setProviderInSettings(provider);

      if (trimmedProviderKey) {
        await setProviderApiKey(provider, trimmedProviderKey);
      }

      updateSetting('uxProfile', 'simple');
      updateSetting('userName', trimmedName);

      const settingsState = useSettingsStore.getState();
      await applyRuntimeConfig({
        activeProvider: settingsState.activeProvider,
        providerBaseUrls: settingsState.providerBaseUrls,
        externalSearchProvider: settingsState.externalSearchProvider,
        mediaRouting: settingsState.mediaRouting,
        sandbox: settingsState.commandSandbox,
        specializedModels: settingsState.specializedModelsV2,
        activeSoul: resolveActiveSoul(
          settingsState.souls,
          settingsState.activeSoulId,
          settingsState.defaultSoulId,
        ),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save setup.');
    } finally {
      setIsSaving(false);
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

          <div className="relative z-10 flex h-full flex-col justify-between p-8 xl:p-12">
            <div className="inline-flex w-fit items-center gap-3">
              <BrandMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-wide text-white/90">Cowork</span>
            </div>

            <div className="max-w-xl space-y-6">
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold leading-tight text-white xl:text-[2.8rem]">
                  Simple setup. Start using Cowork quickly.
                </h1>
                <p className="max-w-lg text-sm leading-relaxed text-white/75 xl:text-base">
                  Add your name, pick a provider, enter your API key, and continue.
                </p>
              </div>
            </div>
          </div>
        </motion.aside>

        <section className="relative flex h-full items-start justify-center overflow-hidden px-4 py-4 sm:px-8 sm:py-6 lg:px-12 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex h-full min-h-0 w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#080F22]/72 p-4 shadow-[0_20px_70px_rgba(3,8,24,0.55)] backdrop-blur-xl sm:p-5"
          >
            <div>
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">Welcome to Cowork</h2>
              <p className="text-sm leading-relaxed text-white/65">
                Complete this one-time setup to continue.
              </p>
            </div>

            <div className="mt-6 flex min-h-0 flex-1 flex-col">
              <div className="space-y-4 overflow-y-auto pr-1">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/75">Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-white/35" />
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full rounded-xl border bg-[#0A1021]/80 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-white/35 border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/75">Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
                    className="app-select w-full rounded-xl border bg-[#0A1021]/80 py-3.5 text-sm text-white border-white/10 focus:border-[#3B82F6] focus:ring-2 focus:ring-[#1D4ED8]/35"
                  >
                    {PROVIDERS.map((id) => (
                      <option key={id} value={id}>
                        {PROVIDER_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/75">
                    API Key{provider === 'lmstudio' ? ' (optional)' : ''}
                  </label>
                  <input
                    type="password"
                    value={providerKey}
                    onChange={(e) => setProviderKey(e.target.value)}
                    placeholder={
                      provider === 'lmstudio'
                        ? 'Optional for local LM Studio servers'
                        : `Enter ${PROVIDER_LABELS[provider]} API key`
                    }
                    className="w-full rounded-xl border bg-[#0A1021]/80 py-3.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                  />
                </div>

                {error ? (
                  <div className="rounded-xl border border-[#FF5449]/30 bg-[#FF5449]/10 px-3.5 py-3 text-sm text-[#FF9A93]">
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex items-center justify-end border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => void handleComplete()}
                  disabled={isSaving}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white',
                    'bg-gradient-to-r from-[#1E3A8A] via-[#1D4ED8] to-[#3B82F6]',
                    'disabled:cursor-not-allowed disabled:opacity-55',
                  )}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Continue'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
