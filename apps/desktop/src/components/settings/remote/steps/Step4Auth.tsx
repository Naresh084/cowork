// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { RemoteAccessStatus } from '@/stores/remote-access-store';

interface Step4AuthProps {
  authLabel: string;
  authNeeded: boolean;
  status: RemoteAccessStatus | null;
}

export function Step4Auth({ authLabel, authNeeded, status }: Step4AuthProps) {
  return (
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
        <p className="mt-1 text-white/90">{authLabel}</p>
      </div>
    </div>
  );
}
