import type { Command } from '../../stores/command-store';
import { CommandCard } from './CommandCard';

interface CommandGridProps {
  commands: Command[];
  installingIds: Set<string>;
  onSelect: (commandName: string) => void;
  onInstall: (commandName: string) => void;
}

export function CommandGrid({
  commands,
  installingIds,
  onSelect,
  onInstall,
}: CommandGridProps) {
  if (commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <span className="text-4xl mb-4">🔍</span>
        <p className="text-lg">No commands found</p>
        <p className="text-sm">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {commands.map((command) => (
        <CommandCard
          key={command.name}
          command={command}
          isInstalling={installingIds.has(command.name)}
          onSelect={() => onSelect(command.name)}
          onInstall={() => onInstall(command.name)}
        />
      ))}
    </div>
  );
}
