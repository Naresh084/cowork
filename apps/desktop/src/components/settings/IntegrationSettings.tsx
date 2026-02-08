import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Loader2, Save, Undo2, Info } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { useCapabilityStore } from '@/stores/capability-store';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';
import { WhatsAppSettings } from './WhatsAppSettings';
import { SlackSettings } from './SlackSettings';
import { TelegramSettings } from './TelegramSettings';
import { DiscordSettings } from './DiscordSettings';
import { IMessageSettings } from './IMessageSettings';
import { TeamsSettings } from './TeamsSettings';

export function IntegrationSettings() {
  const integrationSettings = useIntegrationStore((s) => s.integrationSettings);
  const isLoading = useIntegrationStore((s) => s.isIntegrationSettingsLoading);
  const isSaving = useIntegrationStore((s) => s.isIntegrationSettingsSaving);
  const settingsError = useIntegrationStore((s) => s.integrationSettingsError);
  const loadIntegrationSettings = useIntegrationStore((s) => s.loadIntegrationSettings);
  const saveIntegrationSettings = useIntegrationStore((s) => s.saveIntegrationSettings);
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);

  const [draftWorkingDirectory, setDraftWorkingDirectory] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [userHome, setUserHome] = useState<string | null>(null);

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
        <h3 className="text-sm font-medium text-white/90">Integration Channels</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure messaging integrations and shared integration-session defaults.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-white/85">Shared Integration Session Defaults</h4>
            <SettingHelpPopover settingId="integration.sharedSessionWorkingDirectory" />
          </div>
          <p className="mt-1 text-xs text-white/40">
            New shared integration sessions (all messaging platforms) use this working directory.
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

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">WhatsApp Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            QR-based connection with sender allowlist policy and denial messaging for unauthorized users.
          </p>
          <WhatsAppSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Slack Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Requires bot token and app token. Supports shared-session ingress and notifications.
          </p>
          <SlackSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Telegram Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Uses a BotFather token for connection. Inbound messages can create shared sessions.
          </p>
          <TelegramSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Discord Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Uses bot token plus optional guild/channel allowlists for shared sessions and notifications.
          </p>
          <DiscordSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">iMessage Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Uses a BlueBubbles bridge and is supported on macOS hosts only.
          </p>
          <IMessageSettings />
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-white/90">Microsoft Teams Integration</summary>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-2 text-xs text-white/45">
            Uses Azure Graph app credentials for inbound channel monitoring and outbound notifications.
          </p>
          <TeamsSettings />
        </div>
      </details>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="text-sm font-medium text-white/85">Connectors Ecosystem</h4>
        <p className="mt-1 text-xs text-white/45">
          Connectors add MCP-powered tools for external systems. Configure and connect them from the sidebar
          Connectors manager.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#1D4ED8]/10 border border-[#1D4ED8]/20">
        <Info className="w-4 h-4 text-[#93C5FD] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#93C5FD]">
          Integration updates are applied without restarting the app. If a platform appears disconnected, reconnect
          from its section and retry.
        </p>
      </div>
    </div>
  );
}
