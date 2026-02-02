import { useState, type ReactNode } from 'react';
import { User } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string | ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
  status?: 'online' | 'offline' | 'busy' | 'away';
  className?: string;
}

const sizeStyles = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const statusSizes = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-4 h-4',
};

const statusColors = {
  online: 'bg-[#50956A]',
  offline: 'bg-white/40',
  busy: 'bg-[#FF5449]',
  away: 'bg-[#F5C400]',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function stringToColor(str: string): string {
  const colors = [
    'bg-[#4F52D9]',
    'bg-[#6B6EF0]',
    'bg-[#8A62C2]',
    'bg-[#008585]',
    'bg-[#50956A]',
    'bg-[#F5C400]',
  ];

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({
  src,
  alt,
  fallback,
  size = 'md',
  shape = 'circle',
  status,
  className,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const showImage = src && !imageError;
  const initials = typeof fallback === 'string' ? getInitials(fallback) : null;
  const bgColor = typeof fallback === 'string' ? stringToColor(fallback) : 'bg-white/[0.08]';

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center flex-shrink-0',
        'overflow-hidden',
        shape === 'circle' ? 'rounded-full' : 'rounded-xl',
        sizeStyles[size],
        !showImage && bgColor,
        className
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt || 'Avatar'}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      ) : initials ? (
        <span className="font-medium text-white">{initials}</span>
      ) : typeof fallback === 'object' ? (
        fallback
      ) : (
        <User className="w-1/2 h-1/2 text-white/40" />
      )}

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-[#0D0D0F]',
            statusSizes[size],
            statusColors[status]
          )}
        />
      )}
    </div>
  );
}

interface AvatarGroupProps {
  children: ReactNode;
  max?: number;
  size?: AvatarProps['size'];
  className?: string;
}

export function AvatarGroup({
  children,
  max,
  size = 'md',
  className,
}: AvatarGroupProps) {
  const childArray = Array.isArray(children) ? children : [children];
  const visibleChildren = max ? childArray.slice(0, max) : childArray;
  const overflowCount = max ? Math.max(0, childArray.length - max) : 0;

  return (
    <div className={cn('flex -space-x-2', className)}>
      {visibleChildren.map((child, index) => (
        <div
          key={index}
          className="relative ring-2 ring-[#0D0D0F] rounded-full"
          style={{ zIndex: visibleChildren.length - index }}
        >
          {child}
        </div>
      ))}
      {overflowCount > 0 && (
        <div
          className={cn(
            'relative flex items-center justify-center',
            'bg-white/[0.08] text-white/70 font-medium rounded-full',
            'ring-2 ring-[#0D0D0F]',
            sizeStyles[size]
          )}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
