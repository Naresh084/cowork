// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { handleRequest } from './ipc-handler.js';
import type { IPCRequest } from './types.js';

function buildRequest(request: IPCRequest): IPCRequest {
  return request;
}

describe('ipc-handler idempotency cache', () => {
  it('returns cached result for duplicate command+idempotencyKey', async () => {
    const first = await handleRequest(
      buildRequest({
        id: 'req-1',
        command: 'ping',
        params: {
          _idempotencyKey: 'ping-idem-1',
          _retryAttempt: 0,
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 30));

    const second = await handleRequest(
      buildRequest({
        id: 'req-2',
        command: 'ping',
        params: {
          _idempotencyKey: 'ping-idem-1',
          _retryAttempt: 1,
        },
      }),
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.result).toEqual(first.result);
  });

  it('does not share cache entries across different commands', async () => {
    const ping = await handleRequest(
      buildRequest({
        id: 'req-3',
        command: 'ping',
        params: {
          _idempotencyKey: 'shared-key',
          _retryAttempt: 0,
        },
      }),
    );

    const unknown = await handleRequest(
      buildRequest({
        id: 'req-4',
        command: 'unknown_command_for_test',
        params: {
          _idempotencyKey: 'shared-key',
          _retryAttempt: 0,
        },
      }),
    );

    expect(ping.success).toBe(true);
    expect(unknown.success).toBe(false);
    expect(unknown.error).toContain('Unknown command');
  });

  it('caches errors for duplicate failures with same idempotency key', async () => {
    const first = await handleRequest(
      buildRequest({
        id: 'req-5',
        command: 'create_session',
        params: {
          _idempotencyKey: 'create-session-error',
          _retryAttempt: 0,
        },
      }),
    );

    const second = await handleRequest(
      buildRequest({
        id: 'req-6',
        command: 'create_session',
        params: {
          _idempotencyKey: 'create-session-error',
          _retryAttempt: 1,
        },
      }),
    );

    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
    expect(first.error).toBe('workingDirectory is required');
    expect(second.error).toBe(first.error);
  });
});
