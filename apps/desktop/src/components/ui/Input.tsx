// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, leftIcon, rightIcon, className, ...props }, ref) => {
    return (
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full px-3 py-2.5 rounded-xl',
            'bg-[#0D0D0F] border border-white/[0.08]',
            'text-white/90 placeholder:text-white/30',
            'focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50 focus:border-[#1D4ED8]',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            error && 'border-[#FF5449] focus:ring-[#FF5449]/50 focus:border-[#FF5449]',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
            {rightIcon}
          </div>
        )}
        {error && (
          <p className="mt-1.5 text-sm text-[#FF7A72]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => {
    return (
      <div>
        <textarea
          ref={ref}
          className={cn(
            'w-full px-3 py-2.5 rounded-xl',
            'bg-[#0D0D0F] border border-white/[0.08]',
            'text-white/90 placeholder:text-white/30',
            'focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50 focus:border-[#1D4ED8]',
            'transition-all duration-200 resize-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-[#FF5449] focus:ring-[#FF5449]/50 focus:border-[#FF5449]',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-[#FF7A72]">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
