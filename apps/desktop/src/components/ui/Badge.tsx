import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
}

const variantStyles = {
  default: 'bg-gray-700 text-gray-200 border-gray-600',
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  outline: 'bg-transparent text-gray-300 border-gray-600',
};

const dotColors = {
  default: 'bg-gray-400',
  success: 'bg-green-400',
  warning: 'bg-yellow-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  outline: 'bg-gray-400',
};

const sizeStyles = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-xs px-2 py-1',
  lg: 'text-sm px-2.5 py-1',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])}
        />
      )}
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 hover:bg-white/10 rounded-full p-0.5 transition-colors"
          aria-label="Remove"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

interface BadgeGroupProps {
  children: ReactNode;
  className?: string;
  max?: number;
  showOverflow?: boolean;
}

export function BadgeGroup({
  children,
  className,
  max,
  showOverflow = true,
}: BadgeGroupProps) {
  const childArray = Array.isArray(children) ? children : [children];
  const visibleChildren = max ? childArray.slice(0, max) : childArray;
  const overflowCount = max ? Math.max(0, childArray.length - max) : 0;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {visibleChildren}
      {showOverflow && overflowCount > 0 && (
        <Badge variant="outline" size="sm">
          +{overflowCount}
        </Badge>
      )}
    </div>
  );
}
