import type { WorkflowRetryPolicy } from '@gemini-cowork/shared';

export function computeRetryDelay(policy: WorkflowRetryPolicy, attempt: number): number {
  const base = Math.min(policy.maxBackoffMs, policy.backoffMs * 2 ** Math.max(0, attempt - 1));
  if (policy.jitterRatio <= 0) return base;
  const jitterWindow = base * policy.jitterRatio;
  const offset = (Math.random() * jitterWindow * 2) - jitterWindow;
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
