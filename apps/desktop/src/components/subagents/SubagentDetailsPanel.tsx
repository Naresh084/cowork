import { X, Download, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubagentStore } from '../../stores/subagent-store';
import { useSessionStore } from '../../stores/session-store';
import type { SubagentCategory } from '../../stores/subagent-store';
import {
  Search,
  Code,
  BarChart2,
  Zap,
  FileText,
} from 'lucide-react';

// Category icons mapping
const CATEGORY_ICONS: Record<SubagentCategory, React.ComponentType<{ className?: string }>> = {
  research: Search,
  development: Code,
  analysis: BarChart2,
  productivity: Zap,
  custom: FileText,
};

// Category colors
const CATEGORY_COLORS: Record<SubagentCategory, string> = {
  research: 'text-[#06B6D4]',
  development: 'text-[#27AE60]',
  analysis: 'text-[#F39C12]',
  productivity: 'text-[#9B59B6]',
  custom: 'text-white/60',
};

interface SubagentDetailsPanelProps {
  subagentName: string;
  onClose: () => void;
}

export function SubagentDetailsPanel({ subagentName, onClose }: SubagentDetailsPanelProps) {
  const {
    getSubagentByName,
    isSubagentInstalled,
    installSubagent,
    uninstallSubagent,
    isInstalling,
  } = useSubagentStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const subagent = getSubagentByName(subagentName);
  const isInstalled = isSubagentInstalled(subagentName);
  const isCurrentlyInstalling = isInstalling.has(subagentName);

  if (!subagent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <p>Subagent not found</p>
      </div>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[subagent.category] || FileText;
  const categoryColor = CATEGORY_COLORS[subagent.category] || 'text-zinc-400';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
            <CategoryIcon className={cn('w-5 h-5', categoryColor)} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{subagent.displayName}</h3>
            <span className="text-xs text-zinc-500 capitalize">
              {subagent.category}
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
          <p className="text-sm text-zinc-300">{subagent.description}</p>
        </div>

        {/* Action Button */}
        <div>
          {isInstalled ? (
            <button
              onClick={() => uninstallSubagent(subagent.name, workingDirectory || undefined)}
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
              onClick={() => installSubagent(subagent.name, workingDirectory || undefined)}
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

        {/* Tags */}
        {subagent.tags && subagent.tags.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
              Tags
            </h4>
            <div className="flex flex-wrap gap-2">
              {subagent.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tools */}
        {subagent.tools && subagent.tools.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
              Allowed Tools
            </h4>
            <div className="flex flex-wrap gap-2">
              {subagent.tools.map((tool) => (
                <span
                  key={tool}
                  className="px-2 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300 font-mono"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* System Prompt Preview */}
        <div>
          <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            System Prompt Preview
          </h4>
          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 max-h-40 overflow-y-auto">
            <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
              {subagent.systemPrompt.slice(0, 500)}
              {subagent.systemPrompt.length > 500 && '...'}
            </pre>
          </div>
        </div>

        {/* Metadata */}
        <div>
          <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Details
          </h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Version</dt>
              <dd className="text-zinc-300">{subagent.version}</dd>
            </div>
            {subagent.author && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Author</dt>
                <dd className="text-zinc-300">{subagent.author}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-zinc-500">Source</dt>
              <dd className="text-zinc-300 capitalize">{subagent.source}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Status</dt>
              <dd className={cn('capitalize', isInstalled ? 'text-green-400' : 'text-zinc-500')}>
                {isInstalled ? 'Installed' : 'Not Installed'}
              </dd>
            </div>
            {subagent.model && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Model Override</dt>
                <dd className="text-zinc-300">{subagent.model}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-zinc-500">Priority</dt>
              <dd className="text-zinc-300">{subagent.priority}</dd>
            </div>
          </dl>
        </div>

        {/* Usage Tip */}
        <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
          <p className="text-xs text-zinc-400">
            <span className="text-zinc-300 font-medium">Tip:</span> Installed subagents are automatically
            available to the main agent for task delegation. The agent will choose the best subagent
            based on the task at hand.
          </p>
        </div>
      </div>
    </div>
  );
}
