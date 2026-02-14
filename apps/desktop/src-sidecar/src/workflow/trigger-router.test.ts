// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { WorkflowTriggerRouter } from './trigger-router.js';

function createRouter() {
  return new WorkflowTriggerRouter({
    getNextScheduleAt: async () => null,
    runDueSchedules: async () => {},
  });
}

describe('WorkflowTriggerRouter adaptive confidence', () => {
  it('activates strict chat trigger on exact phrase match with explainability', () => {
    const router = createRouter();
    const results = router.evaluateChatTriggers({
      message: 'deploy release to production now',
      candidates: [
        {
          workflowId: 'wf_deploy',
          workflowVersion: 3,
          triggerId: 'chat_deploy',
          phrases: ['deploy release to production now'],
          strictMatch: true,
          enabled: true,
        },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.shouldActivate).toBe(true);
    expect(results[0]?.confidence).toBe(1);
    expect(results[0]?.reasonCodes).toContain('exact_phrase_match');
    expect(results[0]?.reasonCodes).toContain('activation_threshold_met');
  });

  it('suppresses strict trigger activation when phrase only partially matches', () => {
    const router = createRouter();
    const results = router.evaluateChatTriggers({
      message: 'deploy release now',
      candidates: [
        {
          workflowId: 'wf_deploy',
          workflowVersion: 1,
          triggerId: 'chat_strict',
          phrases: ['deploy release to production now'],
          strictMatch: true,
          enabled: true,
        },
      ],
      minConfidence: 0.01,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.shouldActivate).toBe(false);
    expect(results[0]?.reasonCodes).toContain('strict_requires_exact');
    expect(results[0]?.reasonCodes).toContain('activation_threshold_not_met');
  });

  it('ranks higher-confidence trigger first and returns diagnostics', () => {
    const router = createRouter();
    const results = router.evaluateChatTriggers({
      message: 'please generate and email a weekly engineering status report',
      candidates: [
        {
          workflowId: 'wf_notifications',
          workflowVersion: 2,
          triggerId: 'chat_notify',
          phrases: ['send a notification'],
          strictMatch: false,
          enabled: true,
        },
        {
          workflowId: 'wf_weekly_report',
          workflowVersion: 4,
          triggerId: 'chat_weekly_report',
          phrases: ['email a weekly engineering status report'],
          strictMatch: false,
          enabled: true,
        },
      ],
      maxResults: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.workflowId).toBe('wf_weekly_report');
    expect(results[0]?.confidence).toBeGreaterThan(results[1]?.confidence || 0);
    expect(results[0]?.breakdown.tokenCoverage).toBeGreaterThan(0.5);
  });
});
