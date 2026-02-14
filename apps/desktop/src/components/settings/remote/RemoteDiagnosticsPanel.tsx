// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { AlertTriangle, CheckCircle2, ClipboardCopy, Info } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import type { RemoteDiagnosticEntry } from '@/stores/remote-access-store';
import { formatTimestamp } from './constants';

interface RemoteDiagnosticsPanelProps {
  diagnostics: RemoteDiagnosticEntry[];
  lastError: string | null;
}

function levelColor(level: RemoteDiagnosticEntry['level']): string {
  if (level === 'error') return 'text-[#FFB1AB] border-[#FF6A6A]/35 bg-[#FF5449]/10';
  if (level === 'warn') return 'text-[#FFE58A] border-[#F5C400]/30 bg-[#F5C400]/10';
  return 'text-[#CBE2FF] border-[#3A76FF]/30 bg-[#1D4ED8]/10';
}

function LevelIcon({ level }: { level: RemoteDiagnosticEntry['level'] }) {
  if (level === 'error') return <AlertTriangle className="h-3.5 w-3.5" />;
  if (level === 'warn') return <Info className="h-3.5 w-3.5" />;
  return <CheckCircle2 className="h-3.5 w-3.5" />;
}

export function RemoteDiagnosticsPanel({ diagnostics, lastError }: RemoteDiagnosticsPanelProps) {
  const copyEntry = async (entry: RemoteDiagnosticEntry) => {
    const text = [
      `[${entry.level.toUpperCase()}] ${entry.step}`,
      `${entry.message}`,
      `At: ${formatTimestamp(entry.at)}`,
      entry.commandHint ? `Command: ${entry.commandHint}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Diagnostic copied');
    } catch (error) {
      toast.error('Failed to copy diagnostic', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-2">
      {lastError ? (
        <div className="rounded-xl border border-[#FF6A6A]/35 bg-[#FF5449]/10 px-3 py-2 text-sm text-[#FFB1AB]">
          {lastError}
        </div>
      ) : null}

      {diagnostics.length === 0 ? (
        <div className="rounded-xl border border-white/[0.1] bg-black/20 px-3 py-3 text-xs text-white/55">No diagnostics yet.</div>
      ) : (
        diagnostics.map((entry) => (
          <div key={entry.id} className={`rounded-xl border px-3 py-2 text-xs ${levelColor(entry.level)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 font-medium">
                  <LevelIcon level={entry.level} />
                  {entry.step}
                </p>
                <p className="mt-1 break-words">{entry.message}</p>
                <p className="mt-1 opacity-75">{formatTimestamp(entry.at)}</p>
                {entry.commandHint ? <p className="mt-1 break-all opacity-75">{entry.commandHint}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => void copyEntry(entry)}
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-current/30 px-2 py-1 text-[11px] hover:bg-white/10"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
