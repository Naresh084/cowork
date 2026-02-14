// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { WorkflowRetryPolicy, WorkflowRetryProfile } from '@cowork/shared';

const BASELINE_RETRY_PROFILES: Record<WorkflowRetryProfile, WorkflowRetryPolicy> = {
  fast_safe: {
    maxAttempts: 2,
    backoffMs: 300,
    maxBackoffMs: 2_000,
    jitterRatio: 0.05,
  },
  balanced: {
    maxAttempts: 3,
    backoffMs: 1_000,
    maxBackoffMs: 20_000,
    jitterRatio: 0.2,
  },
  strict_enterprise: {
    maxAttempts: 5,
    backoffMs: 2_000,
    maxBackoffMs: 60_000,
    jitterRatio: 0.1,
  },
};

export function getRetryPolicyProfile(profile: WorkflowRetryProfile = 'balanced'): WorkflowRetryPolicy {
  return { ...BASELINE_RETRY_PROFILES[profile] };
}

export function resolveRetryPolicy(
  profile: WorkflowRetryProfile = 'balanced',
  overrides?: Partial<WorkflowRetryPolicy> | null,
): WorkflowRetryPolicy {
  const baseline = getRetryPolicyProfile(profile);
  if (!overrides) {
    return baseline;
  }

  return normalizeRetryPolicy({
    ...baseline,
    ...overrides,
  });
}

export function normalizeRetryPolicy(policy: WorkflowRetryPolicy): WorkflowRetryPolicy {
  const maxAttempts = Math.max(1, Math.floor(policy.maxAttempts || 1));
  const backoffMs = Math.max(0, Math.floor(policy.backoffMs || 0));
  const maxBackoffMs = Math.max(backoffMs, Math.floor(policy.maxBackoffMs || backoffMs));
  const jitterRatio = Math.min(1, Math.max(0, policy.jitterRatio || 0));

  return {
    maxAttempts,
    backoffMs,
    maxBackoffMs,
    jitterRatio,
  };
}

export function computeRetryDelay(
  policy: WorkflowRetryPolicy,
  attempt: number,
  random: () => number = Math.random,
): number {
  const normalized = normalizeRetryPolicy(policy);
  const base = Math.min(
    normalized.maxBackoffMs,
    normalized.backoffMs * 2 ** Math.max(0, attempt - 1),
  );
  if (normalized.jitterRatio <= 0) return base;
  const jitterWindow = base * normalized.jitterRatio;
  const offset = (random() * jitterWindow * 2) - jitterWindow;
  return Math.max(0, Math.round(base + offset));
}

export async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}
