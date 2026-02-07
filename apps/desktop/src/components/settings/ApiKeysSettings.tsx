import { useMemo, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Key, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BASE_URL_EDITABLE_PROVIDERS,
  PROVIDERS,
  useAuthStore,
  type ProviderId,
} from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { toast } from '@/components/ui/Toast';

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

const EXTERNAL_SEARCH_PROVIDERS: ProviderId[] = ['openrouter', 'deepseek', 'lmstudio'];

function maskKey(value: string | null): string {
  if (!value) return 'Not configured';
  if (value.length <= 10) return '•'.repeat(value.length);
  return `${value.slice(0, 6)}${'•'.repeat(Math.max(6, value.length - 10))}${value.slice(-4)}`;
}

interface KeyCardProps {
  title: string;
  description: string;
  value: string | null;
  placeholder: string;
  isSaving: boolean;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
}

function KeyCard({ title, description, value, placeholder, isSaving, onSave, onClear }: KeyCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [draft, setDraft] = useState('');

  const displayValue = useMemo(
    () => (showValue ? value || 'Not configured' : maskKey(value)),
    [showValue, value],
  );

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    try {
      await onSave(trimmed);
      setIsEditing(false);
      setDraft('');
      toast.success(`${title} saved`);
    } catch (error) {
      toast.error(`Failed to save ${title}`, error instanceof Error ? error.message : String(error));
    }
  };

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${title} copied`);
    } catch (error) {
      toast.error(`Failed to copy ${title}`, error instanceof Error ? error.message : String(error));
    }
  };

  const handleClear = async () => {
    try {
      await onClear();
      setIsEditing(false);
      setDraft('');
      toast.success(`${title} removed`);
    } catch (error) {
      toast.error(`Failed to remove ${title}`, error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
      <div>
        <h4 className="text-sm font-medium text-white/90">{title}</h4>
        <p className="mt-1 text-xs text-white/45">{description}</p>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <input
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#0B0C10] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#1D4ED8]/50',
              'font-mono',
            )}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draft.trim()}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                isSaving || !draft.trim()
                  ? 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                  : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
              )}
            >
              <Check className="w-4 h-4" />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setDraft('');
              }}
              className="px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="px-3 py-2 rounded-lg bg-[#0B0C10] border border-white/[0.08] text-xs text-white/65 font-mono break-all">
            {displayValue}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowValue((current) => !current)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.1] transition-colors"
            >
              {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showValue ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setDraft('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.1] transition-colors"
            >
              <Key className="w-4 h-4" />
              {value ? 'Update' : 'Set key'}
            </button>
            {value ? (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.1] transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            ) : null}
            {value ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={isSaving}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  isSaving
                    ? 'bg-[#FF5449]/10 text-[#FF5449]/40 cursor-not-allowed'
                    : 'bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20',
                )}
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function ApiKeysSettings() {
  const {
    activeProvider,
    providerApiKeys,
    providerBaseUrls,
    googleApiKey,
    openaiApiKey,
    exaApiKey,
    tavilyApiKey,
    stitchApiKey,
    isLoading,
    setProviderApiKey,
    clearProviderApiKey,
    setGoogleApiKey,
    clearGoogleApiKey,
    setOpenAIApiKey,
    clearOpenAIApiKey,
    setExaApiKey,
    clearExaApiKey,
    setTavilyApiKey,
    clearTavilyApiKey,
    setStitchApiKey,
    clearStitchApiKey,
    validateProviderConnection,
    applyRuntimeConfig,
  } = useAuthStore();
  const {
    setActiveProvider: setProviderInSettings,
    setProviderBaseUrl,
    fetchProviderModels,
    mediaRouting,
    specializedModelsV2,
    externalSearchProvider,
    setExternalSearchProvider,
  } =
    useSettingsStore();

  const activeProviderKey = providerApiKeys[activeProvider] || null;
  const providerBaseUrl = providerBaseUrls[activeProvider] || '';
  const baseUrlEditable = BASE_URL_EDITABLE_PROVIDERS.includes(activeProvider);
  const showExternalSearchSettings = EXTERNAL_SEARCH_PROVIDERS.includes(activeProvider);

  const [baseUrlDraft, setBaseUrlDraft] = useState(providerBaseUrl);

  const handleProviderSwitch = async (provider: ProviderId) => {
    await setProviderInSettings(provider);
    setBaseUrlDraft(useAuthStore.getState().providerBaseUrls[provider] || '');
  };

  const handleProviderKeySave = async (value: string) => {
    const isValid = await validateProviderConnection(activeProvider, value, providerBaseUrls[activeProvider]);
    if (!isValid) {
      throw new Error(`Failed to validate ${PROVIDER_LABELS[activeProvider]} connection`);
    }
    await setProviderApiKey(activeProvider, value);
    await fetchProviderModels(activeProvider);
    await applyRuntimeConfig({
      activeProvider,
      providerBaseUrls: providerBaseUrls,
      externalSearchProvider,
      mediaRouting,
      specializedModels: specializedModelsV2,
    });
  };

  const handleBaseUrlSave = async () => {
    await setProviderBaseUrl(activeProvider, baseUrlDraft);
    await fetchProviderModels(activeProvider);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-white/90">Provider & API Credentials</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure a primary provider key, plus optional Google/OpenAI keys for media/research routing.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
        <label className="text-xs text-white/55 uppercase tracking-wide">Active provider</label>
        <select
          value={activeProvider}
          onChange={(event) => void handleProviderSwitch(event.target.value as ProviderId)}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 focus:outline-none focus:border-[#1D4ED8]/50"
        >
          {PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {PROVIDER_LABELS[provider]}
            </option>
          ))}
        </select>
      </div>

      <KeyCard
        title={`${PROVIDER_LABELS[activeProvider]} Provider Key`}
        description="Used for chat, tool calls, and provider-native capabilities."
        value={activeProviderKey}
        placeholder={`Enter ${PROVIDER_LABELS[activeProvider]} API key`}
        isSaving={isLoading}
        onSave={handleProviderKeySave}
        onClear={async () => {
          await clearProviderApiKey(activeProvider);
          await applyRuntimeConfig({
            activeProvider,
            providerBaseUrls,
            externalSearchProvider,
            mediaRouting,
            specializedModels: specializedModelsV2,
          });
        }}
      />

      {baseUrlEditable ? (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
          <div>
            <h4 className="text-sm font-medium text-white/90">Provider Base URL</h4>
            <p className="mt-1 text-xs text-white/45">
              Override API base URL for compatible endpoints.
            </p>
          </div>
          <input
            type="text"
            value={baseUrlDraft}
            onChange={(event) => setBaseUrlDraft(event.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 focus:outline-none focus:border-[#1D4ED8]/50"
          />
          <button
            type="button"
            onClick={() => void handleBaseUrlSave()}
            className="px-3 py-2 rounded-lg text-sm bg-[#1D4ED8] text-white hover:bg-[#3B82F6] transition-colors"
          >
            Save Base URL
          </button>
        </div>
      ) : null}

      <KeyCard
        title="Google API Key"
        description="Used for Google image/video generation, deep research, and computer use."
        value={googleApiKey}
        placeholder="Enter Google API key"
        isSaving={isLoading}
        onSave={async (value) => {
          await setGoogleApiKey(value);
          await applyRuntimeConfig({
            mediaRouting,
            specializedModels: specializedModelsV2,
            externalSearchProvider,
          });
        }}
        onClear={async () => {
          await clearGoogleApiKey();
          await applyRuntimeConfig({
            mediaRouting,
            specializedModels: specializedModelsV2,
            externalSearchProvider,
          });
        }}
      />

      <KeyCard
        title="OpenAI API Key"
        description="Used for OpenAI image/video generation backend when selected."
        value={openaiApiKey}
        placeholder="Enter OpenAI API key"
        isSaving={isLoading}
        onSave={async (value) => {
          await setOpenAIApiKey(value);
          await applyRuntimeConfig({
            mediaRouting,
            specializedModels: specializedModelsV2,
            externalSearchProvider,
          });
        }}
        onClear={async () => {
          await clearOpenAIApiKey();
          await applyRuntimeConfig({
            mediaRouting,
            specializedModels: specializedModelsV2,
            externalSearchProvider,
          });
        }}
      />

      {showExternalSearchSettings ? (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
          <div>
            <h4 className="text-sm font-medium text-white/90">External Web Search Fallback</h4>
            <p className="mt-1 text-xs text-white/45">
              Used for providers without native search support (OpenRouter, DeepSeek, LM Studio).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/55 uppercase tracking-wide">Fallback provider</label>
            <select
              value={externalSearchProvider}
              onChange={(event) => void setExternalSearchProvider(event.target.value as 'google' | 'exa' | 'tavily')}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 focus:outline-none focus:border-[#1D4ED8]/50"
            >
              <option value="google">Google</option>
              <option value="exa">Exa</option>
              <option value="tavily">Tavily</option>
            </select>
          </div>

          {externalSearchProvider === 'exa' ? (
            <KeyCard
              title="Exa API Key"
              description="Used by web_search fallback when Exa is selected."
              value={exaApiKey}
              placeholder="Enter Exa API key"
              isSaving={isLoading}
              onSave={async (value) => {
                await setExaApiKey(value);
                await applyRuntimeConfig({
                  exaApiKey: value,
                  externalSearchProvider,
                  mediaRouting,
                  specializedModels: specializedModelsV2,
                });
              }}
              onClear={async () => {
                await clearExaApiKey();
                await applyRuntimeConfig({
                  exaApiKey: null,
                  externalSearchProvider,
                  mediaRouting,
                  specializedModels: specializedModelsV2,
                });
              }}
            />
          ) : null}

          {externalSearchProvider === 'tavily' ? (
            <KeyCard
              title="Tavily API Key"
              description="Used by web_search fallback when Tavily is selected."
              value={tavilyApiKey}
              placeholder="Enter Tavily API key"
              isSaving={isLoading}
              onSave={async (value) => {
                await setTavilyApiKey(value);
                await applyRuntimeConfig({
                  tavilyApiKey: value,
                  externalSearchProvider,
                  mediaRouting,
                  specializedModels: specializedModelsV2,
                });
              }}
              onClear={async () => {
                await clearTavilyApiKey();
                await applyRuntimeConfig({
                  tavilyApiKey: null,
                  externalSearchProvider,
                  mediaRouting,
                  specializedModels: specializedModelsV2,
                });
              }}
            />
          ) : null}
        </div>
      ) : null}

      <KeyCard
        title="Stitch MCP API Key"
        description="Used only for Stitch MCP servers/tools."
        value={stitchApiKey}
        placeholder="Enter Stitch MCP API key"
        isSaving={isLoading}
        onSave={setStitchApiKey}
        onClear={clearStitchApiKey}
      />

      <div className="p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
        <p className="text-xs text-[#93C5FD]">
          Runtime changes apply immediately when possible. If provider/base URL/model changes affect existing sessions,
          start a new session to pick up the new runtime client safely.
        </p>
      </div>
    </div>
  );
}
