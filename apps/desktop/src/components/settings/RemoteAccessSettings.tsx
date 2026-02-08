import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  Download,
  Globe2,
  Link2,
  Loader2,
  Lock,
  PlayCircle,
  QrCode,
  RefreshCcw,
  Shield,
  ShieldOff,
  Smartphone,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { useRemoteAccessStore, type RemoteTunnelMode } from '@/stores/remote-access-store';

const tunnelModes: Array<{ id: RemoteTunnelMode; label: string; subtitle: string }> = [
  { id: 'tailscale', label: 'Tailscale', subtitle: 'Mesh overlay with auth + secure routing' },
  { id: 'cloudflare', label: 'Cloudflare Tunnel', subtitle: 'Managed HTTPS tunnel with quick public URL' },
  { id: 'custom', label: 'Custom endpoint', subtitle: 'Use your own secure reverse tunnel URL' },
];

type WizardState = 'done' | 'active' | 'locked';

function formatExpiry(epochMs: number): string {
  const diff = Math.max(0, epochMs - Date.now());
  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

function StepStatePill({ state }: { state: WizardState }) {
  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </span>
    );
  }

  if (state === 'locked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/55">
        <Lock className="h-3 w-3" />
        Locked
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#4B83FF]/40 bg-[#1D4ED8]/18 px-2 py-0.5 text-[11px] text-[#C9DAFF]">
      <CircleDashed className="h-3 w-3" />
      Action required
    </span>
  );
}

interface SetupStepCardProps {
  step: number;
  title: string;
  description: string;
  state: WizardState;
  children: ReactNode;
}

