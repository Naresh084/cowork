import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
}

const variantStyles = {
  default: 'bg-white/[0.08] text-white/80 border-white/[0.08]',
  primary: 'bg-[#6B6EF0]/20 text-[#8B8EFF] border-[#6B6EF0]/30',
  secondary: 'bg-[#8A62C2]/20 text-[#A47CDE] border-[#8A62C2]/30',
  success: 'bg-[#50956A]/20 text-[#6BB88A] border-[#50956A]/30',
  warning: 'bg-[#F5C400]/20 text-[#FFD700] border-[#F5C400]/30',
  error: 'bg-[#FF5449]/20 text-[#FF7A72] border-[#FF5449]/30',
  info: 'bg-[#008585]/20 text-[#00A1A3] border-[#008585]/30',
  outline: 'bg-transparent text-white/70 border-white/[0.12]',
};

const dotColors = {
  default: 'bg-white/60',
  primary: 'bg-[#8B8EFF]',
  secondary: 'bg-[#A47CDE]',
  success: 'bg-[#6BB88A]',
  warning: 'bg-[#FFD700]',
  error: 'bg-[#FF7A72]',
  info: 'bg-[#00A1A3]',
  outline: 'bg-white/40',
};

const sizeStyles = {
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1.5',
  lg: 'text-sm px-3 py-1 gap-1.5',
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
        'inline-flex items-center font-medium rounded-full border',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColors[variant])}
        />
      )}
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 hover:bg-white/10 rounded-full p-0.5 transition-colors flex-shrink-0"
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
