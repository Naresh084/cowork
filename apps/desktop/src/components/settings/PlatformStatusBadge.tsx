// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { cn } from '@/lib/utils';
import type { PlatformType } from '@cowork/shared';

interface PlatformStatusBadgeProps {
  platform: PlatformType;
  connected: boolean;
  displayName?: string;
  health?: 'healthy' | 'degraded' | 'unhealthy';
  requiresReconnect?: boolean;
}

const platformColors: Record<PlatformType, string> = {
  whatsapp: '#25D366',
  slack: '#9B59B6',
  telegram: '#2AABEE',
  discord: '#5865F2',
  imessage: '#34C759',
  teams: '#6264A7',
};

export function PlatformStatusBadge({
  platform,
  connected,
  displayName,
  health,
  requiresReconnect,
}: PlatformStatusBadgeProps) {
  const color = platformColors[platform];
  const effectiveHealth = connected ? health ?? 'healthy' : 'unhealthy';
  const dotClass =
    effectiveHealth === 'healthy'
      ? 'shadow-[0_0_6px_1px]'
      : effectiveHealth === 'degraded'
        ? 'bg-[#F59E0B]'
        : 'bg-[#FF6A6A]';
  const dotStyle =
    effectiveHealth === 'healthy'
      ? { backgroundColor: color, boxShadow: `0 0 6px 1px ${color}40` }
      : undefined;

  const statusText = (() => {
    if (!connected) {
      return 'Disconnected';
    }
    if (requiresReconnect || effectiveHealth === 'unhealthy') {
      return 'Connected (reconnect required)';
    }
    if (effectiveHealth === 'degraded') {
      return 'Connected (degraded)';
    }
    return 'Connected';
  })();

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'w-2.5 h-2.5 rounded-full flex-shrink-0',
          connected ? dotClass : 'border border-white/20'
        )}
        style={connected ? dotStyle : undefined}
      />
      <span className="text-sm text-white/70">
        {connected ? (
          <>
            {statusText}
            {displayName && (
              <span className="text-white/50"> as {displayName}</span>
            )}
          </>
        ) : (
          'Disconnected'
        )}
      </span>
    </div>
  );
}
