import { Loader2 } from 'lucide-react';
import { useSkillStore } from '../../stores/skill-store';
import { useSettingsStore } from '../../stores/settings-store';
import { SkillGrid } from './SkillGrid';

export function AvailableTab() {
  const {
    isDiscovering,
    eligibilityMap,
    isInstalling,
    getFilteredSkills,
    selectSkill,
    installSkill,
    enableSkill,
  } = useSkillStore();

  const { installedSkillConfigs } = useSettingsStore();
  const installedIds = new Set(installedSkillConfigs.map((c) => c.id));

  const filteredSkills = getFilteredSkills();

  if (isDiscovering) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>Discovering skills...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <SkillGrid
        skills={filteredSkills}
        eligibilityMap={eligibilityMap}
        installedIds={installedIds}
        installingIds={isInstalling}
        onSelect={selectSkill}
        onInstall={installSkill}
        onEnable={enableSkill}
      />
    </div>
  );
}
