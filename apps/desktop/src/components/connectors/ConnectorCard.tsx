// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectorManifest } from '@cowork/shared';
import { getConnectorIcon } from './connector-icons';

interface ConnectorCardProps {
  connector: ConnectorManifest;
  isInstalled: boolean;
  onClick: () => void;
}

export function ConnectorCard({ connector, isInstalled, onClick }: ConnectorCardProps) {
  const Icon = getConnectorIcon(connector.icon);

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative p-4 rounded-xl border text-left transition-all',
        'hover:border-zinc-600 hover:bg-zinc-800/50',
        isInstalled
          ? 'border-green-600/30 bg-green-500/5'
          : 'border-zinc-700 bg-zinc-800/30'
      )}
    >
      {/* Installed Badge */}
      {isInstalled && (
        <div className="absolute top-2 right-2 p-1 rounded-full bg-green-600">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Icon */}
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
          'bg-gradient-to-br from-zinc-700 to-zinc-800'
        )}
      >
        <Icon className="w-5 h-5 text-zinc-300" />
      </div>

      {/* Name */}
      <h3 className="font-medium text-zinc-100 mb-1 truncate">
        {connector.displayName}
      </h3>

      {/* Description */}
      <p className="text-xs text-zinc-400 line-clamp-2 mb-3">
        {connector.description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {connector.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 text-[10px] bg-zinc-700 text-zinc-400 rounded"
          >
            {tag}
          </span>
        ))}
        {connector.tags.length > 3 && (
          <span className="px-1.5 py-0.5 text-[10px] text-zinc-500">
            +{connector.tags.length - 3}
          </span>
        )}
      </div>
    </button>
  );
}
