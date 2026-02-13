import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner.js';
import { skillService } from './skill-service.js';

type MutableRunner = AgentRunner & {
  enabledSkillIds: Set<string>;
  buildSkillsPrompt: (session: { workingDirectory: string }) => Promise<string>;
};

describe('agent-runner skills prompt loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses compact native skill prompt when synced skills are enabled', async () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    runner.enabledSkillIds = new Set(['skill-zeta', 'skill-alpha']);

    vi.spyOn(skillService, 'getSkill')
      .mockResolvedValueOnce({
        id: 'skill-zeta',
        frontmatter: { name: 'Zeta' },
      } as unknown as Awaited<ReturnType<typeof skillService.getSkill>>)
      .mockResolvedValueOnce({
        id: 'skill-alpha',
        frontmatter: { name: 'Alpha' },
      } as unknown as Awaited<ReturnType<typeof skillService.getSkill>>);

    const prompt = await runner.buildSkillsPrompt({
      workingDirectory: process.cwd(),
    });

    expect(prompt).toContain('Enabled skills are available through native skill loading from `/skills/`.');
    expect(prompt).toContain('Available skills: Alpha, Zeta');
    expect(prompt).toContain('Load and apply only the skills relevant to the current task.');
    expect(prompt).not.toContain('###');
  });
});
