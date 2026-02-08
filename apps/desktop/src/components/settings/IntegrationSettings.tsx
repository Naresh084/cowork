import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2,
  CheckCircle2,
  FolderOpen,
  Gamepad2,
  Info,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Save,
  Send,
  Undo2,
  XCircle,
} from 'lucide-react';
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
import type { PlatformType } from '@gemini-cowork/shared';

type IntegrationTabId =
  | 'general'
  | 'whatsapp'
  | 'slack'
  | 'telegram'
  | 'discord'
  | 'imessage'
  | 'teams';

interface IntegrationTabConfig {
  id: IntegrationTabId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  platform?: PlatformType;
  accentClass: string;
}

const integrationTabs: IntegrationTabConfig[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Shared session defaults used by connected messaging channels.',
    icon: MessagesSquare,
    accentClass: 'text-[#93C5FD]',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'QR-based bridge with sender allowlist and denial policy.',
    icon: MessageCircle,
    platform: 'whatsapp',
    accentClass: 'text-[#7BF4AE]',
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Bot token + app token for real-time shared sessions.',
    icon: MessagesSquare,
    platform: 'slack',
    accentClass: 'text-[#D7B4FF]',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'BotFather token for inbound shared-session routing.',
    icon: Send,
    platform: 'telegram',
    accentClass: 'text-[#8FDBFF]',
  },
  {
    id: 'discord',
    label: 'Discord',
    description: 'Bot token with optional guild/channel restrictions.',
    icon: Gamepad2,
    platform: 'discord',
    accentClass: 'text-[#C3C5FF]',
  },
  {
    id: 'imessage',
    label: 'iMessage',
    description: 'BlueBubbles bridge for macOS-hosted iMessage control.',
    icon: MessageCircle,
    platform: 'imessage',
    accentClass: 'text-[#8FEFFF]',
  },
  {
    id: 'teams',
    label: 'Teams',
    description: 'Azure Graph app credentials for Teams channels.',
    icon: Building2,
    platform: 'teams',
    accentClass: 'text-[#B9C8FF]',
  },
];

function SectionCard({
  title,
  description,
  children,
  helpSettingId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  helpSettingId?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-white/90">{title}</h4>
          {description ? <p className="mt-1 text-xs text-white/45">{description}</p> : null}
        </div>
        {helpSettingId ? <SettingHelpPopover settingId={helpSettingId} /> : null}
      </div>
      {children}
    </div>
  );
}

function getPlatformStatusTone(connected: boolean, connecting: boolean) {
  if (connecting) {
    return {
      dot: 'bg-[#F59E0B]',
      text: 'text-[#FCD34D]',
      pill: 'border-[#F59E0B]/40 bg-[#F59E0B]/12',
      label: 'Connecting',
    };
  }

  if (connected) {
    return {
      dot: 'bg-emerald-400',
      text: 'text-emerald-300',
      pill: 'border-emerald-400/40 bg-emerald-500/10',
      label: 'Connected',
    };
  }

  return {
    dot: 'bg-[#FF6A6A]',
    text: 'text-[#FF9F9A]',
    pill: 'border-[#FF6A6A]/35 bg-[#FF5449]/10',
    label: 'Disconnected',
  };
}

