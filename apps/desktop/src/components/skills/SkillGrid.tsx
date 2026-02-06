import type { SkillManifest, SkillEligibility } from '@gemini-cowork/shared';
import { SkillCard } from './SkillCard';

interface SkillGridProps {
  skills: SkillManifest[];
  eligibilityMap: Map<string, SkillEligibility>;
  installedIds: Set<string>;
  installingIds: Set<string>;
  onSelect: (skillId: string) => void;
  onInstall: (skillId: string) => void;
  onEnable?: (skillId: string) => void;
}

export function SkillGrid({
  skills,
  eligibilityMap,
  installedIds,
  installingIds,
  onSelect,
  onInstall,
  onEnable,
}: SkillGridProps) {
  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <span className="text-4xl mb-4">🔍</span>
        <p className="text-lg">No skills found</p>
        <p className="text-sm">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          eligibility={eligibilityMap.get(skill.id)}
          isInstalled={installedIds.has(skill.id) || skill.source.type === 'managed'}
          isInstalling={installingIds.has(skill.id)}
          onSelect={() => onSelect(skill.id)}
          onInstall={() => onInstall(skill.id)}
          onEnable={onEnable ? () => onEnable(skill.id) : undefined}
        />
      ))}
    </div>
  );
}
