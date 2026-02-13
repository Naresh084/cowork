import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryService } from './memory-service.js';

const tmpRoots: string[] = [];

afterEach(() => {
  for (const root of tmpRoots.splice(0, tmpRoots.length)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeLegacyMemoryFixture(
  workingDir: string,
  id: string,
  fileName: string,
  content: string,
  group: string,
): void {
  const memoriesDir = join(workingDir, '.cowork', 'memories');
  mkdirSync(memoriesDir, { recursive: true });
  writeFileSync(join(memoriesDir, fileName), content, 'utf-8');
  writeFileSync(
    join(memoriesDir, 'index.json'),
    JSON.stringify(
      {
        memories: {
          [id]: {
            filePath: fileName,
            group,
          },
        },
      },
      null,
      2,
    ),
    'utf-8',
  );
}

describe('MemoryService legacy migration', () => {
  it('imports legacy index memories and GEMINI.md instructions once with a report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cowork-memory-migration-'));
    tmpRoots.push(root);
    const workingDir = join(root, 'workspace');
    const appDataDir = join(root, 'app-data');
    mkdirSync(workingDir, { recursive: true });
    mkdirSync(appDataDir, { recursive: true });

    writeLegacyMemoryFixture(
      workingDir,
      'legacy_note_1',
      'legacy-note.md',
      `---
title: Legacy Note
group: context
tags: [legacy, notes]
source: manual
confidence: 1
---
Keep branch merges small and review checkpoints after each tool call.
`,
      'context',
    );
    writeFileSync(
      join(workingDir, 'GEMINI.md'),
      '# Legacy Project Instructions\nAlways run lint and tests before merge.',
      'utf-8',
    );

    const service = createMemoryService(workingDir, { appDataDir });
    await service.initialize();

    const imported = await service.getAll();
    expect(imported.some((entry) => entry.id === 'legacy_note_1')).toBe(true);
    expect(imported.some((entry) => entry.tags.includes('legacy_gemini_md'))).toBe(true);

    const report = service.getMigrationReport();
    expect(report).not.toBeNull();
    expect(report?.importedFromLegacyIndex).toBe(1);
    expect(report?.importedGeminiMd).toBe(1);
    expect(report?.legacySourceDir.endsWith('.cowork/memories')).toBe(true);
    expect(report?.legacyGeminiPath.endsWith('GEMINI.md')).toBe(true);

    writeLegacyMemoryFixture(
      workingDir,
      'legacy_note_2',
      'legacy-note-2.md',
      'This memory should not import because migration is already marked done.',
      'context',
    );

    const serviceSecondRun = createMemoryService(workingDir, { appDataDir });
    await serviceSecondRun.initialize();
    const importedSecondRun = await serviceSecondRun.getAll();
    expect(importedSecondRun.some((entry) => entry.id === 'legacy_note_2')).toBe(false);
    expect(importedSecondRun.filter((entry) => entry.tags.includes('legacy_gemini_md')).length).toBe(1);
  });
});

