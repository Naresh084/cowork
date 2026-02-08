import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Download,
  Globe2,
  Link2,
  Loader2,
  QrCode,
  RefreshCcw,
  Shield,
  ShieldOff,
  Smartphone,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRemoteAccessStore, type RemoteTunnelMode } from '@/stores/remote-access-store';

const tunnelModes: Array<{ id: RemoteTunnelMode; label: string; subtitle: string }> = [
  { id: 'tailscale', label: 'Tailscale', subtitle: 'Mesh + secure overlay (recommended)' },
  { id: 'cloudflare', label: 'Cloudflare Tunnel', subtitle: 'Managed quick tunnel with public HTTPS URL' },
  { id: 'custom', label: 'Custom', subtitle: 'Use your own secure reverse tunnel endpoint' },
];

function formatExpiry(epochMs: number): string {
  const diff = Math.max(0, epochMs - Date.now());
  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

export function RemoteAccessSettings() {
  const {
    status,
    pairingQr,
    isLoading,
    isGeneratingQr,
    isInstallingTunnel,
    isAuthenticatingTunnel,
    isStartingTunnel,
    error,
    loadStatus,
    refreshTunnel,
    enableRemoteAccess,
    disableRemoteAccess,
    installTunnelBinary,
    authenticateTunnel,
    startTunnel,
    stopTunnel,
    generatePairingQr,
    revokeDevice,
    setPublicBaseUrl,
    setTunnelMode,
    clearQr,
  } = useRemoteAccessStore();

  const [publicBaseUrl, setPublicBaseUrlDraft] = useState('');
  const [selectedMode, setSelectedMode] = useState<RemoteTunnelMode>('tailscale');
  const [expiresCountdown, setExpiresCountdown] = useState<string | null>(null);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status) return;
    setPublicBaseUrlDraft(status.publicBaseUrl || '');
    setSelectedMode(status.tunnelMode);
  }, [status]);

  useEffect(() => {
    if (!pairingQr) {
      setExpiresCountdown(null);
      return;
    }
    setExpiresCountdown(formatExpiry(pairingQr.expiresAt));
    const timer = setInterval(() => {
      setExpiresCountdown(formatExpiry(pairingQr.expiresAt));
      if (pairingQr.expiresAt <= Date.now()) {
        clearQr();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [pairingQr, clearQr]);

  const endpoint = useMemo(() => {
    if (!status) return null;
    return status.tunnelPublicUrl || status.publicBaseUrl || status.localBaseUrl;
  }, [status]);

  const isActive = Boolean(status?.enabled && status?.running);
  const hasUnsavedEndpoint = (status?.publicBaseUrl || '') !== publicBaseUrl.trim();
  const needsBinaryInstall = Boolean(status && status.tunnelMode !== 'custom' && !status.tunnelBinaryInstalled);
  const needsAuth = Boolean(
    status &&
      status.tunnelMode === 'tailscale' &&
      status.tunnelBinaryInstalled &&
      status.tunnelAuthStatus !== 'authenticated',
  );
  const tunnelRunning = status?.tunnelState === 'running';

  return (
    <div className="space-y-5" data-tour-id="settings-remote-section">
      <div className="rounded-2xl border border-[#2A6AF2]/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(37,99,235,0.22),rgba(13,16,24,0.85))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/70">
              <Shield className="h-3.5 w-3.5" />
              Remote Access Mesh
            </div>
            <h3 className="text-lg font-semibold text-white/95">Secure phone access to Cowork</h3>
            <p className="max-w-2xl text-sm text-white/70">
              Configure, install, authenticate, and start secure remote tunneling fully from this UI.
            </p>
          </div>
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
              isActive
                ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-300'
                : 'border-white/10 bg-white/[0.06] text-white/60',
            )}
          >
            {isActive ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
            {isActive ? 'Gateway Active' : 'Gateway Disabled'}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Endpoint</p>
            <p className="mt-1 truncate text-sm text-white/90">{endpoint || 'Not configured'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Tunnel state</p>
            <p className="mt-1 text-sm text-white/90">{status?.tunnelState || 'stopped'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Paired devices</p>
            <p className="mt-1 text-sm text-white/90">{status?.deviceCount ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-medium text-white/90">Tunnel Configuration</h4>
          <button
            type="button"
            onClick={() => void refreshTunnel()}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh health
          </button>
        </div>

        <div className="grid gap-2">
          {tunnelModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSelectedMode(mode.id)}
              className={cn(
                'rounded-xl border px-3 py-2 text-left transition-colors',
                selectedMode === mode.id
                  ? 'border-[#4B83FF] bg-[#1D4ED8]/15'
                  : 'border-white/[0.1] bg-black/20 hover:bg-white/[0.04]',
              )}
            >
              <p className="text-sm text-white/90">{mode.label}</p>
              <p className="text-xs text-white/50">{mode.subtitle}</p>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
          <label className="mb-1.5 inline-flex items-center gap-1.5 text-xs text-white/60">
            <Globe2 className="h-3.5 w-3.5" />
            Public base URL (optional for managed mode, required for custom mode)
          </label>
          <input
            type="text"
            value={publicBaseUrl}
            onChange={(event) => setPublicBaseUrlDraft(event.target.value)}
            placeholder="https://your-endpoint.example.com"
            className="w-full rounded-lg border border-white/[0.12] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-[#3B82F6]/70 focus:outline-none"
          />
        </div>

        <div className="grid gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3 text-xs text-white/65 md:grid-cols-3">
          <div>
            <p className="text-white/45">Dependency</p>
            <p className="mt-1 text-white/90">
              {status?.tunnelBinaryInstalled ? status.tunnelBinaryPath || 'Installed' : 'Missing'}
            </p>
          </div>
          <div>
            <p className="text-white/45">Authentication</p>
            <p className="mt-1 text-white/90">{status?.tunnelAuthStatus || 'unknown'}</p>
          </div>
          <div>
            <p className="text-white/45">Runtime</p>
            <p className="mt-1 text-white/90">{status?.tunnelState || 'stopped'}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void setTunnelMode(selectedMode)}
            className="rounded-lg border border-white/[0.15] bg-white/[0.04] px-3 py-2 text-sm text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
          >
            Save tunnel mode
          </button>
          <button
            type="button"
            disabled={isLoading || !hasUnsavedEndpoint}
            onClick={() => void setPublicBaseUrl(publicBaseUrl.trim() || null)}
            className="rounded-lg border border-white/[0.15] bg-white/[0.04] px-3 py-2 text-sm text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
          >
            Save endpoint
          </button>
          {status?.enabled ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void disableRemoteAccess()}
              className="rounded-lg border border-[#FF6A6A]/45 bg-[#FF5449]/12 px-3 py-2 text-sm text-[#FF9F9A] hover:bg-[#FF5449]/20 disabled:opacity-50"
            >
              Disable remote access
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                void enableRemoteAccess({
                  publicBaseUrl: publicBaseUrl.trim() || null,
                  tunnelMode: selectedMode,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
            >
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enable remote access
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isInstallingTunnel || !needsBinaryInstall}
            onClick={() => void installTunnelBinary()}
            className="inline-flex items-center gap-1 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
          >
            {isInstallingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Install dependency
          </button>
          <button
            type="button"
            disabled={isAuthenticatingTunnel || !needsAuth}
            onClick={() => void authenticateTunnel()}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.15] bg-white/[0.04] px-3 py-2 text-sm text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
          >
            {isAuthenticatingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
            Authenticate
          </button>
          <button
            type="button"
            disabled={isStartingTunnel || tunnelRunning}
            onClick={() => void startTunnel()}
            className="inline-flex items-center gap-1 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
          >
            {isStartingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Start tunnel
          </button>
          <button
            type="button"
            disabled={isStartingTunnel || !tunnelRunning}
            onClick={() => void stopTunnel()}
            className="rounded-lg border border-[#FF6A6A]/45 bg-[#FF5449]/12 px-3 py-2 text-sm text-[#FF9F9A] hover:bg-[#FF5449]/20 disabled:opacity-50"
          >
            Stop tunnel
          </button>
        </div>

        {!!status?.tunnelHints?.length && (
          <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-3">
            <p className="text-xs text-white/45">Fallback commands (if managed controls fail)</p>
            {status.tunnelHints.map((hint, index) => (
              <code
                key={`${hint}-${index}`}
                className="block overflow-x-auto rounded-lg border border-white/[0.1] bg-[#090A0F] px-2.5 py-2 text-xs text-[#9EC0FF]"
              >
                {hint}
              </code>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-white/90">Pair Mobile App</h4>
            <p className="text-xs text-white/50">
              Users scan this QR from iPhone/Android to link securely. QR expires quickly.
            </p>
          </div>
          <button
            type="button"
            disabled={!status?.enabled || !endpoint || isGeneratingQr}
            onClick={() => void generatePairingQr()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
          >
            {isGeneratingQr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
            Generate QR
          </button>
        </div>

        {pairingQr ? (
          <div className="grid gap-4 md:grid-cols-[auto_1fr]">
            <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
              <img src={pairingQr.qrDataUrl} alt="Remote access pairing QR code" className="h-52 w-52 rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/40">QR expires in</p>
                <p className="mt-1 font-mono text-lg text-white/90">{expiresCountdown || '00:00'}</p>
              </div>
              <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/40">Pairing link</p>
                <p className="mt-1 break-all text-xs text-white/80">{pairingQr.pairingUri}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/[0.12] bg-black/15 px-4 py-5 text-sm text-white/45">
            Generate a QR code to pair the mobile app.
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h4 className="text-sm font-medium text-white/90">Paired Devices</h4>
        {(status?.devices?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.12] bg-black/15 px-4 py-5 text-sm text-white/45">
            No paired devices yet.
          </div>
        ) : (
          <div className="space-y-2">
            {status!.devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.1] bg-black/20 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm text-white/90">
                    <Smartphone className="h-3.5 w-3.5 flex-shrink-0 text-white/60" />
                    {device.name}
                  </p>
                  <p className="text-xs text-white/45">
                    {device.platform} · Last used {formatTimestamp(device.lastUsedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {device.revokedAt ? (
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/55">Revoked</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void revokeDevice(device.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#FF6A6A]/45 bg-[#FF5449]/12 px-2.5 py-1.5 text-xs text-[#FF9F9A] hover:bg-[#FF5449]/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(error || status?.tunnelLastError) && (
        <div className="rounded-xl border border-[#FF6A6A]/35 bg-[#FF5449]/10 px-3 py-2 text-sm text-[#FFB1AB]">
          {error || status?.tunnelLastError}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3 text-xs text-white/50">
        <p className="font-medium text-white/70">Important constraints</p>
        <p className="mt-1">Mobile app can manage schedules (pause/resume/run) but does not expose manual create forms.</p>
        <p className="mt-1">Schedule creation/editing remains chat-driven for safety and auditability.</p>
        <p className="mt-1 inline-flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          Use a HTTPS tunnel endpoint for internet access outside local Wi-Fi.
        </p>
      </div>
    </div>
  );
}
