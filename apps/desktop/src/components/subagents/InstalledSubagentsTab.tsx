// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { Bot } from 'lucide-react';
import { useSubagentStore } from '../../stores/subagent-store';
import { useSessionStore } from '../../stores/session-store';
import { InstalledSubagentItem } from './InstalledSubagentItem';

export function InstalledSubagentsTab() {
  const {
    getInstalledSubagents,
    selectSubagent,
    uninstallSubagent,
    isInstalling,
  } = useSubagentStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const installedSubagents = getInstalledSubagents();

  if (installedSubagents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Bot className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">No subagents installed</p>
        <p className="text-sm">Browse available subagents to install them</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Table Header */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex-1">Subagent</div>
        <div className="w-24 text-center">Status</div>
        <div className="w-24 text-center">Category</div>
        <div className="w-24 text-center">Actions</div>
      </div>

      {/* Subagent List */}
      <div>
        {installedSubagents.map((subagent) => (
          <InstalledSubagentItem
            key={subagent.name}
            subagent={subagent}
            isUninstalling={isInstalling.has(subagent.name)}
            onUninstall={() => uninstallSubagent(subagent.name, workingDirectory || undefined)}
            onSelect={() => selectSubagent(subagent.name)}
          />
        ))}
      </div>
    </div>
  );
}
