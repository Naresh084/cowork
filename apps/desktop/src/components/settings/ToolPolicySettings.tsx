import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { useToolPolicyStore } from '@/stores/tool-policy-store';
import type { ToolProfile } from '@gemini-cowork/shared';
import { TOOL_GROUP_DEFINITIONS, TOOL_PROFILES } from '@gemini-cowork/shared';

type ToolAction = 'allow' | 'ask' | 'deny';

const PROFILE_OPTIONS: Array<{
  value: ToolProfile;
  label: string;
  description: string;
}> = [
  { value: 'minimal', label: 'Minimal', description: 'Read-first profile, no shell/network.' },
  { value: 'readonly', label: 'Read Only', description: 'Read/search tools, blocks file writes.' },
  { value: 'coding', label: 'Coding', description: 'Balanced coding defaults.' },
  { value: 'messaging', label: 'Messaging', description: 'Network-heavy, limited filesystem.' },
  { value: 'research', label: 'Research', description: 'Research/search with guarded writes.' },
  {
    value: 'enterprise_balanced',
    label: 'Enterprise Balanced',
    description: 'Auditable defaults with controlled breadth.',
  },
  {
    value: 'enterprise_strict',
    label: 'Enterprise Strict',
    description: 'Locked-down defaults for strict environments.',
  },
  { value: 'full', label: 'Full Access', description: 'All tools allowed.' },
  { value: 'custom', label: 'Custom', description: 'Manual allow/deny and rule management.' },
];

const IMPACT_PREVIEW_TOOLS = [
  'read_file',
  'write_file',
  'edit_file',
  'execute',
  'web_search',
  'deep_research',
  'computer_use',
  'generate_image',
] as const;

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

function entryMatchesTool(entry: string, toolName: string): boolean {
  if (entry === '*') return true;
  if (entry === toolName) return true;

  if (entry.startsWith('group:')) {
    const groupTools =
      TOOL_GROUP_DEFINITIONS[
        entry as keyof typeof TOOL_GROUP_DEFINITIONS
      ] || [];
    return groupTools.includes(toolName);
  }

  if (entry.includes('*')) {
    return wildcardToRegex(entry).test(toolName);
  }

  return false;
}

function resolveToolAction(profile: ToolProfile, toolName: string): ToolAction {
  if (profile === 'custom') return 'ask';

  const profileDefinition = TOOL_PROFILES[profile];
  if (!profileDefinition) return 'ask';

  if (profileDefinition.deny.some((entry) => entryMatchesTool(entry, toolName))) {
    return 'deny';
  }
  if (profileDefinition.allow.some((entry) => entryMatchesTool(entry, toolName))) {
    return 'allow';
  }
  return 'ask';
}

function describeAction(action: ToolAction): string {
  if (action === 'allow') return 'Allow';
  if (action === 'deny') return 'Deny';
  return 'Ask';
}

