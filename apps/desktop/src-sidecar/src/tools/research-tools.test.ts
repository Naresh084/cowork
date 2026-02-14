// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const { runDeepResearchMock } = vi.hoisted(() => ({
  runDeepResearchMock: vi.fn(),
}));

vi.mock('@cowork/providers', () => ({
  runDeepResearch: runDeepResearchMock,
}));

import { createDeepResearchTool } from './research-tools.js';

const baseContext = {
  workingDirectory: process.cwd(),
  sessionId: 'session_test',
  agentId: 'agent_test',
};

describe('research-tools resilient deep research execution', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    runDeepResearchMock.mockReset();
  });

  it('passes retry budget/duration/resume token to provider and writes report', async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), 'cowork-research-test-'));

    runDeepResearchMock.mockResolvedValue({
      report: '# Deep Report\n\nFindings.\n\n- [Example](https://example.com/article)',
      citations: [{ title: 'source', url: 'https://example.com' }],
      searchQueries: ['test query'],
      duration: 1200,
      status: 'completed',
      partial: false,
      interactionId: 'interaction_123',
      pollAttempts: 4,
      retryAttempts: 1,
    });

    const tool = createDeepResearchTool(() => 'test-api-key', () => 'deep-model-v1');
    const result = await tool.execute(
      {
        query: 'research this topic',
        includeFiles: ['context.md'],
        retryBudget: 7,
        maxDurationMinutes: 12,
        resumeToken: {
          interactionId: 'interaction_123',
          agent: 'deep-model-v1',
          createdAt: Date.now(),
        },
      },
      {
        ...baseContext,
        appDataDir,
      },
    );

    expect(result.success).toBe(true);
    expect(runDeepResearchMock).toHaveBeenCalledTimes(1);
    expect(runDeepResearchMock.mock.calls[0]?.[0]).toBe('test-api-key');
    expect(runDeepResearchMock.mock.calls[0]?.[1]).toMatchObject({
      query: 'research this topic',
      files: ['context.md'],
      agent: 'deep-model-v1',
      retryBudget: 7,
      maxPollingDurationMs: 12 * 60 * 1000,
      resumeToken: {
        interactionId: 'interaction_123',
      },
      allowPartialResult: true,
    });

    const reportPath = (result as { data?: { reportPath?: string } }).data?.reportPath;
    expect(reportPath).toBeTruthy();

    const reportContent = await readFile(String(reportPath), 'utf-8');
    expect(reportContent).toContain('Deep Report');
    const data = (result as {
      data?: {
        evidence?: Array<{ url: string; confidence: number; rank: number }>;
        evidenceSummary?: { totalSources: number; avgConfidence: number };
      };
    }).data;
    expect(Array.isArray(data?.evidence)).toBe(true);
    expect((data?.evidence || []).length).toBeGreaterThan(0);
    expect((data?.evidence || []).every((item) => typeof item.url === 'string')).toBe(true);
    expect((data?.evidence || [])[0]?.rank).toBe(1);
    expect((data?.evidenceSummary?.totalSources || 0)).toBeGreaterThan(0);
    expect((data?.evidenceSummary?.avgConfidence || 0)).toBeGreaterThan(0);

    await rm(appDataDir, { recursive: true, force: true });
  });

  it('writes fallback partial marker when report text is empty', async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), 'cowork-research-test-'));

    runDeepResearchMock.mockResolvedValue({
      report: '',
      citations: [{ title: 'source', url: 'https://example.com' }],
      searchQueries: ['partial query'],
      duration: 2000,
      status: 'partial',
      partial: true,
      interactionId: 'interaction_partial',
      pollAttempts: 8,
      retryAttempts: 3,
      resumeToken: {
        interactionId: 'interaction_partial',
        agent: 'deep-model-v1',
        createdAt: Date.now(),
      },
    });

    const tool = createDeepResearchTool(() => 'test-api-key', () => 'deep-model-v1');
    const result = await tool.execute(
      {
        query: 'research with partial output',
      },
      {
        ...baseContext,
        appDataDir,
      },
    );

    expect(result.success).toBe(true);
    const reportPath = (result as { data?: { reportPath?: string } }).data?.reportPath;
    const reportContent = await readFile(String(reportPath), 'utf-8');
    expect(reportContent).toContain('Deep Research (partial)');

    await rm(appDataDir, { recursive: true, force: true });
  });

  it('returns typed failure when provider throws', async () => {
    runDeepResearchMock.mockRejectedValue(new Error('network timeout'));

    const tool = createDeepResearchTool(() => 'test-api-key', () => 'deep-model-v1');
    const result = await tool.execute(
      {
        query: 'research failure path',
      },
      baseContext,
    );

    expect(result.success).toBe(false);
    expect(String(result.error || '')).toContain('network timeout');
  });
});
