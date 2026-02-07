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
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';
import { useCapabilityStore } from '@/stores/capability-store';

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
    isLoading,
    setProviderApiKey,
    clearProviderApiKey,
    validateProviderConnection,
    applyRuntimeConfig,
  } = useAuthStore();
  const { setActiveProvider: setProviderInSettings, setProviderBaseUrl, fetchProviderModels } = useSettingsStore();
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);

  const activeProviderKey = providerApiKeys[activeProvider] || null;
  const providerBaseUrl = providerBaseUrls[activeProvider] || '';
  const baseUrlEditable = BASE_URL_EDITABLE_PROVIDERS.includes(activeProvider);

  const [baseUrlDraft, setBaseUrlDraft] = useState(providerBaseUrl);

  const handleProviderSwitch = async (provider: ProviderId) => {
    await setProviderInSettings(provider);
    setBaseUrlDraft(useAuthStore.getState().providerBaseUrls[provider] || '');
    await refreshCapabilitySnapshot();
  };

  const handleProviderKeySave = async (value: string) => {
    const isValid = await validateProviderConnection(activeProvider, value, providerBaseUrls[activeProvider]);
    if (!isValid) {
      throw new Error(`Failed to validate ${PROVIDER_LABELS[activeProvider]} connection`);
    }
    await setProviderApiKey(activeProvider, value);
    await fetchProviderModels(activeProvider);
    const settingsState = useSettingsStore.getState();
    await applyRuntimeConfig({
      activeProvider,
      providerBaseUrls: settingsState.providerBaseUrls,
      externalSearchProvider: settingsState.externalSearchProvider,
      mediaRouting: settingsState.mediaRouting,
      specializedModels: settingsState.specializedModelsV2,
    });
    await refreshCapabilitySnapshot();
  };

  const handleBaseUrlSave = async () => {
    await setProviderBaseUrl(activeProvider, baseUrlDraft);
    await fetchProviderModels(activeProvider);
    await refreshCapabilitySnapshot();
  };

  return (
    <div className="space-y-4" data-tour-id="settings-provider-section">
      <div>
        <h3 className="text-sm font-medium text-white/90">Provider Settings</h3>
        <p className="mt-1 text-xs text-white/40">
          Choose your active chat provider and configure provider-specific credentials and base URL.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-white/55 uppercase tracking-wide">Active provider</label>
          <SettingHelpPopover settingId="provider.activeProvider" />
        </div>
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
        <p className="text-[11px] text-white/45">Used by tools: chat, web_search, web_fetch, computer_use</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-white/45">Key controls provider authentication for all provider-backed tools.</p>
          <SettingHelpPopover settingId="provider.apiKey" />
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
            const settingsState = useSettingsStore.getState();
          await applyRuntimeConfig({
            activeProvider,
            providerBaseUrls: settingsState.providerBaseUrls,
            externalSearchProvider: settingsState.externalSearchProvider,
            mediaRouting: settingsState.mediaRouting,
            specializedModels: settingsState.specializedModelsV2,
          });
          await refreshCapabilitySnapshot();
        }}
      />
        <p className="text-[11px] text-white/45">Used by tools: chat, web_search, google_grounded_search, computer_use</p>
      </div>

      {baseUrlEditable ? (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-white/90">Provider Base URL</h4>
              <SettingHelpPopover settingId="provider.baseUrl" />
            </div>
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
          <p className="text-[11px] text-white/45">Used by tools: chat, provider-native web tools, computer_use</p>
        </div>
      ) : null}

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-white/90">Chat Model Selection</h4>
          <SettingHelpPopover settingId="provider.chatModel" />
        </div>
        <p className="text-xs text-white/45">
          Choose the default model from the chat input model selector. Model changes are applied to new sessions.
        </p>
        <p className="text-[11px] text-white/45">Used by tools: chat, planning, provider-native reasoning tools</p>
      </div>

      <div className="p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
        <p className="text-xs text-[#93C5FD]">
          Provider key changes usually apply immediately. Provider/base URL/model changes can require a new chat
          session to fully switch active runtime clients.
        </p>
      </div>
    </div>
  );
}
