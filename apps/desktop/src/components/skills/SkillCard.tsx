import { Check, AlertTriangle, Download, Loader2, FolderOpen, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SkillManifest, SkillEligibility } from '@gemini-cowork/shared';

interface SkillCardProps {
  skill: SkillManifest;
  eligibility?: SkillEligibility;
  isInstalled: boolean;
  isInstalling: boolean;
  onSelect: () => void;
  onInstall: () => void;
  onEnable?: () => void;
}

export function SkillCard({
  skill,
  eligibility,
  isInstalled,
  isInstalling,
  onSelect,
  onInstall,
  onEnable,
}: SkillCardProps) {
  const emoji = skill.frontmatter.metadata?.emoji || '📦';
  const name = skill.frontmatter.name;
  const description = skill.frontmatter.description;
  const isEligible = !eligibility || eligibility.eligible;
  const hasRequirements = eligibility && !eligibility.eligible;
  const isPlatform = skill.source.type === 'platform';

  const handleInstallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlatform && onEnable) {
      onEnable();
    } else if (!isInstalled && !isInstalling) {
      onInstall();
    }
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all hover:border-zinc-600',
        'bg-zinc-800/50 border-zinc-700',
        isInstalled && 'border-green-800/50 bg-green-950/20',
        isPlatform && !isInstalled && 'border-violet-800/30 bg-violet-950/10'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{emoji}</span>
          <h3 className="font-medium text-zinc-100">{name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isPlatform && (
            <span className="flex items-center gap-1 text-xs text-violet-400 bg-violet-950/50 px-2 py-0.5 rounded-full">
              <FolderOpen className="w-3 h-3" />
              Platform
            </span>
          )}
          {isInstalled && (
            <span className="flex items-center gap-1 text-xs text-green-500 bg-green-950/50 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3" />
              {isPlatform ? 'Enabled' : 'Installed'}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{description}</p>

      {/* Status and Actions */}
      <div className="flex items-center justify-between">
        {/* Status */}
        <div>
          {hasRequirements ? (
            <span className="flex items-center gap-1 text-xs text-amber-500">
              <AlertTriangle className="w-3 h-3" />
              Requires setup
            </span>
          ) : isEligible ? (
            <span className="text-xs text-zinc-500">
              {skill.frontmatter.metadata?.category || 'custom'}
            </span>
          ) : null}
        </div>

        {/* Install/Enable Button */}
        {!isInstalled && (
          <button
            onClick={handleInstallClick}
            disabled={isInstalling}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              isInstalling
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : isPlatform
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
            )}
          >
            {isInstalling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isPlatform ? (
              <ToggleRight className="w-3.5 h-3.5" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {isInstalling ? 'Installing...' : isPlatform ? 'Enable' : 'Install'}
          </button>
        )}
      </div>
    </div>
  );
}
