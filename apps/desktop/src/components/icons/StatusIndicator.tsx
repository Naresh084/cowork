import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function SpinnerIcon({ size = 16, className }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      className={cn('animate-spin', className)}
    />
  );
}

interface StatusDotProps {
  status: 'online' | 'offline' | 'busy' | 'away' | 'idle';
  size?: number;
  pulse?: boolean;
  className?: string;
}

export function StatusDot({
  status,
  size = 8,
  pulse = false,
  className,
}: StatusDotProps) {
  const colors = {
    online: 'bg-green-500',
    offline: 'bg-gray-500',
    busy: 'bg-red-500',
    away: 'bg-yellow-500',
    idle: 'bg-gray-400',
  };

  return (
    <span
      className={cn(
        'inline-block rounded-full',
        colors[status],
        (pulse || status === 'online') && 'animate-pulse',
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}

export function TypingIndicator({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}
