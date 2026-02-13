import { describe, expect, it } from 'vitest';
import type { MemoryAtom } from '@gemini-cowork/shared';
import { createMemoryConsolidationService } from './consolidation-service.js';

function atom(
  id: string,
  content: string,
  options?: Partial<MemoryAtom>,
): MemoryAtom {
  const now = Date.now();
  return {
    id,
    projectId: 'project_test',
    atomType: 'semantic',
    content,
    summary: content,
    keywords: [],
    provenance: {
      source: 'assistant',
      tags: [],
    },
    confidence: 0.8,
    sensitivity: 'normal',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

describe('MemoryConsolidationService', () => {
  it('reduces redundant atoms by at least 35% while preserving pinned entries', () => {
    const now = Date.now();
    const store = new Map<string, MemoryAtom>([
      ['a1', atom('a1', 'User prefers concise answers and command output summaries.', { confidence: 0.95 })],
      ['a2', atom('a2', 'User prefers concise answers and command output summaries!', { confidence: 0.88 })],
      ['a3', atom('a3', 'User prefers concise answers with command output summaries.', { confidence: 0.82 })],
      ['b1', atom('b1', 'Project uses pnpm workspaces and turbo builds.', { pinned: true, confidence: 0.9 })],
      ['b2', atom('b2', 'Project uses pnpm workspaces and turbo builds.', { confidence: 0.7 })],
      ['c1', atom('c1', 'Always run lint and typecheck before merge.', { confidence: 0.86 })],
      ['c2', atom('c2', 'Always run lint and typecheck before merge', { confidence: 0.73 })],
      ['d1', atom('d1', 'Use deterministic benchmark IDs for repeatable scorecards.', { confidence: 0.76 })],
      ['d2', atom('d2', 'Use deterministic benchmark IDs for repeatable scorecards', { confidence: 0.66 })],
      ['e1', atom('e1', 'Keep error taxonomy structured by provider and retryability.', { confidence: 0.77 })],
      [
        'f1',
        atom('f1', 'Legacy temporary workaround for noisy logs.', {
          confidence: 0.8,
          pinned: false,
          updatedAt: now - 1000 * 60 * 60 * 24 * 30,
        }),
      ],
    ]);

    const service = createMemoryConsolidationService({
      listAtoms: () => Array.from(store.values()),
      upsertAtom: (entry) => {
        store.set(entry.id, entry);
      },
      deleteAtom: (id) => store.delete(id),
      now: () => now,
    });

    const result = service.run({
      strategy: 'balanced',
      redundancyThreshold: 0.9,
      decayFactor: 0.9,
      minConfidence: 0.2,
      staleAfterHours: 24 * 7,
    });

    expect(result.beforeCount).toBe(11);
    expect(result.redundancyReduction).toBeGreaterThanOrEqual(0.35);
    expect(result.recallRetention).toBeGreaterThanOrEqual(0.99);
    expect(result.decayedCount).toBeGreaterThanOrEqual(1);
    expect(store.has('b1')).toBe(true);
    expect(store.get('b1')?.pinned).toBe(true);
  });

  it('does not decay pinned stale memories', () => {
    const now = Date.now();
    const pinnedStale = atom('p1', 'Pinned stable memory', {
      pinned: true,
      confidence: 0.91,
      updatedAt: now - 1000 * 60 * 60 * 24 * 120,
    });
    const store = new Map<string, MemoryAtom>([['p1', pinnedStale]]);

    const service = createMemoryConsolidationService({
      listAtoms: () => Array.from(store.values()),
      upsertAtom: (entry) => {
        store.set(entry.id, entry);
      },
      deleteAtom: (id) => store.delete(id),
      now: () => now,
    });

    const result = service.run({
      staleAfterHours: 24 * 7,
      decayFactor: 0.5,
      minConfidence: 0.1,
    });

    expect(result.decayedCount).toBe(0);
    expect(store.get('p1')?.confidence).toBe(0.91);
  });
});
