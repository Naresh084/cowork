// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '../../stores/agent-store';
import { useChatStore } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import { CollapsibleSection } from './CollapsibleSection';

/**
 * ContextSection - Displays context usage only.
 *
 * Context files are shown in the Working Folder section.
 */
export function ContextSection() {
  const { activeSessionId } = useSessionStore();
  const agentContextUsage = useAgentStore((state) => state.getSessionState(activeSessionId).contextUsage);
  const persistedContextUsage = useChatStore((state) =>
    activeSessionId ? state.sessions[activeSessionId]?.contextUsage ?? null : null
  );

  const contextUsage = persistedContextUsage
    ? {
        used: persistedContextUsage.usedTokens,
        total: persistedContextUsage.maxTokens,
        percentage: persistedContextUsage.percentUsed,
      }
    : agentContextUsage;

  return (
    <CollapsibleSection id="context" title="Context" icon={Layers}>
      <div>
        <h4 className="text-xs font-medium text-white/40 mb-2">Context usage</h4>
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                contextUsage.percentage > 85
                  ? 'bg-[#FF5449]'
                  : contextUsage.percentage > 70
                    ? 'bg-[#F5C400]'
                    : 'bg-[#1D4ED8]'
              )}
              style={{ width: `${Math.min(contextUsage.percentage, 100)}%` }}
            />
          </div>
          <div className="text-[11px] text-white/40">
            {formatNumber(contextUsage.used)} / {formatNumber(contextUsage.total)} tokens
            <span className="text-white/30"> ({contextUsage.percentage}%)</span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
  return num.toString();
}
