import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Info, Monitor, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';
import { useAuthStore } from '../../stores/auth-store';
import { resolveActiveSoul, useSettingsStore } from '../../stores/settings-store';
import { useCapabilityStore } from '@/stores/capability-store';
import { BackgroundServiceSettings } from './BackgroundServiceSettings';

interface ExternalCliProviderAvailability {
  installed: boolean;
  binaryPath: string | null;
  version: string | null;
  authStatus: 'authenticated' | 'unauthenticated' | 'unknown';
  authMessage: string | null;
}

interface ExternalCliAvailabilitySnapshot {
  codex: ExternalCliProviderAvailability;
  claude: ExternalCliProviderAvailability;
}

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
    <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
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
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-lg border border-white/[0.08] bg-[#0B0C10] px-3 py-2 text-sm font-mono',
          'text-white/90 placeholder:text-white/30',
          'focus:border-[#1D4ED8]/50 focus:outline-none',
        )}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isLoading || !draft.trim()}
          onClick={() => void onSave(draft.trim())}
          className={cn(
            'rounded-lg px-3 py-2 text-sm transition-colors',
            isLoading || !draft.trim()
              ? 'cursor-not-allowed bg-white/[0.06] text-white/30'
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
            'rounded-lg px-3 py-2 text-sm transition-colors',
            isLoading || !value
              ? 'cursor-not-allowed bg-white/[0.06] text-white/30'
              : 'bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20',
          )}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function RuntimeSettings() {
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
    externalCli,
    updateExternalCliSettings,
  } = useSettingsStore();
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);
  const [computerUseModel, setComputerUseModel] = useState(specializedModelsV2.google.computerUse);
  const [deepResearchModel, setDeepResearchModel] = useState(
    specializedModelsV2.google.deepResearchAgent,
  );
  const [externalCliAvailability, setExternalCliAvailability] =
    useState<ExternalCliAvailabilitySnapshot | null>(null);

  useEffect(() => {
    void invoke<ExternalCliAvailabilitySnapshot>('agent_get_external_cli_availability', {
      forceRefresh: true,
    })
      .then((snapshot) => setExternalCliAvailability(snapshot))
      .catch(() => setExternalCliAvailability(null));
  }, []);

  useEffect(() => {
    setComputerUseModel(specializedModelsV2.google.computerUse);
    setDeepResearchModel(specializedModelsV2.google.deepResearchAgent);
  }, [
    specializedModelsV2.google.computerUse,
    specializedModelsV2.google.deepResearchAgent,
  ]);

  const hasAiModelChanges = useMemo(
    () =>
      computerUseModel.trim() !== specializedModelsV2.google.computerUse ||
      deepResearchModel.trim() !== specializedModelsV2.google.deepResearchAgent,
    [
      computerUseModel,
      deepResearchModel,
      specializedModelsV2.google.computerUse,
      specializedModelsV2.google.deepResearchAgent,
    ],
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
      externalCli: settingsState.externalCli,
      activeSoul,
    });
  };

  const needsExternalSearchFallback = ['openrouter', 'deepseek', 'lmstudio'].includes(
    activeProvider,
  );
  const codexAvailability = externalCliAvailability?.codex;
  const claudeAvailability = externalCliAvailability?.claude;

  return (
    <div className="space-y-4" data-tour-id="settings-runtime-section">
      <div>
        <h3 className="text-sm font-medium text-white/90">Runtime & Extension Controls</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure fallback search, extension keys, external CLI orchestration, and specialized
          runtime model IDs.
        </p>
      </div>

      <BackgroundServiceSettings />

      {needsExternalSearchFallback ? (
        <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-white/85">Web Search Fallback</h4>
              <SettingHelpPopover settingId="integration.externalSearchProvider" />
            </div>
            <p className="mt-1 text-xs text-white/40">
              Active provider <code>{activeProvider}</code> uses fallback search. Choose Google,
              Exa, or Tavily.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-white/55">
              Fallback provider
            </label>
            <select
              value={externalSearchProvider}
              onChange={(event) => {
                void (async () => {
                  await setExternalSearchProvider(
                    event.target.value as 'google' | 'exa' | 'tavily',
                  );
                  await refreshCapabilitySnapshot();
                })();
              }}
              className="app-select"
            >
              <option value="google">Google</option>
              <option value="exa">Exa</option>
              <option value="tavily">Tavily</option>
            </select>
            <p className="text-[11px] text-white/35">
              Selecting Exa or Tavily requires the corresponding API key.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-xs text-white/45">
            Active provider <code>{activeProvider}</code> supports native web search. Fallback
            provider controls are hidden.
          </p>
        </div>
      )}

      {needsExternalSearchFallback && externalSearchProvider === 'exa' ? (
        <KeyField
          title="Exa API Key"
          description="Enables Exa-based web search fallback when native provider search is unavailable."
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
          description="Enables Tavily-based web search fallback when native provider search is unavailable."
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

      <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-white/85">External CLI Orchestration</h4>
            <SettingHelpPopover settingId="integration.externalCli.enableTools" />
          </div>
          <p className="mt-1 text-xs text-white/40">
            Enable Codex/Claude external CLI tools only when the corresponding binary is installed
            locally.
          </p>
        </div>

        {!codexAvailability?.installed && !claudeAvailability?.installed ? (
          <p className="text-xs text-white/45">
            No supported external CLI found in PATH. Install <code>codex</code> and/or{' '}
            <code>claude</code> to enable this section.
          </p>
        ) : null}

        {codexAvailability?.installed ? (
          <div className="space-y-3 rounded-lg border border-white/[0.06] bg-[#0B0C10]/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white/90">Codex CLI</p>
                <p className="text-[11px] text-white/40">
                  {codexAvailability.version || 'unknown version'} ·{' '}
                  {codexAvailability.authStatus === 'unauthenticated'
                    ? 'Not authenticated'
                    : codexAvailability.authStatus === 'authenticated'
                    ? 'Authenticated'
                    : 'Auth unknown'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={externalCli.codex.enabled}
                  onChange={(event) => {
                    void (async () => {
                      await updateExternalCliSettings('codex', {
                        enabled: event.target.checked,
                      });
                      await refreshCapabilitySnapshot();
                    })();
                  }}
                />
                Enable Tools
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/65">
              <input
                type="checkbox"
                checked={externalCli.codex.allowBypassPermissions}
                disabled={!externalCli.codex.enabled}
                onChange={(event) => {
                  void (async () => {
                    await updateExternalCliSettings('codex', {
                      allowBypassPermissions: event.target.checked,
                    });
                    await refreshCapabilitySnapshot();
                  })();
                }}
              />
              Allow bypass permissions (agent still asks each run)
              <SettingHelpPopover settingId="integration.externalCli.allowBypassPermissions" />
            </label>
            {codexAvailability.authMessage ? (
              <p className="text-[11px] text-[#FCA5A5]">{codexAvailability.authMessage}</p>
            ) : null}
          </div>
        ) : null}

        {claudeAvailability?.installed ? (
          <div className="space-y-3 rounded-lg border border-white/[0.06] bg-[#0B0C10]/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white/90">Claude CLI</p>
                <p className="text-[11px] text-white/40">
                  {claudeAvailability.version || 'unknown version'} ·{' '}
                  {claudeAvailability.authStatus === 'unauthenticated'
                    ? 'Not authenticated'
                    : claudeAvailability.authStatus === 'authenticated'
                    ? 'Authenticated'
                    : 'Auth checked at run time'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={externalCli.claude.enabled}
                  onChange={(event) => {
                    void (async () => {
                      await updateExternalCliSettings('claude', {
                        enabled: event.target.checked,
                      });
                      await refreshCapabilitySnapshot();
                    })();
                  }}
                />
                Enable Tools
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/65">
              <input
                type="checkbox"
                checked={externalCli.claude.allowBypassPermissions}
                disabled={!externalCli.claude.enabled}
                onChange={(event) => {
                  void (async () => {
                    await updateExternalCliSettings('claude', {
                      allowBypassPermissions: event.target.checked,
                    });
                    await refreshCapabilitySnapshot();
                  })();
                }}
              />
              Allow bypass permissions (agent still asks each run)
              <SettingHelpPopover settingId="integration.externalCli.allowBypassPermissions" />
            </label>
            {claudeAvailability.authMessage ? (
              <p className="text-[11px] text-[#FCA5A5]">{claudeAvailability.authMessage}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div>
          <h4 className="text-sm font-medium text-white/85">Google Specialized Models</h4>
          <p className="mt-1 text-xs text-white/40">
            These model IDs are used by <code>computer_use</code> and <code>deep_research</code>{' '}
            tools.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Computer Use Model</label>
            <SettingHelpPopover settingId="integration.computerUseModel" />
          </div>
          <div className="relative">
            <Monitor className="absolute left-3 top-2.5 h-4 w-4 text-white/35" />
            <input
              type="text"
              value={computerUseModel}
              onChange={(event) => setComputerUseModel(event.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-[#0B0C10] py-2 pl-9 pr-3 text-sm font-mono text-white/90 placeholder:text-white/30 focus:border-[#1D4ED8]/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Deep Research Model</label>
            <SettingHelpPopover settingId="integration.deepResearchModel" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/35" />
            <input
              type="text"
              value={deepResearchModel}
              onChange={(event) => setDeepResearchModel(event.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-[#0B0C10] py-2 pl-9 pr-3 text-sm font-mono text-white/90 placeholder:text-white/30 focus:border-[#1D4ED8]/50 focus:outline-none"
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
                  await updateSpecializedModelV2(
                    'google',
                    'computerUse',
                    computerUseModel.trim(),
                  );
                }
                if (
                  deepResearchModel.trim() !== specializedModelsV2.google.deepResearchAgent
                ) {
                  await updateSpecializedModelV2(
                    'google',
                    'deepResearchAgent',
                    deepResearchModel.trim(),
                  );
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
              'rounded-lg px-4 py-2 text-sm transition-colors',
              hasAiModelChanges
                ? 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]'
                : 'cursor-not-allowed bg-white/[0.06] text-white/30',
            )}
          >
            Save Model Overrides
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#1D4ED8]/20 bg-[#1D4ED8]/10 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
        <p className="text-xs text-[#93C5FD]">
          Runtime extension changes apply to future tool calls. If you changed provider, base URL,
          or chat model separately, start a new session for full runtime consistency.
        </p>
      </div>
    </div>
  );
}
