// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { Message } from '@cowork/shared';
import { createMiddlewareStack } from '../middleware/middleware-stack.js';

function msg(role: Message['role'], content: string): Message {
  return {
    id: `${role}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

describe('memory orchestrator middleware', () => {
  it('uses configured maxMemoriesInPrompt for retrieval', async () => {
    const getRelevantMemories = vi.fn().mockResolvedValue([
      {
        id: 'mem-1',
        title: 'Style preference',
        content: 'User wants concise answers.',
        group: 'preferences',
        tags: ['style'],
        relevanceScore: 0.91,
      },
    ]);
    const addRelatedSession = vi.fn().mockResolvedValue(undefined);

    const memoryService = {
      getRelevantMemories,
      addRelatedSession,
      upsertAutoMemory: vi.fn(),
    } as any;

    const memoryExtractor = {
      isEnabled: vi.fn().mockReturnValue(true),
      extract: vi.fn().mockResolvedValue({ memories: [], messagesProcessed: 0, extractedAt: new Date().toISOString() }),
    } as any;

    const stack = await createMiddlewareStack(
      { id: 'sess-1', messages: [], model: 'x' },
      memoryService,
      memoryExtractor,
      null,
      { maxMemoriesInPrompt: 3, autoExtract: true },
    );

    const result = await stack.beforeInvoke({
      sessionId: 'sess-1',
      input: 'Help me with formatting',
      messages: [msg('user', 'Please keep it concise and practical.')],
      systemPrompt: '',
      systemPromptAdditions: [],
    });

    expect(getRelevantMemories).toHaveBeenCalledWith(expect.any(String), 3);
    expect(result.systemPromptAddition).toContain('Relevant Memories');
    expect(result.memoriesUsed).toEqual(['mem-1']);
  });

  it('skips auto extraction when autoExtract is disabled', async () => {
    const upsertAutoMemory = vi.fn();

    const memoryService = {
      getRelevantMemories: vi.fn().mockResolvedValue([]),
      addRelatedSession: vi.fn().mockResolvedValue(undefined),
      upsertAutoMemory,
    } as any;

    const memoryExtractor = {
      isEnabled: vi.fn().mockReturnValue(true),
      extract: vi.fn().mockResolvedValue({
        memories: [
          {
            title: 'Preference',
            content: 'Use TypeScript strictly.',
            group: 'preferences',
            tags: ['typescript'],
            confidence: 0.88,
          },
        ],
        messagesProcessed: 1,
        extractedAt: new Date().toISOString(),
      }),
    } as any;

    const stack = await createMiddlewareStack(
      { id: 'sess-2', messages: [], model: 'x' },
      memoryService,
      memoryExtractor,
      null,
      { autoExtract: false },
    );

    await stack.afterInvoke({
      sessionId: 'sess-2',
      input: 'Please remember this for later.',
      messages: [msg('user', 'Use TypeScript strictly.')],
      systemPrompt: '',
      systemPromptAdditions: [],
    });

    expect(upsertAutoMemory).not.toHaveBeenCalled();
  });
});
