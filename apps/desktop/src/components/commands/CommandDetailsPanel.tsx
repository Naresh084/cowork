import { X, Download, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommandStore } from '../../stores/command-store';
import { useSessionStore } from '../../stores/session-store';
import type { CommandCategory } from '../../stores/command-store';
import {
  FolderCog,
  Brain,
  Settings,
  Zap,
  FileText,
} from 'lucide-react';

// Category icons mapping
const CATEGORY_ICONS: Record<CommandCategory, React.ComponentType<{ className?: string }>> = {
  setup: FolderCog,
  memory: Brain,
  utility: Settings,
  workflow: Zap,
  custom: FileText,
};

// Category colors
const CATEGORY_COLORS: Record<CommandCategory, string> = {
  setup: 'text-[#4C71FF]',
  memory: 'text-[#9B59B6]',
  utility: 'text-[#F5C400]',
  workflow: 'text-[#27AE60]',
  custom: 'text-white/60',
};

interface CommandDetailsPanelProps {
  commandName: string;
  onClose: () => void;
}

export function CommandDetailsPanel({ commandName, onClose }: CommandDetailsPanelProps) {
  const {
    getCommandByName,
    isCommandInstalled,
    installCommand,
    uninstallCommand,
    isInstalling,
  } = useCommandStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const command = getCommandByName(commandName);
  const isInstalled = isCommandInstalled(commandName);
  const isCurrentlyInstalling = isInstalling.has(commandName);

  if (!command) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <p>Command not found</p>
      </div>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[command.category] || FileText;
  const categoryColor = CATEGORY_COLORS[command.category] || 'text-zinc-400';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
            <CategoryIcon className={cn('w-5 h-5', categoryColor)} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">/{command.name}</h3>
            <span className="text-xs text-zinc-500 capitalize">
              {command.category}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-zinc-800 text-zinc-500 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Description */}
        <div>
          <p className="text-sm text-zinc-300">{command.description}</p>
        </div>

        {/* Action Button */}
        <div>
          {isInstalled ? (
            <button
              onClick={() => uninstallCommand(command.name, workingDirectory || undefined)}
              disabled={isCurrentlyInstalling}
              className={cn(
                'flex items-center justify-center gap-2 w-full py-2 rounded-lg font-medium transition-colors',
                isCurrentlyInstalling
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-700'
              )}
            >
              {isCurrentlyInstalling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {isCurrentlyInstalling ? 'Uninstalling...' : 'Uninstall'}
            </button>
          ) : (
            <button
              onClick={() => installCommand(command.name, workingDirectory || undefined)}
              disabled={isCurrentlyInstalling}
              className={cn(
                'flex items-center justify-center gap-2 w-full py-2 rounded-lg font-medium transition-colors',
                isCurrentlyInstalling
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              )}
            >
              {isCurrentlyInstalling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isCurrentlyInstalling ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>

        {/* Aliases */}
        {command.aliases.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
              Aliases
            </h4>
            <div className="flex flex-wrap gap-2">
              {command.aliases.map((alias) => (
                <span
                  key={alias}
                  className="px-2 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300"
                >
                  /{alias}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Arguments */}
        {command.arguments.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
              Arguments
            </h4>
            <div className="space-y-2">
              {command.arguments.map((arg) => (
                <div
                  key={arg.name}
                  className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">{arg.name}</span>
                    <span className="text-xs text-zinc-500">({arg.type})</span>
                    {arg.required && (
                      <span className="text-xs text-red-400">required</span>
                    )}
                  </div>
                  {arg.description && (
                    <p className="text-xs text-zinc-400">{arg.description}</p>
                  )}
                  {arg.default !== undefined && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Default: {String(arg.default)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div>
          <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Details
          </h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Version</dt>
              <dd className="text-zinc-300">{command.version}</dd>
            </div>
            {command.author && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Author</dt>
                <dd className="text-zinc-300">{command.author}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-zinc-500">Type</dt>
              <dd className="text-zinc-300 capitalize">{command.type}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Source</dt>
              <dd className="text-zinc-300 capitalize">{command.source}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Status</dt>
              <dd className={cn('capitalize', isInstalled ? 'text-green-400' : 'text-zinc-500')}>
                {isInstalled ? 'Installed' : 'Not Installed'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Requires Session</dt>
              <dd className="text-zinc-300">{command.requiresSession ? 'Yes' : 'No'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Requires Working Dir</dt>
              <dd className="text-zinc-300">{command.requiresWorkingDir ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        </div>

        {/* Usage Tip */}
        <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
          <p className="text-xs text-zinc-400">
            <span className="text-zinc-300 font-medium">Tip:</span> Type{' '}
            <code className="px-1 py-0.5 rounded bg-zinc-700 text-blue-400">/{command.name}</code>{' '}
            in the chat input to use this command.
          </p>
        </div>
      </div>
    </div>
  );
}
