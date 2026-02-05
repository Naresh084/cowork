import { Package } from 'lucide-react';
import { useSkillStore } from '../../stores/skill-store';
import { useSettingsStore } from '../../stores/settings-store';
import { InstalledSkillItem } from './InstalledSkillItem';

export function InstalledTab() {
  const {
    eligibilityMap,
    getInstalledSkills,
    selectSkill,
    toggleSkill,
    uninstallSkill,
  } = useSkillStore();

  const { installedSkillConfigs } = useSettingsStore();

  const installedSkills = getInstalledSkills();
  const configMap = new Map(installedSkillConfigs.map((c) => [c.id, c]));

  if (installedSkills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Package className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">No skills installed</p>
        <p className="text-sm">Browse the marketplace to install skills</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Table Header */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex-1">Skill</div>
        <div className="w-24 text-center">Status</div>
        <div className="w-24 text-center">Requirements</div>
        <div className="w-24 text-center">Actions</div>
      </div>

      {/* Skill List */}
      <div>
        {installedSkills.map((skill) => {
          const config = configMap.get(skill.id);
          const isEnabled = config?.enabled ?? (skill.source.type === 'managed');

          return (
            <InstalledSkillItem
              key={skill.id}
              skill={skill}
              eligibility={eligibilityMap.get(skill.id)}
              isEnabled={isEnabled}
              onToggle={() => toggleSkill(skill.id)}
              onUninstall={() => uninstallSkill(skill.id)}
              onSelect={() => selectSkill(skill.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
