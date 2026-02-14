// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import {
  decodeSessionPermissionBootstrap,
  encodeSessionPermissionBootstrap,
} from './permission-bootstrap.js';

describe('permission-bootstrap encoding', () => {
  it('round-trips bootstrap payloads', () => {
    const encoded = encodeSessionPermissionBootstrap({
      version: 1,
      sourceSessionId: 'sess_123',
      approvalMode: 'auto',
      permissionScopes: {
        shell_execute: ['/usr/local/bin', '/opt/homebrew/bin'],
        file_read: ['/Users/test/project'],
      },
      permissionCache: {
        'shell_execute:ls /usr/local/bin': 'allow_session',
      },
      createdAt: 1739462400000,
    });

    const decoded = decodeSessionPermissionBootstrap(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.version).toBe(1);
    expect(decoded?.sourceSessionId).toBe('sess_123');
    expect(decoded?.approvalMode).toBe('auto');
    expect(decoded?.permissionScopes.shell_execute).toContain('/usr/local/bin');
    expect(decoded?.permissionCache['shell_execute:ls /usr/local/bin']).toBe('allow_session');
  });

  it('returns null for malformed payloads', () => {
    expect(decodeSessionPermissionBootstrap('')).toBeNull();
    expect(decodeSessionPermissionBootstrap('session_permissions_v1:not-base64')).toBeNull();
    expect(decodeSessionPermissionBootstrap('unrelated-prefix:value')).toBeNull();
  });
});
