// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { cn } from '@/lib/utils';
import type { RemoteTunnelMode } from '@/stores/remote-access-store';
import { tunnelProviderModes } from '../constants';

interface Step1ProviderProps {
  selectedMode: RemoteTunnelMode;
  savedMode: RemoteTunnelMode | null;
  onSelectMode: (mode: RemoteTunnelMode) => void;
  disabled?: boolean;
}

export function Step1Provider({
  selectedMode,
  savedMode,
  onSelectMode,
  disabled = false,
}: Step1ProviderProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        {tunnelProviderModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelectMode(mode.id)}
            className={cn(
              'rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50',
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
      <p className="text-xs text-white/55">Current saved provider: {savedMode || 'unknown'}</p>
    </div>
  );
}
