// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, clearMockInvokeResponses, setMockInvokeResponse } from '../test/mocks/tauri-core';
import { useSkillStore } from './skill-store';
import { useSettingsStore } from './settings-store';
import type { SkillManifest } from '@cowork/shared';

const WORKING_DIRECTORY = '/tmp/cowork';

function createManagedSkill(name: string): SkillManifest {
  return {
    id: `managed:${name}`,
    source: {
      type: 'managed',
      path: '/tmp/.cowork/skills',
      priority: 2,
    },
    frontmatter: {
      name,
      description: `${name} description`,
      metadata: {
        category: 'development',
      },
    },
    skillPath: `/tmp/.cowork/skills/${name}`,
    hasScripts: false,
    hasReferences: false,
    hasAssets: false,
  };
}

function resetState(): void {
  useSkillStore.getState().reset();
  useSettingsStore.setState({
    installedSkillConfigs: [],
  });
}

describe('skill store installed sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-14T00:00:00.000Z'));
    clearMockInvokeResponses();
    setMockInvokeResponse('agent_check_skill_eligibility', {
      eligible: true,
      missingBins: [],
      missingEnvVars: [],
      platformMismatch: false,
      installHints: [],
      foundBins: {},
    });
    (invoke as unknown as { mockClear: () => void }).mockClear();
    resetState();
  });

  it('auto-creates managed installed config for discovered managed skill', async () => {
    const managedSkill = createManagedSkill('skill-creator');
    setMockInvokeResponse('agent_discover_skills', [managedSkill]);

    await useSkillStore.getState().discoverSkills(WORKING_DIRECTORY);

    const configs = useSettingsStore.getState().installedSkillConfigs;
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      id: 'managed:skill-creator',
      name: 'skill-creator',
      source: 'managed',
      enabled: true,
    });
  });

  it('keeps installed count in sync with installed list', async () => {
    const managedSkill = createManagedSkill('skill-creator');
    setMockInvokeResponse('agent_discover_skills', [managedSkill]);

    await useSkillStore.getState().discoverSkills(WORKING_DIRECTORY);

    const installedCount = useSkillStore.getState().getInstalledCount();
    const installedSkills = useSkillStore.getState().getInstalledSkills();

    expect(installedCount).toBe(installedSkills.length);
    expect(installedSkills.map((skill) => skill.id)).toEqual(['managed:skill-creator']);
  });
});
