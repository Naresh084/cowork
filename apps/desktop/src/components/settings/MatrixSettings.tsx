import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';

export function MatrixSettings() {
  const platform = useIntegrationStore((s) => s.platforms.matrix);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.matrix);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);

  const [homeserverUrl, setHomeserverUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [defaultRoomId, setDefaultRoomId] = useState('');

  const connected = platform?.connected ?? false;
  const canConnect = homeserverUrl.trim().length > 0 && accessToken.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-white/80">Connection Status</p>
            <SettingHelpPopover settingId="matrix.connection" />
          </div>
          <PlatformStatusBadge platform="matrix" connected={connected} displayName={platform?.displayName} />
        </div>
        {connected ? (
          <button
            type="button"
            onClick={() => void disconnect('matrix')}
            disabled={isConnecting}
            className="px-3 py-2 rounded-lg text-xs bg-[#FF5449]/10 text-[#FF5449] hover:bg-[#FF5449]/20 disabled:opacity-50"
          >
            {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Disconnect'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              void connect('matrix', {
                homeserverUrl,
                accessToken,
                defaultRoomId,
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
          <label className="text-xs text-white/55">Homeserver URL</label>
          <SettingHelpPopover settingId="matrix.homeserverUrl" />
        </div>
        <input
          type="text"
          value={homeserverUrl}
          onChange={(event) => setHomeserverUrl(event.target.value)}
          placeholder="Homeserver URL (e.g. https://matrix.org)"
          disabled={connected || isConnecting}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-white/55">Access Token</label>
          <SettingHelpPopover settingId="matrix.accessToken" />
        </div>
        <input
          type="password"
          value={accessToken}
          onChange={(event) => setAccessToken(event.target.value)}
          placeholder="Access token"
          disabled={connected || isConnecting}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50 font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-white/55">Default Room ID (optional)</label>
          <SettingHelpPopover settingId="matrix.defaultRoomId" />
        </div>
        <input
          type="text"
          value={defaultRoomId}
          onChange={(event) => setDefaultRoomId(event.target.value)}
          placeholder="Default room ID (optional)"
          disabled={connected || isConnecting}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[#0B0C10] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#1D4ED8]/50"
        />
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
        <p className="text-[11px] text-white/55">
          Impact: enables `message` + `send_notification_matrix` when connected. Security: prefer bot-scoped tokens and
          private rooms. Session behavior: applies immediately to integration tools.
        </p>
      </div>
    </div>
  );
}
