import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationStore } from '../../stores/integration-store';
import { PlatformStatusBadge } from './PlatformStatusBadge';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';

export function TeamsSettings() {
  const platform = useIntegrationStore((s) => s.platforms.teams);
  const isConnecting = useIntegrationStore((s) => s.isConnecting.teams);
  const connect = useIntegrationStore((s) => s.connect);
  const disconnect = useIntegrationStore((s) => s.disconnect);

  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [teamId, setTeamId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState('30');
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const connected = platform?.connected ?? false;
  const displayName = platform?.displayName;
  const error = platform?.error;

  const canConnect =
    tenantId.trim().length > 0 &&
    clientId.trim().length > 0 &&
    clientSecret.trim().length > 0 &&
    teamId.trim().length > 0 &&
    channelId.trim().length > 0;

  const handleConnect = async () => {
    await connect('teams', {
      tenantId,
      clientId,
      clientSecret,
      teamId,
      channelId,
      pollIntervalSeconds: Number(pollIntervalSeconds) || 30,
    });
  };

  const handleDisconnect = async () => {
    await disconnect('teams');
    setClientSecret('');
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/90">Connection Status</h3>
              <SettingHelpPopover settingId="teams.connection" />
            </div>
            <div className="mt-2">
              <PlatformStatusBadge platform="teams" connected={connected} displayName={displayName} />
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
              style={canConnect ? { backgroundColor: '#6264A7' } : undefined}
              onMouseEnter={(event) => {
                if (canConnect && !isConnecting) {
                  event.currentTarget.style.backgroundColor = '#53559C';
                }
              }}
              onMouseLeave={(event) => {
                if (canConnect && !isConnecting) {
                  event.currentTarget.style.backgroundColor = '#6264A7';
                }
              }}
            >
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <h3 className="text-sm font-medium text-white/90">Azure Graph App Configuration</h3>

        <Field
          label="Tenant ID"
          value={tenantId}
          onChange={setTenantId}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          settingId="teams.tenantId"
          disabled={connected || isConnecting}
        />

        <Field
          label="Client ID"
          value={clientId}
          onChange={setClientId}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          settingId="teams.clientId"
          disabled={connected || isConnecting}
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs text-white/50">Client Secret</label>
            <SettingHelpPopover settingId="teams.clientSecret" />
          </div>
          <div className="relative">
            <input
              type={showClientSecret ? 'text' : 'password'}
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder="Azure app secret"
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
              onClick={() => setShowClientSecret(!showClientSecret)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Field
          label="Team ID"
          value={teamId}
          onChange={setTeamId}
          placeholder="19:xxxxxxxxxx@thread.tacv2"
          settingId="teams.teamId"
          disabled={connected || isConnecting}
        />

        <Field
          label="Channel ID"
          value={channelId}
          onChange={setChannelId}
          placeholder="19:yyyyyyyyyy@thread.tacv2"
          settingId="teams.channelId"
          disabled={connected || isConnecting}
        />

        <Field
          label="Poll Interval (seconds)"
          value={pollIntervalSeconds}
          onChange={setPollIntervalSeconds}
          placeholder="30"
          settingId="teams.pollIntervalSeconds"
          disabled={connected || isConnecting}
          type="number"
        />
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
                <Step number={1} text="Create an Azure AD app with Graph application permissions for Teams channel messages." />
                <Step number={2} text="Grant admin consent for the required Graph scopes in your tenant." />
                <Step number={3} text="Copy tenant ID, client ID, and create a client secret." />
                <Step number={4} text="Find the Team ID and Channel ID you want Cowork to monitor." />
                <Step number={5} text="Fill fields above and click Connect to enable full inbound/outbound Teams workflows." />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  settingId,
  disabled,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  settingId: string;
  disabled: boolean;
  type?: 'text' | 'number';
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-xs text-white/50">{label}</label>
        <SettingHelpPopover settingId={settingId} />
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 rounded-lg text-sm',
          'bg-[#0B0C10] border border-white/[0.08]',
          'text-white/90 placeholder:text-white/30',
          'focus:outline-none focus:border-[#1D4ED8]/50',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      />
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-[#6264A7]/20 text-[#C7D2FE] flex items-center justify-center flex-shrink-0 text-xs font-medium mt-0.5">
        {number}
      </div>
      <p className="text-xs text-white/50">{text}</p>
    </div>
  );
}
