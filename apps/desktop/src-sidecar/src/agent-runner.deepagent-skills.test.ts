import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner.js';
import { skillService } from './skill-service.js';

type MutableRunner = AgentRunner & {
  enabledSkillIds: Set<string>;
  resolveDeepAgentSkillConfig: () => Promise<{
    skills: string[] | undefined;
    syncSkillIds: string[];
  }>;
};

describe('agent-runner deepagent skill config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables /skills source when managed skills exist even without enabled skill IDs', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set();

    vi.spyOn(skillService, 'getInstalledSkillIds').mockResolvedValue(['managed:planner']);

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toEqual(['/skills/']);
    expect(config.syncSkillIds).toEqual([]);
  });

  it('deduplicates sync skill IDs and ignores blank values', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set([
      'managed:planner',
      ' managed:planner ',
      '',
      '  ',
      'platform:web-search',
    ]);

    vi.spyOn(skillService, 'getInstalledSkillIds').mockResolvedValue([]);

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toEqual(['/skills/']);
    expect(config.syncSkillIds).toEqual(['managed:planner', 'platform:web-search']);
  });

  it('disables /skills source when no enabled or installed skills exist', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set();

    vi.spyOn(skillService, 'getInstalledSkillIds').mockResolvedValue([]);

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toBeUndefined();
    expect(config.syncSkillIds).toEqual([]);
  });

  it('fails closed when installed-skill discovery throws and no enabled skills exist', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set();

    vi.spyOn(skillService, 'getInstalledSkillIds').mockRejectedValue(new Error('discovery failed'));

    const config = await runner.resolveDeepAgentSkillConfig();
    expect(config.skills).toBeUndefined();
    expect(config.syncSkillIds).toEqual([]);
  });
});
