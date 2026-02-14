// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentRunner } from './agent-runner.js';

describe('agent runner release gate assertion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows launch assertion for warning status', () => {
    vi.spyOn(agentRunner, 'getReleaseGateStatus').mockReturnValue({
      status: 'warning',
      reasons: ['score below ideal but non-blocking'],
      evaluatedAt: 123,
    });

    const result = agentRunner.assertReleaseGateForLaunch();
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('warning');
    expect(result.reasons).toEqual(['score below ideal but non-blocking']);
  });

  it('throws when release gate is fail', () => {
    vi.spyOn(agentRunner, 'getReleaseGateStatus').mockReturnValue({
      status: 'fail',
      reasons: ['critical dimension below threshold'],
      evaluatedAt: 456,
    });

    expect(() => agentRunner.assertReleaseGateForLaunch()).toThrow(
      'Release gate failed: critical dimension below threshold',
    );
  });
});
