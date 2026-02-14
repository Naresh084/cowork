// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: {
    track: 'w-7 h-4',
    thumb: 'w-3 h-3',
    translate: 'translate-x-3',
  },
  md: {
    track: 'w-9 h-5',
    thumb: 'w-4 h-4',
    translate: 'translate-x-4',
  },
  lg: {
    track: 'w-11 h-6',
    thumb: 'w-5 h-5',
    translate: 'translate-x-5',
  },
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, size = 'md', className, disabled, ...props }, ref) => {
    const styles = sizeStyles[size];

    return (
      <label
        className={cn(
          'inline-flex items-start gap-3 cursor-pointer',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        <div className="relative flex items-center">
          <input
            ref={ref}
            type="checkbox"
            role="switch"
            disabled={disabled}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              'rounded-full transition-colors',
              styles.track,
              'bg-white/[0.10] peer-checked:bg-[#1D4ED8]',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-[#1D4ED8]/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0D0D0F]'
            )}
          />
          <div
            className={cn(
              'absolute left-0.5 rounded-full transition-transform',
              styles.thumb,
              'bg-white shadow-sm',
              props.checked ? styles.translate : 'translate-x-0'
            )}
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span className="text-sm font-medium text-white/90">{label}</span>
            )}
            {description && (
              <span className="text-xs text-white/50">{description}</span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Switch.displayName = 'Switch';