export function IntegrationSettings() {
  const platforms = useIntegrationStore((s) => s.platforms);
  const isConnecting = useIntegrationStore((s) => s.isConnecting);
  const integrationSettings = useIntegrationStore((s) => s.integrationSettings);
  const isLoading = useIntegrationStore((s) => s.isIntegrationSettingsLoading);
  const isSaving = useIntegrationStore((s) => s.isIntegrationSettingsSaving);
  const settingsError = useIntegrationStore((s) => s.integrationSettingsError);
  const loadIntegrationSettings = useIntegrationStore((s) => s.loadIntegrationSettings);
  const saveIntegrationSettings = useIntegrationStore((s) => s.saveIntegrationSettings);
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);

  const [activeTab, setActiveTab] = useState<IntegrationTabId>('general');
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

  const platformTabs = useMemo(
    () => integrationTabs.filter((tab) => tab.platform) as Array<IntegrationTabConfig & { platform: PlatformType }>,
    [],
  );

  const connectedCount = useMemo(
    () => platformTabs.filter((tab) => platforms[tab.platform]?.connected).length,
    [platformTabs, platforms],
  );

  const connectingCount = useMemo(
    () => platformTabs.filter((tab) => isConnecting[tab.platform]).length,
    [platformTabs, isConnecting],
  );

  const isDirty = useMemo(
    () => draftWorkingDirectory.trim() !== integrationSettings.sharedSessionWorkingDirectory.trim(),
    [draftWorkingDirectory, integrationSettings.sharedSessionWorkingDirectory],
  );

  const activeTabConfig = useMemo(
    () => integrationTabs.find((tab) => tab.id === activeTab) ?? integrationTabs[0],
    [activeTab],
  );

  const handlePickFolder = async () => {
    setLocalError(null);
    setNotice(null);

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: draftWorkingDirectory.trim() || userHome || undefined,
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

  const renderTabContent = () => {
    if (activeTab === 'general') {
      return (
        <div className="space-y-4">
          <SectionCard
            title="Shared Integration Session Defaults"
            description="All new messaging-triggered shared sessions start in this working directory by default."
            helpSettingId="integration.sharedSessionWorkingDirectory"
          >
            <div className="space-y-2">
              <label className="block text-xs text-white/50">Working Directory</label>
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
              <p className="text-[11px] text-white/35">Leave empty to use the app process directory fallback.</p>
            </div>

            {(localError || settingsError) && <p className="text-xs text-[#FF5449]">{localError || settingsError}</p>}
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
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Connectors Ecosystem"
            description="Connectors add MCP-powered tools for external systems. Configure them in the sidebar Connectors manager."
          >
            <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/55">
              Connector configuration is separate from messaging integrations and can run in parallel with them.
            </div>
          </SectionCard>
        </div>
      );
    }

    if (activeTab === 'whatsapp') {
      return <WhatsAppSettings />;
    }
    if (activeTab === 'slack') {
      return <SlackSettings />;
    }
    if (activeTab === 'telegram') {
      return <TelegramSettings />;
    }
    if (activeTab === 'discord') {
      return <DiscordSettings />;
    }
    if (activeTab === 'imessage') {
      return <IMessageSettings />;
    }

    return <TeamsSettings />;
  };

  return (
    <div className="space-y-5" data-tour-id="settings-integrations-section">
      <div className="rounded-2xl border border-[#2A6AF2]/25 bg-[radial-gradient(120%_160%_at_0%_0%,rgba(45,96,255,0.22),rgba(10,13,22,0.9))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white/95">Messaging Integrations Control Center</h3>
            <p className="mt-1 text-xs text-white/60">
              Manage all channels through sub-tabs. Status cards show live connectivity and quick navigation.
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.12] bg-black/20 px-3 py-2 text-xs text-white/70">
            <p>
              Connected <span className="text-emerald-300">{connectedCount}</span> / {platformTabs.length}
            </p>
            {connectingCount > 0 ? <p className="text-[#FCD34D]">{connectingCount} connecting</p> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {platformTabs.map((tab) => {
            const platform = platforms[tab.platform];
            const tone = getPlatformStatusTone(Boolean(platform?.connected), Boolean(isConnecting[tab.platform]));
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  activeTab === tab.id
                    ? 'border-[#4B83FF]/60 bg-[#1D4ED8]/20'
                    : 'border-white/[0.1] bg-black/20 hover:bg-white/[0.05]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.15] bg-white/[0.04]">
                      <Icon className={cn('h-4 w-4', tab.accentClass)} />
                    </span>
                    <p className="text-sm text-white/90">{tab.label}</p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', tone.pill, tone.text)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {tone.label}
                  </span>
                </div>
                <p className="mt-2 truncate text-xs text-white/55">{platform?.displayName || platform?.identityName || 'Not connected yet'}</p>
              </button>
            );
          })}
        </div>

      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center gap-2" data-tour-id="settings-integrations-subtabs">
          {integrationTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            const platform = tab.platform ? platforms[tab.platform] : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                  isActive
                    ? 'border-[#4B83FF]/55 bg-[#1D4ED8]/20 text-[#D7E3FF]'
                    : 'border-white/[0.1] text-white/65 hover:bg-white/[0.06] hover:text-white/85',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.platform ? (
                  platform?.connected ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-[#FF9F9A]" />
                  )
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.01] p-4">
        <div className="mb-4 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
          <p className="text-sm text-white/90">{activeTabConfig.label}</p>
          <p className="mt-0.5 text-xs text-white/50">{activeTabConfig.description}</p>
        </div>
        {renderTabContent()}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#1D4ED8]/20 bg-[#1D4ED8]/10 p-4">
        <Info className="w-4 h-4 text-[#93C5FD] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#93C5FD]">
          Integration updates apply without restarting the app. If a platform disconnects, open its sub-tab and reconnect.
        </p>
      </div>
    </div>
  );
}
