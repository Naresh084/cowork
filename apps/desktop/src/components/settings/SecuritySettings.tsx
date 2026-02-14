// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SecurityPostureStatus {
  credentialBackend: string;
  secureSeedAvailable: boolean;
  credentialsVaultPresent: boolean;
  connectorVaultPresent: boolean;
  plaintextCredentialsPresent: boolean;
  plaintextConnectorSecretsPresent: boolean;
  migrationStatus: string;
  providerKeysConfigured: number;
  auxiliaryKeysConfigured: number;
  auditLogPresent: boolean;
  auditLogSizeBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function SecuritySettings() {
  const [status, setStatus] = useState<SecurityPostureStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextStatus = await invoke<SecurityPostureStatus>('auth_get_security_posture');
      setStatus(nextStatus);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasPlaintextResidue = useMemo(
    () =>
      !!status &&
      (status.plaintextCredentialsPresent || status.plaintextConnectorSecretsPresent),
    [status]
  );
  const seedSourceLabel = useMemo(() => {
    if (!status) {
      return 'unknown';
    }
    const backend = status.credentialBackend.toLowerCase();
    if (backend.includes('keychain')) {
      return status.secureSeedAvailable ? 'system secure-store backed' : 'local fallback';
    }
    return status.secureSeedAvailable ? 'encrypted vault backed' : 'local fallback';
  }, [status]);

  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-white/88">Security Posture</h4>
          <p className="text-xs text-white/42">
            Credential backend, migration residue, connector secret encryption, and audit visibility.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
            isLoading
              ? 'border-white/[0.08] text-white/35 cursor-not-allowed'
              : 'border-white/[0.12] text-white/70 hover:bg-white/[0.05] hover:text-white/90',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-[#FF5449]/30 bg-[#FF5449]/10 px-3 py-2 text-xs text-[#FFB4AF]">
          Failed to load security posture: {error}
        </div>
      ) : null}

      {status ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.07] bg-[#0B0C10]/60 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/45">
              <KeyRound className="h-3.5 w-3.5" />
              Credential Backend
            </div>
            <p className="mt-1 text-sm text-white/88">{status.credentialBackend}</p>
            <p className="mt-1 text-[11px] text-white/45">
              Provider keys: {status.providerKeysConfigured} | Aux keys: {status.auxiliaryKeysConfigured}
            </p>
          </div>

          <div className="rounded-lg border border-white/[0.07] bg-[#0B0C10]/60 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/45">
              <ShieldCheck className="h-3.5 w-3.5" />
              Connector Secret Vault
            </div>
            <p className="mt-1 text-sm text-white/88">
              {status.connectorVaultPresent ? 'Encrypted vault present' : 'Encrypted vault not yet created'}
            </p>
            <p className="mt-1 text-[11px] text-white/45">
              Seed source: {seedSourceLabel}
            </p>
          </div>

          <div className="rounded-lg border border-white/[0.07] bg-[#0B0C10]/60 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/45">
              {hasPlaintextResidue ? (
                <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-[#34D399]" />
              )}
              Migration State
            </div>
            <p className="mt-1 text-sm text-white/88">{status.migrationStatus}</p>
            <p className="mt-1 text-[11px] text-white/45">
              Plaintext residues: {hasPlaintextResidue ? 'detected' : 'none detected'}
            </p>
          </div>

          <div className="rounded-lg border border-white/[0.07] bg-[#0B0C10]/60 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/45">
              <ShieldCheck className="h-3.5 w-3.5" />
              Security Audit Log
            </div>
            <p className="mt-1 text-sm text-white/88">
              {status.auditLogPresent ? 'Available' : 'Not initialized'}
            </p>
            <p className="mt-1 text-[11px] text-white/45">
              Current size: {formatBytes(status.auditLogSizeBytes)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-white/45">Loading security posture…</p>
      )}
    </section>
  );
}
