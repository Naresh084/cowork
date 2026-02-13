import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  CircleHelp,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BASE_URL_EDITABLE_PROVIDERS,
  PROVIDERS,
  useAuthStore,
  type ProviderId,
} from '@/stores/auth-store';
import { resolveActiveSoul, useSettingsStore, type ModelInfo } from '@/stores/settings-store';
import { useHelpStore } from '@/stores/help-store';
import { useCapabilityStore } from '@/stores/capability-store';
import { BrandMark } from '../icons/BrandMark';
import { HelpCenterModal } from '../help/HelpCenterModal';
import { GuidedTourOverlay } from '../help/GuidedTourOverlay';
import { CapabilityMatrix } from '../help/CapabilityMatrix';

const onboardingHero = new URL('../../assets/onboarding/image_2.png', import.meta.url).href;

type SetupMode = 'fast' | 'deep';
type HealthCheckStatus = 'pass' | 'warn' | 'fail';

interface EnvironmentHealthCheck {
  id: string;
  label: string;
  status: HealthCheckStatus;
  detail: string;
  blocking: boolean;
}

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

const FAST_STEPS = ['Welcome', 'Core Setup', 'Quick Start', 'Review'];
const DEEP_STEPS = ['Welcome', 'Core Setup', 'Media Setup', 'Integrations', 'Review'];
const DEFAULT_CHAT_MODEL_BY_PROVIDER: Partial<Record<ProviderId, string>> = {
  google: 'gemini-3-flash-preview',
  openai: 'gpt-5.2',
  anthropic: 'claude-opus-4-6',
  openrouter: 'openai/gpt-5.2',
  moonshot: 'kimi-k2-thinking',
  glm: 'glm-4.7',
  deepseek: 'deepseek-chat',
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
    defaultWorkingDirectory,
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
    commandSandbox,
    setCommandSandbox,
    providerBaseUrls: settingsBaseUrls,
    externalSearchProvider,
  } = useSettingsStore();
  const openHelp = useHelpStore((state) => state.openHelp);
  const startTour = useHelpStore((state) => state.startTour);
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);

  const [setupMode, setSetupMode] = useState<SetupMode>('deep');
  const [currentStep, setCurrentStep] = useState(0);
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
  const [sandboxMode, setSandboxMode] = useState(commandSandbox.mode);
  const [sandboxAllowNetwork, setSandboxAllowNetwork] = useState(commandSandbox.allowNetwork);
  const [environmentChecks, setEnvironmentChecks] = useState<EnvironmentHealthCheck[]>([]);
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDraftModels, setIsLoadingDraftModels] = useState(false);
  const [draftModelsByProvider, setDraftModelsByProvider] = useState<Partial<Record<ProviderId, ModelInfo[]>>>({});
  const needsOnlyName = isAuthenticated && !existingUserName;

  const getRecommendedChatModel = (providerId: ProviderId): string => {
    return DEFAULT_CHAT_MODEL_BY_PROVIDER[providerId] || '';
  };

  const modelsForProvider = useMemo(
    () => {
      const draftModels = draftModelsByProvider[provider];
      if (draftModels && draftModels.length > 0) {
        return draftModels;
      }
      return availableModelsByProvider[provider] || [];
    },
    [availableModelsByProvider, draftModelsByProvider, provider],
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

  useEffect(() => {
    if (needsOnlyName) {
      return;
    }

    const baseEditable = BASE_URL_EDITABLE_PROVIDERS.includes(provider);
    const trimmedProviderKey = providerKey.trim();
    if (provider !== 'lmstudio' && trimmedProviderKey.length < 12) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsLoadingDraftModels(true);
        try {
          const models = await invoke<Array<{
            id: string;
            name: string;
            description: string;
            input_token_limit: number;
            output_token_limit: number;
          }>>('fetch_provider_models', {
            providerId: provider,
            apiKey: provider === 'lmstudio' ? '' : trimmedProviderKey,
            baseUrl: baseEditable && baseUrl.trim() ? baseUrl.trim() : null,
          });

          if (cancelled) return;
          const mapped: ModelInfo[] = models.map((model) => ({
            id: model.id,
            name: model.name,
            description: model.description,
            inputTokenLimit: model.input_token_limit,
            outputTokenLimit: model.output_token_limit,
          }));
          setDraftModelsByProvider((prev) => ({ ...prev, [provider]: mapped }));
          if (!selectedModel.trim() && !customModel.trim() && mapped[0]?.id) {
            setSelectedModel(mapped[0].id);
          }
        } catch {
          if (!cancelled) {
            setDraftModelsByProvider((prev) => ({ ...prev, [provider]: [] }));
          }
        } finally {
          if (!cancelled) {
            setIsLoadingDraftModels(false);
          }
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    baseUrl,
    customModel,
    needsOnlyName,
    provider,
    providerKey,
    selectedModel,
  ]);

  useEffect(() => {
    const totalSteps = setupMode === 'deep' ? DEEP_STEPS.length : FAST_STEPS.length;
    if (currentStep > totalSteps - 1) {
      setCurrentStep(totalSteps - 1);
    }
  }, [setupMode, currentStep]);

  useEffect(() => {
    void refreshCapabilitySnapshot();
  }, [refreshCapabilitySnapshot]);

  const baseUrlEditable = BASE_URL_EDITABLE_PROVIDERS.includes(provider);
  const stepLabels = setupMode === 'deep' ? DEEP_STEPS : FAST_STEPS;
  const totalSteps = stepLabels.length;
  const isFinalStep = currentStep === totalSteps - 1;
  const resolveModelToUse = (): string => {
    const fromInput = customModel.trim() || selectedModel.trim();
    if (fromInput) return fromInput;
    if (modelsForProvider[0]?.id) return modelsForProvider[0].id;
    return getRecommendedChatModel(provider);
  };
  const hasBlockingEnvironmentIssues = environmentChecks.some(
    (check) => check.blocking && check.status === 'fail',
  );

  const applyRecommendedDefaults = () => {
    if (!selectedModel.trim() && !customModel.trim()) {
      const recommended = modelsForProvider[0]?.id || getRecommendedChatModel(provider);
      if (recommended) {
        setSelectedModel(recommended);
      }
    }

    if (provider === 'openai') {
      setImageBackend('openai');
      setVideoBackend('openai');
    } else {
      setImageBackend('google');
      setVideoBackend('google');
    }

    if (externalSearchDraft !== 'google') {
      setExternalSearchDraft('google');
    }

    setSandboxMode('workspace-write');
    setSandboxAllowNetwork(false);
    setError(null);
  };

  const runEnvironmentChecks = async (): Promise<EnvironmentHealthCheck[]> => {
    setIsRunningChecks(true);
    const checks: EnvironmentHealthCheck[] = [];
    const modelToUse = resolveModelToUse();

    let runtimeReady = false;
    try {
      const status = await invoke<{ initialized: boolean }>('agent_get_initialization_status');
      runtimeReady = status?.initialized === true;
    } catch {
      runtimeReady = false;
    }

    checks.push({
      id: 'runtime_backend',
      label: 'Runtime backend',
      status: runtimeReady ? 'pass' : 'fail',
      detail: runtimeReady
        ? 'Desktop runtime is ready.'
        : 'Runtime is still starting. Wait a moment and run checks again.',
      blocking: true,
    });

    const hasProviderCredentials =
      needsOnlyName || provider === 'lmstudio' || providerKey.trim().length > 0;
    checks.push({
      id: 'provider_credentials',
      label: 'Provider credentials',
      status: hasProviderCredentials ? 'pass' : 'fail',
      detail: hasProviderCredentials
        ? 'Provider credentials are configured for setup.'
        : `Missing ${PROVIDER_LABELS[provider]} API key.`,
      blocking: true,
    });

    const hasModelSelection = needsOnlyName || modelToUse.length > 0;
    checks.push({
      id: 'chat_model',
      label: 'Chat model selection',
      status: hasModelSelection ? 'pass' : 'fail',
      detail: hasModelSelection
        ? `Using model ${modelToUse || 'from existing settings'}.`
        : 'No chat model selected.',
      blocking: true,
    });

    const hasSearchKey =
      externalSearchDraft === 'google' ||
      (externalSearchDraft === 'exa' && exaKeyDraft.trim().length > 0) ||
      (externalSearchDraft === 'tavily' && tavilyKeyDraft.trim().length > 0);
    checks.push({
      id: 'search_fallback',
      label: 'Search fallback',
      status: hasSearchKey ? 'pass' : 'warn',
      detail: hasSearchKey
        ? `${externalSearchDraft} fallback is ready.`
        : `${externalSearchDraft} selected without API key. Switch to Google or add key.`,
      blocking: false,
    });

    const mediaDefaultsAligned =
      provider === 'openai'
        ? imageBackend === 'openai' && videoBackend === 'openai'
        : imageBackend === 'google' && videoBackend === 'google';
    checks.push({
      id: 'media_defaults',
      label: 'Media defaults',
      status: mediaDefaultsAligned ? 'pass' : 'warn',
      detail: mediaDefaultsAligned
        ? 'Media backends match recommended defaults.'
        : 'Media backends are customized from recommended defaults.',
      blocking: false,
    });

    const sandboxSafetyReady = sandboxMode !== 'danger-full-access' || !sandboxAllowNetwork;
    checks.push({
      id: 'sandbox_safety',
      label: 'Command safety defaults',
      status: sandboxSafetyReady ? 'pass' : 'warn',
      detail: sandboxSafetyReady
        ? 'Command sandbox is set to a safe default profile.'
        : 'Danger-full-access with network is enabled.',
      blocking: false,
    });

    checks.push({
      id: 'default_workspace',
      label: 'Default workspace',
      status: defaultWorkingDirectory.trim().length > 0 ? 'pass' : 'warn',
      detail:
        defaultWorkingDirectory.trim().length > 0
          ? `Default workspace set to ${defaultWorkingDirectory}.`
          : 'No default workspace path configured yet.',
      blocking: false,
    });

    setEnvironmentChecks(checks);
    setIsRunningChecks(false);
    return checks;
  };

  useEffect(() => {
    if (!isFinalStep) return;
    void runEnvironmentChecks();
  }, [isFinalStep]);

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

  const validateCoreStep = () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return false;
    }

    if (!needsOnlyName) {
      if (provider !== 'lmstudio' && !providerKey.trim()) {
        setError('Please enter your provider API key');
        return false;
      }

      const modelToSave = resolveModelToUse();
      if (provider === 'lmstudio' && !modelToSave) {
        setError('Enter a model ID for LM Studio or start your local server to load models.');
        return false;
      }
    }

    setError(null);
    return true;
  };

  const handleComplete = async () => {
    if (isSaving) return;
    if (!validateCoreStep()) return;

    const checks = await runEnvironmentChecks();
    if (checks.some((check) => check.blocking && check.status === 'fail')) {
      setError('Resolve blocking environment checks before completing setup.');
      return;
    }

    if (needsOnlyName) {
      updateSetting('uxProfile', setupMode === 'fast' ? 'simple' : 'pro');
      updateSetting('userName', userName.trim());
      return;
    }

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

      const modelToSave = resolveModelToUse();
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
      await setCommandSandbox({
        mode: sandboxMode,
        allowNetwork: sandboxAllowNetwork,
      });

      await applyRuntimeConfig({
        activeProvider: useSettingsStore.getState().activeProvider,
        providerBaseUrls: useSettingsStore.getState().providerBaseUrls,
        externalSearchProvider: useSettingsStore.getState().externalSearchProvider,
        mediaRouting: useSettingsStore.getState().mediaRouting,
        sandbox: useSettingsStore.getState().commandSandbox,
        specializedModels: useSettingsStore.getState().specializedModelsV2,
        activeSoul: resolveActiveSoul(
          useSettingsStore.getState().souls,
          useSettingsStore.getState().activeSoulId,
          useSettingsStore.getState().defaultSoulId,
        ),
      });

      await refreshCapabilitySnapshot();
      updateSetting('uxProfile', setupMode === 'fast' ? 'simple' : 'pro');
      updateSetting('userName', userName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save onboarding settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !validateCoreStep()) return;
    setError(null);
    setCurrentStep((step) => Math.min(step + 1, totalSteps - 1));
  };

  const handleSkip = () => {
    if (isFinalStep) return;
    setError(null);
    setCurrentStep((step) => Math.min(step + 1, totalSteps - 1));
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const renderStepContent = () => {
    if (currentStep === 0) {
      return (
        <div className="space-y-4" data-tour-id="onboarding-setup-mode">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white/90">How Cowork Works</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              Cowork runs locally with a desktop shell and sidecar runtime. Provider keys, routing, and tool policies
              decide which tools are available. Automations can be created from chat or scheduler surfaces and run
              manually or on schedule. You can replay this guide anytime from Help Center.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSetupMode('fast')}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                setupMode === 'fast'
                  ? 'border-[#1D4ED8]/60 bg-[#1D4ED8]/15'
                  : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]',
              )}
            >
              <p className="text-sm font-medium text-white/90">Fast Path</p>
              <p className="mt-1 text-xs text-white/50">Minimal required setup, then start chat and automations immediately.</p>
            </button>
            <button
              type="button"
              onClick={() => setSetupMode('deep')}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                setupMode === 'deep'
                  ? 'border-[#1D4ED8]/60 bg-[#1D4ED8]/15'
                  : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]',
              )}
            >
              <p className="text-sm font-medium text-white/90">Deep Dive</p>
              <p className="mt-1 text-xs text-white/50">Full guided setup with media, integrations, automation, and tools.</p>
            </button>
          </div>

          <div className="rounded-xl border border-[#1D4ED8]/25 bg-[#1D4ED8]/10 p-4">
            <p className="text-xs text-[#93C5FD]">
              Tour mode is always skippable and replayable. Use <span className="font-medium">Start Guided Tour</span>
              {' '}to spotlight each key section.
            </p>
          </div>
        </div>
      );
    }

    if (currentStep === 1) {
      return (
        <div className="space-y-4" data-tour-id="onboarding-provider-block">
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
                {modelsForProvider.length > 0 ? (
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="app-select w-full rounded-xl border bg-[#0A1021]/80 py-3.5 text-sm text-white border-white/10 focus:border-[#3B82F6] focus:ring-2 focus:ring-[#1D4ED8]/35"
                  >
                    <option value="">Select model</option>
                    {modelsForProvider.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name || model.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-[#0A1021]/80 px-4 py-3 text-xs text-white/60">
                    {isLoadingDraftModels ? (
                      'Loading models...'
                    ) : (
                      <>
                        Models are not loaded yet. Setup will use
                        <span className="ml-1 font-mono text-white/80">
                          {getRecommendedChatModel(provider) || 'your custom model'}
                        </span>
                        {' '}unless you enter a custom model below.
                      </>
                    )}
                  </div>
                )}
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="Optional: enter custom model ID"
                  className="mt-2 w-full rounded-xl border bg-[#0A1021]/80 py-3 px-4 text-sm text-white placeholder:text-white/35 border-white/10 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                />
              </div>
            </>
          ) : null}
        </div>
      );
    }

    if (setupMode === 'fast' && currentStep === 2) {
      return (
        <div className="space-y-4" data-tour-id="onboarding-capability-block">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white/90">Quick Start Capability Summary</h3>
            <p className="mt-1 text-xs text-white/55">
              You can launch immediately after completion. Media and integration details can be configured later in
              Settings without re-running onboarding. Automations can be created from chat or the scheduler surfaces
              as soon as setup completes.
            </p>
          </div>
          <CapabilityMatrix compact />
        </div>
      );
    }

    if (setupMode === 'deep' && currentStep === 2) {
      return (
        <div className="space-y-4" data-tour-id="onboarding-media-block">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/75">Image backend</label>
              <select
                value={imageBackend}
                onChange={(e) => setImageBackend(e.target.value as 'google' | 'openai' | 'fal')}
                className="app-select w-full rounded-xl border bg-[#0A1021]/80 py-3 text-sm text-white border-white/10"
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
                className="app-select w-full rounded-xl border bg-[#0A1021]/80 py-3 text-sm text-white border-white/10"
              >
                <option value="google">Google</option>
                <option value="openai">OpenAI</option>
                <option value="fal">Fal</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-white/55">Media keys</p>
            <input
              type="password"
              value={googleKeyDraft}
              onChange={(e) => setGoogleKeyDraft(e.target.value)}
              placeholder="Google media API key (optional)"
              className="w-full rounded-xl border bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
            />
            <input
              type="password"
              value={openaiKeyDraft}
              onChange={(e) => setOpenAIKeyDraft(e.target.value)}
              placeholder="OpenAI media API key (optional)"
              className="w-full rounded-xl border bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
            />
            <input
              type="password"
              value={falKeyDraft}
              onChange={(e) => setFalKeyDraft(e.target.value)}
              placeholder="Fal media API key (optional)"
              className="w-full rounded-xl border bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
            <input
              type="text"
              value={googleImageModel}
              onChange={(e) => setGoogleImageModel(e.target.value)}
              placeholder="Google image model"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-3 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
            />
            <input
              type="text"
              value={googleVideoModel}
              onChange={(e) => setGoogleVideoModel(e.target.value)}
              placeholder="Google video model"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-3 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
            />
            <input
              type="text"
              value={openaiImageModel}
              onChange={(e) => setOpenAIImageModel(e.target.value)}
              placeholder="OpenAI image model"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-3 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
            />
            <input
              type="text"
              value={openaiVideoModel}
              onChange={(e) => setOpenAIVideoModel(e.target.value)}
              placeholder="OpenAI video model"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-3 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
            />
            <input
              type="text"
              value={falImageModel}
              onChange={(e) => setFalImageModel(e.target.value)}
              placeholder="Fal image model"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-3 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
            />
            <input
              type="text"
              value={falVideoModel}
              onChange={(e) => setFalVideoModel(e.target.value)}
              placeholder="Fal video model"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-3 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
            />
          </div>
        </div>
      );
    }

    if (setupMode === 'deep' && currentStep === 3) {
      return (
        <div className="space-y-4" data-tour-id="onboarding-capability-block">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white/90">Search, Research, Integrations, and Automations</h3>
            <p className="mt-1 text-xs text-white/55">
              Configure fallback search, deep research/computer-use model overrides, messaging integrations, and
              connectors access context. These also affect scheduled automation runs.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <h3 className="text-sm font-medium text-white/90">Command Sandboxing (optional)</h3>
            <p className="text-xs text-white/55">
              Controls shell execution safety for tools like execute/Bash. You can change this later in Settings.
            </p>
            <select
              value={sandboxMode}
              onChange={(e) => setSandboxMode(e.target.value as typeof sandboxMode)}
              className="app-select w-full rounded-xl border bg-[#0A1021]/80 py-2.5 text-sm text-white border-white/10"
            >
              <option value="read-only">read-only</option>
              <option value="workspace-write">workspace-write</option>
              <option value="danger-full-access">danger-full-access</option>
            </select>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white/80">
              <span>Allow network access for shell commands</span>
              <input
                type="checkbox"
                checked={sandboxAllowNetwork}
                onChange={(e) => setSandboxAllowNetwork(e.target.checked)}
                className="accent-[#3B82F6]"
              />
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/75">Fallback Search Provider</label>
            <select
              value={externalSearchDraft}
              onChange={(e) => setExternalSearchDraft(e.target.value as 'google' | 'exa' | 'tavily')}
              className="app-select w-full rounded-xl border bg-[#0A1021]/80 py-3 text-sm text-white border-white/10"
            >
              <option value="google">Google</option>
              <option value="exa">Exa</option>
              <option value="tavily">Tavily</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="password"
              value={exaKeyDraft}
              onChange={(e) => setExaKeyDraft(e.target.value)}
              placeholder="Exa API key (optional)"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
            />
            <input
              type="password"
              value={tavilyKeyDraft}
              onChange={(e) => setTavilyKeyDraft(e.target.value)}
              placeholder="Tavily API key (optional)"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
            />
            <input
              type="password"
              value={stitchKeyDraft}
              onChange={(e) => setStitchKeyDraft(e.target.value)}
              placeholder="Stitch MCP API key (optional)"
              className="col-span-2 rounded-xl border bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10"
            />
            <input
              type="text"
              value={computerUseModel}
              onChange={(e) => setComputerUseModel(e.target.value)}
              placeholder="Google computer_use model"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
            />
            <input
              type="text"
              value={deepResearchModel}
              onChange={(e) => setDeepResearchModel(e.target.value)}
              placeholder="Google deep_research model"
              className="rounded-xl border bg-[#0A1021]/80 py-2.5 px-4 text-sm text-white placeholder:text-white/35 border-white/10 font-mono"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-medium text-white/85">Messaging + Connectors Overview</p>
            <p className="mt-1 text-xs text-white/55">
              WhatsApp, Slack, Telegram, Discord, iMessage (BlueBubbles), and Teams can create shared sessions once
              connected. Connectors expand MCP-based tools (GitHub, docs, APIs, and more) from the sidebar Connectors
              manager.
            </p>
            <p className="mt-2 text-xs text-white/45">
              Shared integration sessions use a default working directory set in Settings → Integrations.
            </p>
          </div>

          <details className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-white/85">
              Advanced capability matrix
            </summary>
            <p className="mt-1 text-xs text-white/50">
              Expand for a full policy and tool readiness checklist.
            </p>
            <div className="mt-3">
              <CapabilityMatrix compact />
            </div>
          </details>
        </div>
      );
    }

    return (
      <div className="space-y-4" data-tour-id="onboarding-review-block">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-medium text-white/90">Review Setup</h3>
          <div className="mt-2 space-y-1.5 text-xs text-white/60">
            <p>Name: <span className="text-white/85">{userName || 'Not set'}</span></p>
            <p>Provider: <span className="text-white/85">{PROVIDER_LABELS[provider]}</span></p>
            <p>Model: <span className="font-mono text-white/85">{resolveModelToUse() || 'Not set'}</span></p>
            <p>Image backend: <span className="text-white/85">{imageBackend}</span></p>
            <p>Video backend: <span className="text-white/85">{videoBackend}</span></p>
            <p>Search fallback: <span className="text-white/85">{externalSearchDraft}</span></p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-white/90">Environment Health Checks</h3>
            <button
              type="button"
              onClick={() => {
                void runEnvironmentChecks();
              }}
              disabled={isRunningChecks}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs transition-colors',
                isRunningChecks
                  ? 'cursor-not-allowed bg-white/[0.08] text-white/35'
                  : 'bg-white/[0.08] text-white/75 hover:bg-white/[0.12]',
              )}
            >
              {isRunningChecks ? 'Running checks...' : 'Run Checks'}
            </button>
          </div>

          {environmentChecks.length === 0 ? (
            <p className="text-xs text-white/50">
              Run checks to validate runtime readiness and safe defaults.
            </p>
          ) : (
            <div className="space-y-2">
              {environmentChecks.map((check) => (
                <div
                  key={check.id}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs',
                    check.status === 'pass'
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                      : check.status === 'warn'
                        ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                        : 'border-[#FF5449]/35 bg-[#FF5449]/10 text-[#FFB4AF]',
                  )}
                >
                  <p className="font-medium">{check.label}</p>
                  <p className="mt-0.5 opacity-90">{check.detail}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0A1021]/75 px-3 py-2">
            <p className="text-xs text-white/60">
              Apply recommended defaults for fast first success.
            </p>
            <button
              type="button"
              onClick={applyRecommendedDefaults}
              className="rounded-lg bg-[#1D4ED8]/30 px-3 py-1.5 text-xs text-[#BFDBFE] hover:bg-[#1D4ED8]/45"
            >
              Apply Defaults
            </button>
          </div>
        </div>

        <details className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-white/85">
            Advanced capability matrix
          </summary>
          <p className="mt-1 text-xs text-white/50">
            Expand for full capability and policy coverage before finalizing.
          </p>
          <div className="mt-3">
            <CapabilityMatrix compact />
          </div>
        </details>

        <div className="rounded-xl border border-[#1D4ED8]/20 bg-[#1D4ED8]/10 p-4">
          <p className="text-xs text-[#93C5FD]">
            Completion sets your profile name gate and starts the app. Next, use chat and automations to set up your
            first recurring task. You can replay onboarding and guided tours later from Help Center in Settings or
            Sidebar.
          </p>
        </div>
      </div>
    );
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

          <div className="relative z-10 flex h-full flex-col justify-between p-8 xl:p-12">
            <div className="inline-flex items-center gap-3 w-fit">
              <BrandMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-wide text-white/90">Cowork</span>
            </div>

            <div className="max-w-xl space-y-6">
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold leading-tight text-white xl:text-[2.8rem]">
                  Guided setup for provider, automation, tools, and integrations.
                </h1>
                <p className="max-w-lg text-sm leading-relaxed text-white/75 xl:text-base">
                  Choose Fast Path for quick start or Deep Dive for full capability education. Build and run
                  automations after setup. All tours are skippable and replayable.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
                  <CheckCircle2 className="mb-2 h-4 w-4 text-[#93C5FD]" />
                  <p className="text-sm text-white/85">Tool impact, key usage, and automation runtime explained</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
                  <CheckCircle2 className="mb-2 h-4 w-4 text-[#93C5FD]" />
                  <p className="text-sm text-white/85">Replay tours and revisit guidance anytime</p>
                </div>
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
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-white sm:text-3xl">Welcome to Cowork</h2>
                  <p className="text-sm leading-relaxed text-white/65">
                    {needsOnlyName
                      ? "Let's personalize your workspace and confirm your runtime setup."
                      : 'Complete setup to unlock tools and automations with full context.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openHelp('platform-overview')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/[0.05]"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                    Help
                  </button>
                  <button
                    type="button"
                    onClick={() => startTour('onboarding', true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/[0.05]"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Start Guided Tour</span>
                    <span className="sm:hidden">Tour</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-white/55">Step {currentStep + 1} of {totalSteps}</p>
                <p className="text-xs text-white/45">{stepLabels[currentStep]}</p>
              </div>
              <div className="flex items-center gap-1">
                {stepLabels.map((label, index) => (
                  <div key={label} className="flex-1">
                    <div
                      className={cn(
                        'h-1.5 rounded-full',
                        index <= currentStep ? 'bg-[#3B82F6]' : 'bg-white/[0.08]',
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="space-y-4 overflow-y-auto pr-1">
                {renderStepContent()}

                {error ? (
                  <div className="flex items-start gap-2 rounded-xl border border-[#FF5449]/30 bg-[#FF5449]/10 px-3.5 py-3 text-sm text-[#FF9A93]">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={currentStep === 0 || isSaving}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                      currentStep === 0 || isSaving
                        ? 'cursor-not-allowed bg-white/[0.04] text-white/30'
                        : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.1]',
                    )}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  {!isFinalStep && currentStep !== 1 ? (
                    <button
                      type="button"
                      onClick={handleSkip}
                      disabled={isSaving}
                      className="rounded-xl px-3 py-2 text-sm text-white/55 hover:bg-white/[0.06] hover:text-white/80"
                    >
                      Skip this step
                    </button>
                  ) : null}
                </div>

                {isFinalStep ? (
                  <button
                    type="button"
                    onClick={() => void handleComplete()}
                    disabled={isSaving || isRunningChecks || hasBlockingEnvironmentIssues}
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
                      <>
                        Complete Setup
                        <ArrowRight className="h-4.5 w-4.5" />
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3B82F6]"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </section>
      </div>

      <HelpCenterModal />
      <GuidedTourOverlay />
    </div>
  );
}
