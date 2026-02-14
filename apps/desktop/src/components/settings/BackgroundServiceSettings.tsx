// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, RefreshCw, ServerCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';

type ServiceMode = 'user' | 'system';

interface ServiceModeState {
  mode: ServiceMode;
  updatedAt: number;
}

interface ServiceStatus {
  mode: ServiceMode;
  manager: string;
  serviceId: string;
  installed: boolean;
  running: boolean;
  enabled: boolean;
  configPath: string | null;
  daemonProgram: string;
  daemonArgs: string[];
  appDataDir: string;
  endpoint: string;
  tokenFile: string;
  lockFile: string;
  details: string | null;
}

type ServiceAction =
  | 'service_install'
  | 'service_uninstall'
  | 'service_start'
  | 'service_stop'
  | 'service_restart';

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'good' | 'warn';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
      : tone === 'warn'
        ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
        : 'border-white/[0.12] bg-white/[0.04] text-white/75';

  return (
    <div className={cn('rounded-md border px-2.5 py-1 text-[11px]', toneClass)}>
      <span className="text-white/50">{label}:</span> {value}
    </div>
  );
}

export function BackgroundServiceSettings() {
  const [mode, setMode] = useState<ServiceMode>('user');
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<ServiceAction | null>(null);

  const refreshStatus = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const modeState = await invoke<ServiceModeState>('service_get_mode');
      const resolvedMode = modeState.mode || 'user';
      setMode(resolvedMode);

      const snapshot = await invoke<ServiceStatus>('service_status', { mode: resolvedMode });
      setStatus(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!silent) {
        toast.error('Service status failed', message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const applyMode = async (nextMode: ServiceMode) => {
    try {
      setLoading(true);
      await invoke<ServiceModeState>('service_set_mode', { mode: nextMode });
      setMode(nextMode);
      const snapshot = await invoke<ServiceStatus>('service_status', { mode: nextMode });
      setStatus(snapshot);
      toast.success(
        nextMode === 'system'
          ? 'System mode selected'
          : 'User mode selected',
      );
    } catch (error) {
      toast.error(
        'Failed to switch service mode',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (action: ServiceAction) => {
    try {
      setActionInFlight(action);
      const snapshot = await invoke<ServiceStatus>(action, { mode });
      setStatus(snapshot);
      switch (action) {
        case 'service_install':
          toast.success('Background service installed');
          break;
        case 'service_uninstall':
          toast.success('Background service uninstalled');
          break;
        case 'service_start':
          toast.success('Background service started');
          break;
        case 'service_stop':
          toast.success('Background service stopped');
          break;
        case 'service_restart':
          toast.success('Background service restarted');
          break;
      }
    } catch (error) {
      toast.error(
        'Service action failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setActionInFlight(null);
    }
  };

  const managerHint = useMemo(() => {
    if (!status) return '';
    switch (status.manager) {
      case 'launchd':
        return mode === 'system'
          ? 'Managed as LaunchDaemon (/Library/LaunchDaemons).'
          : 'Managed as LaunchAgent (~/Library/LaunchAgents).';
      case 'systemd':
        return mode === 'system'
          ? 'Managed as system unit (/etc/systemd/system).'
          : 'Managed as user unit (~/.config/systemd/user).';
      case 'task-scheduler':
        return 'Managed as a Scheduled Task at user logon.';
      case 'service-control-manager':
        return 'Managed as a Windows Service via Service Control Manager.';
      default:
        return 'Managed by OS-native background service tooling.';
    }
  }, [mode, status]);

  const busy = loading || actionInFlight !== null;

  return (
    <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ServerCog className="h-4 w-4 text-white/70" />
            <h4 className="text-sm font-medium text-white/90">Background Service</h4>
          </div>
          <p className="mt-1 text-xs text-white/45">
            Run Cowork agent runtime continuously even when the desktop app is closed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors',
            busy
              ? 'cursor-not-allowed border-white/[0.08] text-white/35'
              : 'border-white/[0.12] text-white/75 hover:bg-white/[0.05] hover:text-white/90',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs text-white/65">
          <span>Service mode</span>
          <select
            value={mode}
            onChange={(event) => void applyMode(event.target.value as ServiceMode)}
            disabled={busy}
            className="app-select"
          >
            <option value="user">User mode</option>
            <option value="system">System mode</option>
          </select>
        </label>
        <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10]/70 px-3 py-2 text-[11px] text-white/50">
          {managerHint || 'Loading service manager details…'}
        </div>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0B0C10]/70 px-3 py-2 text-xs text-white/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading background service status…
        </div>
      ) : null}

      {status ? (
        <>
          <div className="flex flex-wrap gap-2">
            <StatusChip
              label="Installed"
              value={status.installed ? 'Yes' : 'No'}
              tone={status.installed ? 'good' : 'warn'}
            />
            <StatusChip
              label="Running"
              value={status.running ? 'Yes' : 'No'}
              tone={status.running ? 'good' : 'warn'}
            />
            <StatusChip
              label="Enabled"
              value={status.enabled ? 'Yes' : 'No'}
              tone={status.enabled ? 'good' : 'neutral'}
            />
            <StatusChip label="Manager" value={status.manager} tone="neutral" />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10]/70 px-3 py-2 text-[11px] text-white/55">
              <div className="text-white/40">Service ID</div>
              <div className="mt-1 break-all font-mono text-white/85">{status.serviceId}</div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10]/70 px-3 py-2 text-[11px] text-white/55">
              <div className="text-white/40">Daemon endpoint</div>
              <div className="mt-1 break-all font-mono text-white/85">{status.endpoint}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction('service_install')}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs transition-colors',
                busy
                  ? 'cursor-not-allowed border-white/[0.08] text-white/35'
                  : 'border-[#1D4ED8]/50 bg-[#1D4ED8]/15 text-[#BFDBFE] hover:bg-[#1D4ED8]/25',
              )}
            >
              Install
            </button>
            <button
              type="button"
              disabled={busy || !status.installed}
              onClick={() => void runAction('service_start')}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs transition-colors',
                busy || !status.installed
                  ? 'cursor-not-allowed border-white/[0.08] text-white/35'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25',
              )}
            >
              Start
            </button>
            <button
              type="button"
              disabled={busy || !status.installed}
              onClick={() => void runAction('service_restart')}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs transition-colors',
                busy || !status.installed
                  ? 'cursor-not-allowed border-white/[0.08] text-white/35'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25',
              )}
            >
              Restart
            </button>
            <button
              type="button"
              disabled={busy || !status.running}
              onClick={() => void runAction('service_stop')}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs transition-colors',
                busy || !status.running
                  ? 'cursor-not-allowed border-white/[0.08] text-white/35'
                  : 'border-[#FF6B6B]/45 bg-[#FF6B6B]/15 text-[#FFD4D4] hover:bg-[#FF6B6B]/25',
              )}
            >
              Stop
            </button>
            <button
              type="button"
              disabled={busy || !status.installed}
              onClick={() => void runAction('service_uninstall')}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs transition-colors',
                busy || !status.installed
                  ? 'cursor-not-allowed border-white/[0.08] text-white/35'
                  : 'border-white/[0.2] bg-white/[0.06] text-white/80 hover:bg-white/[0.11]',
              )}
            >
              Uninstall
            </button>
          </div>

          <p className="text-[11px] text-white/45">
            System mode may require elevated privileges (administrator/root) on install/start/stop.
          </p>
          <p className="text-[11px] text-white/40">
            Both modes use the same single-tenant profile at{' '}
            <code className="rounded bg-white/[0.08] px-1 py-0.5 text-white/80">{status.appDataDir}</code>.
          </p>
        </>
      ) : null}
    </div>
  );
}
