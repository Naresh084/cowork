// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Loader2, Shield, ShieldOff, Smartphone } from 'lucide-react';
import { useRemoteAccessStore } from '@/stores/remote-access-store';
import { formatTimestamp, getTunnelProviderMeta } from './remote/constants';
import { RemoteSetupWizard } from './remote/RemoteSetupWizard';
import { RemoteSummaryCard } from './remote/RemoteSummaryCard';

type RemoteViewMode = 'setup' | 'summary';

export function RemoteAccessSettings() {
  const {
    status,
    pairingQr,
    isLoading,
    isRefreshing,
    isStartingTunnel,
    isStoppingTunnel,
    isDeletingRemote,
    isGeneratingQr,
    hasHydratedDraft,
    error,
    loadStatus,
    refreshTunnel,
    beginAdaptivePolling,
    stopAdaptivePolling,
    startTunnel,
    stopTunnel,
    deleteAllRemote,
    generatePairingQr,
    revokeDevice,
  } = useRemoteAccessStore();

  const [viewMode, setViewMode] = useState<RemoteViewMode>('setup');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    void loadStatus();
    beginAdaptivePolling();
    return () => {
      stopAdaptivePolling();
    };
  }, [loadStatus, beginAdaptivePolling, stopAdaptivePolling]);

  const endpoint = useMemo(() => {
    if (!status) return null;
    return status.tunnelPublicUrl || status.publicBaseUrl || status.localBaseUrl;
  }, [status]);

  const setupReadyForSummary = Boolean(status && status.tunnelState === 'running' && endpoint);
  const provider = getTunnelProviderMeta(status?.tunnelMode || 'tailscale');

  useEffect(() => {
    if (!status) {
      setViewMode('setup');
      setIsEditing(false);
      return;
    }

    if (setupReadyForSummary && !isEditing) {
      setViewMode('summary');
      return;
    }

    if (!setupReadyForSummary) {
      setViewMode('setup');
      setIsEditing(false);
    }
  }, [status, setupReadyForSummary, isEditing]);

  const isHydrating = isLoading && !hasHydratedDraft;

  return (
    <div className="space-y-5" data-tour-id="settings-remote-section">
      <div className="rounded-2xl border border-[#2A6AF2]/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(37,99,235,0.22),rgba(13,16,24,0.85))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/70">
              <Shield className="h-3.5 w-3.5" />
              Remote Control Gateway
            </div>
            <h3 className="text-lg font-semibold text-white/95">Secure internet access for phone control</h3>
            <p className="max-w-3xl text-sm text-white/70">
              Guided setup with strict step flow. Configure once, then manage runtime from the compact summary card.
            </p>
          </div>

          <button
            type="button"
            disabled={isRefreshing}
            onClick={() => void refreshTunnel()}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] disabled:opacity-50"
          >
            {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
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
            <p className="mt-1 text-sm text-white/90">{provider.label}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Endpoint</p>
            <p className="mt-1 truncate text-sm text-white/90">{endpoint || 'Not ready'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Runtime</p>
            <p className="mt-1 text-sm text-white/90">{status?.tunnelState || 'stopped'}</p>
          </div>
        </div>

        {status?.configHealth === 'repair_required' ? (
          <div className="mt-3 rounded-xl border border-[#F5C400]/30 bg-[#F5C400]/10 px-3 py-2 text-xs text-[#FFE58A]">
            {status.configRepairReason || 'Remote configuration was repaired automatically.'}
          </div>
        ) : null}
      </div>

      {isHydrating ? (
        <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-8 text-center text-sm text-white/70">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-white/65" />
          <p className="mt-2">Loading remote setup state...</p>
        </div>
      ) : null}

      {!isHydrating && viewMode === 'setup' ? (
        <RemoteSetupWizard
          isHydrating={isHydrating}
          isEditing={isEditing}
          onComplete={() => {
            setViewMode('summary');
            setIsEditing(false);
          }}
          onCancelEdit={
            isEditing
              ? () => {
                  setViewMode('summary');
                  setIsEditing(false);
                }
              : undefined
          }
        />
      ) : null}

      {!isHydrating && viewMode === 'summary' && status ? (
        <RemoteSummaryCard
          status={status}
          pairingQr={pairingQr}
          endpoint={endpoint}
          isRefreshing={isRefreshing}
          isStartingTunnel={isStartingTunnel}
          isStoppingTunnel={isStoppingTunnel}
          isDeletingRemote={isDeletingRemote}
          isGeneratingQr={isGeneratingQr}
          onRefresh={() => refreshTunnel()}
          onStart={() => startTunnel()}
          onStop={() => stopTunnel()}
          onGenerateQr={() => generatePairingQr()}
          onEdit={() => {
            setViewMode('setup');
            setIsEditing(true);
          }}
          onDelete={() => deleteAllRemote()}
        />
      ) : null}

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
          <p className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            {error || status?.tunnelLastError}
          </p>
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
