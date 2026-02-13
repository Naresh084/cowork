import { useEffect } from 'react';
import { X, ExternalLink, Download, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSkillStore } from '../../stores/skill-store';
import { SkillRequirements } from './SkillRequirements';
import { SkillLifecycleBadges } from './SkillLifecycleBadges';

interface SkillDetailsPanelProps {
  skillId: string;
  onClose: () => void;
}

export function SkillDetailsPanel({ skillId, onClose }: SkillDetailsPanelProps) {
  const {
    availableSkills,
    eligibilityMap,
    isInstalling,
    checkEligibility,
    installSkill,
    uninstallSkill,
    isSkillInstalled,
    getSkillLifecycleInfo,
    setActiveTab,
    selectSkill,
  } = useSkillStore();

  const skill = availableSkills.find((s) => s.id === skillId);
  const eligibility = eligibilityMap.get(skillId);
  const isInstalled = isSkillInstalled(skillId);
  const isCurrentlyInstalling = isInstalling.has(skillId);
  const lifecycleInfo = getSkillLifecycleInfo(skillId);

  // Check eligibility if not already checked
  useEffect(() => {
    if (skillId && !eligibility) {
      checkEligibility(skillId);
    }
  }, [skillId, eligibility, checkEligibility]);

  if (!skill) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <p>Skill not found</p>
      </div>
    );
  }

  const emoji = skill.frontmatter.metadata?.emoji || '📦';
  const name = skill.frontmatter.name;
  const description = skill.frontmatter.description;
  const homepage = skill.frontmatter.homepage || skill.frontmatter.metadata?.homepage;
  const license = skill.frontmatter.license;
  const version = skill.frontmatter.metadata?.version;
  const author = skill.frontmatter.metadata?.author;
  const requirements = skill.frontmatter.metadata?.requires;
  const installOptions = skill.frontmatter.metadata?.install;

  const handleInstall = async () => {
    const installedSkillId = await installSkill(skillId);
    if (installedSkillId) {
      setActiveTab('installed');
      selectSkill(installedSkillId);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{emoji}</span>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{name}</h3>
            {skill.frontmatter.metadata?.category && (
              <span className="text-xs text-zinc-500">
                {skill.frontmatter.metadata.category}
              </span>
            )}
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
          <p className="text-sm text-zinc-300">{description}</p>
          <div className="mt-3">
            <SkillLifecycleBadges info={lifecycleInfo} />
          </div>
          {lifecycleInfo?.verificationNotes && (
            <p className="mt-2 text-xs text-zinc-400">{lifecycleInfo.verificationNotes}</p>
          )}
        </div>

        {/* Action Button */}
        <div>
          {isInstalled ? (
            <button
              onClick={() => uninstallSkill(skillId)}
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
              onClick={handleInstall}
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

        {/* Requirements */}
        <div>
          <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Requirements
          </h4>
          <SkillRequirements
            requirements={requirements}
            eligibility={eligibility}
            installOptions={installOptions}
          />
        </div>

        {/* Metadata */}
        <div>
          <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Details
          </h4>
          <dl className="space-y-2 text-sm">
            {version && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Version</dt>
                <dd className="text-zinc-300">{version}</dd>
              </div>
            )}
            {author && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Author</dt>
                <dd className="text-zinc-300">{author}</dd>
              </div>
            )}
            {license && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">License</dt>
                <dd className="text-zinc-300">{license}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-zinc-500">Source</dt>
              <dd className="text-zinc-300 capitalize">{skill.source.type}</dd>
            </div>
            {lifecycleInfo && (
              <>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Lifecycle</dt>
                  <dd className="text-zinc-300 capitalize">{lifecycleInfo.lifecycle}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Trust Level</dt>
                  <dd className="text-zinc-300 capitalize">{lifecycleInfo.trustLevel}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Provenance</dt>
                  <dd className="text-zinc-300 text-right max-w-[220px]">{lifecycleInfo.sourceReason}</dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {/* Homepage Link */}
        {homepage && (
          <a
            href={homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View documentation
          </a>
        )}
      </div>
    </div>
  );
}
