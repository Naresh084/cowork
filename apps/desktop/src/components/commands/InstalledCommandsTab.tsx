import { Package } from 'lucide-react';
import { useCommandStore } from '../../stores/command-store';
import { useSessionStore } from '../../stores/session-store';
import { InstalledCommandItem } from './InstalledCommandItem';

export function InstalledCommandsTab() {
  const {
    getInstalledCommands,
    selectCommand,
    uninstallCommand,
    isInstalling,
  } = useCommandStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const installedCommands = getInstalledCommands();

  if (installedCommands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Package className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">No commands installed</p>
        <p className="text-sm">Browse available commands to install them</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Table Header */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex-1">Command</div>
        <div className="w-24 text-center">Status</div>
        <div className="w-24 text-center">Category</div>
        <div className="w-24 text-center">Actions</div>
      </div>

      {/* Command List */}
      <div>
        {installedCommands.map((command) => (
          <InstalledCommandItem
            key={command.name}
            command={command}
            isUninstalling={isInstalling.has(command.name)}
            onUninstall={() => uninstallCommand(command.name, workingDirectory || undefined)}
            onSelect={() => selectCommand(command.name)}
          />
        ))}
      </div>
    </div>
  );
}
