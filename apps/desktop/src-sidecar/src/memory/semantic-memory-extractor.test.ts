// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { Message } from '@cowork/shared';
import { createSemanticMemoryExtractor } from './semantic-memory-extractor.js';

function message(role: Message['role'], content: string): Message {
  return {
    id: `${role}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

describe('SemanticMemoryExtractor', () => {
  it('extracts durable natural-language preferences without trigger phrases', async () => {
    const extractor = createSemanticMemoryExtractor({
      style: 'balanced',
      invokeModel: async () =>
        JSON.stringify({
          candidates: [
            {
              group: 'preferences',
              content: 'User prefers concise responses, avoids emojis, and wants command outputs summarized.',
              confidence: 0.92,
              stable: true,
              scope: 'user',
              sensitive: false,
              tags: ['communication', 'style'],
            },
          ],
        }),
    });

    const result = await extractor.extract([
      message('user', 'Could you keep answers tight and skip emojis? Also summarize command output.'),
      message('assistant', 'Understood. I will keep responses concise and avoid emojis.'),
    ]);

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].group).toBe('preferences');
    expect(result.memories[0].content.toLowerCase()).toContain('concise responses');
    expect(result.memories[0].tags).toContain('communication');
  });

  it('filters sensitive, unstable, and low-confidence candidates', async () => {
    const extractor = createSemanticMemoryExtractor({
      style: 'balanced',
      invokeModel: async () =>
        JSON.stringify({
          candidates: [
            {
              group: 'context',
              content: 'Use this temporary workaround for today only.',
              confidence: 0.95,
              stable: false,
              scope: 'workflow',
              sensitive: false,
            },
            {
              group: 'preferences',
              content: 'API key is sk-xxxx and should be saved.',
              confidence: 0.99,
              stable: true,
              scope: 'user',
              sensitive: true,
            },
            {
              group: 'instructions',
              content: 'Always run lint before commit in this repo.',
              confidence: 0.4,
              stable: true,
              scope: 'project',
              sensitive: false,
            },
          ],
        }),
    });

    const result = await extractor.extract([
      message('user', 'For this repository, run lint before commit.'),
    ]);

    expect(result.memories).toHaveLength(0);
  });

  it('supports JSON repair fallback for fenced/trailing-comma model output', async () => {
    const extractor = createSemanticMemoryExtractor({
      style: 'aggressive',
      invokeModel: async () =>
        [
          '```json',
          '{',
          '  "candidates": [',
          '    {',
          '      "group": "context",',
          '      "content": "Project uses pnpm workspaces and Turbo for builds.",',
          '      "confidence": 0.9,',
          '      "stable": true,',
          '      "scope": "project",',
          '      "sensitive": false,',
          '    }',
          '  ]',
          '}',
          '```',
        ].join('\n'),
    });

    const result = await extractor.extract([
      message('user', 'Heads up: this codebase uses pnpm workspace + turbo.'),
    ]);

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].group).toBe('context');
    expect(result.memories[0].content).toContain('pnpm');
  });

  it('filters contradictory candidates by keeping the highest-confidence polarity', async () => {
    const extractor = createSemanticMemoryExtractor({
      style: 'aggressive',
      invokeModel: async () =>
        JSON.stringify({
          candidates: [
            {
              group: 'preferences',
              content: 'User prefers verbose explanations for implementation details.',
              confidence: 0.92,
              stable: true,
              scope: 'user',
              sensitive: false,
            },
            {
              group: 'preferences',
              content: 'User does not prefer verbose explanations for implementation details.',
              confidence: 0.75,
              stable: true,
              scope: 'user',
              sensitive: false,
            },
          ],
        }),
    });

    const result = await extractor.extract([
      message('user', 'Please keep implementation explanations detailed.'),
    ]);

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content.toLowerCase()).toContain('prefers verbose');
  });

  it('filters sensitive candidates based on heuristic patterns even when model marks non-sensitive', async () => {
    const extractor = createSemanticMemoryExtractor({
      style: 'aggressive',
      invokeModel: async () =>
        JSON.stringify({
          candidates: [
            {
              group: 'instructions',
              content: 'API key is sk-abc1234567890123456789 and should be reused for tests.',
              confidence: 0.95,
              stable: true,
              scope: 'project',
              sensitive: false,
            },
          ],
        }),
    });

    const result = await extractor.extract([
      message('user', 'Store this key for future runs.'),
    ]);

    expect(result.memories).toHaveLength(0);
  });

  it('keeps benign candidates with <1% false-positive sensitivity filtering', async () => {
    const benignCandidates = Array.from({ length: 120 }, (_, index) => ({
      group: 'context',
      content: `topic${index} workflow preference keeps command output concise and structured for repo track ${index}.`,
      confidence: 0.93,
      stable: true,
      scope: 'project',
      sensitive: false,
    }));

    const extractor = createSemanticMemoryExtractor({
      style: 'aggressive',
      maxPerConversation: 200,
      maxAcceptedPerTurn: 200,
      confidenceThreshold: 0.5,
      invokeModel: async () =>
        JSON.stringify({
          candidates: benignCandidates,
        }),
    });

    const result = await extractor.extract([
      message('user', 'Please remember standard workflow notes for this repository.'),
    ]);

    const falsePositiveRate = (benignCandidates.length - result.memories.length) / benignCandidates.length;
    expect(falsePositiveRate).toBeLessThan(0.01);
  });
});
