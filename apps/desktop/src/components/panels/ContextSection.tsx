import { Layers, Files } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '../../stores/agent-store';
import { useSessionStore } from '../../stores/session-store';
import { CollapsibleSection } from './CollapsibleSection';

/**
 * ContextSection - Displays context usage and context files only.
 *
 * Connectors and skills are intentionally hidden to keep the panel focused.
 */
export function ContextSection() {
  const { activeSessionId } = useSessionStore();
  const contextUsage = useAgentStore((state) => state.getSessionState(activeSessionId).contextUsage);
  const contextFiles = useAgentStore((state) => state.getSessionState(activeSessionId).contextFiles);

  return (
    <CollapsibleSection id="context" title="Context" icon={Layers}>
      <div className="space-y-4">
        {/* Context Usage */}
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
                      : 'bg-[#4C71FF]'
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

        {/* Context Files */}
        <div>
          <h4 className="text-xs font-medium text-white/40 mb-2">Context files</h4>
          {contextFiles.length === 0 ? (
            <p className="text-xs text-white/25 py-2">No context files yet</p>
          ) : (
            <div className="space-y-1">
              {contextFiles
                .slice()
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 12)
                .map((file) => (
                  <div key={file.id} className="flex items-center gap-2 py-1 px-1">
                    <Files className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                    <span className="text-sm text-white/50 truncate">{file.path}</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full',
                        file.type === 'deleted'
                          ? 'bg-[#FF5449]/20 text-[#FF5449]'
                          : file.type === 'modified'
                            ? 'bg-[#4C71FF]/20 text-[#8CA2FF]'
                            : file.type === 'created'
                              ? 'bg-[#50956A]/20 text-[#76B58C]'
                              : 'bg-[#F5C400]/20 text-[#F5C400]'
                      )}
                    >
                      {file.type}
                    </span>
                  </div>
                ))}
            </div>
          )}
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
