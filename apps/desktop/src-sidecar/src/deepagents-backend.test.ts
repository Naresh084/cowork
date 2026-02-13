import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CoworkBackend } from './deepagents-backend.js';

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }),
  );
});

describe('CoworkBackend skill virtual file support', () => {
  it('exposes virtual skills through ls/read/readRaw/glob', async () => {
    const workingDirectory = await createTempDir('cowork-backend-skills-');
    const backend = new CoworkBackend(
      workingDirectory,
      'session-test',
      undefined,
      undefined,
      undefined,
      new Map([
        [
          '/skills/reviewer/SKILL.md',
          [
            '---',
            'name: reviewer',
            'description: code review assistant',
            '---',
            'Use a strict checklist before approving changes.',
          ].join('\n'),
        ],
      ]),
    );

    const listing = await backend.lsInfo('/skills/');
    expect(listing).toEqual([
      expect.objectContaining({
        path: '/skills/reviewer/',
        is_dir: true,
      }),
    ]);

    const readResult = await backend.read('/skills/reviewer/SKILL.md', 0, 20);
    expect(readResult).toContain('name: reviewer');
    expect(readResult).toContain('Use a strict checklist');

    const rawResult = await backend.readRaw('/skills/reviewer/SKILL.md');
    expect(rawResult.content).toContain('name: reviewer');
    expect(rawResult.content).toContain('Use a strict checklist before approving changes.');

    const globResult = await backend.globInfo('/skills/**/SKILL.md', '/skills/');
    expect(globResult).toEqual([
      expect.objectContaining({
        path: '/skills/reviewer/SKILL.md',
        is_dir: false,
      }),
    ]);
  });

  it('prefers synced virtual skills over managed-directory duplicates', async () => {
    const workingDirectory = await createTempDir('cowork-backend-skills-dupe-');
    const managedSkillsDir = join(workingDirectory, 'managed-skills');
    await mkdir(join(managedSkillsDir, 'reviewer'), { recursive: true });
    await writeFile(
      join(managedSkillsDir, 'reviewer', 'SKILL.md'),
      'Filesystem copy should not win when virtual sync exists.',
      'utf-8',
    );

    const backend = new CoworkBackend(
      workingDirectory,
      'session-test',
      undefined,
      managedSkillsDir,
      undefined,
      new Map([
        ['/skills/reviewer/SKILL.md', 'Virtual synced skill content should win.'],
      ]),
    );

    const readResult = await backend.read('/skills/reviewer/SKILL.md', 0, 20);
    expect(readResult).toContain('Virtual synced skill content should win.');
    expect(readResult).not.toContain('Filesystem copy should not win');

    const grepResult = await backend.grepRaw('Filesystem copy', '/skills/');
    expect(Array.isArray(grepResult)).toBe(true);
    if (!Array.isArray(grepResult)) {
      throw new Error('Expected grep result array for duplicate skill paths');
    }
    expect(grepResult).toHaveLength(0);
  });

  it('supports grepRaw across virtual skills', async () => {
    const workingDirectory = await createTempDir('cowork-backend-skills-grep-');
    const backend = new CoworkBackend(
      workingDirectory,
      'session-test',
      undefined,
      undefined,
      undefined,
      new Map([
        ['/skills/planner/SKILL.md', 'Always build a milestone checklist before execution.'],
      ]),
    );

    const grepResult = await backend.grepRaw('checklist', '/skills/');
    expect(Array.isArray(grepResult)).toBe(true);
    if (!Array.isArray(grepResult)) {
      throw new Error('Expected grep result array for virtual skills');
    }
    expect(grepResult).toEqual([
      expect.objectContaining({
        path: '/skills/planner/SKILL.md',
      }),
    ]);
  });
});
