import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';

export function LineSettings() {
  const platform = useIntegrationStore((s) => s.platforms.line);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.line);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);

  const [channelAccessToken, setChannelAccessToken] = useState('');
  const [defaultTargetId, setDefaultTargetId] = useState('');

  const connected = platform?.connected ?? false;
  const canConnect = channelAccessToken.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-white/80">Connection Status</p>
            <SettingHelpPopover settingId="line.connection" />
          </div>
          <PlatformStatusBadge platform="line" connected={connected} displayName={platform?.displayName} />
        </div>
        {connected ? (
          <button
            type="button"
            onClick={() => void disconnect('line')}
            disabled={isConnecting}
            className="px-3 py-2 rounded-lg text-xs bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20 disabled:opacity-50"
          >
            {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Disconnect'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              void connect('line', {
                channelAccessToken,
                defaultTargetId,
              })
            }
            disabled={!canConnect || isConnecting}
            className={cn(
              'px-3 py-2 rounded-lg text-xs text-white transition-colors disabled:opacity-50',
              canConnect ? 'bg-[#1D4ED8] hover:bg-[#3B82F6]' : 'bg-white/[0.06] text-white/35',
            )}
          >
            {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Connect'}
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-white/55">Channel Access Token</label>
          <SettingHelpPopover settingId="line.channelAccessToken" />
        </div>
        <input
          type="password"
          value={channelAccessToken}
          onChange={(event) => setChannelAccessToken(event.target.value)}
          placeholder="LINE channel access token"
          disabled={connected || isConnecting}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50 font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-white/55">Default Target ID (optional)</label>
          <SettingHelpPopover settingId="line.defaultTargetId" />
        </div>
        <input
          type="text"
          value={defaultTargetId}
          onChange={(event) => setDefaultTargetId(event.target.value)}
          placeholder="Default user/group ID (optional)"
          disabled={connected || isConnecting}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
        />
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
        <p className="text-[11px] text-white/55">
          Impact: enables `message` + `send_notification_line` when connected. Security: keep token private and scope
          app permissions minimally. Session behavior: changes apply immediately.
        </p>
      </div>
    </div>
  );
}
