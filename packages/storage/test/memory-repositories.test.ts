// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import type { MemoryAtom, MemoryQueryResult } from '@cowork/shared';
import { DatabaseConnection } from '../src/database.js';
import { MemoryAtomRepository } from '../src/repositories/memory-atom.js';
import { MemoryQueryRepository } from '../src/repositories/memory-query.js';

function createAtom(input: Partial<MemoryAtom> & Pick<MemoryAtom, 'id' | 'content'>): MemoryAtom {
  const now = Date.now();
  return {
    id: input.id,
    projectId: input.projectId || 'project_test',
    sessionId: input.sessionId,
    runId: input.runId,
    atomType: input.atomType || 'semantic',
    content: input.content,
    summary: input.summary,
    keywords: input.keywords || [],
    provenance: input.provenance || { source: 'assistant' },
    confidence: input.confidence ?? 0.8,
    sensitivity: input.sensitivity || 'normal',
    pinned: input.pinned || false,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    expiresAt: input.expiresAt,
  };
}

describe('Memory repositories integration', () => {
  it('supports atom upsert/read/list/search/delete flows', () => {
    const db = new DatabaseConnection({ inMemory: true });
    const repo = new MemoryAtomRepository(db);
    const now = Date.now();

    const atomA = createAtom({
      id: 'atom_a',
      content: 'Run lint and tests before merge.',
      summary: 'merge gate checks',
      sessionId: 'session_1',
      updatedAt: now - 1000,
      keywords: ['lint', 'tests'],
    });
    const atomB = createAtom({
      id: 'atom_b',
      content: 'Use branch graph panel for conflict resolution.',
      summary: 'branch operations',
      sessionId: 'session_1',
      pinned: true,
      updatedAt: now - 2000,
      keywords: ['branch', 'merge'],
    });
    const atomC = createAtom({
      id: 'atom_c',
      content: 'Workspace-wide note for another project.',
      projectId: 'project_other',
      sessionId: 'session_2',
      updatedAt: now,
    });

    repo.upsert(atomA);
    repo.upsert(atomB);
    repo.upsert(atomC);

    const found = repo.findById('atom_a');
    expect(found?.summary).toBe('merge gate checks');
    expect(found?.keywords).toEqual(['lint', 'tests']);

    const byProject = repo.listByProject('project_test');
    expect(byProject.map((entry) => entry.id)).toEqual(['atom_a', 'atom_b']);

    const bySession = repo.listBySession('session_1');
    expect(bySession.map((entry) => entry.id)).toEqual(['atom_a', 'atom_b']);

    const searchResults = repo.search('project_test', 'branch', 10);
    expect(searchResults[0]?.id).toBe('atom_b');
    expect(searchResults.some((entry) => entry.id === 'atom_a')).toBe(false);

    expect(repo.delete('atom_b')).toBe(true);
    expect(repo.findById('atom_b')).toBeNull();
    expect(repo.delete('atom_b')).toBe(false);
  });

  it('logs deep queries and feedback with retrievable history', () => {
    const db = new DatabaseConnection({ inMemory: true });
    const atomRepo = new MemoryAtomRepository(db);
    const queryRepo = new MemoryQueryRepository(db);
    const now = Date.now();

    const atom = createAtom({
      id: 'atom_memory_1',
      content: 'Always document release gates and migration checkpoints.',
      sessionId: 'session_memory',
      updatedAt: now,
    });
    atomRepo.upsert(atom);

    const queryResult: MemoryQueryResult = {
      queryId: 'query_1',
      sessionId: 'session_memory',
      query: 'release gate migration checks',
      options: {
        limit: 8,
        includeSensitive: false,
        includeGraphExpansion: true,
        lexicalWeight: 0.35,
        denseWeight: 0.4,
        graphWeight: 0.15,
        rerankWeight: 0.1,
      },
      evidence: [
        {
          atomId: atom.id,
          score: 0.92,
          reasons: ['keyword:release', 'keyword:migration'],
        },
      ],
      atoms: [atom],
      totalCandidates: 1,
      latencyMs: 12,
      createdAt: now,
    };

    queryRepo.logQuery(queryResult, 'project_test');
    const storedLog = queryRepo.findById('query_1');
    expect(storedLog).not.toBeNull();
    expect(storedLog?.resultAtomIds).toEqual(['atom_memory_1']);

    const sessionLogs = queryRepo.listRecentBySession('session_memory');
    expect(sessionLogs).toHaveLength(1);
    expect(sessionLogs[0]?.query).toContain('release gate');

    queryRepo.addFeedback({
      id: 'feedback_1',
      sessionId: 'session_memory',
      queryId: 'query_1',
      atomId: 'atom_memory_1',
      feedback: 'pin',
      note: 'critical instruction',
      createdAt: now + 1,
    });

    const feedback = queryRepo.listFeedbackForQuery('query_1');
    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.feedback).toBe('pin');
    expect(feedback[0]?.atomId).toBe('atom_memory_1');
  });
});

