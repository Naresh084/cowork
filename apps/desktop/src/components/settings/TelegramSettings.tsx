// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';

export function TelegramSettings() {
  const platform = useIntegrationStore((s) => s.platforms.telegram);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.telegram);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);
  const reconnect = useIntegrationStore((s) => s.reconnect);

  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const connected = platform?.connected ?? false;
  const displayName = platform?.displayName;
  const error = platform?.error;
  const health = platform?.health;
  const healthMessage = platform?.healthMessage;
  const requiresReconnect = Boolean(platform?.requiresReconnect || health === 'unhealthy');

  const handleConnect = async () => {
    await connect('telegram', { botToken });
  };

  const handleDisconnect = async () => {
    await disconnect('telegram');
    setBotToken('');
  };

  const handleReconnect = async () => {
    await reconnect('telegram');
  };

  const canConnect = botToken.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Status Section */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/90">Connection Status</h3>
              <SettingHelpPopover settingId="telegram.connection" />
            </div>
            <div className="mt-2">
              <PlatformStatusBadge
                platform="telegram"
                connected={connected}
                displayName={displayName}
                health={health}
                requiresReconnect={requiresReconnect}
              />
            </div>
            {error && (
              <p className="mt-2 text-xs text-[#FF5449]">{error}</p>
            )}
            {connected && healthMessage && (
              <p className={cn('mt-2 text-xs', requiresReconnect ? 'text-[#FCA5A5]' : 'text-[#FCD34D]')}>
                {healthMessage}
              </p>
            )}
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
                {isConnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Disconnect'
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting || !canConnect}
              className={cn(
                'px-4 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-50',
                !canConnect && !isConnecting && 'bg-white/[0.06] text-white/30'
              )}
              style={canConnect ? { backgroundColor: '#2AABEE' } : undefined}
              onMouseEnter={(e) => {
                if (canConnect && !isConnecting)
                  e.currentTarget.style.backgroundColor = '#229ED9';
              }}
              onMouseLeave={(e) => {
                if (canConnect && !isConnecting)
                  e.currentTarget.style.backgroundColor = '#2AABEE';
              }}
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Connect'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Token Configuration */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <h3 className="text-sm font-medium text-white/90">Authentication</h3>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Bot Token</label>
            <SettingHelpPopover settingId="telegram.botToken" />
          </div>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456:ABC-DEF..."
              disabled={connected || isConnecting}
              className={cn(
                'w-full px-3 py-2 pr-10 rounded-lg text-sm',
                'bg-[#0B0C10] border border-white/[0.08]',
                'text-white/90 placeholder:text-white/30',
                'focus:outline-none focus:border-[#1D4ED8]/50',
                'font-mono',
                connected && 'opacity-50 cursor-not-allowed'
              )}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showToken ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-white/40">
          Token is stored locally and never sent to external servers.
        </p>
      </div>

      {/* Setup Guide */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-medium text-white/90">How to connect</span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-white/40 transition-transform',
              showGuide && 'rotate-180'
            )}
          />
        </button>
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                <Step number={1} text="Open Telegram and search for @BotFather." />
                <Step number={2} text="Send /newbot and follow the prompts to create a new bot." />
                <Step number={3} text="Copy the bot token provided by BotFather." />
                <Step number={4} text="Paste the token above and click Connect." />
                <Step number={5} text="Start a conversation with your bot in Telegram to begin receiving messages." />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-[#2AABEE]/20 text-[#2AABEE] flex items-center justify-center flex-shrink-0 text-xs font-medium mt-0.5">
        {number}
      </div>
      <p className="text-xs text-white/50">{text}</p>
    </div>
  );
}
