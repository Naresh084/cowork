// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { computeRetryDelay, getRetryPolicyProfile, resolveRetryPolicy } from './retry-policy.js';

describe('workflow retry policy profiles', () => {
  it('resolves fast_safe profile contract', () => {
    const policy = getRetryPolicyProfile('fast_safe');
    expect(policy).toEqual({
      maxAttempts: 2,
      backoffMs: 300,
      maxBackoffMs: 2000,
      jitterRatio: 0.05,
    });
  });

  it('resolves strict_enterprise profile with overrides', () => {
    const policy = resolveRetryPolicy('strict_enterprise', {
      maxAttempts: 6,
      backoffMs: 2500,
      maxBackoffMs: 90000,
      jitterRatio: 0.15,
    });
    expect(policy).toEqual({
      maxAttempts: 6,
      backoffMs: 2500,
      maxBackoffMs: 90000,
      jitterRatio: 0.15,
    });
  });

  it('computes deterministic retry delays when jitter is disabled', () => {
    const policy = resolveRetryPolicy('balanced', {
      maxAttempts: 3,
      backoffMs: 1000,
      maxBackoffMs: 5000,
      jitterRatio: 0,
    });

    expect(computeRetryDelay(policy, 1)).toBe(1000);
    expect(computeRetryDelay(policy, 2)).toBe(2000);
    expect(computeRetryDelay(policy, 3)).toBe(4000);
    expect(computeRetryDelay(policy, 4)).toBe(5000);
  });

  it('applies jitter using injected randomness for deterministic testing', () => {
    const policy = resolveRetryPolicy('fast_safe');
    const base = 300;
    const jitterWindow = base * policy.jitterRatio;

    const low = computeRetryDelay(policy, 1, () => 0);
    const high = computeRetryDelay(policy, 1, () => 1);

    expect(low).toBe(Math.max(0, Math.round(base - jitterWindow)));
    expect(high).toBe(Math.round(base + jitterWindow));
  });
});
