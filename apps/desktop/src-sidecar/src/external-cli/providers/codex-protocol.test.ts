// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { isJsonRpcResponse, isJsonRpcServerRequest } from './codex-protocol.js';

describe('codex-protocol', () => {
  it('accepts numeric and string ids for server requests', () => {
    expect(
      isJsonRpcServerRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'item/tool/requestUserInput',
        params: {},
      }),
    ).toBe(true);

    expect(
      isJsonRpcServerRequest({
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'item/tool/requestUserInput',
        params: {},
      }),
    ).toBe(true);
  });

  it('accepts numeric and string ids for responses', () => {
    expect(
      isJsonRpcResponse({
        jsonrpc: '2.0',
        id: 2,
        result: {},
      }),
    ).toBe(true);

    expect(
      isJsonRpcResponse({
        jsonrpc: '2.0',
        id: 'resp-2',
        result: {},
      }),
    ).toBe(true);
  });
});
