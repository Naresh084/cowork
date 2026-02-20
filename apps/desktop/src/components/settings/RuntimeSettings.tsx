// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';
import { useAuthStore } from '../../stores/auth-store';
import {
  DEFAULT_TOOL_OUTPUT_TOKEN_LIMIT,
  MAX_TOOL_OUTPUT_TOKEN_LIMIT,
  MIN_TOOL_OUTPUT_TOKEN_LIMIT,
  resolveActiveSoul,
  useSettingsStore,
} from '../../stores/settings-store';
import { BackgroundServiceSettings } from './BackgroundServiceSettings';

export function RuntimeSettings() {
  const { applyRuntimeConfig } = useAuthStore();
  const {
    toolOutputTokenLimit,
    updateSetting,
  } = useSettingsStore();
  const [toolOutputTokenLimitDraft, setToolOutputTokenLimitDraft] = useState(
    String(toolOutputTokenLimit),
  );
  const [isSavingToolOutputTokenLimit, setIsSavingToolOutputTokenLimit] = useState(false);

  useEffect(() => {
    setToolOutputTokenLimitDraft(String(toolOutputTokenLimit));
  }, [toolOutputTokenLimit]);

  const parsedToolOutputTokenLimit = Number.parseInt(toolOutputTokenLimitDraft.trim(), 10);
  const toolOutputTokenLimitValid =
    Number.isFinite(parsedToolOutputTokenLimit) &&
    parsedToolOutputTokenLimit >= MIN_TOOL_OUTPUT_TOKEN_LIMIT &&
    parsedToolOutputTokenLimit <= MAX_TOOL_OUTPUT_TOKEN_LIMIT;
  const hasToolOutputTokenLimitChanges =
    toolOutputTokenLimitValid && parsedToolOutputTokenLimit !== toolOutputTokenLimit;

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
      mediaRouting: settingsState.mediaRouting,
      specializedModels: settingsState.specializedModelsV2,
      sandbox: settingsState.commandSandbox,
      toolOutputTokenLimit: settingsState.toolOutputTokenLimit,
      activeSoul,
    });
  };

  return (
    <div className="space-y-4" data-tour-id="settings-runtime-section">
      <div>
        <h3 className="text-sm font-medium text-white/90">Runtime Controls</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure runtime health and tool token limits for the active workspace.
        </p>
      </div>

      <BackgroundServiceSettings />

      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-white/85">Tool Output Token Limit</h4>
            <SettingHelpPopover settingId="runtime.toolOutputTokenLimit" />
          </div>
          <p className="mt-1 text-xs text-white/40">
            Caps tool result size before it is sent back to the model. Lower values reduce overflow
            risk. Default is <code>{DEFAULT_TOOL_OUTPUT_TOKEN_LIMIT}</code> tokens.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-white/50">
            Max tool output tokens ({MIN_TOOL_OUTPUT_TOKEN_LIMIT} - {MAX_TOOL_OUTPUT_TOKEN_LIMIT})
          </label>
          <input
            type="number"
            min={MIN_TOOL_OUTPUT_TOKEN_LIMIT}
            max={MAX_TOOL_OUTPUT_TOKEN_LIMIT}
            step={256}
            value={toolOutputTokenLimitDraft}
            onChange={(event) => setToolOutputTokenLimitDraft(event.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-[#0B0C10] px-3 py-2 text-sm font-mono text-white/90 placeholder:text-white/30 focus:border-[#1D4ED8]/50 focus:outline-none"
          />
          {!toolOutputTokenLimitValid ? (
            <p className="text-[11px] text-[#FCA5A5]">
              Enter a value between {MIN_TOOL_OUTPUT_TOKEN_LIMIT} and {MAX_TOOL_OUTPUT_TOKEN_LIMIT}.
            </p>
          ) : (
            <p className="text-[11px] text-white/40">
              Current runtime limit: <code>{toolOutputTokenLimit}</code> tokens.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            disabled={!hasToolOutputTokenLimitChanges || isSavingToolOutputTokenLimit}
            onClick={async () => {
              if (!toolOutputTokenLimitValid) return;
              setIsSavingToolOutputTokenLimit(true);
              try {
                updateSetting('toolOutputTokenLimit', parsedToolOutputTokenLimit);
                await applyRuntime();
                toast.success('Tool output token limit updated');
              } catch (error) {
                toast.error(
                  'Failed to update tool output token limit',
                  error instanceof Error ? error.message : String(error),
                );
              } finally {
                setIsSavingToolOutputTokenLimit(false);
              }
            }}
            className={cn(
              'rounded-lg px-4 py-2 text-sm transition-colors',
              hasToolOutputTokenLimitChanges && !isSavingToolOutputTokenLimit
                ? 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]'
                : 'cursor-not-allowed bg-white/[0.06] text-white/30',
            )}
          >
            Save Tool Limit
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#1D4ED8]/20 bg-[#1D4ED8]/10 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
        <p className="text-xs text-[#93C5FD]">
          Runtime changes apply to future tool calls. Specialized model overrides and media routing
          are now configured in the Specialized Models and Integrations tabs.
        </p>
      </div>
    </div>
  );
}
