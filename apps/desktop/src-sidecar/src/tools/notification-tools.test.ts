// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '@cowork/core';
import { createNotificationTools } from './notification-tools.js';

const context: ToolContext = {
  workingDirectory: '/tmp',
  sessionId: 'sess-1',
  agentId: 'agent-1',
};

describe('notification-tools', () => {
  it('sends notification when not skipped', async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const bridge = {
      getStatuses: () => [{ platform: 'whatsapp', connected: true }],
      sendNotification,
    };

    const tools = createNotificationTools(() => bridge as any);
    expect(tools).toHaveLength(1);

    const result = await tools[0]!.execute(
      { message: 'hello', chatId: 'chat-1' },
      context,
    );

    expect(result.success).toBe(true);
    expect(sendNotification).toHaveBeenCalledWith('whatsapp', 'hello', 'chat-1');
  });

  it('skips notification when evaluator blocks same-turn duplicate delivery', async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const bridge = {
      getStatuses: () => [{ platform: 'whatsapp', connected: true }],
      sendNotification,
    };

    const tools = createNotificationTools(
      () => bridge as any,
      {
        shouldSkip: () =>
          'Current turn already originates from this platform/chat.',
      },
    );

    const result = await tools[0]!.execute(
      { message: 'hello' },
      context,
    );

    expect(result.success).toBe(true);
    expect(String(result.data)).toContain('Skipped WhatsApp notification');
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
