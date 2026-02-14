// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useMemo } from 'react';
import { Puzzle, Sparkles } from 'lucide-react';
import { useChatStore } from '../../stores/chat-store';
import { useSessionStore } from '../../stores/session-store';
import {
  useSettingsStore,
  type InstalledSkillConfig,
} from '../../stores/settings-store';
import { extractSkillNameFromArgs } from '../chat/tool-metadata';
import { CollapsibleSection } from './CollapsibleSection';

interface InstalledSkillRow {
  id: string;
  name: string;
  source: InstalledSkillConfig['source'];
  enabled: boolean;
  usedInSession: boolean;
  firstUsedAt: number | null;
}

function isSkillReadTool(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'read_file' || lower.includes('read');
}

function formatSkillSource(source: InstalledSkillConfig['source']): string {
  switch (source) {
    case 'bundled':
      return 'Bundled';
    case 'managed':
      return 'Marketplace';
    case 'workspace':
      return 'Workspace';
    case 'custom':
      return 'Custom';
    case 'platform':
      return 'Platform';
    default:
      return source;
  }
}

function SkillItem({ skill }: { skill: InstalledSkillRow }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-white/50" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white/80 block truncate">{skill.name}</span>
        <span className="text-xs text-white/40">
          {formatSkillSource(skill.source)} | {skill.usedInSession ? 'Used in this chat' : 'Not used yet'}
        </span>
      </div>
      <span
        className={
          skill.enabled
            ? 'text-[10px] px-1.5 py-0.5 rounded-full border border-[#50956A]/40 bg-[#50956A]/15 text-[#B9F2CB]'
            : 'text-[10px] px-1.5 py-0.5 rounded-full border border-white/[0.16] bg-white/[0.04] text-white/55'
        }
      >
        {skill.enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  );
}

export function InstalledSkillsUsedSection() {
  const { activeSessionId } = useSessionStore();
  const chatItems = useChatStore(
    (state) => state.getSessionState(activeSessionId).chatItems
  );
  const installedSkillConfigs = useSettingsStore((state) => state.installedSkillConfigs);

  const installedSkills = useMemo(() => {
    const installedByName = new Map<string, InstalledSkillConfig>();
    for (const config of installedSkillConfigs) {
      const key = config.name.toLowerCase();
      const existing = installedByName.get(key);
      if (!existing || (!existing.enabled && config.enabled)) {
        installedByName.set(key, config);
      }
    }

    const usageByName = new Map<string, number>();
    for (const item of chatItems) {
      if (item.kind !== 'tool_start') continue;
      if (!isSkillReadTool(item.name)) continue;

      const skillName = extractSkillNameFromArgs(item.args as Record<string, unknown> | undefined);
      if (!skillName) continue;

      const key = skillName.toLowerCase();
      const firstSeen = usageByName.get(key);
      if (firstSeen === undefined || item.timestamp < firstSeen) {
        usageByName.set(key, item.timestamp);
      }
    }

    return Array.from(installedByName.values())
      .map<InstalledSkillRow>((config) => {
        const key = config.name.toLowerCase();
        const firstUsedAt = usageByName.get(key) ?? null;
        return {
          id: config.id,
          name: config.name,
          source: config.source,
          enabled: config.enabled,
          usedInSession: firstUsedAt !== null,
          firstUsedAt,
        };
      })
      .sort((a, b) => {
        if (a.usedInSession && b.usedInSession) {
          return (a.firstUsedAt ?? 0) - (b.firstUsedAt ?? 0);
        }
        if (a.usedInSession) return -1;
        if (b.usedInSession) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [chatItems, installedSkillConfigs]);

  const usedCount = installedSkills.filter((skill) => skill.usedInSession).length;
  const totalCount = installedSkills.length;
  const badge = totalCount > 0 ? `${usedCount}/${totalCount}` : undefined;

  return (
    <CollapsibleSection
      id="installedSkillsUsed"
      title="Installed Skills"
      icon={Puzzle}
      badge={badge}
    >
      {installedSkills.length === 0 ? (
        <div className="text-sm text-white/30 py-2">No installed skills</div>
      ) : (
        <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 space-y-0.5">
          {installedSkills.map((skill) => (
            <SkillItem key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
