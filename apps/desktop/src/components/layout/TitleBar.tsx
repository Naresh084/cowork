// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { cn } from '@/lib/utils';

export function TitleBar() {
  return (
    <div
      className={cn(
        'absolute inset-x-0 top-0 z-40 h-8 flex items-center',
        'bg-transparent',
        'window-drag'
      )}
    >
      {/* Traffic lights space */}
      <div className="w-20" />
    </div>
  );
}
