// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCapabilityStore } from '@/stores/capability-store';

interface CapabilityMatrixProps {
  compact?: boolean;
}

function KeyStatusPill({
  label,
  configured,
}: {
  label: string;
  configured: boolean;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
        configured
          ? 'border-[#10B981]/35 bg-[#10B981]/10 text-[#6EE7B7]'
          : 'border-white/[0.14] bg-white/[0.03] text-white/45',
      )}
    >
      {configured ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
      {label}
    </div>
  );
}

export function CapabilityMatrix({ compact = false }: CapabilityMatrixProps) {
  const { snapshot, isLoading, error, refreshSnapshot } = useCapabilityStore();

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const sortedTools = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.toolAccess].sort((a, b) => {
      if (a.enabled === b.enabled) {
        return a.toolName.localeCompare(b.toolName);
      }
      return a.enabled ? -1 : 1;
    });
  }, [snapshot]);

  if (isLoading && !snapshot) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white/50">
        Loading capability snapshot...
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-xl border border-[#FF5449]/30 bg-[#FF5449]/10 p-4 text-xs text-[#FF9A93]">
        Failed to load capability snapshot: {error}
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      {!compact ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-white/90">Tools You Can Use Now</h4>
            <p className="mt-1 text-xs text-white/45">
              Provider: <span className="font-mono text-white/70">{snapshot.provider}</span> • Policy profile:{' '}
              <span className="font-mono text-white/70">{snapshot.policyProfile}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshSnapshot()}
            className="rounded-md border border-white/[0.1] px-2 py-1 text-xs text-white/60 hover:bg-white/[0.05] hover:text-white/80"
          >
            Refresh
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <KeyStatusPill label="Provider key" configured={snapshot.keyStatus.providerKeyConfigured} />
        <KeyStatusPill label="Google key" configured={snapshot.keyStatus.googleKeyConfigured} />
        <KeyStatusPill label="OpenAI key" configured={snapshot.keyStatus.openaiKeyConfigured} />
        <KeyStatusPill label="Fal key" configured={snapshot.keyStatus.falKeyConfigured} />
        <KeyStatusPill label="Exa key" configured={snapshot.keyStatus.exaKeyConfigured} />
        <KeyStatusPill label="Tavily key" configured={snapshot.keyStatus.tavilyKeyConfigured} />
        <KeyStatusPill label="Stitch key" configured={snapshot.keyStatus.stitchKeyConfigured} />
      </div>

      <div className="space-y-2">
        {sortedTools.slice(0, compact ? 8 : sortedTools.length).map((tool) => (
          <div
            key={tool.toolName}
            className={cn(
              'rounded-lg border p-2',
              tool.enabled
                ? 'border-[#10B981]/25 bg-[#10B981]/5'
                : 'border-white/[0.08] bg-white/[0.01]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5">
                <span className="font-mono text-xs text-white/85">{tool.toolName}</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                    tool.enabled ? 'bg-[#10B981]/15 text-[#6EE7B7]' : 'bg-white/[0.08] text-white/45',
                  )}
                >
                  {tool.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                  tool.policyAction === 'allow'
                    ? 'bg-[#1D4ED8]/15 text-[#93C5FD]'
                    : tool.policyAction === 'deny'
                      ? 'bg-[#FF5449]/15 text-[#FF9A93]'
                      : 'bg-[#F59E0B]/15 text-[#FCD34D]',
                )}
              >
                policy: {tool.policyAction}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-white/55">{tool.reason}</p>
          </div>
        ))}
      </div>

      {snapshot.integrationAccess.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-white/[0.08] bg-white/[0.01] p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Integration Access</p>
          {snapshot.integrationAccess.map((integration) => (
            <div key={integration.integrationName} className="flex items-start justify-between gap-2">
              <div className="text-xs text-white/80">{integration.integrationName}</div>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                  integration.enabled ? 'bg-[#10B981]/15 text-[#6EE7B7]' : 'bg-white/[0.08] text-white/45',
                )}
              >
                {integration.enabled ? 'enabled' : 'disabled'}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {snapshot.notes.length > 0 ? (
        <div className="rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/8 p-2.5 text-xs text-[#FCD34D]">
          <div className="mb-1 inline-flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Notes
          </div>
          {snapshot.notes.map((note) => (
            <p key={note} className="text-[11px] leading-relaxed text-[#FDE68A]">
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
