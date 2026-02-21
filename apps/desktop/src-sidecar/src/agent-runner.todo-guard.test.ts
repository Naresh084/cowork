// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { ToolMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import { AgentRunner } from './agent-runner.js';

type DeepAgentSubagentConfig = {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  skills?: string[];
  middleware?: unknown[];
};

type RunnerWithTodoGuard = AgentRunner & {
  createTodoToolGuardMiddleware: () => {
    wrapModelCall?: (request: any, handler: (request: any) => Promise<unknown>) => Promise<unknown>;
    wrapToolCall?: (request: any, handler: (request: any) => Promise<unknown>) => Promise<unknown>;
  };
  buildTodoGuardedSubagents: (
    subagents: DeepAgentSubagentConfig[],
    todoGuardMiddleware: unknown,
  ) => DeepAgentSubagentConfig[];
};

describe('agent-runner todo guard middleware', () => {
  it('filters write_todos variants from model tool lists', async () => {
    const runner = new AgentRunner() as unknown as RunnerWithTodoGuard;
    const middleware = runner.createTodoToolGuardMiddleware();
    let forwardedRequest: any = null;

    await middleware.wrapModelCall?.(
      {
        tools: [
          { name: 'write_todos' },
          { name: 'WRITE-TODOS' },
          { name: 'task_create' },
          { name: 'task_update' },
        ],
      },
      async (request) => {
        forwardedRequest = request;
        return { ok: true };
      },
    );

    expect(forwardedRequest).toBeTruthy();
    expect(forwardedRequest.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'task_create',
      'task_update',
    ]);
  });

  it('blocks write_todos calls and returns a tool message with task guidance', async () => {
    const runner = new AgentRunner() as unknown as RunnerWithTodoGuard;
    const middleware = runner.createTodoToolGuardMiddleware();
    const handler = vi.fn();

    const result = await middleware.wrapToolCall?.(
      {
        toolCall: {
          id: 'tool-1',
          name: 'write_todos',
          args: {
            todos: [],
          },
        },
      },
      handler,
    );

    expect(handler).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(ToolMessage);
    const content = String((result as ToolMessage).content);
    expect(content).toContain('task_create');
    expect(content).toContain('task_update');
  });

  it('attaches todo guard middleware to subagents and injects a general-purpose override', () => {
    const runner = new AgentRunner() as unknown as RunnerWithTodoGuard;
    const guard = runner.createTodoToolGuardMiddleware();

    const subagents = runner.buildTodoGuardedSubagents(
      [
        {
          name: 'researcher',
          description: 'Research helper',
          systemPrompt: 'You are a research helper.',
        },
      ],
      guard,
    );

    const researcher = subagents.find((entry) => entry.name === 'researcher');
    const generalPurpose = subagents.find((entry) => entry.name === 'general-purpose');

    expect(researcher).toBeDefined();
    expect(researcher?.middleware?.includes(guard)).toBe(true);
    expect(generalPurpose).toBeDefined();
    expect(generalPurpose?.middleware?.includes(guard)).toBe(true);
  });

  it('does not duplicate a user-provided general-purpose subagent override', () => {
    const runner = new AgentRunner() as unknown as RunnerWithTodoGuard;
    const guard = runner.createTodoToolGuardMiddleware();

    const subagents = runner.buildTodoGuardedSubagents(
      [
        {
          name: 'general-purpose',
          description: 'Custom general-purpose helper',
          systemPrompt: 'Custom general-purpose prompt.',
        },
      ],
      guard,
    );

    expect(subagents.filter((entry) => entry.name === 'general-purpose')).toHaveLength(1);
    expect(subagents[0]?.middleware?.includes(guard)).toBe(true);
  });
});

