import { describe, expect, it } from 'vitest';
import { buildWorkflowDraftFromPrompt } from './draft-generator.js';

describe('buildWorkflowDraftFromPrompt', () => {
  it('builds a scheduled workflow draft from recurring prompt text', () => {
    const draft = buildWorkflowDraftFromPrompt({
      prompt: 'Analyze repo changes every 2 hours then summarize and post to Twitter',
      workingDirectory: '/tmp/repo',
    });

    const scheduleTrigger = draft.triggers.find((trigger) => trigger.type === 'schedule');
    expect(scheduleTrigger).toBeTruthy();
    expect(scheduleTrigger?.type).toBe('schedule');
    if (scheduleTrigger?.type === 'schedule') {
      expect(scheduleTrigger.schedule.type).toBe('every');
      if (scheduleTrigger.schedule.type === 'every') {
        expect(scheduleTrigger.schedule.intervalMs).toBe(2 * 60 * 60 * 1000);
      }
    }

    expect(draft.nodes[0]?.type).toBe('start');
    expect(draft.nodes[draft.nodes.length - 1]?.type).toBe('end');
    expect(draft.nodes.filter((node) => node.type === 'agent_step').length).toBeGreaterThanOrEqual(2);
    expect(draft.edges.length).toBe(draft.nodes.length - 1);
  });

  it('creates manual-only workflow when no schedule intent is detected', () => {
    const draft = buildWorkflowDraftFromPrompt({
      prompt: 'Compare release notes and summarize differences for the current branch',
    });

    expect(draft.triggers).toHaveLength(1);
    expect(draft.triggers[0]?.type).toBe('manual');
  });

  it('respects explicit name and maxTurnsPerStep', () => {
    const draft = buildWorkflowDraftFromPrompt({
      prompt: 'Check latest open issues then write a digest',
      name: 'Issue Digest',
      maxTurnsPerStep: 7,
      workingDirectory: '/workspace',
    });

    expect(draft.name).toBe('Issue Digest');
    const step = draft.nodes.find((node) => node.type === 'agent_step');
    expect(step).toBeTruthy();
    expect(step?.config.maxTurns).toBe(7);
    expect(step?.config.workingDirectory).toBe('/workspace');
  });
});
