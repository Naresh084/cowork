// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useMemoryStore } from './memory-store';
import { clearMockInvokeResponses, setMockInvokeResponse } from '../test/mocks/tauri-core';

describe('memory-store deep query and feedback', () => {
  beforeEach(() => {
    useMemoryStore.getState().reset();
    clearMockInvokeResponses();
    vi.clearAllMocks();
  });

  it('maps deep query evidence into ranked atoms with confidence/explanations', async () => {
    setMockInvokeResponse('deep_memory_query', {
      queryId: 'mq_1',
      sessionId: 'session-1',
      query: 'lint and typecheck before merge',
      options: {
        limit: 2,
        includeSensitive: false,
        includeGraphExpansion: true,
        lexicalWeight: 0.35,
        denseWeight: 0.4,
        graphWeight: 0.15,
        rerankWeight: 0.1,
      },
      evidence: [
        {
          atomId: 'atom-2',
          score: 0.93,
          reasons: ['tag:lint', 'confidence:0.97'],
        },
        {
          atomId: 'atom-1',
          score: 0.82,
          reasons: ['tag:typecheck'],
        },
      ],
      atoms: [
        {
          id: 'atom-1',
          projectId: 'project-1',
          atomType: 'semantic',
          content: 'Run lint and typecheck before merge.',
          confidence: 0.91,
          createdAt: Date.now() - 1000,
          updatedAt: Date.now() - 1000,
        },
        {
          id: 'atom-2',
          projectId: 'project-1',
          atomType: 'semantic',
          content: 'Merge gate requires lint and typecheck.',
          confidence: 0.97,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      totalCandidates: 12,
      latencyMs: 42,
      createdAt: Date.now(),
    });

    const ranked = await useMemoryStore.getState().runDeepQuery(
      'session-1',
      'lint and typecheck before merge',
      { limit: 2 },
    );

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.id).toBe('atom-2');
    expect(ranked[0]?.queryScore).toBe(0.93);
    expect(ranked[0]?.confidenceScore).toBe(0.97);
    expect(ranked[0]?.explanations).toContain('tag:lint');

    const state = useMemoryStore.getState();
    expect(state.deepQueryResult?.queryId).toBe('mq_1');
    expect(state.deepQueryAtoms[0]?.id).toBe('atom-2');
    expect(state.isDeepQuerying).toBe(false);
    expect(state.error).toBeNull();
  });

  it('submits deep feedback and keeps a bounded feedback log', async () => {
    setMockInvokeResponse('deep_memory_feedback', {
      id: 'fb-1',
      sessionId: 'session-1',
      queryId: 'mq_1',
      atomId: 'atom-2',
      feedback: 'positive',
      note: 'highly relevant',
      createdAt: Date.now(),
    });

    const feedback = await useMemoryStore
      .getState()
      .submitDeepFeedback('session-1', 'mq_1', 'atom-2', 'positive', 'highly relevant');

    expect(invoke).toHaveBeenCalledWith('deep_memory_feedback', {
      sessionId: 'session-1',
      queryId: 'mq_1',
      atomId: 'atom-2',
      feedback: 'positive',
      note: 'highly relevant',
    });
    expect(feedback?.id).toBe('fb-1');

    const state = useMemoryStore.getState();
    expect(state.lastFeedback?.id).toBe('fb-1');
    expect(state.feedbackLog).toHaveLength(1);
    expect(state.isSubmittingFeedback).toBe(false);
    expect(state.error).toBeNull();
  });

  it('returns validation error when deep query inputs are missing', async () => {
    const result = await useMemoryStore.getState().runDeepQuery('', '');

    expect(result).toEqual([]);
    expect(useMemoryStore.getState().error).toBe('Session ID and query are required for deep query');
  });
});
