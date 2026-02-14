// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { Loader2 } from 'lucide-react';
import { useSubagentStore, useIsLoadingSubagents } from '../../stores/subagent-store';
import { useSessionStore } from '../../stores/session-store';
import { SubagentGrid } from './SubagentGrid';

export function AvailableSubagentsTab() {
  const {
    getFilteredSubagents,
    isInstalling,
    selectSubagent,
    installSubagent,
    setActiveTab,
  } = useSubagentStore();

  const { sessions, activeSessionId } = useSessionStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workingDirectory = activeSession?.workingDirectory;

  const isLoading = useIsLoadingSubagents();
  const filteredSubagents = getFilteredSubagents();

  const handleInstall = async (name: string) => {
    const installedName = await installSubagent(name, workingDirectory || undefined);
    if (installedName) {
      setActiveTab('installed');
      selectSubagent(installedName);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>Loading subagents...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <SubagentGrid
        subagents={filteredSubagents}
        installingIds={isInstalling}
        onSelect={selectSubagent}
        onInstall={handleInstall}
      />
    </div>
  );
}
