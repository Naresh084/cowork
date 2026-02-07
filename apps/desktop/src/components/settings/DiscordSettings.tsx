import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';

function splitCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function DiscordSettings() {
  const platform = useIntegrationStore((s) => s.platforms.discord);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.discord);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);

  const [botToken, setBotToken] = useState('');
  const [allowedGuildIdsText, setAllowedGuildIdsText] = useState('');
  const [allowedChannelIdsText, setAllowedChannelIdsText] = useState('');
  const [allowDirectMessages, setAllowDirectMessages] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const connected = platform?.connected ?? false;
  const displayName = platform?.displayName;
  const error = platform?.error;

  const canConnect = botToken.trim().length > 0;

  const handleConnect = async () => {
    await connect('discord', {
      botToken,
      allowedGuildIds: splitCommaSeparated(allowedGuildIdsText),
      allowedChannelIds: splitCommaSeparated(allowedChannelIdsText),
      allowDirectMessages,
    });
  };

  const handleDisconnect = async () => {
    await disconnect('discord');
    setBotToken('');
    setAllowedGuildIdsText('');
    setAllowedChannelIdsText('');
    setAllowDirectMessages(true);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/90">Connection Status</h3>
              <SettingHelpPopover settingId="discord.connection" />
            </div>
            <div className="mt-2">
              <PlatformStatusBadge platform="discord" connected={connected} displayName={displayName} />
            </div>
            {error ? <p className="mt-2 text-xs text-[#FF5449]">{error}</p> : null}
          </div>
          {connected ? (
            <button
              onClick={handleDisconnect}
              disabled={isConnecting}
              className="px-4 py-2 rounded-lg text-sm bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20 transition-colors disabled:opacity-50"
            >
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting || !canConnect}
              className={cn(
                'px-4 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-50',
                !canConnect && !isConnecting && 'bg-white/[0.06] text-white/30',
              )}
              style={canConnect ? { backgroundColor: '#5865F2' } : undefined}
              onMouseEnter={(event) => {
                if (canConnect && !isConnecting) {
                  event.currentTarget.style.backgroundColor = '#4752C4';
                }
              }}
              onMouseLeave={(event) => {
                if (canConnect && !isConnecting) {
                  event.currentTarget.style.backgroundColor = '#5865F2';
                }
              }}
            >
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <h3 className="text-sm font-medium text-white/90">Authentication</h3>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Bot Token</label>
            <SettingHelpPopover settingId="discord.botToken" />
          </div>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder="Paste Discord bot token"
              disabled={connected || isConnecting}
              className={cn(
                'w-full px-3 py-2 pr-10 rounded-lg text-sm',
                'bg-[#0B0C10] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:border-[#1D4ED8]/50',
                'font-mono',
                connected && 'opacity-50 cursor-not-allowed',
              )}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Allowed Guild IDs (optional)</label>
            <SettingHelpPopover settingId="discord.allowedGuildIds" />
          </div>
          <input
            type="text"
            value={allowedGuildIdsText}
            onChange={(event) => setAllowedGuildIdsText(event.target.value)}
            placeholder="123..., 456..."
            disabled={connected || isConnecting}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#0B0C10] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#1D4ED8]/50',
              connected && 'opacity-50 cursor-not-allowed',
            )}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Allowed Channel IDs (optional)</label>
            <SettingHelpPopover settingId="discord.allowedChannelIds" />
          </div>
          <input
            type="text"
            value={allowedChannelIdsText}
            onChange={(event) => setAllowedChannelIdsText(event.target.value)}
            placeholder="123..., 456..."
            disabled={connected || isConnecting}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#0B0C10] border border-white/[0.08]',
              'text-white/90 placeholder:text-white/30',
              'focus:outline-none focus:border-[#1D4ED8]/50',
              connected && 'opacity-50 cursor-not-allowed',
            )}
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0B0C10] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/55">Allow direct messages</span>
            <SettingHelpPopover settingId="discord.allowDirectMessages" />
          </div>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={allowDirectMessages}
              onChange={(event) => setAllowDirectMessages(event.target.checked)}
              disabled={connected || isConnecting}
              className="sr-only"
            />
            <span
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                allowDirectMessages ? 'bg-[#5865F2]' : 'bg-white/[0.15]',
                (connected || isConnecting) && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                  allowDirectMessages ? 'translate-x-5' : 'translate-x-1',
                )}
              />
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-medium text-white/90">How to connect</span>
          <ChevronDown className={cn('w-4 h-4 text-white/40 transition-transform', showGuide && 'rotate-180')} />
        </button>
        <AnimatePresence>
          {showGuide ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                <Step number={1} text="Create a bot app in Discord Developer Portal and enable Message Content Intent." />
                <Step number={2} text="Invite the bot to your server with read/send message permissions." />
                <Step number={3} text="Paste the bot token above." />
                <Step number={4} text="Optionally restrict guild/channel IDs for safer ingress scope." />
                <Step number={5} text="Click Connect. Incoming messages create shared-session requests." />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-[#5865F2]/20 text-[#93C5FD] flex items-center justify-center flex-shrink-0 text-xs font-medium mt-0.5">
        {number}
      </div>
      <p className="text-xs text-white/50">{text}</p>
    </div>
  );
}
