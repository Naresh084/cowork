import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  selected?: boolean;
}

const variantStyles = {
  default: 'bg-gray-800/50 border border-gray-700/50',
  outlined: 'bg-transparent border border-gray-700',
  elevated: 'bg-gray-800/80 border border-gray-700/50 shadow-lg shadow-black/20',
  ghost: 'bg-transparent border border-transparent',
};

const paddingStyles = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      hoverable = false,
      selected = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg transition-all',
          variantStyles[variant],
          paddingStyles[padding],
          hoverable && 'hover:bg-gray-700/50 hover:border-gray-600 cursor-pointer',
          selected && 'border-blue-500/50 bg-blue-500/10',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  action?: ReactNode;
}

export function CardHeader({ action, className, children, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4', className)}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-base font-semibold text-white', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-sm text-gray-400 mt-1', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mt-4', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-4 pt-4 border-t border-gray-700/50',
        'flex items-center gap-3',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
