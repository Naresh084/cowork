// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react';
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

export function IMessageSettings() {
  const platform = useIntegrationStore((s) => s.platforms.imessage);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.imessage);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);
  const reconnect = useIntegrationStore((s) => s.reconnect);

  const [serverUrl, setServerUrl] = useState('http://localhost:1234');
  const [accessToken, setAccessToken] = useState('');
  const [defaultChatGuid, setDefaultChatGuid] = useState('');
  const [allowHandlesText, setAllowHandlesText] = useState('');
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState('20');
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const connected = platform?.connected ?? false;
  const displayName = platform?.displayName;
  const error = platform?.error;
  const health = platform?.health;
  const healthMessage = platform?.healthMessage;
  const requiresReconnect = Boolean(platform?.requiresReconnect || health === 'unhealthy');

  const isMacOS = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const platformValue = typeof navigator !== 'undefined' ? navigator.platform : '';
    return /Mac/i.test(ua) || /Mac/i.test(platformValue);
  }, []);

  const canConnect = isMacOS && serverUrl.trim().length > 0 && accessToken.trim().length > 0;

  const handleConnect = async () => {
    await connect('imessage', {
      serverUrl,
      accessToken,
      defaultChatGuid: defaultChatGuid.trim() || undefined,
      allowHandles: splitCommaSeparated(allowHandlesText),
      pollIntervalSeconds: Number(pollIntervalSeconds) || 20,
    });
  };

  const handleDisconnect = async () => {
    await disconnect('imessage');
    setAccessToken('');
  };

  const handleReconnect = async () => {
    await reconnect('imessage');
  };

  return (
    <div className="space-y-4">
      {!isMacOS ? (
        <div className="rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/10 p-3 text-xs text-[#FCD34D]">
          <div className="inline-flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            iMessage is supported only on macOS hosts.
          </div>
          <p className="mt-1 text-[#FDE68A]">
            This integration uses a BlueBubbles bridge connected to the macOS Messages ecosystem.
          </p>
        </div>
      ) : null}

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/90">Connection Status</h3>
              <SettingHelpPopover settingId="imessage.connection" />
            </div>
            <div className="mt-2">
              <PlatformStatusBadge
                platform="imessage"
                connected={connected}
                displayName={displayName}
                health={health}
                requiresReconnect={requiresReconnect}
              />
            </div>
            {error ? <p className="mt-2 text-xs text-[#FF5449]">{error}</p> : null}
            {connected && healthMessage ? (
              <p className={cn('mt-2 text-xs', requiresReconnect ? 'text-[#FCA5A5]' : 'text-[#FCD34D]')}>
                {healthMessage}
              </p>
            ) : null}
          </div>
          {connected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReconnect}
                disabled={isConnecting}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50',
                  requiresReconnect
                    ? 'bg-[#F59E0B]/18 text-[#FCD34D] hover:bg-[#F59E0B]/28'
                    : 'bg-white/[0.08] text-white/80 hover:bg-white/[0.12]',
                )}
              >
                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reconnect'}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isConnecting}
                className="px-4 py-2 rounded-lg text-sm bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20 transition-colors disabled:opacity-50"
              >
                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disconnect'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting || !canConnect}
              className={cn(
                'px-4 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-50',
                !canConnect && !isConnecting && 'bg-white/[0.06] text-white/30',
              )}
              style={canConnect ? { backgroundColor: '#34C759' } : undefined}
              onMouseEnter={(event) => {
                if (canConnect && !isConnecting) {
                  event.currentTarget.style.backgroundColor = '#30B653';
                }
              }}
              onMouseLeave={(event) => {
                if (canConnect && !isConnecting) {
                  event.currentTarget.style.backgroundColor = '#34C759';
                }
              }}
            >
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <h3 className="text-sm font-medium text-white/90">BlueBubbles Bridge</h3>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Server URL</label>
            <SettingHelpPopover settingId="imessage.serverUrl" />
          </div>
          <input
            type="text"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder="http://localhost:1234"
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
            <label className="block text-xs text-white/50">Access Token</label>
            <SettingHelpPopover settingId="imessage.accessToken" />
          </div>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="BlueBubbles API token"
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
            <label className="block text-xs text-white/50">Default Chat GUID (optional)</label>
            <SettingHelpPopover settingId="imessage.defaultChatGuid" />
          </div>
          <input
            type="text"
            value={defaultChatGuid}
            onChange={(event) => setDefaultChatGuid(event.target.value)}
            placeholder="chat123456789"
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
            <label className="block text-xs text-white/50">Allowed Handles (optional)</label>
            <SettingHelpPopover settingId="imessage.allowHandles" />
          </div>
          <input
            type="text"
            value={allowHandlesText}
            onChange={(event) => setAllowHandlesText(event.target.value)}
            placeholder="+15551234567, alice@icloud.com"
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
            <label className="block text-xs text-white/50">Poll Interval (seconds)</label>
            <SettingHelpPopover settingId="imessage.pollIntervalSeconds" />
          </div>
          <input
            type="number"
            min={5}
            max={300}
            value={pollIntervalSeconds}
            onChange={(event) => setPollIntervalSeconds(event.target.value)}
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
                <Step number={1} text="Install and run BlueBubbles Server on your Mac with Messages access enabled." />
                <Step number={2} text="Enable the BlueBubbles API and copy the server token." />
                <Step number={3} text="Set the server URL and token in this panel." />
                <Step number={4} text="Optionally set allowed handles and a default chat GUID for outbound notifications." />
                <Step number={5} text="Click Connect. Incoming iMessages are routed into shared sessions." />
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
      <div className="w-5 h-5 rounded-full bg-[#34C759]/20 text-[#6EE7B7] flex items-center justify-center flex-shrink-0 text-xs font-medium mt-0.5">
        {number}
      </div>
      <p className="text-xs text-white/50">{text}</p>
    </div>
  );
}
