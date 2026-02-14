// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useState } from 'react';
import { GitBranch, GitMerge, Plus, Loader2 } from 'lucide-react';
import { useSessionStore } from '../../stores/session-store';
import { useChatStore } from '../../stores/chat-store';
import { toast } from '../ui/Toast';
import { cn } from '@/lib/utils';

export function BranchGraphPanel() {
  const {
    activeSessionId,
    branchesBySession,
    activeBranchBySession,
    createBranch,
    mergeBranch,
    setActiveBranch,
  } = useSessionStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingName, setCreatingName] = useState('');
  const [mergeInFlightSource, setMergeInFlightSource] = useState<string | null>(null);
  const [switchInFlightBranchId, setSwitchInFlightBranchId] = useState<string | null>(null);
  const activeTurnId = useChatStore((state) => {
    if (!activeSessionId) return undefined;
    return state.sessions[activeSessionId]?.activeTurnId;
  });

  const branches = activeSessionId ? branchesBySession[activeSessionId] || [] : [];
  const activeBranchId = activeSessionId ? activeBranchBySession[activeSessionId] ?? null : null;
  const hasBranches = branches.length > 0;

  const handleCreateBranch = async () => {
    if (!activeSessionId) return;
    const name = creatingName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      await createBranch(activeSessionId, name, activeTurnId);
      setCreatingName('');
      setIsExpanded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Branch create failed', message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleMergeIntoActive = async (sourceBranchId: string) => {
    if (!activeSessionId || !activeBranchId || sourceBranchId === activeBranchId) return;
    setMergeInFlightSource(sourceBranchId);
    try {
      await mergeBranch(activeSessionId, sourceBranchId, activeBranchId, 'auto');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Merge failed', message);
    } finally {
      setMergeInFlightSource(null);
    }
  };

  const handleSwitchActiveBranch = async (branchId: string) => {
    if (!activeSessionId || !branchId || branchId === activeBranchId) return;
    setSwitchInFlightBranchId(branchId);
    try {
      await setActiveBranch(activeSessionId, branchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Branch switch failed', message);
    } finally {
      setSwitchInFlightBranchId(null);
    }
  };

  if (!activeSessionId) return null;

  return (
    <div className="border-b border-white/[0.06] bg-[#0e1016] px-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="inline-flex items-center gap-2 text-xs text-white/80 hover:text-white transition-colors"
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Branches</span>
          <span className="text-white/40">({branches.length})</span>
        </button>
        {activeBranchId ? (
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            Active: {branches.find((branch) => branch.id === activeBranchId)?.name || 'branch'}
          </span>
        ) : (
          <span className="text-[10px] text-white/40">No active branch</span>
        )}
      </div>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={creatingName}
              onChange={(event) => setCreatingName(event.target.value)}
              placeholder="New branch name"
              className="h-8 flex-1 rounded-md border border-white/10 bg-[#141722] px-2 text-xs text-white placeholder:text-white/35 focus:border-[#60A5FA] focus:outline-none"
              disabled={isCreating}
            />
            <button
              type="button"
              onClick={handleCreateBranch}
              disabled={isCreating || creatingName.trim().length === 0}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </button>
          </div>

          {hasBranches ? (
            <div className="max-h-44 space-y-1 overflow-auto pr-1">
              {branches.map((branch) => {
                const isActive = branch.id === activeBranchId;
                const canMerge = Boolean(activeBranchId && !isActive && branch.status === 'active');
                const mergePending = mergeInFlightSource === branch.id;
                const canSwitch = !isActive && branch.status === 'active';
                const switchPending = switchInFlightBranchId === branch.id;
                return (
                  <div
                    key={branch.id}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs',
                      isActive
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-white/10 bg-white/[0.03]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-white">{branch.name}</div>
                        <div className="text-[10px] text-white/45">
                          {branch.status}
                          {branch.parentBranchId ? ` · parent ${branch.parentBranchId.slice(0, 6)}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isActive && (
                          <span className="rounded border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200">
                            active
                          </span>
                        )}
                        {canMerge && (
                          <button
                            type="button"
                            onClick={() => handleMergeIntoActive(branch.id)}
                            disabled={mergePending}
                            className="inline-flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/80 hover:bg-white/10 disabled:opacity-50"
                          >
                            {mergePending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <GitMerge className="h-3 w-3" />
                            )}
                            Merge
                          </button>
                        )}
                        {canSwitch && (
                          <button
                            type="button"
                            onClick={() => handleSwitchActiveBranch(branch.id)}
                            disabled={switchPending}
                            className="inline-flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/80 hover:bg-white/10 disabled:opacity-50"
                          >
                            {switchPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            Use
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-white/10 px-2 py-3 text-center text-xs text-white/45">
              Create your first branch for parallel exploration.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
