// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'default' | 'circular' | 'text';
  width?: number | string;
  height?: number | string;
  animate?: boolean;
}

export function Skeleton({
  className,
  variant = 'default',
  width,
  height,
  animate = true,
}: SkeletonProps) {
  const variantStyles = {
    default: 'rounded-md',
    circular: 'rounded-full',
    text: 'rounded h-4',
  };

  return (
    <div
      className={cn(
        'bg-white/[0.06]',
        animate && 'animate-pulse',
        variantStyles[variant],
        className
      )}
      style={{
        width: width,
        height: height,
      }}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}

export function SkeletonText({
  lines = 3,
  className,
  lastLineWidth = '60%',
}: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}

interface SkeletonAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function SkeletonAvatar({ size = 'md', className }: SkeletonAvatarProps) {
  const sizeStyles = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <Skeleton
      variant="circular"
      className={cn(sizeStyles[size], className)}
    />
  );
}

interface SkeletonCardProps {
  className?: string;
  showAvatar?: boolean;
  showImage?: boolean;
}

export function SkeletonCard({
  className,
  showAvatar = true,
  showImage = false,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'p-4 bg-[#1A1A1E] border border-white/[0.06] rounded-xl',
        className
      )}
    >
      {showImage && (
        <Skeleton className="w-full h-40 mb-4" />
      )}
      <div className="flex items-start gap-3">
        {showAvatar && <SkeletonAvatar size="md" />}
        <div className="flex-1">
          <Skeleton className="h-4 w-1/3 mb-2" />
          <SkeletonText lines={2} lastLineWidth="80%" />
        </div>
      </div>
    </div>
  );
}

interface SkeletonListProps {
  count?: number;
  className?: string;
  itemClassName?: string;
}

export function SkeletonList({
  count = 5,
  className,
  itemClassName,
}: SkeletonListProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]',
            itemClassName
          )}
        >
          <Skeleton variant="circular" className="w-8 h-8 flex-shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-2/3 mb-1" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
