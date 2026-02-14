// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner.js';
import { skillService } from './skill-service.js';

type MutableRunner = AgentRunner & {
  enabledSkillIds: Set<string>;
  resolveDeepAgentSkillConfig: () => Promise<{
    skills: string[] | undefined;
    syncSkillIds: string[];
  }>;
  resolveSubagentSkillSources: (
    declaredSubagentSkills: string[] | undefined,
    installedSkillSources: string[] | undefined,
  ) => string[];
};

describe('agent-runner deepagent skill config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables /skills source with all installed managed skills when no enabled skill IDs exist', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set();
    vi.spyOn(skillService, 'autoRepairManagedSkills').mockResolvedValue({ scanned: 0, repaired: 0 });

    vi.spyOn(skillService, 'getInstalledSkillIds').mockResolvedValue(['managed:planner']);

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toEqual(['/skills/']);
    expect(config.syncSkillIds).toEqual(['managed:planner']);
  });

  it('deduplicates enabled skill IDs and keeps only installed managed skill IDs', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set([
      'managed:planner',
      ' managed:planner ',
      '',
      '  ',
      'platform:web-search',
    ]);
    vi.spyOn(skillService, 'autoRepairManagedSkills').mockResolvedValue({ scanned: 0, repaired: 0 });

    vi.spyOn(skillService, 'getInstalledSkillIds').mockResolvedValue(['managed:planner', 'managed:writer']);

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toEqual(['/skills/']);
    expect(config.syncSkillIds).toEqual(['managed:planner']);
  });

  it('disables /skills source when enabled skill IDs are not installed as managed skills', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set(['platform:web-search']);
    vi.spyOn(skillService, 'autoRepairManagedSkills').mockResolvedValue({ scanned: 0, repaired: 0 });

    vi.spyOn(skillService, 'getInstalledSkillIds').mockResolvedValue([]);

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toBeUndefined();
    expect(config.syncSkillIds).toEqual([]);
  });

  it('disables /skills source when no enabled or installed skills exist', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set();
    vi.spyOn(skillService, 'autoRepairManagedSkills').mockResolvedValue({ scanned: 0, repaired: 0 });

    vi.spyOn(skillService, 'getInstalledSkillIds').mockResolvedValue([]);

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toBeUndefined();
    expect(config.syncSkillIds).toEqual([]);
  });

  it('fails closed when installed-skill discovery throws and no enabled skills exist', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set();
    vi.spyOn(skillService, 'autoRepairManagedSkills').mockResolvedValue({ scanned: 0, repaired: 0 });

    vi.spyOn(skillService, 'getInstalledSkillIds').mockRejectedValue(new Error('discovery failed'));

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toBeUndefined();
    expect(config.syncSkillIds).toEqual([]);
  });

  it('maps declared subagent skill names to /skills/* and filters to installed set', () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    const resolved = runner.resolveSubagentSkillSources(
      ['bird', '/skills/planner', 'skills/invalid', ''],
      ['/skills/'],
    );
    expect(resolved).toEqual(['/skills/']);
  });

  it('inherits installed skill sources when subagent has no explicit skills', () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    const resolved = runner.resolveSubagentSkillSources(
      undefined,
      ['/skills/bird'],
    );
    expect(resolved).toEqual(['/skills/bird']);
  });
});
