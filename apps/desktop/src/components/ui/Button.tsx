import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

// Omit conflicting event handlers between React and Framer Motion
type ConflictingProps = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, ConflictingProps> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'gradient' | 'glass';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantStyles = {
  primary: [
    'bg-[#6B6EF0] text-white',
    'hover:bg-[#8B8EFF]',
    'focus:ring-[#6B6EF0]/50',
    'shadow-lg shadow-[#6B6EF0]/25 hover:shadow-xl hover:shadow-[#6B6EF0]/35',
  ],
  secondary: [
    'bg-white/[0.08] text-white',
    'hover:bg-white/[0.12]',
    'focus:ring-white/20',
  ],
  ghost: [
    'bg-transparent text-white/70',
    'hover:bg-white/[0.06] hover:text-white',
    'focus:ring-white/20',
  ],
  danger: [
    'bg-[#FF5449]/20 text-[#FF5449] border border-[#FF5449]/30',
    'hover:bg-[#FF5449]/30',
    'focus:ring-[#FF5449]/50',
  ],
  outline: [
    'bg-transparent text-white/70 border border-white/[0.12]',
    'hover:bg-white/[0.06] hover:text-white hover:border-white/[0.2]',
    'focus:ring-white/20',
  ],
  gradient: [
    'bg-gradient-to-r from-[#4F52D9] to-[#6B6EF0] text-white',
    'hover:from-[#6B6EF0] hover:to-[#8B8EFF]',
    'focus:ring-[#6B6EF0]/50',
    'shadow-lg shadow-[#6B6EF0]/25 hover:shadow-xl hover:shadow-[#6B6EF0]/35',
  ],
  glass: [
    'bg-white/[0.03] backdrop-blur-xl text-white/80',
    'border border-white/[0.08]',
    'hover:bg-white/[0.06] hover:text-white',
    'focus:ring-white/20',
  ],
};

const sizeStyles = {
  xs: 'px-2.5 py-1.5 text-xs gap-1.5',
  sm: 'px-3 py-2 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={cn(
          'inline-flex items-center justify-center',
          'font-medium rounded-xl',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0D0D0F]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-all duration-200',
          'border border-transparent',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="animate-spin" size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16} />
        ) : leftIcon ? (
          <span className="flex-shrink-0">{leftIcon}</span>
        ) : null}
        {children && <span>{children}</span>}
        {rightIcon && !isLoading && <span className="flex-shrink-0">{rightIcon}</span>}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
