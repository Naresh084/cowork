// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { AgentRunner } from './agent-runner.js';

type MutableRunner = AgentRunner & {
  hasExplicitExternalCliLaunchIntent: (
    userText: string | null,
    toolName: 'start_codex_cli_run' | 'start_claude_cli_run',
  ) => boolean;
  shouldAllowExternalCliLaunch: (
    session: { chatItems: Array<{ kind: string; content: string }> },
    toolName: 'start_codex_cli_run' | 'start_claude_cli_run',
  ) => boolean;
};

function createSessionWithUserMessages(messages: string[]) {
  return {
    chatItems: messages.map((content, idx) => ({
      id: `user-${idx}`,
      kind: 'user_message',
      timestamp: Date.now() + idx,
      turnId: `turn-${idx}`,
      content,
    })),
  };
}

describe('agent-runner external cli intent guard', () => {
  it('detects explicit codex launch intent from user text', () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    expect(
      runner.hasExplicitExternalCliLaunchIntent(
        'Use Codex CLI to refactor this project.',
        'start_codex_cli_run',
      ),
    ).toBe(true);
  });

  it('does not treat generic lookup requests as explicit external cli launch intent', () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    expect(
      runner.hasExplicitExternalCliLaunchIntent(
        'Can you find my twitter posts?',
        'start_codex_cli_run',
      ),
    ).toBe(false);
    expect(
      runner.hasExplicitExternalCliLaunchIntent(
        'Why it started codex instead of using bird?',
        'start_codex_cli_run',
      ),
    ).toBe(false);
  });

  it('allows recent follow-up responses after an explicit launch request', () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    const session = createSessionWithUserMessages([
      'Please use Codex CLI for this task.',
      '/Users/naresh/Work/Personal/cowork',
    ]);

    expect(runner.shouldAllowExternalCliLaunch(session, 'start_codex_cli_run')).toBe(true);
  });

  it('does not allow launch when no recent explicit request exists', () => {
    const runner = new AgentRunner() as unknown as MutableRunner;
    const session = createSessionWithUserMessages([
      'Use web search to find this profile.',
      '/Users/naresh/Work/Personal/cowork',
    ]);

    expect(runner.shouldAllowExternalCliLaunch(session, 'start_codex_cli_run')).toBe(false);
  });
});