export function ToolPolicySettings() {
  const policy = useToolPolicyStore((state) => state.policy);
  const isLoading = useToolPolicyStore((state) => state.isLoading);
  const loadPolicy = useToolPolicyStore((state) => state.loadPolicy);
  const setProfile = useToolPolicyStore((state) => state.setProfile);

  const [draftProfile, setDraftProfile] = useState<ToolProfile>('coding');

  useEffect(() => {
    if (!policy && !isLoading) {
      void loadPolicy().catch(() => undefined);
    }
  }, [isLoading, loadPolicy, policy]);

  useEffect(() => {
    if (policy?.profile) {
      setDraftProfile(policy.profile);
    }
  }, [policy?.profile]);

  const currentProfile = policy?.profile || 'coding';

  const previewRows = useMemo(
    () =>
      IMPACT_PREVIEW_TOOLS.map((toolName) => {
        const currentAction = resolveToolAction(currentProfile, toolName);
        const nextAction = resolveToolAction(draftProfile, toolName);
        return {
          toolName,
          currentAction,
          nextAction,
          changed: currentAction !== nextAction,
        };
      }),
    [currentProfile, draftProfile],
  );

  const changedRows = previewRows.filter((row) => row.changed);

  const nextActionCounts = useMemo(
    () =>
      previewRows.reduce(
        (accumulator, row) => {
          accumulator[row.nextAction] += 1;
          return accumulator;
        },
        { allow: 0, ask: 0, deny: 0 } as Record<ToolAction, number>,
      ),
    [previewRows],
  );

  const applyProfile = async () => {
    if (!policy || draftProfile === policy.profile) return;
    try {
      await setProfile(draftProfile);
      toast.success(
        'Policy profile updated',
        `Applied "${draftProfile}" profile.`,
      );
    } catch (error) {
      toast.error(
        'Failed to update policy profile',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-white/85">
            Policy Profile Editor
          </h4>
          <p className="mt-1 text-xs text-white/45">
            Preview tool impact before applying policy profile changes.
          </p>
        </div>
        <span className="rounded-full border border-white/[0.1] px-2 py-1 text-[11px] text-white/60">
          Current: {currentProfile}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/45">
            Draft profile
          </label>
          <select
            value={draftProfile}
            onChange={(event) =>
              setDraftProfile(event.target.value as ToolProfile)
            }
            disabled={isLoading}
            className="app-select app-select--compact w-full"
          >
            {PROFILE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-white/45">
            {
              PROFILE_OPTIONS.find((option) => option.value === draftProfile)
                ?.description
            }
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDraftProfile(currentProfile)}
          disabled={isLoading || draftProfile === currentProfile}
          className={cn(
            'h-8 rounded-lg border px-3 text-xs transition-colors',
            'border-white/[0.12] text-white/70 hover:bg-white/[0.06]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          Reset Draft
        </button>
        <button
          type="button"
          onClick={() => void applyProfile()}
          disabled={isLoading || draftProfile === currentProfile}
          className={cn(
            'h-8 rounded-lg border px-3 text-xs transition-colors',
            'border-[#1D4ED8]/45 bg-[#1D4ED8]/25 text-[#BFDBFE] hover:bg-[#1D4ED8]/35',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          Apply Profile
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-[#10B981]/25 bg-[#10B981]/10 px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-[#6EE7B7]">Allow</p>
          <p className="text-sm font-semibold text-[#A7F3D0]">{nextActionCounts.allow}</p>
        </div>
        <div className="rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-[#FCD34D]">Ask</p>
          <p className="text-sm font-semibold text-[#FDE68A]">{nextActionCounts.ask}</p>
        </div>
        <div className="rounded-lg border border-[#EF4444]/25 bg-[#EF4444]/10 px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-[#FCA5A5]">Deny</p>
          <p className="text-sm font-semibold text-[#FECACA]">{nextActionCounts.deny}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-[#0B0C10]/60">
        <div className="border-b border-white/[0.06] px-3 py-2">
          <p className="text-xs text-white/60">
            Preview impact ({changedRows.length} tool
            {changedRows.length === 1 ? '' : 's'} changing)
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {previewRows.map((row) => (
            <div
              key={row.toolName}
              className={cn(
                'grid grid-cols-[1.4fr_1fr_1fr] items-center gap-2 px-3 py-2 text-xs',
                'border-b border-white/[0.04] last:border-b-0',
                row.changed && 'bg-[#1D4ED8]/8',
              )}
            >
              <span className="font-mono text-white/80">{row.toolName}</span>
              <span className="text-white/55">
                now: {describeAction(row.currentAction)}
              </span>
              <span
                className={cn(
                  row.nextAction === 'allow' && 'text-[#86EFAC]',
                  row.nextAction === 'ask' && 'text-[#FCD34D]',
                  row.nextAction === 'deny' && 'text-[#FCA5A5]',
                )}
              >
                draft: {describeAction(row.nextAction)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
