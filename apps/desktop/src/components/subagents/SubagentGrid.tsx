import type { Subagent } from '../../stores/subagent-store';
import { SubagentCard } from './SubagentCard';

interface SubagentGridProps {
  subagents: Subagent[];
  installingIds: Set<string>;
  onSelect: (subagentName: string) => void;
  onInstall: (subagentName: string) => void;
}

export function SubagentGrid({
  subagents,
  installingIds,
  onSelect,
  onInstall,
}: SubagentGridProps) {
  if (subagents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <span className="text-4xl mb-4">🤖</span>
        <p className="text-lg">No subagents found</p>
        <p className="text-sm">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {subagents.map((subagent) => (
        <SubagentCard
          key={subagent.name}
          subagent={subagent}
          isInstalling={installingIds.has(subagent.name)}
          onSelect={() => onSelect(subagent.name)}
          onInstall={() => onInstall(subagent.name)}
        />
      ))}
    </div>
  );
}
