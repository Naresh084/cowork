// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { RemoteAccessStatus } from '@/stores/remote-access-store';

interface Step3DependencyProps {
  installLabel: string;
  status: RemoteAccessStatus | null;
  installNeeded: boolean;
}

export function Step3Dependency({ installLabel, status, installNeeded }: Step3DependencyProps) {
  return (
    <div className="grid gap-2 rounded-xl border border-white/[0.1] bg-black/20 p-3 text-xs text-white/65 md:grid-cols-2">
      <div>
        <p className="text-white/45">Dependency state</p>
        <p className="mt-1 text-white/90">{status?.tunnelBinaryInstalled ? status.tunnelBinaryPath || 'Installed' : 'Missing'}</p>
      </div>
      <div>
        <p className="text-white/45">Provider package</p>
        <p className="mt-1 text-white/90">{installNeeded ? installLabel : 'None (custom mode)'}</p>
      </div>
    </div>
  );
}
