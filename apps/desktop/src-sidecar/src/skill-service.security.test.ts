import * as fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { SkillService } from './skill-service.js';

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeSkillMarkdown(targetDir: string, name: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    path.join(targetDir, 'SKILL.md'),
    `---
name: ${name}
description: "Skill ${name} description"
---

Use this skill for test automation.
`,
    'utf-8'
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('skill-service signed pack validation', () => {
  it('blocks unsigned managed skill packs by default', async () => {
    const appDataDir = createTempDir('cowork-skills-appdata-');
    const managedDir = path.join(appDataDir, 'skills');
    await writeSkillMarkdown(path.join(managedDir, 'unsigned-skill'), 'unsigned-skill');

    const service = new SkillService(appDataDir);
    const discovered = await service.discoverFromDirectory(managedDir, 'managed', 2);
    expect(discovered).toHaveLength(0);
  });

  it('signs skill pack during install so managed discovery remains valid', async () => {
    const appDataDir = createTempDir('cowork-skills-appdata-');
    const bundledDir = createTempDir('cowork-skills-bundled-');
    await writeSkillMarkdown(path.join(bundledDir, 'signed-on-install-skill'), 'signed-on-install-skill');

    const service = new SkillService(appDataDir);
    service.setBundledDir(bundledDir);

    const discovered = await service.discoverAll();
    const target = discovered.find((skill) => skill.frontmatter.name === 'signed-on-install-skill');
    expect(target).toBeDefined();

    await service.installSkill(target!.id);

    const signaturePath = path.join(appDataDir, 'skills', 'signed-on-install-skill', 'SIGNATURE.json');
    expect(fs.existsSync(signaturePath)).toBe(true);

    const managedDiscovered = await service.discoverFromDirectory(path.join(appDataDir, 'skills'), 'managed', 2);
    expect(managedDiscovered.some((skill) => skill.frontmatter.name === 'signed-on-install-skill')).toBe(true);
  });
});
