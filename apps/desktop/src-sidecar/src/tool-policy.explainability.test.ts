// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { ToolPolicyService } from './tool-policy.js';

function evaluate(service: ToolPolicyService, toolName: string) {
  return service.evaluate({
    toolName,
    arguments: {},
    sessionId: 'session_test',
    sessionType: 'main',
  });
}

describe('ToolPolicyService explainability reason codes', () => {
  it('returns global_deny reason code when tool is globally denied', () => {
    const service = new ToolPolicyService();
    (service as unknown as { policy: { globalDeny: string[] } }).policy.globalDeny = ['execute'];

    const result = evaluate(service, 'execute');
    expect(result.action).toBe('deny');
    expect(result.reasonCode).toBe('global_deny');
  });

  it('returns profile_deny reason code under enterprise_strict profile', () => {
    const service = new ToolPolicyService();
    (service as unknown as { policy: { profile: string } }).policy.profile = 'enterprise_strict';

    const result = evaluate(service, 'write_file');
    expect(result.action).toBe('deny');
    expect(result.reasonCode).toBe('profile_deny');
  });

  it('returns default_ask reason code when no rule matches', () => {
    const service = new ToolPolicyService();
    const result = evaluate(service, 'nonexistent_tool');

    expect(result.action).toBe('ask');
    expect(result.reasonCode).toBe('default_ask');
  });
});
