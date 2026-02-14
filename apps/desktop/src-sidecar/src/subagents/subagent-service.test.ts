import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SubagentService } from './subagent-service.js';

describe('SubagentService', () => {
  it('discovers installed managed subagents when fetching configs', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'cowork-subagent-service-'));
    try {
      const service = new SubagentService(appDataDir);
      await service.initialize();

      const subagentDir = join(appDataDir, 'subagents', 'research-helper');
      mkdirSync(subagentDir, { recursive: true });
      writeFileSync(
        join(subagentDir, 'subagent.json'),
        JSON.stringify({
          name: 'research-helper',
          displayName: 'Research Helper',
          description: 'Research assistant for docs and references.',
          version: '1.0.0',
          category: 'research',
          source: 'custom',
          skills: ['bird', '/skills/planner '],
        }),
        'utf-8',
      );
      writeFileSync(
        join(subagentDir, 'prompt.md'),
        'You are a focused research helper.',
        'utf-8',
      );

      const configs = await service.getSubagentConfigs('gemini-test');
      expect(configs).toHaveLength(1);
      expect(configs[0]?.name).toBe('research-helper');
      expect(configs[0]?.systemPrompt).toContain('focused research helper');
      expect(configs[0]?.model).toBe('gemini-test');
      expect(configs[0]?.skills).toEqual(['bird', '/skills/planner']);
    } finally {
      rmSync(appDataDir, { recursive: true, force: true });
    }
  });
});
