// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatItem } from '@cowork/shared';
import type { PlatformType } from './types.js';
import { eventEmitter } from '../event-emitter.js';
import { BaseAdapter } from './adapters/base-adapter.js';
import { MessageRouter } from './message-router.js';

class TestAdapter extends BaseAdapter {
  sentMessages: string[] = [];
  replacedMessages: string[] = [];
  updatedMessages: string[] = [];

  constructor(platform: PlatformType, private readonly editableStreaming: boolean) {
    super(platform);
    this.setConnected(true, `${platform}-test`);
  }

  override supportsStreamingEdits(): boolean {
    return this.editableStreaming;
  }

  async connect(_config: Record<string, unknown>): Promise<void> {}

  async disconnect(): Promise<void> {}

  async sendMessage(_chatId: string, text: string): Promise<void> {
    this.sentMessages.push(text);
  }

  async sendTypingIndicator(_chatId: string): Promise<void> {}

  override async replaceProcessingPlaceholder(
    _chatId: string,
    _placeholderHandle: unknown,
    text: string,
  ): Promise<void> {
    this.replacedMessages.push(text);
  }

  override async updateStreamingMessage(
    _chatId: string,
    handle: unknown,
    text: string,
  ): Promise<unknown> {
    this.updatedMessages.push(text);
    return handle ?? { id: 'stream-handle' };
  }
}

function makeAssistantItem(
  id: string,
  text: string,
  segmentIndex: number,
  turnId = 'turn-1',
): ChatItem {
  return {
    id,
    kind: 'assistant_message',
    timestamp: Date.now(),
    turnId,
    content: text,
    stream: {
      phase: 'intermediate',
      status: 'streaming',
      segmentIndex,
    },
  };
}

function makeMediaItem(id: string, base64Data: string, turnId = 'turn-1'): ChatItem {
  return {
    id,
    kind: 'media',
    timestamp: Date.now(),
    turnId,
    mediaType: 'image',
    data: base64Data,
    mimeType: 'image/png',
  };
}

function primeRouter(router: MessageRouter, adapter: TestAdapter): {
  state: {
    pendingOrigin: unknown;
    isProcessing: boolean;
    outboundChain: Promise<void>;
  };
  sessionId: string;
} {
  const sessionId = 'integration-session';
  router.registerAdapter(adapter);

  const routerAny = router as unknown as {
    integrationSessionId: string | null;
    getState: (sid: string) => any;
  };
  routerAny.integrationSessionId = sessionId;
  const state = routerAny.getState(sessionId);
  state.isProcessing = true;
  state.pendingOrigin = {
    requestId: 1,
    platform: adapter.getStatus().platform,
    chatId: 'chat-1',
    senderName: 'Naresh',
    thinkingHandle: { id: 'placeholder' },
  };

  return { state, sessionId };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('message-router outbound dedupe', () => {
  it('sends exactly one final message for non-editing adapters', async () => {
    const adapter = new TestAdapter('whatsapp', false);
    const router = new MessageRouter();
    const { sessionId } = primeRouter(router, adapter);
    const outSpy = vi
      .spyOn(eventEmitter, 'integrationMessageOut')
      .mockImplementation(() => {});

    router.onChatItem(sessionId, makeAssistantItem('a1', 'Hello', 0));
    router.onChatItemUpdate(sessionId, 'a1', { content: 'Hello there' });
    router.onChatItemUpdate(sessionId, 'a1', { content: 'Hello there' });

    await router.onStreamDone(sessionId);

    expect(adapter.replacedMessages).toEqual(['Hello there']);
    expect(adapter.sentMessages).toEqual([]);
    expect(adapter.updatedMessages).toEqual([]);
    expect(outSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps editable streaming updates in-place without extra sends', async () => {
    const adapter = new TestAdapter('slack', true);
    const router = new MessageRouter();
    const { sessionId } = primeRouter(router, adapter);
    const outSpy = vi
      .spyOn(eventEmitter, 'integrationMessageOut')
      .mockImplementation(() => {});

    router.onChatItem(sessionId, makeAssistantItem('a1', 'Hello', 0));
    router.onChatItemUpdate(sessionId, 'a1', { content: 'Hello there' });
    router.onChatItemUpdate(sessionId, 'a1', { content: 'Hello there' });

    await router.onStreamDone(sessionId);

    expect(adapter.replacedMessages).toEqual(['Hello']);
    expect(adapter.updatedMessages).toEqual(['Hello there']);
    expect(adapter.sentMessages).toEqual([]);
    expect(outSpy).toHaveBeenCalledTimes(2);
  });

  it('uses a single outbound send for oversized media fallback', async () => {
    const previousLimit = process.env.COWORK_INTEGRATION_MAX_MEDIA_BYTES;
    process.env.COWORK_INTEGRATION_MAX_MEDIA_BYTES = '1';

    try {
      const adapter = new TestAdapter('whatsapp', false);
      const router = new MessageRouter();
      const { state, sessionId } = primeRouter(router, adapter);
      const outSpy = vi
        .spyOn(eventEmitter, 'integrationMessageOut')
        .mockImplementation(() => {});

      router.onChatItem(sessionId, makeMediaItem('m1', 'AAAA'));

      await state.outboundChain;
      await router.onStreamDone(sessionId);

      expect(adapter.replacedMessages.length).toBe(1);
      expect(adapter.sentMessages).toEqual([]);
      expect(outSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (previousLimit === undefined) {
        delete process.env.COWORK_INTEGRATION_MAX_MEDIA_BYTES;
      } else {
        process.env.COWORK_INTEGRATION_MAX_MEDIA_BYTES = previousLimit;
      }
    }
  });
});
