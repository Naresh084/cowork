// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ReactNode } from 'react';

interface ConnectorGridProps {
  children: ReactNode;
}

export function ConnectorGrid({ children }: ConnectorGridProps) {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {children}
      </div>
    </div>
  );
}
