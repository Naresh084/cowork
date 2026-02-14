// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import type { ChatTriggerCandidate } from './trigger-router.js';
import { WorkflowTriggerRouter } from './trigger-router.js';

const CANDIDATES: ChatTriggerCandidate[] = [
  {
    workflowId: 'wf_deploy',
    workflowVersion: 1,
    triggerId: 'chat_deploy',
    phrases: ['deploy release to production'],
    strictMatch: false,
    enabled: true,
  },
  {
    workflowId: 'wf_weekly_report',
    workflowVersion: 1,
    triggerId: 'chat_weekly_report',
    phrases: ['email weekly engineering status report'],
    strictMatch: false,
    enabled: true,
  },
  {
    workflowId: 'wf_incident_triage',
    workflowVersion: 1,
    triggerId: 'chat_incident_triage',
    phrases: ['triage open pager incidents'],
    strictMatch: false,
    enabled: true,
  },
  {
    workflowId: 'wf_memory_consolidate',
    workflowVersion: 1,
    triggerId: 'chat_memory_consolidate',
    phrases: ['consolidate project memory store'],
    strictMatch: false,
    enabled: true,
  },
  {
    workflowId: 'wf_branch_merge',
    workflowVersion: 1,
    triggerId: 'chat_branch_merge',
    phrases: ['merge feature branch into main'],
    strictMatch: false,
    enabled: true,
  },
  {
    workflowId: 'wf_release_gate',
    workflowVersion: 1,
    triggerId: 'chat_release_gate',
    phrases: ['run release gate evaluation'],
    strictMatch: false,
    enabled: true,
  },
  {
    workflowId: 'wf_workspace_backup',
    workflowVersion: 1,
    triggerId: 'chat_workspace_backup',
    phrases: ['backup local workspace artifacts'],
    strictMatch: false,
    enabled: true,
  },
  {
    workflowId: 'wf_incident_bridge',
    workflowVersion: 1,
    triggerId: 'chat_incident_bridge',
    phrases: ['open incident bridge now'],
    strictMatch: true,
    enabled: true,
  },
];

type Scenario = {
  message: string;
  expectedWorkflowId: string | null;
};

const SCENARIOS: Scenario[] = [
  { message: 'please deploy release to production tonight', expectedWorkflowId: 'wf_deploy' },
  { message: 'can you email weekly engineering status report before 9am', expectedWorkflowId: 'wf_weekly_report' },
  { message: 'triage open pager incidents for api cluster', expectedWorkflowId: 'wf_incident_triage' },
  { message: 'consolidate project memory store after this run', expectedWorkflowId: 'wf_memory_consolidate' },
  { message: 'merge feature branch into main once tests pass', expectedWorkflowId: 'wf_branch_merge' },
  { message: 'run release gate evaluation for candidate build', expectedWorkflowId: 'wf_release_gate' },
  { message: 'backup local workspace artifacts to cold storage', expectedWorkflowId: 'wf_workspace_backup' },
  { message: 'open incident bridge now', expectedWorkflowId: 'wf_incident_bridge' },
  { message: 'deploy release to production and then run release gate evaluation', expectedWorkflowId: 'wf_deploy' },
  { message: 'send weekly engineering status report email for leadership', expectedWorkflowId: 'wf_weekly_report' },
  { message: 'triage open pager incidents and summarize hot spots', expectedWorkflowId: 'wf_incident_triage' },
  { message: 'please merge feature branch into main and tag release', expectedWorkflowId: 'wf_branch_merge' },
  { message: 'open a bridge for incident please', expectedWorkflowId: null },
  { message: 'draft a product launch announcement for social media', expectedWorkflowId: null },
  { message: 'set up a lunch meeting with design and pm', expectedWorkflowId: null },
  { message: 'show me the benchmark trend from last week', expectedWorkflowId: null },
  { message: 'create a travel itinerary for sf next month', expectedWorkflowId: null },
  { message: 'organize markdown files by folder and date', expectedWorkflowId: null },
  { message: 'summarize this pull request in plain language', expectedWorkflowId: null },
  { message: 'what is the weather in new york today', expectedWorkflowId: null },
  { message: 'find duplicate screenshots in downloads', expectedWorkflowId: null },
  { message: 'help write onboarding copy for first-run wizard', expectedWorkflowId: null },
  { message: 'schedule coffee chat with the new engineer', expectedWorkflowId: null },
  { message: 'scan logs for unusual latency spikes', expectedWorkflowId: null },
  { message: 'prepare talking points for stakeholder sync', expectedWorkflowId: null },
  { message: 'generate test data for ui snapshots', expectedWorkflowId: null },
  { message: 'draft changelog entries for next release', expectedWorkflowId: null },
  { message: 'compare two json files and show key diffs', expectedWorkflowId: null },
  { message: 'convert this note into a task checklist', expectedWorkflowId: null },
  { message: 'review this architecture diagram for clarity', expectedWorkflowId: null },
  { message: 'open incident bridge tomorrow morning', expectedWorkflowId: null },
  { message: 'run release readiness checklist', expectedWorkflowId: null },
  { message: 'merge docs updates from branch', expectedWorkflowId: null },
  { message: 'create a backup plan for conference travel', expectedWorkflowId: null },
  { message: 'cleanup workspace tabs in the editor', expectedWorkflowId: null },
  { message: 'investigate memory leak in chart rendering', expectedWorkflowId: null },
];

describe('WorkflowTriggerRouter quality gate', () => {
  it('keeps false-positive trigger activations below 3% on seeded corpus', () => {
    const router = new WorkflowTriggerRouter({
      getNextScheduleAt: async () => null,
      runDueSchedules: async () => {},
    });

    let falsePositives = 0;
    let negativeCount = 0;

    for (const scenario of SCENARIOS) {
      const matches = router.evaluateChatTriggers({
        message: scenario.message,
        candidates: CANDIDATES,
      });

      const top = matches.find((match) => match.shouldActivate) || null;

      if (scenario.expectedWorkflowId === null) {
        negativeCount += 1;
        if (top) falsePositives += 1;
        continue;
      }

      expect(top).not.toBeNull();
      expect(top?.workflowId).toBe(scenario.expectedWorkflowId);
    }

    const falsePositiveRate = negativeCount === 0 ? 0 : falsePositives / negativeCount;
    expect(falsePositiveRate).toBeLessThan(0.03);
  });
});
