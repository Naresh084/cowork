// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SkillService } from './skill-service.js';
import { parseFrontmatter } from './skill-parser.js';

describe('SkillService auto repair', () => {
  it('repairs managed skills with invalid frontmatter', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'cowork-skill-repair-'));

    try {
      const service = new SkillService(appDataDir);
      const skillDir = join(appDataDir, 'skills', 'broken-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '# Broken Skill\n\nThis file had no frontmatter.\n',
        'utf-8',
      );

      const result = await service.autoRepairManagedSkills();
      expect(result.scanned).toBe(1);
      expect(result.repaired).toBe(1);

      const repaired = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
      const frontmatter = parseFrontmatter(repaired);
      expect(frontmatter?.name).toBe('broken-skill');
      expect(typeof frontmatter?.description).toBe('string');
      expect((frontmatter?.description || '').length).toBeGreaterThan(0);
    } finally {
      rmSync(appDataDir, { recursive: true, force: true });
    }
  });
});
