import { cn } from '@/lib/utils';
import type { PlatformType } from '@gemini-cowork/shared';

interface PlatformStatusBadgeProps {
  platform: PlatformType;
  connected: boolean;
  displayName?: string;
}

const platformColors: Record<PlatformType, string> = {
  whatsapp: '#25D366',
  slack: '#9B59B6',
  telegram: '#2AABEE',
  discord: '#5865F2',
  imessage: '#34C759',
  teams: '#6264A7',
  line: '#06C755',
  matrix: '#0DBD8B',
};

export function PlatformStatusBadge({
  platform,
  connected,
  displayName,
}: PlatformStatusBadgeProps) {
  const color = platformColors[platform];

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'w-2.5 h-2.5 rounded-full flex-shrink-0',
          connected ? 'shadow-[0_0_6px_1px]' : 'border border-white/20'
        )}
        style={
          connected
            ? { backgroundColor: color, boxShadow: `0 0 6px 1px ${color}40` }
            : undefined
        }
      />
      <span className="text-sm text-white/70">
        {connected ? (
          <>
            Connected
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
