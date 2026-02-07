import type { Message } from '@gemini-cowork/shared';
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
});
