import { Loader2 } from 'lucide-react';
import { useCommandStore, useIsLoadingCommands } from '../../stores/command-store';
import { useSessionStore } from '../../stores/session-store';
import { CommandGrid } from './CommandGrid';

export function AvailableCommandsTab() {
  const {
    getFilteredCommands,
    isInstalling,
    selectCommand,
    installCommand,
  } = useCommandStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const isLoading = useIsLoadingCommands();
  const filteredCommands = getFilteredCommands();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>Loading commands...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <CommandGrid
        commands={filteredCommands}
        installingIds={isInstalling}
        onSelect={selectCommand}
        onInstall={(name) => installCommand(name, workingDirectory || undefined)}
      />
    </div>
  );
}
