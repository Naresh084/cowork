// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatItem } from '@cowork/shared';
import { SkillGenerationService } from './skill-generation-service.js';
import { skillService } from './skill-service.js';

function createMessage(
  kind: 'user_message' | 'assistant_message',
  text: string,
  timestamp: number,
): ChatItem {
  return {
    id: `ci-${timestamp}-${kind}`,
    kind,
    content: text,
    timestamp,
    turnId: `turn-${timestamp}`,
  } as ChatItem;
}

describe('skill-generation-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates draft skill candidates from current session conversation', async () => {
    vi.spyOn(skillService, 'ensureDefaultManagedSkillInstalled').mockResolvedValue({
      skillId: 'managed:skill-creator',
      installed: true,
    });

    const chatItems: ChatItem[] = [
      createMessage('user_message', 'Please monitor deployment failures and summarize every run.', 1),
      createMessage('assistant_message', 'I can automate this and send concise summaries.', 2),
      createMessage('user_message', 'Must include exact dates and a short checklist.', 3),
    ];

    const service = new SkillGenerationService((sessionId) => (
      sessionId === 'session-1'
        ? {
            sessionId,
            workingDirectory: process.cwd(),
            chatItems,
          }
        : null
    ));

    const draft = await service.draftFromSession({
      sessionId: 'session-1',
      purpose: 'scheduled_task',
      goal: 'Monitor deployment failures and summarize with exact dates',
      maxSkills: 2,
      mode: 'draft',
    });

    expect(draft.skills.length).toBeGreaterThan(0);
    expect(draft.skills.length).toBeLessThanOrEqual(2);
    expect(draft.summary.userTurns).toBe(2);
    expect(draft.summary.assistantTurns).toBe(1);
    expect(draft.skills[0]?.skillMarkdown).toContain('name:');
    expect(draft.skills[0]?.skillMarkdown).toContain('## Workflow');
  });

  it('creates managed skills and appends deterministic version suffix on name collision', async () => {
    vi.spyOn(skillService, 'ensureDefaultManagedSkillInstalled').mockResolvedValue({
      skillId: 'managed:skill-creator',
      installed: false,
    });
    vi.spyOn(skillService, 'isInstalled').mockImplementation(async (name: string) => name === 'deploy-alerts');

    const createSkillSpy = vi
      .spyOn(skillService, 'createSkill')
      .mockImplementation(async ({ name }: { name: string }) => `managed:${name}`);

    const chatItems: ChatItem[] = [
      createMessage('user_message', 'Create deploy alerts for nightly runs.', 11),
      createMessage('assistant_message', 'I will build a reusable workflow skill.', 12),
    ];

    const service = new SkillGenerationService((sessionId) => (
      sessionId === 'session-2'
        ? {
            sessionId,
            workingDirectory: process.cwd(),
            chatItems,
          }
        : null
    ));

    const result = await service.createFromSession({
      sessionId: 'session-2',
      purpose: 'manual_skill',
      goal: 'deploy alerts',
      maxSkills: 1,
      mode: 'create',
    });

    expect(createSkillSpy).toHaveBeenCalledTimes(1);
    expect(createSkillSpy.mock.calls[0]?.[0]?.name).toBe('deploy-alerts-v2');
    expect(result.createdSkills[0]?.skillId).toBe('managed:deploy-alerts-v2');
  });
});
