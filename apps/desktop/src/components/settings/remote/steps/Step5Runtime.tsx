// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { RemoteAccessStatus } from '@/stores/remote-access-store';

interface Step5RuntimeProps {
  status: RemoteAccessStatus | null;
  endpoint: string | null;
}

export function Step5Runtime({ status, endpoint }: Step5RuntimeProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3 text-xs text-white/65 md:grid-cols-3">
        <div>
          <p className="text-white/45">Runtime</p>
          <p className="mt-1 text-white/90">{status?.tunnelState || 'stopped'}</p>
        </div>
        <div>
          <p className="text-white/45">Public URL</p>
          <p className="mt-1 truncate text-white/90">{endpoint || 'Not ready'}</p>
        </div>
        <div>
          <p className="text-white/45">PID</p>
          <p className="mt-1 text-white/90">{status?.tunnelPid ?? 'n/a'}</p>
        </div>
      </div>

      {!!status?.tunnelHints?.length && (
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-3">
          <p className="text-xs text-white/45">Fallback commands (manual fallback only)</p>
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
  );
}
