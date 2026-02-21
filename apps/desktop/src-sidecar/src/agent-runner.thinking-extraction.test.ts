// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { AgentRunner } from './agent-runner.js';

type MutableRunner = AgentRunner & {
  modelCatalog: Array<{ id: string; thinking?: boolean }>;
  runtimeConfig: { thinkingLevel: 'low' | 'medium' | 'high' };
  resolveThinkingConfigForModel: (
    modelId: string,
  ) =>
    | { includeThoughts?: boolean; thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH'; thinkingBudget?: number }
    | undefined;
  extractThinkingContent: (event: unknown) => string | null;
  extractStreamChunkText: (event: unknown) => string | null;
};

function createRunner(): MutableRunner {
  return new AgentRunner() as unknown as MutableRunner;
}

describe('agent-runner Gemini thinking extraction', () => {
  it('enables includeThoughts for thinking-capable Gemini models', () => {
    const runner = createRunner();
    runner.modelCatalog = [
      { id: 'gemini-3.1-pro', thinking: true },
      { id: 'gemini-2.5-flash', thinking: false },
    ];
    runner.runtimeConfig.thinkingLevel = 'medium';

    const config = runner.resolveThinkingConfigForModel('gemini-3.1-pro');
    expect(config).toBeDefined();
    expect(config?.includeThoughts).toBe(true);
    expect(config?.thinkingLevel).toBe('MEDIUM');
  });

  it('extracts thinking from modern LangChain chunks (type=thinking)', () => {
    const runner = createRunner();
    const thinking = runner.extractThinkingContent({
      data: {
        chunk: {
          content: [
            { type: 'thinking', thinking: 'First thought.' },
            { type: 'text', text: 'Final answer text' },
          ],
        },
      },
    });

    expect(thinking).toBe('First thought.');
  });

  it('does not leak thinking parts into assistant text stream', () => {
    const runner = createRunner();
    const text = runner.extractStreamChunkText({
      event: 'on_chat_model_stream',
      data: {
        chunk: {
          content: [
            { type: 'thinking', thinking: 'Hidden reasoning' },
            { type: 'text', text: 'Visible response' },
          ],
        },
      },
    });

    expect(text).toBe('Visible response');
  });
});

