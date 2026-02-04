import { useId } from 'react';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  title?: string;
}

export function BrandMark({ className, title = 'Gemini Cowork' }: BrandMarkProps) {
  const id = useId();
  const gradientId = `brand-gradient-${id}`;

  return (
    <svg
      viewBox="0 0 120 120"
      className={cn('w-10 h-10', className)}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2B48BE" />
          <stop offset="55%" stopColor="#4C71FF" />
          <stop offset="100%" stopColor="#8CA2FF" />
        </linearGradient>
      </defs>

      <g>
        <circle
          cx="46"
          cy="60"
          r="28"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="10"
        />
        <circle
          cx="74"
          cy="60"
          r="28"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="10"
        />
        <circle cx="60" cy="60" r="7" fill={`url(#${gradientId})`} />
      </g>
    </svg>
  );
}
