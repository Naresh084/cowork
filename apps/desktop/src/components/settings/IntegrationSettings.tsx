import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Loader2, Save, Undo2, Search, Monitor, Info } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { useAuthStore } from '../../stores/auth-store';
import { resolveActiveSoul, useSettingsStore } from '../../stores/settings-store';
import { toast } from '@/components/ui/Toast';
import { WhatsAppSettings } from './WhatsAppSettings';
import { SlackSettings } from './SlackSettings';
import { TelegramSettings } from './TelegramSettings';
import { DiscordSettings } from './DiscordSettings';
import { IMessageSettings } from './IMessageSettings';
import { TeamsSettings } from './TeamsSettings';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';
import { CapabilityMatrix } from '@/components/help/CapabilityMatrix';
import { useCapabilityStore } from '@/stores/capability-store';

function KeyField({
  title,
  description,
  value,
  placeholder,
  onSave,
  onClear,
  isLoading,
  settingId,
}: {
  title: string;
  description: string;
  value: string | null;
  placeholder: string;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
  isLoading: boolean;
  settingId: string;
}) {
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-white/90">{title}</h4>
          <SettingHelpPopover settingId={settingId} />
        </div>
        <p className="mt-1 text-xs text-white/45">{description}</p>
      </div>
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full px-3 py-2 rounded-lg text-sm',
          'bg-[#0B0C10] border border-white/[0.08]',
          'text-white/90 placeholder:text-white/30',
          'focus:outline-none focus:border-[#1D4ED8]/50',
          'font-mono',
        )}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isLoading || !draft.trim()}
          onClick={() => void onSave(draft.trim())}
          className={cn(
            'px-3 py-2 rounded-lg text-sm transition-colors',
            isLoading || !draft.trim()
              ? 'bg-white/[0.06] text-white/30 cursor-not-allowed'
              : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
          )}
        >
          Save Key
        </button>
        <button
          type="button"
          disabled={isLoading || !value}
          onClick={() => void onClear()}
          className={cn(
            'px-3 py-2 rounded-lg text-sm transition-colors',
            isLoading || !value
              ? 'bg-white/[0.06] text-white/30 cursor-not-allowed'
              : 'bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20',
          )}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function IntegrationSettings() {
  const integrationSettings = useIntegrationStore((s) => s.integrationSettings);
  const isLoading = useIntegrationStore((s) => s.isIntegrationSettingsLoading);
  const isSaving = useIntegrationStore((s) => s.isIntegrationSettingsSaving);
  const settingsError = useIntegrationStore((s) => s.integrationSettingsError);
  const loadIntegrationSettings = useIntegrationStore((s) => s.loadIntegrationSettings);
  const saveIntegrationSettings = useIntegrationStore((s) => s.saveIntegrationSettings);

  const {
    exaApiKey,
    tavilyApiKey,
    stitchApiKey,
    isLoading: authLoading,
    setExaApiKey,
    clearExaApiKey,
    setTavilyApiKey,
    clearTavilyApiKey,
    setStitchApiKey,
    clearStitchApiKey,
    applyRuntimeConfig,
  } = useAuthStore();
  const {
    activeProvider,
    externalSearchProvider,
    setExternalSearchProvider,
    specializedModelsV2,
    updateSpecializedModelV2,
  } = useSettingsStore();
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);

  const [draftWorkingDirectory, setDraftWorkingDirectory] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [userHome, setUserHome] = useState<string | null>(null);
  const [computerUseModel, setComputerUseModel] = useState(specializedModelsV2.google.computerUse);
  const [deepResearchModel, setDeepResearchModel] = useState(specializedModelsV2.google.deepResearchAgent);

  useEffect(() => {
    void loadIntegrationSettings();
    void homeDir()
      .then((path) => setUserHome(path))
      .catch(() => setUserHome(null));
  }, [loadIntegrationSettings]);

  useEffect(() => {
    setDraftWorkingDirectory(integrationSettings.sharedSessionWorkingDirectory);
  }, [integrationSettings.sharedSessionWorkingDirectory]);

  useEffect(() => {
    setComputerUseModel(specializedModelsV2.google.computerUse);
    setDeepResearchModel(specializedModelsV2.google.deepResearchAgent);
  }, [specializedModelsV2.google.computerUse, specializedModelsV2.google.deepResearchAgent]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const isDirty = useMemo(
    () =>
      draftWorkingDirectory.trim() !==
      integrationSettings.sharedSessionWorkingDirectory.trim(),
    [draftWorkingDirectory, integrationSettings.sharedSessionWorkingDirectory],
  );

  const hasAiModelChanges = useMemo(
    () =>
      computerUseModel.trim() !== specializedModelsV2.google.computerUse ||
      deepResearchModel.trim() !== specializedModelsV2.google.deepResearchAgent,
    [computerUseModel, deepResearchModel, specializedModelsV2.google.computerUse, specializedModelsV2.google.deepResearchAgent],
  );

  const applyRuntime = async () => {
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
  };

  const needsExternalSearchFallback = ['openrouter', 'deepseek', 'lmstudio'].includes(activeProvider);

  const handlePickFolder = async () => {
    setLocalError(null);
    setNotice(null);

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath:
          draftWorkingDirectory.trim() || userHome || undefined,
        title: 'Select shared session working directory',
      });

      if (selected && typeof selected === 'string') {
        setDraftWorkingDirectory(selected);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSave = async () => {
    setLocalError(null);
    setNotice(null);
    try {
      await saveIntegrationSettings({
        sharedSessionWorkingDirectory: draftWorkingDirectory.trim(),
      });
      setNotice('Integration settings saved.');
      await refreshCapabilitySnapshot();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleResetToCurrent = () => {
    setLocalError(null);
    setNotice(null);
    setDraftWorkingDirectory(integrationSettings.sharedSessionWorkingDirectory);
  };

  return (
    <div className="space-y-4" data-tour-id="settings-integrations-section">
      <div>
        <h3 className="text-sm font-medium text-white/90">Integration & Capability Settings</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure web-search fallbacks, computer-use/deep-research models, Stitch key, and messaging integrations
          (WhatsApp, Slack, Telegram, Discord, iMessage, Teams).
        </p>
      </div>

      <CapabilityMatrix compact />

      {needsExternalSearchFallback ? (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-white/85">Web Search Fallback</h4>
              <SettingHelpPopover settingId="integration.externalSearchProvider" />
            </div>
            <p className="mt-1 text-xs text-white/40">
              Active provider <code>{activeProvider}</code> uses fallback search. Choose Google, Exa, or Tavily.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/55 uppercase tracking-wide">Fallback provider</label>
            <select
              value={externalSearchProvider}
              onChange={(event) => {
                void (async () => {
                  await setExternalSearchProvider(event.target.value as 'google' | 'exa' | 'tavily');
                  await refreshCapabilitySnapshot();
                })();
              }}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 focus:outline-none focus:border-[#1D4ED8]/50"
            >
              <option value="google">Google</option>
              <option value="exa">Exa</option>
              <option value="tavily">Tavily</option>
            </select>
            <p className="text-[11px] text-white/35">
              Selecting Exa or Tavily requires the corresponding API key below.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-xs text-white/45">
            Active provider <code>{activeProvider}</code> supports native web search. External fallback settings are
            hidden.
          </p>
        </div>
      )}

      {needsExternalSearchFallback && externalSearchProvider === 'exa' ? (
        <KeyField
          title="Exa API Key"
          description="Enables Exa-based `web_search` fallback when native provider search is unavailable."
          value={exaApiKey}
          placeholder="Enter Exa API key"
          onSave={async (value) => {
            await setExaApiKey(value);
            await applyRuntime();
            toast.success('Exa key saved');
            await refreshCapabilitySnapshot();
          }}
          onClear={async () => {
            await clearExaApiKey();
            await applyRuntime();
            toast.success('Exa key removed');
            await refreshCapabilitySnapshot();
          }}
          isLoading={authLoading}
          settingId="integration.exaApiKey"
        />
      ) : null}

      {needsExternalSearchFallback && externalSearchProvider === 'tavily' ? (
        <KeyField
          title="Tavily API Key"
          description="Enables Tavily-based `web_search` fallback when native provider search is unavailable."
          value={tavilyApiKey}
          placeholder="Enter Tavily API key"
          onSave={async (value) => {
            await setTavilyApiKey(value);
            await applyRuntime();
            toast.success('Tavily key saved');
            await refreshCapabilitySnapshot();
          }}
          onClear={async () => {
            await clearTavilyApiKey();
            await applyRuntime();
            toast.success('Tavily key removed');
            await refreshCapabilitySnapshot();
          }}
          isLoading={authLoading}
          settingId="integration.tavilyApiKey"
        />
      ) : null}

      <KeyField
        title="Stitch MCP API Key"
        description="Controls availability of Stitch MCP tools. If missing, Stitch tools are not registered."
        value={stitchApiKey}
        placeholder="Enter Stitch MCP API key"
        onSave={async (value) => {
          await setStitchApiKey(value);
          toast.success('Stitch key saved');
          await refreshCapabilitySnapshot();
        }}
        onClear={async () => {
          await clearStitchApiKey();
          toast.success('Stitch key removed');
          await refreshCapabilitySnapshot();
        }}
        isLoading={authLoading}
        settingId="integration.stitchApiKey"
      />

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div>
          <h4 className="text-sm font-medium text-white/85">Google Specialized Models</h4>
          <p className="mt-1 text-xs text-white/40">
            These model IDs are used by `computer_use` and `deep_research` tools.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Computer Use Model</label>
            <SettingHelpPopover settingId="integration.computerUseModel" />
          </div>
          <div className="relative">
            <Monitor className="w-4 h-4 text-white/35 absolute left-3 top-2.5" />
            <input
              type="text"
              value={computerUseModel}
              onChange={(e) => setComputerUseModel(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50 font-mono"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Deep Research Model</label>
            <SettingHelpPopover settingId="integration.deepResearchModel" />
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-white/35 absolute left-3 top-2.5" />
            <input
              type="text"
              value={deepResearchModel}
              onChange={(e) => setDeepResearchModel(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            disabled={!hasAiModelChanges}
            onClick={async () => {
              try {
                if (computerUseModel.trim() !== specializedModelsV2.google.computerUse) {
                  await updateSpecializedModelV2('google', 'computerUse', computerUseModel.trim());
                }
                if (deepResearchModel.trim() !== specializedModelsV2.google.deepResearchAgent) {
                  await updateSpecializedModelV2('google', 'deepResearchAgent', deepResearchModel.trim());
                }
                await applyRuntime();
                toast.success('Specialized model settings updated');
                await refreshCapabilitySnapshot();
              } catch (error) {
                toast.error(
                  'Failed to save specialized model settings',
                  error instanceof Error ? error.message : String(error),
                );
              }
            }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm transition-colors',
              hasAiModelChanges
                ? 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]'
                : 'bg-white/[0.06] text-white/30 cursor-not-allowed',
            )}
          >
            Save Model Overrides
          </button>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-white/85">Shared Integration Session Defaults</h4>
            <SettingHelpPopover settingId="integration.sharedSessionWorkingDirectory" />
          </div>
          <p className="mt-1 text-xs text-white/40">
            New shared integration sessions (all messaging platforms) will use this working directory.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-white/50">
            Working Directory
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={draftWorkingDirectory}
              onChange={(e) => setDraftWorkingDirectory(e.target.value)}
              placeholder={userHome || '/path/to/project'}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm',
                'bg-[#0B0C10] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:border-[#1D4ED8]/50',
              )}
            />
            <button
              type="button"
              onClick={handlePickFolder}
              className="px-3 py-2 rounded-lg bg-white/[0.06] text-white/75 hover:bg-white/[0.1] transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-white/35">
            Leave empty to use the app process directory fallback.
          </p>
        </div>

        {(localError || settingsError) && (
          <p className="text-xs text-[#FF5449]">{localError || settingsError}</p>
        )}
        {notice && <p className="text-xs text-[#86EFAC]">{notice}</p>}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleResetToCurrent}
            disabled={!isDirty || isSaving || isLoading}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              !isDirty || isSaving || isLoading
                ? 'bg-white/[0.04] text-white/30 cursor-not-allowed'
                : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.1]',
            )}
          >
            <Undo2 className="w-4 h-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving || isLoading}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors',
              !isDirty || isSaving || isLoading
                ? 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
            )}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
        <Info className="w-4 h-4 text-[#93C5FD] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#93C5FD]">
          Capability key/model changes apply to future tool calls. If provider/base URL/chat model changed in the
          active session, start a new session to guarantee full runtime consistency.
        </p>
      </div>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">WhatsApp Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            WhatsApp supports QR-based connection, sender allowlist policy, and denial messaging for unauthorized users.
          </p>
          <WhatsAppSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Slack Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Slack requires both bot token and app token. Connected Slack enables shared-session ingress and notifications.
          </p>
          <SlackSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Telegram Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Telegram uses a BotFather token for connection. Once connected, inbound messages can create shared sessions.
          </p>
          <TelegramSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Discord Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Discord uses a bot token with optional guild/channel allowlists. Connected Discord supports inbound shared
            sessions and outbound notifications.
          </p>
          <DiscordSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">iMessage Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            iMessage uses a BlueBubbles bridge and is supported on macOS hosts only.
          </p>
          <IMessageSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Microsoft Teams Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Teams integration uses Azure Graph app credentials to power inbound channel monitoring and outbound
            notifications.
          </p>
          <TeamsSettings />
        </div>
      </details>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="text-sm font-medium text-white/85">Connectors Ecosystem</h4>
        <p className="mt-1 text-xs text-white/45">
          Connectors add MCP-powered tools for external systems. Configure and connect them from the sidebar
          Connectors manager. Tool availability appears in the capability matrix above.
        </p>
      </div>
    </div>
  );
}
