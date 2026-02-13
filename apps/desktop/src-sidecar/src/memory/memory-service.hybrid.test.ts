import { mkdtempSync, mkdirSync, rmSync } from 'fs';
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

describe('MemoryService hybrid retrieval', () => {
  it('achieves precision@8 >= 0.88 on seeded evaluation set', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cowork-memory-hybrid-'));
    tmpRoots.push(root);
    const workingDir = join(root, 'workspace');
    const appDataDir = join(root, 'app-data');
    mkdirSync(workingDir, { recursive: true });
    mkdirSync(appDataDir, { recursive: true });

    const service = createMemoryService(workingDir, { appDataDir });
    await service.initialize();

    const relevantSamples = [
      'Before merging pull requests, run lint and typecheck commands.',
      'Merge gate requires lint plus typecheck to pass cleanly.',
      'Project policy: execute lint and typecheck before any merge.',
      'Run lint, then run typecheck, then merge when both are green.',
      'CI expects lint and typecheck checks before merge approval.',
      'Always perform lint and typecheck validation prior to merging.',
      'Pre-merge checklist includes lint and typecheck execution.',
      'Do not merge until lint and typecheck both complete successfully.',
      'Lint and typecheck are mandatory pre-merge validation steps.',
      'Merge readiness depends on lint and typecheck results.',
    ];

    const noiseSamples = [
      'Use onboarding wizard defaults for first run setup.',
      'Browser operator should capture blocker screenshots for review.',
      'Keep release gate status visible in dashboard header.',
      'Store connector secrets in keychain-backed secure storage.',
      'Workflow retries should include deterministic compensation hooks.',
      'Prefer concise response tone in general conversations.',
      'Use branch merge graph panel for branch conflict navigation.',
      'Schedule periodic benchmark runs for trend monitoring.',
      'Use memory inspector to pin important long-term entries.',
      'Enable research mode with multi-source evidence synthesis.',
    ];

    for (let index = 0; index < relevantSamples.length; index += 1) {
      await service.create({
        title: `relevant-${index + 1}`,
        content: relevantSamples[index]!,
        group: 'learnings',
        tags: ['lint', 'typecheck', 'merge', `relevant-${index + 1}`],
        source: 'auto',
        confidence: 0.95,
      });
    }

    for (let index = 0; index < noiseSamples.length; index += 1) {
      await service.create({
        title: `noise-${index + 1}`,
        content: noiseSamples[index]!,
        group: 'context',
        tags: ['noise', `topic-${index + 1}`],
        source: 'auto',
        confidence: 0.55,
      });
    }

    const result = await service.deepQuery(
      'session-hybrid-test',
      'Before merge we must run lint and typecheck checks.',
      {
        limit: 8,
        lexicalWeight: 0.35,
        denseWeight: 0.4,
        graphWeight: 0.15,
        rerankWeight: 0.1,
      },
    );

    const relevantHits = result.atoms.filter((atom) => {
      const normalized = atom.content.toLowerCase();
      const hasMergeIntent = normalized.includes('merge') || normalized.includes('merging');
      return normalized.includes('lint') && normalized.includes('typecheck') && hasMergeIntent;
    }).length;

    const precisionAt8 = relevantHits / 8;
    expect(precisionAt8).toBeGreaterThanOrEqual(0.88);
  });
});
