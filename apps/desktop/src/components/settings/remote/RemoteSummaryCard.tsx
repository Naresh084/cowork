import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Loader2,
  Pencil,
  PlayCircle,
  QrCode,
  RefreshCcw,
  StopCircle,
  Trash2,
} from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import type { PairingQrResult, RemoteAccessStatus } from '@/stores/remote-access-store';
import { formatTimestamp, getTunnelProviderMeta } from './constants';
import { RemoteDiagnosticsPanel } from './RemoteDiagnosticsPanel';

interface RemoteSummaryCardProps {
  status: RemoteAccessStatus;
  pairingQr: PairingQrResult | null;
  endpoint: string | null;
  isRefreshing: boolean;
  isStartingTunnel: boolean;
  isStoppingTunnel: boolean;
  isDeletingRemote: boolean;
  isGeneratingQr: boolean;
  onRefresh: () => Promise<void>;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onGenerateQr: () => Promise<void>;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

export function RemoteSummaryCard({
  status,
  pairingQr,
  endpoint,
  isRefreshing,
  isStartingTunnel,
  isStoppingTunnel,
  isDeletingRemote,
  isGeneratingQr,
  onRefresh,
  onStart,
  onStop,
  onGenerateQr,
  onEdit,
  onDelete,
}: RemoteSummaryCardProps) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const provider = useMemo(() => getTunnelProviderMeta(status.tunnelMode), [status.tunnelMode]);
  const tunnelRunning = status.tunnelState === 'running';

  const copyLastError = async () => {
    if (!status.tunnelLastError) return;
    try {
      await navigator.clipboard.writeText(status.tunnelLastError);
      toast.success('Copied error');
    } catch (error) {
      toast.error('Failed to copy error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      [
        'Delete all remote setup?',
        '',
        'This will stop the tunnel and remove:',
        '- Provider and endpoint configuration',
        '- Paired devices',
        '- Generated pairing QR',
        '',
        'This cannot be undone.',
      ].join('\n'),
    );

    if (!confirmed) return;
    await onDelete();
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[#2A6AF2]/30 bg-[radial-gradient(130%_150%_at_0%_0%,rgba(37,99,235,0.22),rgba(13,16,24,0.86))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-white/55">Remote active summary</p>
          <h3 className="mt-1 text-lg font-semibold text-white/95">{provider.label}</h3>
          <p className="mt-1 text-sm text-white/70">{provider.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isRefreshing || isDeletingRemote}
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] disabled:opacity-50"
          >
            {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button
            type="button"
            disabled={isDeletingRemote}
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/[0.06] disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            disabled={isDeletingRemote}
            onClick={() => void handleDelete()}
            className="inline-flex items-center gap-1 rounded-lg border border-[#FF6A6A]/45 bg-[#FF5449]/12 px-2.5 py-1.5 text-xs text-[#FF9F9A] hover:bg-[#FF5449]/20 disabled:opacity-50"
          >
            {isDeletingRemote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[11px] uppercase tracking-wide text-white/40">Runtime</p>
          <p className="mt-1 text-sm text-white/90">{status.tunnelState}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[11px] uppercase tracking-wide text-white/40">Access scope</p>
          <p className="mt-1 text-sm text-white/90">{status.tunnelVisibility}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[11px] uppercase tracking-wide text-white/40">Endpoint</p>
          <p className="mt-1 truncate text-sm text-white/90">{endpoint || 'Not ready'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[11px] uppercase tracking-wide text-white/40">Paired devices</p>
          <p className="mt-1 text-sm text-white/90">{status.deviceCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[11px] uppercase tracking-wide text-white/40">Last verified</p>
          <p className="mt-1 text-sm text-white/90">{formatTimestamp(status.lastOperationAt)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isStartingTunnel || isStoppingTunnel || isDeletingRemote || tunnelRunning}
          onClick={() => void onStart()}
          className="inline-flex items-center gap-1 rounded-lg border border-[#3A76FF]/45 bg-[#1D4ED8]/25 px-3 py-2 text-sm text-[#C9DAFF] hover:bg-[#1D4ED8]/35 disabled:opacity-50"
        >
          {isStartingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
          Start tunnel
        </button>
        <button
          type="button"
          disabled={isStoppingTunnel || isStartingTunnel || isDeletingRemote || !tunnelRunning}
          onClick={() => void onStop()}
          className="inline-flex items-center gap-1 rounded-lg border border-[#FF6A6A]/45 bg-[#FF5449]/12 px-3 py-2 text-sm text-[#FF9F9A] hover:bg-[#FF5449]/20 disabled:opacity-50"
        >
          {isStoppingTunnel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
          Stop tunnel
        </button>
        <button
          type="button"
          disabled={isGeneratingQr || isDeletingRemote || !endpoint}
          onClick={() => void onGenerateQr()}
          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.15] bg-white/[0.05] px-3 py-2 text-sm text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
        >
          {isGeneratingQr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
          Generate QR
        </button>
      </div>

      {pairingQr ? (
        <div className="rounded-xl border border-[#3A76FF]/35 bg-[#1D4ED8]/12 p-3 text-xs text-[#C9DAFF]">
          Pairing QR is available for a short time in setup mode. Click Edit if you need the large QR view again.
        </div>
      ) : null}

      {status.tunnelLastError ? (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-[#FF6A6A]/35 bg-[#FF5449]/10 px-3 py-2 text-sm text-[#FFB1AB]">
          <p className="min-w-0 flex-1 break-words">{status.tunnelLastError}</p>
          <button
            type="button"
            onClick={() => void copyLastError()}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-[#FFB1AB]/40 px-2 py-1 text-xs hover:bg-[#FF5449]/20"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3">
        <button
          type="button"
          onClick={() => setShowDiagnostics((prev) => !prev)}
          className="flex w-full items-center justify-between text-left text-sm text-white/90"
        >
          <span>Diagnostics</span>
          {showDiagnostics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showDiagnostics ? (
          <div className="mt-3">
            <RemoteDiagnosticsPanel diagnostics={status.diagnostics} lastError={status.tunnelLastError} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
