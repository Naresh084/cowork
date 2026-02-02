import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'primary' | 'white';
  className?: string;
  label?: string;
}

const sizeStyles = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

const strokeWidths = {
  xs: 3,
  sm: 3,
  md: 2.5,
  lg: 2,
  xl: 2,
};

const variantColors = {
  default: 'text-white/40',
  primary: 'text-[#6B6EF0]',
  white: 'text-white',
};

export function Spinner({
  size = 'md',
  variant = 'default',
  className,
  label,
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label || 'Loading'}
      className={cn('inline-flex items-center gap-2', className)}
    >
      <svg
        className={cn('animate-spin', sizeStyles[size], variantColors[variant])}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={strokeWidths[size]}
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label && <span className="text-sm text-white/50">{label}</span>}
    </div>
  );
}

interface SpinnerOverlayProps {
  visible: boolean;
  label?: string;
  className?: string;
}

export function SpinnerOverlay({
  visible,
  label = 'Loading...',
  className,
}: SpinnerOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex flex-col items-center justify-center',
        'bg-[#0D0D0F]/80 backdrop-blur-sm',
        className
      )}
    >
      <Spinner size="lg" variant="primary" />
      {label && <p className="mt-3 text-sm text-white/70">{label}</p>}
    </div>
  );
}

interface LoadingDotsProps {
  className?: string;
}

export function LoadingDots({ className }: LoadingDotsProps) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span
        className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
        style={{ animationDelay: '300ms' }}
      />
    </span>
  );
}
