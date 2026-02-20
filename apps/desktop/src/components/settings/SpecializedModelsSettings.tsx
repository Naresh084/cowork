// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../../stores/auth-store';
import { resolveActiveSoul, useSettingsStore } from '../../stores/settings-store';
import { useCapabilityStore } from '@/stores/capability-store';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';

export function SpecializedModelsSettings() {
  const specializedModelsV2 = useSettingsStore((state) => state.specializedModelsV2);
  const updateSpecializedModelV2 = useSettingsStore((state) => state.updateSpecializedModelV2);
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);
  const {
    stitchApiKey,
    isLoading,
    setStitchApiKey,
    clearStitchApiKey,
    applyRuntimeConfig,
  } = useAuthStore();

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stitchKeyDraft, setStitchKeyDraft] = useState(stitchApiKey || '');
  const [computerUseModelDraft, setComputerUseModelDraft] = useState(
    specializedModelsV2.google.computerUse,
  );
  const [deepResearchModelDraft, setDeepResearchModelDraft] = useState(
    specializedModelsV2.google.deepResearchAgent,
  );

  useEffect(() => {
    setStitchKeyDraft(stitchApiKey || '');
  }, [stitchApiKey]);

  useEffect(() => {
    setComputerUseModelDraft(specializedModelsV2.google.computerUse);
    setDeepResearchModelDraft(specializedModelsV2.google.deepResearchAgent);
  }, [specializedModelsV2.google.computerUse, specializedModelsV2.google.deepResearchAgent]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const hasModelChanges = useMemo(
    () =>
      computerUseModelDraft.trim() !== specializedModelsV2.google.computerUse ||
      deepResearchModelDraft.trim() !== specializedModelsV2.google.deepResearchAgent,
    [
      computerUseModelDraft,
      deepResearchModelDraft,
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
      mediaRouting: settingsState.mediaRouting,
      specializedModels: settingsState.specializedModelsV2,
      sandbox: settingsState.commandSandbox,
      toolOutputTokenLimit: settingsState.toolOutputTokenLimit,
      activeSoul,
    });
  };

  const handleSaveSpecializedModels = async () => {
    setError(null);
    setNotice(null);
    try {
      if (computerUseModelDraft.trim() && computerUseModelDraft.trim() !== specializedModelsV2.google.computerUse) {
        await updateSpecializedModelV2('google', 'computerUse', computerUseModelDraft.trim());
      }
      if (
        deepResearchModelDraft.trim() &&
        deepResearchModelDraft.trim() !== specializedModelsV2.google.deepResearchAgent
      ) {
        await updateSpecializedModelV2('google', 'deepResearchAgent', deepResearchModelDraft.trim());
      }
      await applyRuntime();
      setNotice('Specialized Google models saved.');
      await refreshCapabilitySnapshot();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  return (
    <div className="space-y-4" data-tour-id="settings-specialized-section">
      <div>
        <h3 className="text-sm font-medium text-white/90">Specialized Models</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure Stitch and Google non-media specialized model settings.
        </p>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-white/90">Stitch MCP API Key</h4>
            <p className="mt-1 text-xs text-white/45">
              Controls availability of Stitch MCP tools for design and UI generation workflows.
            </p>
          </div>
          <SettingHelpPopover settingId="integration.stitchApiKey" />
        </div>
        <input
          type="password"
          value={stitchKeyDraft}
          onChange={(event) => setStitchKeyDraft(event.target.value)}
          placeholder="Enter Stitch MCP API key"
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
            disabled={isLoading || !stitchKeyDraft.trim()}
            onClick={async () => {
              try {
                await setStitchApiKey(stitchKeyDraft.trim());
                setNotice('Stitch key saved.');
                await refreshCapabilitySnapshot();
              } catch (saveError) {
                setError(saveError instanceof Error ? saveError.message : String(saveError));
              }
            }}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              isLoading || !stitchKeyDraft.trim()
                ? 'bg-white/[0.04] text-white/30 cursor-not-allowed'
                : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
            )}
          >
            Save Stitch Key
          </button>
          <button
            type="button"
            disabled={isLoading || !stitchApiKey}
            onClick={async () => {
              try {
                await clearStitchApiKey();
                setNotice('Stitch key removed.');
                await refreshCapabilitySnapshot();
              } catch (clearError) {
                setError(clearError instanceof Error ? clearError.message : String(clearError));
              }
            }}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              isLoading || !stitchApiKey
                ? 'bg-white/[0.04] text-white/30 cursor-not-allowed'
                : 'bg-[#FF5449]/10 text-[#FF8A80] hover:bg-[#FF5449]/18',
            )}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-white/90">Google Specialized Models</h4>
            <p className="mt-1 text-xs text-white/45">
              Used by advanced non-media tools.
            </p>
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-white/90">Computer Use Model</p>
            <SettingHelpPopover settingId="integration.googleComputerUseModel" />
          </div>
          <input
            type="text"
            value={computerUseModelDraft}
            onChange={(event) => setComputerUseModelDraft(event.target.value)}
            placeholder="gemini-3-flash-preview"
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#0B0C10] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#1D4ED8]/50',
              'font-mono',
            )}
          />
        </div>
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-white/90">Deep Research Model</p>
            <SettingHelpPopover settingId="integration.googleDeepResearchModel" />
          </div>
          <input
            type="text"
            value={deepResearchModelDraft}
            onChange={(event) => setDeepResearchModelDraft(event.target.value)}
            placeholder="deep-research-pro-preview-12-2025"
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#0B0C10] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#1D4ED8]/50',
              'font-mono',
            )}
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => {
              setComputerUseModelDraft(specializedModelsV2.google.computerUse);
              setDeepResearchModelDraft(specializedModelsV2.google.deepResearchAgent);
            }}
            disabled={!hasModelChanges || isLoading}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              !hasModelChanges || isLoading
                ? 'bg-white/[0.04] text-white/30 cursor-not-allowed'
                : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.1]',
            )}
          >
            <Undo2 className="w-4 h-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleSaveSpecializedModels()}
            disabled={!hasModelChanges || isLoading}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors',
              !hasModelChanges || isLoading
                ? 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                : 'bg-[#1D4ED8] text-white hover:bg-[#3B82F6]',
            )}
          >
            Save Models
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-[#FF9F9A]">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-xs text-[#86EFAC]">{notice}</p>
      ) : null}
    </div>
  );
}
