import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { SettingHelpPopover } from '@/components/help/SettingHelpPopover';
import { useCapabilityStore } from '@/stores/capability-store';
import { useToolPolicyStore } from '@/stores/tool-policy-store';
import { ToolPolicySettings } from './ToolPolicySettings';
import type { ToolRule } from '@gemini-cowork/shared';

export function CapabilitySettings() {
  const refreshCapabilitySnapshot = useCapabilityStore((state) => state.refreshSnapshot);
  const capabilitySnapshot = useCapabilityStore((state) => state.snapshot);
  const capabilitySnapshotLoading = useCapabilityStore((state) => state.isLoading);
  const toolPolicy = useToolPolicyStore((state) => state.policy);
  const toolPolicyLoading = useToolPolicyStore((state) => state.isLoading);
  const loadToolPolicy = useToolPolicyStore((state) => state.loadPolicy);
  const setToolPolicyProfile = useToolPolicyStore((state) => state.setProfile);
  const updateToolPolicy = useToolPolicyStore((state) => state.updatePolicy);
  const [updatingToolPolicyName, setUpdatingToolPolicyName] = useState<string | null>(null);

  useEffect(() => {
    void loadToolPolicy().catch(() => undefined);
    void refreshCapabilitySnapshot().catch(() => undefined);
  }, [loadToolPolicy, refreshCapabilitySnapshot]);

  const toolAccess = capabilitySnapshot?.toolAccess || [];
  const sortedToolAccess = useMemo(
    () =>
      [...toolAccess].sort((left, right) => {
        if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
        return left.toolName.localeCompare(right.toolName);
      }),
    [toolAccess],
  );

  const handleToolPolicyChange = async (
    toolName: string,
    nextAction: 'allow' | 'ask' | 'deny',
  ) => {
    setUpdatingToolPolicyName(toolName);
    try {
      if (!toolPolicy) {
        await loadToolPolicy();
      }

      let currentPolicy = useToolPolicyStore.getState().policy;
      if (!currentPolicy) {
        throw new Error('Tool policy is unavailable.');
      }

      if (currentPolicy.profile !== 'custom') {
        await setToolPolicyProfile('custom');
        currentPolicy = useToolPolicyStore.getState().policy;
        if (!currentPolicy) {
          throw new Error('Failed to switch tool policy profile to custom.');
        }
      }

      const nextGlobalAllow = new Set(
        currentPolicy.globalAllow.filter((entry) => entry !== toolName),
      );
      const nextGlobalDeny = new Set(
        currentPolicy.globalDeny.filter((entry) => entry !== toolName),
      );
      const nextRules = currentPolicy.rules.filter(
        (rule: ToolRule) => !(rule.tool === toolName && !rule.conditions),
      );

      if (nextAction === 'allow') {
        nextGlobalAllow.add(toolName);
      } else if (nextAction === 'deny') {
        nextGlobalDeny.add(toolName);
      }

      await updateToolPolicy({
        globalAllow: Array.from(nextGlobalAllow),
        globalDeny: Array.from(nextGlobalDeny),
        rules: nextRules,
      });

      await refreshCapabilitySnapshot();
      toast.success(`Updated ${toolName} policy to ${nextAction.toUpperCase()}`);
    } catch (error) {
      toast.error(
        `Failed to update ${toolName} policy`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setUpdatingToolPolicyName(null);
    }
  };

  return (
    <div className="space-y-4" data-tour-id="settings-capabilities-section">
      <div>
        <h3 className="text-sm font-medium text-white/90">Capabilities</h3>
        <p className="mt-1 text-xs text-white/40">
          Review capability availability and change the permission policy for each tool in one place.
        </p>
      </div>

      <ToolPolicySettings />

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-white/85">Capability Access + Permission Policy</h4>
          <SettingHelpPopover settingId="capability.policyControl" />
        </div>
        <p className="text-xs text-white/40">
          Set policy inline per capability. First edit switches profile to <code>custom</code> automatically.
        </p>

        {toolPolicy?.profile !== 'custom' ? (
          <p className="text-[11px] text-[#FCD34D]">
            Current profile is <code>{toolPolicy?.profile || 'coding'}</code>. Your first change here will switch to
            <code> custom</code>.
          </p>
        ) : null}

        {capabilitySnapshotLoading ? (
          <p className="text-xs text-white/45">Loading capability controls…</p>
        ) : sortedToolAccess.length === 0 ? (
          <p className="text-xs text-white/45">No capability tools found for this runtime.</p>
        ) : (
          <div className="space-y-2">
            {sortedToolAccess.map((entry) => {
              const isUpdating = updatingToolPolicyName === entry.toolName;
              return (
                <div
                  key={entry.toolName}
                  className="rounded-lg border border-white/[0.06] bg-[#0B0C10]/60 px-3 py-2.5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white/88 font-mono">{entry.toolName}</p>
                        <span
                          className={cn(
                            'rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                            entry.enabled
                              ? 'border-[#10B981]/35 bg-[#10B981]/15 text-[#86EFAC]'
                              : 'border-[#F59E0B]/35 bg-[#F59E0B]/12 text-[#FCD34D]',
                          )}
                        >
                          {entry.enabled ? 'Available' : 'Unavailable'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-white/40">{entry.reason}</p>
                    </div>

                    <div className="shrink-0">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-white/45">
                        Permission
                      </p>
                      <select
                        value={entry.policyAction}
                        onChange={(event) =>
                          void handleToolPolicyChange(
                            entry.toolName,
                            event.target.value as 'allow' | 'ask' | 'deny',
                          )
                        }
                        disabled={toolPolicyLoading || isUpdating}
                        className="app-select app-select--compact w-[132px]"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#1D4ED8]/20 bg-[#1D4ED8]/10 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
        <p className="text-xs text-[#93C5FD]">
          Capability policy changes apply immediately for upcoming tool calls. If capabilities still appear stale,
          start a new session and retry.
        </p>
      </div>
    </div>
  );
}
