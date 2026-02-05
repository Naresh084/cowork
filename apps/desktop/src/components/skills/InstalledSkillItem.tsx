import { Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SkillManifest, SkillEligibility } from '@gemini-cowork/shared';

interface InstalledSkillItemProps {
  skill: SkillManifest;
  eligibility?: SkillEligibility;
  isEnabled: boolean;
  onToggle: () => void;
  onUninstall: () => void;
  onSelect: () => void;
}

export function InstalledSkillItem({
  skill,
  eligibility,
  isEnabled,
  onToggle,
  onUninstall,
  onSelect,
}: InstalledSkillItemProps) {
  const emoji = skill.frontmatter.metadata?.emoji || '📦';
  const name = skill.frontmatter.name;
  const isEligible = !eligibility || eligibility.eligible;

  const getStatusBadge = () => {
    if (!isEligible) {
      return (
        <span className="flex items-center gap-1 text-xs text-amber-500 bg-amber-950/50 px-2 py-0.5 rounded-full">
          <AlertTriangle className="w-3 h-3" />
          Missing deps
        </span>
      );
    }
    if (isEnabled) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-500 bg-green-950/50 px-2 py-0.5 rounded-full">
          <Check className="w-3 h-3" />
          Enabled
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
        <X className="w-3 h-3" />
        Disabled
      </span>
    );
  };

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer',
        !isEligible && 'opacity-75'
      )}
      onClick={onSelect}
    >
      {/* Icon and Name */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-xl">{emoji}</span>
        <span className="font-medium text-zinc-100 truncate">{name}</span>
      </div>

      {/* Status */}
      <div className="flex-shrink-0">{getStatusBadge()}</div>

      {/* Requirements */}
      <div className="flex-shrink-0 w-24 text-center">
        {isEligible ? (
          <span className="text-xs text-green-500">All met</span>
        ) : (
          <span className="text-xs text-amber-500">
            {eligibility?.missingBins.length || 0} missing
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            'w-10 h-5 rounded-full relative transition-colors',
            isEnabled ? 'bg-blue-600' : 'bg-zinc-700'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
              isEnabled ? 'left-5' : 'left-0.5'
            )}
          />
        </button>

        {/* Uninstall */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUninstall();
          }}
          className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          title="Uninstall"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
