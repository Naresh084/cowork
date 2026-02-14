// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  title?: string;
}

export function BrandMark({ className, title = 'Cowork' }: BrandMarkProps) {
  const id = useId();
  const gradientId = `brand-gradient-${id}`;

  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('w-10 h-10', className)}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradientId} x1="72" y1="78" x2="438" y2="434" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="50%" stopColor="#1D4ED8" />
          <stop offset="100%" stopColor="#7DD3FC" />
        </linearGradient>
      </defs>
      <path
        d="M382 112C340 70 286 46 226 46C124 46 46 124 46 226C46 328 124 406 226 406C286 406 340 382 382 340"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="84"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
