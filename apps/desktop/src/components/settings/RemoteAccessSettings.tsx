import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  Download,
  Globe2,
  Info,
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
import {
  useRemoteAccessStore,
  type RemoteTunnelMode,
  type RemoteTunnelVisibility,
} from '@/stores/remote-access-store';

const tunnelModes: Array<{
  id: RemoteTunnelMode;
  label: string;
  subtitle: string;
  installLabel: string;
  authLabel: string;
}> = [
  {
    id: 'tailscale',
    label: 'Tailscale',
    subtitle: 'Private mesh networking with optional public funnel.',
    installLabel: 'tailscale',
    authLabel: 'Tailscale login',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Tunnel',
    subtitle: 'Managed HTTPS tunnel with quick URL or your own domain.',
    installLabel: 'cloudflared',
    authLabel: 'Cloudflare tunnel login',
  },
  {
    id: 'custom',
    label: 'Custom endpoint',
    subtitle: 'Use your own tunnel/reverse proxy URL.',
    installLabel: 'none',
    authLabel: 'not required',
  },
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

function normalizeDomainInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const withScheme = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    return parsed.hostname.replace(/\.$/, '').toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.replace(/\.$/, '')
      .toLowerCase();
  }
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
    setTunnelMode,
    setTunnelOptions,
    clearQr,
  } = useRemoteAccessStore();

  const [selectedMode, setSelectedMode] = useState<RemoteTunnelMode>('tailscale');
  const [publicBaseUrlDraft, setPublicBaseUrlDraft] = useState('');
  const [tunnelNameDraft, setTunnelNameDraft] = useState('');
  const [tunnelDomainDraft, setTunnelDomainDraft] = useState('');
  const [tunnelVisibilityDraft, setTunnelVisibilityDraft] = useState<RemoteTunnelVisibility>('public');
  const [expiresCountdown, setExpiresCountdown] = useState<string | null>(null);
  const [isApplyingProvider, setIsApplyingProvider] = useState(false);
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status) return;
    setSelectedMode(status.tunnelMode);
    setPublicBaseUrlDraft(status.publicBaseUrl || '');
    setTunnelNameDraft(status.tunnelName || '');
    setTunnelDomainDraft(status.tunnelDomain || '');
    setTunnelVisibilityDraft(status.tunnelVisibility || 'public');
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

  const selectedProvider = useMemo(
    () => tunnelModes.find((mode) => mode.id === selectedMode) ?? tunnelModes[0],
    [selectedMode],
  );

  const normalizedDomainDraft = normalizeDomainInput(tunnelDomainDraft);
  const endpoint = useMemo(() => {
    if (!status) return null;
    return status.tunnelPublicUrl || status.publicBaseUrl || status.localBaseUrl;
  }, [status]);

  const installNeeded = selectedMode !== 'custom';
  const authNeeded =
    selectedMode === 'tailscale' || (selectedMode === 'cloudflare' && Boolean((status?.tunnelDomain || normalizedDomainDraft).trim()));
  const customEndpointMissing = selectedMode === 'custom' && !publicBaseUrlDraft.trim() && !normalizedDomainDraft;
  const tunnelRunning = status?.tunnelState === 'running';

  const stepOneComplete = Boolean(status && status.tunnelMode === selectedMode);
  const stepTwoComplete = Boolean(
    status &&
      stepOneComplete &&
      (status.tunnelName || '') === tunnelNameDraft.trim() &&
      (status.tunnelDomain || '') === normalizedDomainDraft &&
      status.tunnelVisibility === tunnelVisibilityDraft &&
      (!customEndpointMissing && (selectedMode !== 'custom' || Boolean(status.publicBaseUrl))),
  );
  const stepThreeComplete = Boolean(stepTwoComplete && (!installNeeded || status?.tunnelBinaryInstalled));
  const stepFourComplete = Boolean(stepThreeComplete && (!authNeeded || status?.tunnelAuthStatus === 'authenticated'));
  const stepFiveComplete = Boolean(stepFourComplete && tunnelRunning && endpoint);

  const stepThreeState: WizardState = !stepTwoComplete ? 'locked' : stepThreeComplete ? 'done' : 'active';
  const stepFourState: WizardState = !stepThreeComplete ? 'locked' : stepFourComplete ? 'done' : 'active';
  const stepFiveState: WizardState = !stepFourComplete ? 'locked' : stepFiveComplete ? 'done' : 'active';
  const stepSixState: WizardState = !stepFiveComplete ? 'locked' : pairingQr ? 'done' : 'active';

  const applyProviderStep = async () => {
    if (!status) return;
    if (status.tunnelMode === selectedMode) {
      toast.success('Tunnel provider already selected');
      return;
    }

    setIsApplyingProvider(true);
    try {
      await setTunnelMode(selectedMode);
      await refreshTunnel();
    } finally {
      setIsApplyingProvider(false);
    }
  };

  const applyConfigurationStep = async () => {
    if (!status) return;

    if (customEndpointMissing) {
      toast.error('Endpoint required', 'Custom mode needs a public base URL or custom domain before continuing.');
      return;
    }

    const normalizedTunnelName = tunnelNameDraft.trim() || null;
    const normalizedPublicBaseUrl = publicBaseUrlDraft.trim() || null;
    const normalizedVisibility: RemoteTunnelVisibility = selectedMode === 'cloudflare' ? 'public' : tunnelVisibilityDraft;

    const approved = window.confirm(
      [
        `Apply ${selectedProvider.label} configuration?`,
        '',
        `Tunnel name: ${normalizedTunnelName || 'not set'}`,
        `Domain: ${normalizedDomainDraft || 'not set'}`,
        `Visibility: ${normalizedVisibility}`,
        `Endpoint override: ${normalizedPublicBaseUrl || 'none'}`,
        '',
        'If tunnel options changed while running, Cowork will restart the managed tunnel safely.',
      ].join('\n'),
    );

    if (!approved) return;

    setIsApplyingConfig(true);
    try {
      if (!status.enabled) {
        await enableRemoteAccess({
          tunnelMode: selectedMode,
          tunnelName: normalizedTunnelName,
          tunnelDomain: normalizedDomainDraft || null,
          tunnelVisibility: normalizedVisibility,
          publicBaseUrl: normalizedPublicBaseUrl,
        });
      } else {
        if (status.tunnelMode !== selectedMode) {
          await setTunnelMode(selectedMode);
        }

        await setTunnelOptions({
          tunnelName: normalizedTunnelName,
          tunnelDomain: normalizedDomainDraft || null,
          tunnelVisibility: normalizedVisibility,
          publicBaseUrl: normalizedPublicBaseUrl,
        });
      }

      await refreshTunnel();
    } finally {
      setIsApplyingConfig(false);
    }
  };

  const installProviderDependency = async () => {
    if (!installNeeded) return;
    const approved = window.confirm(
      `Install ${selectedProvider.installLabel} automatically on this machine? You can still use manual installation if needed.`,
    );
    if (!approved) return;
    await installTunnelBinary();
  };

  const authenticateProvider = async () => {
    const approved = window.confirm(
      [
        `Run ${selectedProvider.authLabel}?`,
        '',
        selectedMode === 'tailscale'
          ? 'This may trigger OS permission prompts and open a browser flow.'
          : 'This may open a browser login flow to authorize Cloudflare domain routing.',
      ].join('\n'),
    );
    if (!approved) return;
    await authenticateTunnel();
  };

  const startTunnelStep = async () => {
    const approved = window.confirm(
      [
        `Start ${selectedProvider.label} tunnel now?`,
        '',
        'Cowork will expose your selected local service through your configured secure endpoint.',
      ].join('\n'),
    );
    if (!approved) return;
    await startTunnel();
  };

  return (
    <div className="space-y-5" data-tour-id="settings-remote-section">
      <div className="rounded-2xl border border-[#2A6AF2]/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(37,99,235,0.22),rgba(13,16,24,0.85))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/70">
              <Shield className="h-3.5 w-3.5" />
              Guided Remote Setup
            </div>
            <h3 className="text-lg font-semibold text-white/95">Secure internet access for phone control</h3>
            <p className="max-w-3xl text-sm text-white/70">
              Cowork runs locally on your desktop. This wizard sets up a secure tunnel so your iPhone/Android app can reach it from anywhere,
              not just the same Wi-Fi.
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

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Gateway</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/90">
              {status?.enabled ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" /> : <ShieldOff className="h-3.5 w-3.5 text-white/55" />}
              {status?.enabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Provider</p>
            <p className="mt-1 text-sm text-white/90">{selectedProvider.label}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Endpoint</p>
            <p className="mt-1 truncate text-sm text-white/90">{endpoint || 'Not ready'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Tunnel runtime</p>
            <p className="mt-1 text-sm text-white/90">{status?.tunnelState || 'stopped'}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[#3A76FF]/30 bg-[#1D4ED8]/12 p-3 text-xs text-[#C9DAFF]">
          <p className="font-medium">Setup plan</p>
          <p className="mt-1">
            1) Select provider, 2) configure domain/name/access policy, 3) install dependency, 4) authenticate, 5) start tunnel, 6) pair phone.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <SetupStepCard
          step={1}
          title="Choose tunnel provider"
          description="Pick one provider first. Later steps adapt automatically for this provider."
          state={stepOneComplete ? 'done' : 'active'}
        >
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isApplyingProvider || isLoading}
              onClick={() => void applyProviderStep()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
            >
              {isApplyingProvider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              Save provider
            </button>
            <p className="text-xs text-white/55">Current saved provider: {status?.tunnelMode || 'unknown'}</p>
          </div>
        </SetupStepCard>

        <SetupStepCard
          step={2}
          title="Configure tunnel options"
          description="Set tunnel name, domain/private endpoint, and visibility policy from UI."
          state={!stepOneComplete ? 'locked' : stepTwoComplete ? 'done' : 'active'}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
              <label className="mb-1.5 block text-xs text-white/60">Tunnel name (optional)</label>
              <input
                type="text"
                value={tunnelNameDraft}
                onChange={(event) => setTunnelNameDraft(event.target.value)}
                placeholder="my-cowork-tunnel"
                className="w-full rounded-lg border border-white/[0.12] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-[#3B82F6]/70 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-white/45">Friendly name used in Cowork and provider setup context.</p>
            </div>

            <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
              <label className="mb-1.5 inline-flex items-center gap-1.5 text-xs text-white/60">
                <Globe2 className="h-3.5 w-3.5" />
                Domain (optional)
              </label>
              <input
                type="text"
                value={tunnelDomainDraft}
                onChange={(event) => setTunnelDomainDraft(event.target.value)}
                placeholder="chat.example.com"
                className="w-full rounded-lg border border-white/[0.12] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-[#3B82F6]/70 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-white/45">
                For Cloudflare this maps to a stable hostname. For custom mode this can complement your endpoint.
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-white/[0.1] bg-black/20 p-3">
            <label className="mb-1.5 inline-flex items-center gap-1.5 text-xs text-white/60">
              <Link2 className="h-3.5 w-3.5" />
              Endpoint URL ({selectedMode === 'custom' ? 'required' : 'optional'})
            </label>
            <input
              type="text"
              value={publicBaseUrlDraft}
              onChange={(event) => setPublicBaseUrlDraft(event.target.value)}
              placeholder="https://your-endpoint.example.com"
              className="w-full rounded-lg border border-white/[0.12] bg-[#0B0C10] px-3 py-2 text-sm text-white/90 placeholder:text-white/35 focus:border-[#3B82F6]/70 focus:outline-none"
            />
            {customEndpointMissing ? (
              <p className="mt-1.5 text-xs text-[#FF9F9A]">Custom mode needs endpoint URL or domain before continuing.</p>
            ) : (
              <p className="mt-1.5 text-xs text-white/45">Leave empty for managed provider defaults (quick URL or inferred endpoint).</p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3">
            <p className="text-xs text-white/60">Access scope</p>
            <button
              type="button"
              onClick={() => setTunnelVisibilityDraft('public')}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs',
                tunnelVisibilityDraft === 'public'
                  ? 'border-[#4B83FF]/65 bg-[#1D4ED8]/25 text-[#D7E3FF]'
                  : 'border-white/[0.12] text-white/65 hover:bg-white/[0.04]',
              )}
            >
              Public
            </button>
            <button
              type="button"
              onClick={() => setTunnelVisibilityDraft('private')}
              disabled={selectedMode === 'cloudflare'}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs',
                tunnelVisibilityDraft === 'private'
                  ? 'border-[#4B83FF]/65 bg-[#1D4ED8]/25 text-[#D7E3FF]'
                  : 'border-white/[0.12] text-white/65 hover:bg-white/[0.04]',
                selectedMode === 'cloudflare' && 'cursor-not-allowed opacity-45',
              )}
            >
              Private
            </button>
            <p className="text-xs text-white/50">
              Cloudflare mode uses internet-facing HTTPS; private mode is best with Tailscale/custom private routing.
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!stepOneComplete || isApplyingConfig || isLoading}
              onClick={() => void applyConfigurationStep()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
            >
              {isApplyingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Apply configuration
            </button>
            <p className="text-xs text-white/55">
              Saved: name {status?.tunnelName || 'none'} · domain {status?.tunnelDomain || 'none'} · {status?.tunnelVisibility || 'public'}
            </p>
          </div>
        </SetupStepCard>

        <SetupStepCard
          step={3}
          title={`Install ${selectedProvider.installLabel} dependency`}
          description="Install the provider binary required for managed tunnel lifecycle in Cowork."
          state={stepThreeState}
        >
          <div className="grid gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3 text-xs text-white/65 md:grid-cols-2">
            <div>
              <p className="text-white/45">Dependency state</p>
              <p className="mt-1 text-white/90">{status?.tunnelBinaryInstalled ? status.tunnelBinaryPath || 'Installed' : 'Missing'}</p>
            </div>
            <div>
              <p className="text-white/45">Provider package</p>
              <p className="mt-1 text-white/90">{selectedProvider.installLabel}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={stepThreeState !== 'active' || isInstallingTunnel || !installNeeded || Boolean(status?.tunnelBinaryInstalled)}
              onClick={() => void installProviderDependency()}
              className="inline-flex items-center gap-1 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
            >
              {isInstallingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Install dependency
            </button>
            {!installNeeded ? (
              <p className="text-xs text-white/50">Custom mode is externally managed, so no dependency install is required.</p>
            ) : null}
          </div>
        </SetupStepCard>

        <SetupStepCard
          step={4}
          title={`Authenticate ${selectedProvider.label}`}
          description="Run provider auth only when required by your selected mode/domain routing."
          state={stepFourState}
        >
          <div className="grid gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3 text-xs text-white/65 md:grid-cols-3">
            <div>
              <p className="text-white/45">Auth required</p>
              <p className="mt-1 text-white/90">{authNeeded ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-white/45">Auth status</p>
              <p className="mt-1 text-white/90">{status?.tunnelAuthStatus || 'unknown'}</p>
            </div>
            <div>
              <p className="text-white/45">Flow</p>
              <p className="mt-1 text-white/90">{selectedProvider.authLabel}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={stepFourState !== 'active' || isAuthenticatingTunnel || !authNeeded || status?.tunnelAuthStatus === 'authenticated'}
              onClick={() => void authenticateProvider()}
              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.15] bg-white/[0.04] px-3 py-2 text-sm text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
            >
              {isAuthenticatingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
              Authenticate
            </button>
            {!authNeeded ? <p className="text-xs text-white/50">No auth step is needed for this provider setup.</p> : null}
          </div>
        </SetupStepCard>

        <SetupStepCard
          step={5}
          title="Start tunnel and verify"
          description="Start remote tunnel from UI and verify the endpoint before pairing a phone."
          state={stepFiveState}
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
              disabled={stepFiveState === 'locked' || isStartingTunnel || tunnelRunning}
              onClick={() => void startTunnelStep()}
              className="inline-flex items-center gap-1 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
            >
              {isStartingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              Start tunnel
            </button>
            <button
              type="button"
              disabled={stepFiveState === 'locked' || isStartingTunnel || !tunnelRunning}
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

        {stepFiveComplete ? (
          <SetupStepCard
            step={6}
            title="Pair phone with QR"
            description="Now that tunnel is live, generate a short-lived QR and scan from iPhone/Android app."
            state={stepSixState}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-white/55">QR becomes available only after tunnel verification succeeds.</p>
              <button
                type="button"
                disabled={!stepFiveComplete || !endpoint || isGeneratingQr}
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
            ) : null}
          </SetupStepCard>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm text-white/55">
            <p className="inline-flex items-center gap-1.5 text-white/70">
              <Info className="h-4 w-4" />
              Mobile pairing is hidden until steps 1-5 complete successfully.
            </p>
            <p className="mt-1 text-xs text-white/45">This prevents broken phone pairing before tunnel readiness.</p>
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
        <p className="mt-1">Mobile app can manage schedules (pause/resume/run) but manual schedule creation remains chat-only.</p>
        <p className="mt-1">Use HTTPS tunnel endpoints for internet access outside local Wi-Fi.</p>
      </div>
    </div>
  );
}
