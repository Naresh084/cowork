import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { PlatformStatusBadge } from './PlatformStatusBadge';

export function SlackSettings() {
  const platform = useIntegrationStore((s) => s.platforms.slack);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.slack);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);

  const [botToken, setBotToken] = useState('');
  const [appToken, setAppToken] = useState('');
  const [showBotToken, setShowBotToken] = useState(false);
  const [showAppToken, setShowAppToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const connected = platform?.connected ?? false;
  const displayName = platform?.displayName;
  const error = platform?.error;

  const handleConnect = async () => {
    await connect('slack', { botToken, appToken });
  };

  const handleDisconnect = async () => {
    await disconnect('slack');
    setBotToken('');
    setAppToken('');
  };

  const canConnect = botToken.trim().length > 0 && appToken.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Status Section */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white/90">Connection Status</h3>
            <div className="mt-2">
              <PlatformStatusBadge
                platform="slack"
                connected={connected}
                displayName={displayName}
              />
            </div>
            {error && (
              <p className="mt-2 text-xs text-[#FF5449]">{error}</p>
            )}
          </div>
          {connected ? (
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
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting || !canConnect}
              className={cn(
                'px-4 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-50',
                !canConnect && !isConnecting && 'bg-white/[0.06] text-white/30'
              )}
              style={canConnect ? { backgroundColor: '#9B59B6' } : undefined}
              onMouseEnter={(e) => {
                if (canConnect && !isConnecting)
                  e.currentTarget.style.backgroundColor = '#8E44AD';
              }}
              onMouseLeave={(e) => {
                if (canConnect && !isConnecting)
                  e.currentTarget.style.backgroundColor = '#9B59B6';
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

        {/* Bot Token */}
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Bot User OAuth Token</label>
          <div className="relative">
            <input
              type={showBotToken ? 'text' : 'password'}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="xoxb-..."
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
              onClick={() => setShowBotToken(!showBotToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showBotToken ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* App Token */}
        <div>
          <label className="block text-xs text-white/50 mb-1.5">App-Level Token</label>
          <div className="relative">
            <input
              type={showAppToken ? 'text' : 'password'}
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
              placeholder="xapp-..."
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
              onClick={() => setShowAppToken(!showAppToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showAppToken ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-white/40">
          Tokens are stored locally and never sent to external servers.
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
                <Step number={1} text="Go to api.slack.com/apps and create a new app (or select an existing one)." />
                <Step number={2} text="Under OAuth & Permissions, add the required bot scopes: chat:write, channels:history, channels:read, groups:read, im:read, mpim:read." />
                <Step number={3} text='Install the app to your workspace and copy the "Bot User OAuth Token" (starts with xoxb-).' />
                <Step number={4} text='Under Basic Information > App-Level Tokens, create a token with connections:write scope. Copy the token (starts with xapp-).' />
                <Step number={5} text="Paste both tokens above and click Connect." />
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
      <div className="w-5 h-5 rounded-full bg-[#9B59B6]/20 text-[#9B59B6] flex items-center justify-center flex-shrink-0 text-xs font-medium mt-0.5">
        {number}
      </div>
      <p className="text-xs text-white/50">{text}</p>
    </div>
  );
}