function SetupStepCard({ step, title, description, state, children }: SetupStepCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        state === 'done'
          ? 'border-emerald-400/25 bg-emerald-500/[0.06]'
          : state === 'locked'
            ? 'border-white/[0.08] bg-white/[0.01]'
            : 'border-[#3A76FF]/35 bg-[#1D4ED8]/[0.08]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold',
              state === 'done'
                ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-200'
                : state === 'locked'
                  ? 'border-white/20 bg-white/[0.03] text-white/60'
                  : 'border-[#4B83FF]/50 bg-[#1D4ED8]/30 text-[#D7E3FF]',
            )}
          >
            {step}
          </div>
          <div>
            <h5 className="text-sm font-semibold text-white/95">{title}</h5>
            <p className="mt-0.5 text-xs text-white/60">{description}</p>
          </div>
        </div>
        <StepStatePill state={state} />
      </div>

      <div className="mt-3">{children}</div>
    </div>
  );
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
  const [isApplyingStepOne, setIsApplyingStepOne] = useState(false);

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

  const draftEndpoint = publicBaseUrl.trim();
  const customEndpointMissing = selectedMode === 'custom' && draftEndpoint.length === 0;
  const tunnelRunning = status?.tunnelState === 'running';

  const stepOneComplete = Boolean(
    status &&
      status.enabled &&
      status.tunnelMode === selectedMode &&
      (selectedMode !== 'custom' || Boolean(status.publicBaseUrl)),
  );

  const installNeeded = Boolean(status && status.tunnelMode !== 'custom');
  const stepTwoComplete = Boolean(stepOneComplete && (!installNeeded || status?.tunnelBinaryInstalled));

  const authNeeded = Boolean(status && status.tunnelMode === 'tailscale');
  const stepThreeComplete = Boolean(stepTwoComplete && (!authNeeded || status?.tunnelAuthStatus === 'authenticated'));

  const stepFourComplete = Boolean(stepThreeComplete && tunnelRunning);

  const stepTwoState: WizardState = !stepOneComplete ? 'locked' : stepTwoComplete ? 'done' : 'active';
  const stepThreeState: WizardState = !stepTwoComplete ? 'locked' : stepThreeComplete ? 'done' : 'active';
  const stepFourState: WizardState = !stepThreeComplete ? 'locked' : stepFourComplete ? 'done' : 'active';
  const stepFiveState: WizardState = !stepFourComplete ? 'locked' : pairingQr ? 'done' : 'active';

  const runStepOne = async () => {
    if (!status) return;

    if (customEndpointMissing) {
      toast.error('Public endpoint required', 'Enter a HTTPS endpoint for custom tunnel mode before continuing.');
      return;
    }

    const nextPublicBaseUrl = draftEndpoint || null;
    setIsApplyingStepOne(true);

    try {
      if (!status.enabled) {
        await enableRemoteAccess({
          tunnelMode: selectedMode,
          publicBaseUrl: nextPublicBaseUrl,
        });
      } else {
        if (status.tunnelMode !== selectedMode) {
          await setTunnelMode(selectedMode);
        }

        const currentPublic = status.publicBaseUrl || '';
        const nextPublic = nextPublicBaseUrl || '';
        if (currentPublic !== nextPublic) {
          await setPublicBaseUrl(nextPublicBaseUrl);
        }

        await refreshTunnel();
      }
    } finally {
      setIsApplyingStepOne(false);
    }
  };

  return (
    <div className="space-y-5" data-tour-id="settings-remote-section">
      <div className="rounded-2xl border border-[#2A6AF2]/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(37,99,235,0.22),rgba(13,16,24,0.85))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/70">
              <Shield className="h-3.5 w-3.5" />
              Remote Setup Wizard
            </div>
            <h3 className="text-lg font-semibold text-white/95">Set up tunnel access in guided steps</h3>
            <p className="max-w-2xl text-sm text-white/70">
              Follow each step in order: choose mode, install dependency, authenticate, start tunnel, then pair your phone.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshTunnel()}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              Refresh
            </button>

            {status?.enabled ? (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void disableRemoteAccess()}
                className="rounded-lg border border-[#FF6A6A]/45 bg-[#FF5449]/12 px-2.5 py-1.5 text-xs text-[#FF9F9A] hover:bg-[#FF5449]/20 disabled:opacity-50"
              >
                Disable remote
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Status</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/90">
              {status?.enabled ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" /> : <ShieldOff className="h-3.5 w-3.5 text-white/55" />}
              {status?.enabled ? 'Remote gateway enabled' : 'Remote gateway disabled'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Active endpoint</p>
            <p className="mt-1 truncate text-sm text-white/90">{endpoint || 'Not available yet'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Tunnel runtime</p>
            <p className="mt-1 text-sm text-white/90">{status?.tunnelState || 'stopped'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <SetupStepCard
          step={1}
          title="Choose tunnel mode and save setup"
          description="Select your tunnel provider and optional endpoint, then apply configuration."
          state={stepOneComplete ? 'done' : 'active'}
        >
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
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
                Public base URL ({selectedMode === 'custom' ? 'required' : 'optional'})
              </label>
              <input
                type="text"
                value={publicBaseUrl}
                onChange={(event) => setPublicBaseUrlDraft(event.target.value)}
                placeholder="https://your-endpoint.example.com"
                className="w-full rounded-lg border border-white/[0.12] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-[#3B82F6]/70 focus:outline-none"
              />
              {customEndpointMissing ? (
                <p className="mt-1.5 text-xs text-[#FF9F9A]">Custom mode needs a public HTTPS endpoint URL.</p>
              ) : (
                <p className="mt-1.5 text-xs text-white/45">
                  For managed modes, this can stay empty and Cowork will infer or set it after tunnel start.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isApplyingStepOne || isLoading}
                onClick={() => void runStepOne()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
              >
                {isApplyingStepOne ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                Apply step 1
              </button>
              <p className="text-xs text-white/55">
                Current: {status?.tunnelMode || 'unknown'} · endpoint {status?.publicBaseUrl || 'not set'}
              </p>
            </div>
          </div>
        </SetupStepCard>

        <SetupStepCard
          step={2}
          title="Install tunnel dependency"
          description="Install required local binary for selected tunnel mode."
          state={stepTwoState}
        >
          <div className="grid gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3 text-xs text-white/65 md:grid-cols-2">
            <div>
              <p className="text-white/45">Dependency</p>
              <p className="mt-1 text-white/90">{status?.tunnelBinaryInstalled ? status.tunnelBinaryPath || 'Installed' : 'Missing'}</p>
            </div>
            <div>
              <p className="text-white/45">Mode</p>
              <p className="mt-1 text-white/90">{status?.tunnelMode || selectedMode}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={stepTwoState !== 'active' || isInstallingTunnel || !installNeeded || Boolean(status?.tunnelBinaryInstalled)}
              onClick={() => void installTunnelBinary()}
              className="inline-flex items-center gap-1 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
            >
              {isInstallingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Install dependency
            </button>
            {!installNeeded ? (
              <p className="text-xs text-white/50">Custom mode uses your existing endpoint and does not require auto-install.</p>
            ) : null}
          </div>
        </SetupStepCard>

        <SetupStepCard
          step={3}
          title="Authenticate tunnel"
          description="Authenticate provider if the chosen mode requires it."
          state={stepThreeState}
        >
          <div className="grid gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3 text-xs text-white/65 md:grid-cols-2">
            <div>
              <p className="text-white/45">Authentication status</p>
              <p className="mt-1 text-white/90">{status?.tunnelAuthStatus || 'unknown'}</p>
            </div>
            <div>
              <p className="text-white/45">Required</p>
              <p className="mt-1 text-white/90">{authNeeded ? 'Yes' : 'No'}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                stepThreeState !== 'active' ||
                isAuthenticatingTunnel ||
                !authNeeded ||
                status?.tunnelAuthStatus === 'authenticated'
              }
              onClick={() => void authenticateTunnel()}
              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.15] bg-white/[0.04] px-3 py-2 text-sm text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
            >
              {isAuthenticatingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
              Authenticate
            </button>
            {!authNeeded ? <p className="text-xs text-white/50">This mode does not require an extra auth step.</p> : null}
          </div>
        </SetupStepCard>

        <SetupStepCard
          step={4}
          title="Start tunnel"
          description="Launch the tunnel process and verify endpoint reachability."
          state={stepFourState}
        >
          <div className="grid gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3 text-xs text-white/65 md:grid-cols-3">
            <div>
              <p className="text-white/45">Runtime</p>
              <p className="mt-1 text-white/90">{status?.tunnelState || 'stopped'}</p>
            </div>
            <div>
              <p className="text-white/45">Public URL</p>
              <p className="mt-1 truncate text-white/90">{status?.tunnelPublicUrl || status?.publicBaseUrl || 'Not ready'}</p>
            </div>
            <div>
              <p className="text-white/45">PID</p>
              <p className="mt-1 text-white/90">{status?.tunnelPid ?? 'n/a'}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={stepFourState === 'locked' || isStartingTunnel || tunnelRunning}
              onClick={() => void startTunnel()}
              className="inline-flex items-center gap-1 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
            >
              {isStartingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              Start tunnel
            </button>
            <button
              type="button"
              disabled={stepFourState === 'locked' || isStartingTunnel || !tunnelRunning}
              onClick={() => void stopTunnel()}
              className="rounded-lg border border-[#FF6A6A]/45 bg-[#FF5449]/12 px-3 py-2 text-sm text-[#FF9F9A] hover:bg-[#FF5449]/20 disabled:opacity-50"
            >
              Stop tunnel
            </button>
          </div>

          {!!status?.tunnelHints?.length && (
            <div className="mt-3 space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <p className="text-xs text-white/45">Fallback commands (only if managed actions fail)</p>
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
        </SetupStepCard>

        <SetupStepCard
          step={5}
          title="Pair phone with QR"
          description="Generate one-time QR after tunnel is running and scan from iPhone/Android app."
          state={stepFiveState}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/55">QR can only be generated after tunnel setup is complete and endpoint is reachable.</p>
            <button
              type="button"
              disabled={!stepFourComplete || !endpoint || isGeneratingQr}
              onClick={() => void generatePairingQr()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
            >
              {isGeneratingQr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              Generate QR
            </button>
          </div>

          {pairingQr ? (
            <div className="mt-3 grid gap-4 md:grid-cols-[auto_1fr]">
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
            <div className="mt-3 rounded-xl border border-dashed border-white/[0.12] bg-black/15 px-4 py-5 text-sm text-white/45">
              Complete steps 1-4, then generate a QR code to pair the mobile app.
            </div>
          )}
        </SetupStepCard>
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
