import type { CommandManifest } from '../../stores/command-store';
import { useCommandStore } from '../../stores/command-store';
import { CommandCard } from './CommandCard';

interface CommandGridProps {
  commands: CommandManifest[];
  onSelect: (commandId: string) => void;
  onInstall: (commandId: string) => void;
}

export function CommandGrid({
  commands,
  onSelect,
  onInstall,
}: CommandGridProps) {
  const { isInstalling, isCommandInstalled } = useCommandStore();

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
          key={command.id}
          command={command}
          isInstalled={isCommandInstalled(command.id)}
          isInstalling={isInstalling.has(command.id)}
          onSelect={() => onSelect(command.id)}
          onInstall={() => onInstall(command.id)}
        />
      ))}
    </div>
  );
}
