import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Loader2, Save, Undo2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';

export function IntegrationSettings() {
  const integrationSettings = useIntegrationStore((s) => s.integrationSettings);
  const isLoading = useIntegrationStore((s) => s.isIntegrationSettingsLoading);
  const isSaving = useIntegrationStore((s) => s.isIntegrationSettingsSaving);
  const settingsError = useIntegrationStore((s) => s.integrationSettingsError);
  const loadIntegrationSettings = useIntegrationStore((s) => s.loadIntegrationSettings);
  const saveIntegrationSettings = useIntegrationStore((s) => s.saveIntegrationSettings);

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
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-white/90">Integration Settings</h3>
        <p className="mt-1 text-xs text-white/40">
          Configure shared defaults for WhatsApp, Slack, and Telegram integrations.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <div>
          <h4 className="text-sm font-medium text-white/85">Shared Session Working Directory</h4>
          <p className="mt-1 text-xs text-white/40">
            New shared integration sessions will use this working directory.
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
    </div>
  );
}
