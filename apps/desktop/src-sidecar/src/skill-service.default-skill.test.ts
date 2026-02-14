// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

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
description: "Skill ${name}"
license: MIT
---

# ${name}

Use this skill when needed.
`,
    'utf-8',
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('skill-service default managed skill bootstrap', () => {
  it('installs bundled skill-creator into managed directory and remains idempotent', async () => {
    const appDataDir = createTempDir('cowork-default-skill-app-');
    const bundledDir = createTempDir('cowork-default-skill-bundle-');
    await writeSkillMarkdown(path.join(bundledDir, 'skill-creator'), 'skill-creator');

    const service = new SkillService(appDataDir);
    service.setBundledDir(bundledDir);

    const first = await service.ensureDefaultManagedSkillInstalled('skill-creator');
    expect(first.skillId).toBe('managed:skill-creator');
    expect(first.installed).toBe(true);

    const managedSkillDir = path.join(appDataDir, 'skills', 'skill-creator');
    expect(fs.existsSync(path.join(managedSkillDir, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(managedSkillDir, 'SIGNATURE.json'))).toBe(true);

    const second = await service.ensureDefaultManagedSkillInstalled('skill-creator');
    expect(second.skillId).toBe('managed:skill-creator');
    expect(second.installed).toBe(false);
  });
});
