// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';
import type {
  AIProvider,
  StreamGenerateRequest,
  StreamChunk,
  GenerateResponse,
} from '@cowork/providers';

const noopProvider: AIProvider = {
  id: 'google',
  name: 'noop',
  listModels: async () => [],
  getModel: async () => null,
  generate: async () => {
    throw new Error('not used');
  },
  stream: async function* (
    _request: StreamGenerateRequest
  ): AsyncGenerator<StreamChunk, GenerateResponse> {
    yield { type: 'done' };
    return {
      message: {
        id: 'noop',
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      },
      finishReason: 'stop',
    };
  },
  isReady: async () => true,
  validateCredentials: async () => true,
};

describe('zodToParameters', () => {
  it('maps zod schema to tool parameters with types and required flags', () => {
    const agent = createAgent({
      config: { model: 'gemini-3-flash-preview' },
      provider: noopProvider,
    });

    const schema = z.object({
      path: z.string().describe('Path to file'),
      count: z.number().optional().describe('Optional count'),
      enabled: z.boolean().default(true).describe('Enable flag'),
      tags: z.array(z.string()).optional().describe('Tags'),
      meta: z.object({ foo: z.string() }).optional().describe('Metadata'),
    });

    const params = (
      agent as unknown as {
        zodToParameters: (s: unknown) => Array<{ name: string; type: string; required: boolean }>;
      }
    ).zodToParameters(schema);

    expect(params).toEqual([
      { name: 'path', type: 'string', required: true, description: 'Path to file' },
      { name: 'count', type: 'number', required: false, description: 'Optional count' },
      {
        name: 'enabled',
        type: 'boolean',
        required: false,
        description: 'Enable flag',
        default: true,
      },
      { name: 'tags', type: 'array', required: false, description: 'Tags' },
      { name: 'meta', type: 'object', required: false, description: 'Metadata' },
    ]);
  });
});
