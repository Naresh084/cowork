// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { ExternalLink } from 'lucide-react';

interface Source {
  title?: string;
  url: string;
}

interface SourcesCitationProps {
  sources: Source[];
  searchQueries?: string[];
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function SourcesCitation({ sources, searchQueries }: SourcesCitationProps) {
  if (!sources?.length) return null;

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.08]">
      <p className="text-xs text-white/40 mb-2">Sources:</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((source, i) => (
          <a
            key={`${source.url}-${i}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs
                       bg-white/[0.04] rounded-md
                       hover:bg-white/[0.08] transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {source.title?.trim() || getHostname(source.url)}
          </a>
        ))}
      </div>
      {searchQueries && searchQueries.length > 0 && (
        <p className="mt-2 text-[11px] text-white/30">
          Searches: {searchQueries.join(' · ')}
        </p>
      )}
    </div>
  );
}
