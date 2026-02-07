import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, AlertCircle, User, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BASE_URL_EDITABLE_PROVIDERS,
  PROVIDERS,
  useAuthStore,
  type ProviderId,
} from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
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
  const {
    activeProvider,
    providerApiKeys,
    providerBaseUrls,
    googleApiKey,
    openaiApiKey,
    falApiKey,
    exaApiKey,
    tavilyApiKey,
    stitchApiKey,
    setProviderApiKey,
    setGoogleApiKey,
    setOpenAIApiKey,
    setFalApiKey,
    setExaApiKey,
    setTavilyApiKey,
    setStitchApiKey,
    validateProviderConnection,
    applyRuntimeConfig,
    isAuthenticated,
  } = useAuthStore();
  const {
    userName: existingUserName,
    availableModelsByProvider,
    selectedModelByProvider,
    mediaRouting,
    specializedModelsV2,
    updateSetting,
    setActiveProvider: setProviderInSettings,
    setSelectedModelForProvider,
    addCustomModelForProvider,
    fetchProviderModels,
    setProviderBaseUrl,
    setMediaRouting,
    setExternalSearchProvider,
    updateSpecializedModelV2,
    providerBaseUrls: settingsBaseUrls,
    externalSearchProvider,
  } = useSettingsStore();

  const [userName, setUserName] = useState(existingUserName || '');
  const [provider, setProvider] = useState<ProviderId>(activeProvider || 'google');
  const [providerKey, setProviderKey] = useState(providerApiKeys[provider] || '');
  const [baseUrl, setBaseUrl] = useState(providerBaseUrls[provider] || settingsBaseUrls[provider] || '');
  const [selectedModel, setSelectedModel] = useState(selectedModelByProvider[provider] || '');
  const [customModel, setCustomModel] = useState('');
  const [googleKeyDraft, setGoogleKeyDraft] = useState(googleApiKey || '');
  const [openaiKeyDraft, setOpenAIKeyDraft] = useState(openaiApiKey || '');
  const [falKeyDraft, setFalKeyDraft] = useState(falApiKey || '');
  const [exaKeyDraft, setExaKeyDraft] = useState(exaApiKey || '');
  const [tavilyKeyDraft, setTavilyKeyDraft] = useState(tavilyApiKey || '');
  const [stitchKeyDraft, setStitchKeyDraft] = useState(stitchApiKey || '');
  const [externalSearchDraft, setExternalSearchDraft] = useState(externalSearchProvider);
  const [imageBackend, setImageBackend] = useState(mediaRouting.imageBackend);
  const [videoBackend, setVideoBackend] = useState(mediaRouting.videoBackend);
  const [googleImageModel, setGoogleImageModel] = useState(specializedModelsV2.google.imageGeneration);
  const [googleVideoModel, setGoogleVideoModel] = useState(specializedModelsV2.google.videoGeneration);
  const [openaiImageModel, setOpenAIImageModel] = useState(specializedModelsV2.openai.imageGeneration);
  const [openaiVideoModel, setOpenAIVideoModel] = useState(specializedModelsV2.openai.videoGeneration);
  const [falImageModel, setFalImageModel] = useState(specializedModelsV2.fal.imageGeneration);
  const [falVideoModel, setFalVideoModel] = useState(specializedModelsV2.fal.videoGeneration);
  const [computerUseModel, setComputerUseModel] = useState(specializedModelsV2.google.computerUse);
  const [deepResearchModel, setDeepResearchModel] = useState(specializedModelsV2.google.deepResearchAgent);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const modelsForProvider = useMemo(
    () => availableModelsByProvider[provider] || [],
    [availableModelsByProvider, provider],
  );

  useEffect(() => {
    setProviderKey(providerApiKeys[provider] || '');
    setBaseUrl(providerBaseUrls[provider] || settingsBaseUrls[provider] || '');
    setSelectedModel(selectedModelByProvider[provider] || '');
  }, [provider, providerApiKeys, providerBaseUrls, settingsBaseUrls, selectedModelByProvider]);

  useEffect(() => {
    if (!providerApiKeys[provider] && provider !== 'lmstudio') return;
    void fetchProviderModels(provider);
  }, [provider, providerApiKeys, fetchProviderModels]);

  const baseUrlEditable = BASE_URL_EDITABLE_PROVIDERS.includes(provider);
  const needsOnlyName = isAuthenticated && !existingUserName;

  const handleProviderChange = async (nextProvider: ProviderId) => {
    setProvider(nextProvider);
    if (nextProvider === 'openai' && imageBackend === 'google' && videoBackend === 'google') {
      setImageBackend('openai');
      setVideoBackend('openai');
    }
    if (nextProvider !== 'openai' && imageBackend === 'openai' && videoBackend === 'openai') {
      setImageBackend('google');
      setVideoBackend('google');
    }
    await setProviderInSettings(nextProvider);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (needsOnlyName) {
      updateSetting('userName', userName.trim());
      return;
    }

    if (provider !== 'lmstudio' && !providerKey.trim()) {
      setError('Please enter your provider API key');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await setProviderInSettings(provider);

      if (baseUrlEditable && baseUrl.trim()) {
        await setProviderBaseUrl(provider, baseUrl.trim());
      }

      const valid = await validateProviderConnection(
        provider,
        providerKey.trim(),
        baseUrlEditable ? baseUrl.trim() : undefined,
      );
      if (!valid) {
        setError(`Unable to validate ${PROVIDER_LABELS[provider]} API key`);
        setIsSaving(false);
        return;
      }

      if (providerKey.trim()) {
        await setProviderApiKey(provider, providerKey.trim());
      }
      await fetchProviderModels(provider);

      const modelToSave = customModel.trim() || selectedModel.trim();
      if (!modelToSave) {
        setError('Select a model or enter a custom model ID');
        setIsSaving(false);
        return;
      }
      if (customModel.trim()) {
        addCustomModelForProvider(provider, customModel.trim());
      }
      setSelectedModelForProvider(provider, modelToSave);

      if (googleKeyDraft.trim()) {
        await setGoogleApiKey(googleKeyDraft.trim());
      }
      if (openaiKeyDraft.trim()) {
        await setOpenAIApiKey(openaiKeyDraft.trim());
      }
      if (falKeyDraft.trim()) {
        await setFalApiKey(falKeyDraft.trim());
      }
      if (exaKeyDraft.trim()) {
        await setExaApiKey(exaKeyDraft.trim());
      }
      if (tavilyKeyDraft.trim()) {
        await setTavilyApiKey(tavilyKeyDraft.trim());
      }
      if (stitchKeyDraft.trim()) {
        await setStitchApiKey(stitchKeyDraft.trim());
      }

      await setMediaRouting({
        imageBackend,
        videoBackend,
      });
      await setExternalSearchProvider(externalSearchDraft);

      if (googleImageModel.trim()) {
        await updateSpecializedModelV2('google', 'imageGeneration', googleImageModel.trim());
      }
      if (googleVideoModel.trim()) {
        await updateSpecializedModelV2('google', 'videoGeneration', googleVideoModel.trim());
      }
      if (openaiImageModel.trim()) {
        await updateSpecializedModelV2('openai', 'imageGeneration', openaiImageModel.trim());
      }
      if (openaiVideoModel.trim()) {
        await updateSpecializedModelV2('openai', 'videoGeneration', openaiVideoModel.trim());
      }
      if (falImageModel.trim()) {
        await updateSpecializedModelV2('fal', 'imageGeneration', falImageModel.trim());
      }
      if (falVideoModel.trim()) {
        await updateSpecializedModelV2('fal', 'videoGeneration', falVideoModel.trim());
      }
      if (computerUseModel.trim()) {
        await updateSpecializedModelV2('google', 'computerUse', computerUseModel.trim());
      }
      if (deepResearchModel.trim()) {
        await updateSpecializedModelV2('google', 'deepResearchAgent', deepResearchModel.trim());
      }

      await applyRuntimeConfig({
        activeProvider: provider,
        providerBaseUrls: useSettingsStore.getState().providerBaseUrls,
        externalSearchProvider: useSettingsStore.getState().externalSearchProvider,
        mediaRouting: useSettingsStore.getState().mediaRouting,
        specializedModels: useSettingsStore.getState().specializedModelsV2,
      });

      updateSetting('userName', userName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save onboarding settings');
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
          <img src={onboardingHero} alt="Cowork onboarding visual" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#060A15]/55 via-[#060A15]/25 to-[#060A15]/70" />

          <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
            <div className="inline-flex items-center gap-3 w-fit">
              <BrandMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-wide text-white/90">Cowork</span>
            </div>

            <div className="max-w-xl space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
                  Configure your provider stack in one pass.
                </h1>
                <p className="max-w-lg text-sm leading-relaxed text-white/75 xl:text-base">
                  Choose a chat provider, validate credentials, pick a model, and set media backend routing.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
                  <CheckCircle2 className="mb-2 h-4 w-4 text-[#93C5FD]" />
                  <p className="text-sm text-white/85">Provider-native search routing</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
                  <CheckCircle2 className="mb-2 h-4 w-4 text-[#93C5FD]" />
                  <p className="text-sm text-white/85">Google/OpenAI media backend toggles</p>
                </div>
              </div>
            </div>
          </div>
        </motion.aside>

        <section className="relative flex h-full items-center justify-center px-6 py-8 sm:px-10 lg:px-14 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-xl py-6"
          >
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold text-white">Welcome to Cowork</h2>
              <p className="text-sm leading-relaxed text-white/65">
                {needsOnlyName ? "Let's personalize your workspace." : 'Finish provider-aware onboarding to start chatting.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/75">Your Name</label>
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

              {!needsOnlyName ? (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">Provider</label>
                    <select
                      value={provider}
                      onChange={(e) => void handleProviderChange(e.target.value as ProviderId)}
                      className="w-full rounded-xl border bg-[#0A1021]/80 py-3.5 px-4 text-sm text-white border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
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
                      Provider API Key{provider === 'lmstudio' ? ' (optional)' : ''}
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

                  {baseUrlEditable ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-white/75">Base URL (optional)</label>
                      <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">Chat Model</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full rounded-xl border bg-[#0A1021]/80 py-3.5 px-4 text-sm text-white border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                    >
                      <option value="">Select model</option>
                      {modelsForProvider.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name || model.id}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="Or enter custom model ID"
                      className="mt-2 w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-white/75">Image backend</label>
                      <select
                        value={imageBackend}
                        onChange={(e) => setImageBackend(e.target.value as 'google' | 'openai' | 'fal')}
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white border-white/10"
                      >
                        <option value="google">Google</option>
                        <option value="openai">OpenAI</option>
                        <option value="fal">Fal</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-white/75">Video backend</label>
                      <select
                        value={videoBackend}
                        onChange={(e) => setVideoBackend(e.target.value as 'google' | 'openai' | 'fal')}
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white border-white/10"
                      >
                        <option value="google">Google</option>
                        <option value="openai">OpenAI</option>
                        <option value="fal">Fal</option>
                      </select>
                    </div>
                  </div>

                  <details className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <summary className="cursor-pointer text-sm text-white/80">
                      Optional media setup (keys + models)
                    </summary>
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-white/45">
                        If skipped, default media settings are used and can be changed later in Settings.
                      </p>
                      <input
                        type="password"
                        value={googleKeyDraft}
                        onChange={(e) => setGoogleKeyDraft(e.target.value)}
                        placeholder="Google media API key (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
                      />
                      <input
                        type="password"
                        value={openaiKeyDraft}
                        onChange={(e) => setOpenAIKeyDraft(e.target.value)}
                        placeholder="OpenAI media API key (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
                      />
                      <input
                        type="password"
                        value={falKeyDraft}
                        onChange={(e) => setFalKeyDraft(e.target.value)}
                        placeholder="Fal media API key (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
                      />
                      <input
                        type="text"
                        value={googleImageModel}
                        onChange={(e) => setGoogleImageModel(e.target.value)}
                        placeholder="Google image model (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
                      />
                      <input
                        type="text"
                        value={googleVideoModel}
                        onChange={(e) => setGoogleVideoModel(e.target.value)}
                        placeholder="Google video model (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
                      />
                      <input
                        type="text"
                        value={openaiImageModel}
                        onChange={(e) => setOpenAIImageModel(e.target.value)}
                        placeholder="OpenAI image model (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
                      />
                      <input
                        type="text"
                        value={openaiVideoModel}
                        onChange={(e) => setOpenAIVideoModel(e.target.value)}
                        placeholder="OpenAI video model (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
                      />
                      <input
                        type="text"
                        value={falImageModel}
                        onChange={(e) => setFalImageModel(e.target.value)}
                        placeholder="Fal image model (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
                      />
                      <input
                        type="text"
                        value={falVideoModel}
                        onChange={(e) => setFalVideoModel(e.target.value)}
                        placeholder="Fal video model (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
                      />
                    </div>
                  </details>

                  <details className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <summary className="cursor-pointer text-sm text-white/80">
                      Optional capability setup (search, research, integrations)
                    </summary>
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-white/45">
                        Optional settings for web-search fallback, Stitch tools, and Google research/computer models.
                      </p>
                      <select
                        value={externalSearchDraft}
                        onChange={(e) => setExternalSearchDraft(e.target.value as 'google' | 'exa' | 'tavily')}
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white border-white/10"
                      >
                        <option value="google">Fallback search: Google</option>
                        <option value="exa">Fallback search: Exa</option>
                        <option value="tavily">Fallback search: Tavily</option>
                      </select>
                      <input
                        type="password"
                        value={exaKeyDraft}
                        onChange={(e) => setExaKeyDraft(e.target.value)}
                        placeholder="Exa API key (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
                      />
                      <input
                        type="password"
                        value={tavilyKeyDraft}
                        onChange={(e) => setTavilyKeyDraft(e.target.value)}
                        placeholder="Tavily API key (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
                      />
                      <input
                        type="password"
                        value={stitchKeyDraft}
                        onChange={(e) => setStitchKeyDraft(e.target.value)}
                        placeholder="Stitch MCP API key (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
                      />
                      <input
                        type="text"
                        value={computerUseModel}
                        onChange={(e) => setComputerUseModel(e.target.value)}
                        placeholder="Google computer_use model (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
                      />
                      <input
                        type="text"
                        value={deepResearchModel}
                        onChange={(e) => setDeepResearchModel(e.target.value)}
                        placeholder="Google deep_research model (optional)"
                        className="w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
                      />
                    </div>
                  </details>
                </>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2 rounded-xl border border-[#FF5449]/30 bg-[#FF5449]/10 px-3.5 py-3 text-sm text-[#FF9A93]">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSaving}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white',
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
                  <>
                    Complete Setup
                    <ArrowRight className="h-4.5 w-4.5" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
