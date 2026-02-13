import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';
import type {
  AIProvider,
  GenerateRequest,
  GenerateResponse,
  StreamChunk,
  StreamGenerateRequest,
} from '@gemini-cowork/providers';
import type { Message, MessageContentPart } from '@gemini-cowork/shared';

function createProvider(generateImpl: (request: GenerateRequest) => Promise<GenerateResponse>): AIProvider {
  return {
    id: 'google',
    name: 'test-provider',
    listModels: async () => [],
    getModel: async () => null,
    generate: generateImpl,
    stream: async function* (
      _request: StreamGenerateRequest,
    ): AsyncGenerator<StreamChunk, GenerateResponse> {
      yield { type: 'done' };
      return {
        message: {
          id: 'stream-done',
          role: 'assistant',
          content: 'done',
          createdAt: Date.now(),
        },
      };
    },
    isReady: async () => true,
    validateCredentials: async () => true,
  };
}

async function collectEvents(generator: AsyncGenerator<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

function getToolResultParts(message: Message): MessageContentPart[] {
  if (typeof message.content === 'string') return [];
  return message.content.filter((part) => part.type === 'tool_result');
}

describe('agent integration', () => {
  it('retries a flaky tool via looped tool-call flow and succeeds', async () => {
    let toolExecCount = 0;
    const generate = vi.fn(async (request: GenerateRequest): Promise<GenerateResponse> => {
      const toolResults = request.messages
        .flatMap((message) => getToolResultParts(message))
        .filter((part) => part.type === 'tool_result');

      if (toolResults.length === 0) {
        return {
          message: {
            id: 'assistant-1',
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                toolCallId: 'call-1',
                toolName: 'flaky_tool',
                args: { op: 'run' },
              },
            ],
            createdAt: Date.now(),
          },
          finishReason: 'tool_calls',
        };
      }

      const latestResult = toolResults[toolResults.length - 1]!;
      const hasError =
        latestResult.type === 'tool_result' &&
        typeof latestResult.result === 'object' &&
        latestResult.result !== null &&
        'error' in latestResult.result;

      if (hasError && toolResults.length < 2) {
        return {
          message: {
            id: 'assistant-2',
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                toolCallId: 'call-2',
                toolName: 'flaky_tool',
                args: { op: 'retry' },
              },
            ],
            createdAt: Date.now(),
          },
          finishReason: 'tool_calls',
        };
      }

      return {
        message: {
          id: 'assistant-final',
          role: 'assistant',
          content: 'retry complete',
          createdAt: Date.now(),
        },
        finishReason: 'stop',
      };
    });

    const agent = createAgent({
      config: { model: 'gemini-test', maxIterations: 6 },
      provider: createProvider(generate),
      permissionHandler: async () => 'allow',
      tools: [
        {
          name: 'flaky_tool',
          description: 'Fails once, then succeeds.',
          parameters: z.object({ op: z.string() }),
          requiresPermission: () => ({
            type: 'shell_execute',
            resource: 'workspace',
            reason: 'execute flaky operation',
          }),
          execute: async () => {
            toolExecCount += 1;
            if (toolExecCount === 1) {
              return { success: false, error: 'transient failure' };
            }
            return { success: true, data: { ok: true } };
          },
        },
      ],
    });

    const events = (await collectEvents(agent.run('run flaky flow'))) as Array<{
      type: string;
      payload: Record<string, unknown>;
    }>;

    const toolCallEvents = events.filter((event) => event.type === 'agent:tool_call');
    const permissionEvents = events.filter((event) => event.type === 'agent:permission_request');
    const finalState = agent.getState();

    expect(toolExecCount).toBe(2);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(toolCallEvents).toHaveLength(2);
    expect(permissionEvents).toHaveLength(2);
    expect(finalState.lastError).toBeUndefined();
    expect(finalState.messages.at(-1)?.role).toBe('assistant');
    expect(finalState.messages.at(-1)?.content).toBe('retry complete');
  });

  it('respects deny permission decision and skips tool execution', async () => {
    const execute = vi.fn(async () => ({ success: true, data: { shouldNotRun: true } }));
    const generate = vi.fn(async (request: GenerateRequest): Promise<GenerateResponse> => {
      const toolResults = request.messages
        .flatMap((message) => getToolResultParts(message))
        .filter((part) => part.type === 'tool_result');

      if (toolResults.length === 0) {
        return {
          message: {
            id: 'assistant-perm',
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                toolCallId: 'call-deny',
                toolName: 'guarded_tool',
                args: {},
              },
            ],
            createdAt: Date.now(),
          },
          finishReason: 'tool_calls',
        };
      }

      return {
        message: {
          id: 'assistant-after-deny',
          role: 'assistant',
          content: 'denied path complete',
          createdAt: Date.now(),
        },
        finishReason: 'stop',
      };
    });

    const agent = createAgent({
      config: { model: 'gemini-test', maxIterations: 4 },
      provider: createProvider(generate),
      permissionHandler: async () => 'deny',
      tools: [
        {
          name: 'guarded_tool',
          description: 'Requires permission',
          parameters: z.object({}),
          requiresPermission: () => ({
            type: 'shell_execute',
            resource: 'workspace',
            reason: 'guarded operation',
          }),
          execute,
        },
      ],
    });

    const events = (await collectEvents(agent.run('deny this tool'))) as Array<{
      type: string;
      payload: Record<string, unknown>;
    }>;
    const deniedResult = events.find((event) => {
      if (event.type !== 'agent:tool_result') return false;
      const toolCall = event.payload.toolCall as { status?: string } | undefined;
      return toolCall?.status === 'denied';
    });

    expect(execute).not.toHaveBeenCalled();
    expect(deniedResult).toBeTruthy();
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('emits an error when resume is called without pending tool calls', async () => {
    const agent = createAgent({
      config: { model: 'gemini-test' },
      provider: createProvider(async () => ({
        message: {
          id: 'noop',
          role: 'assistant',
          content: 'noop',
          createdAt: Date.now(),
        },
      })),
    });

    const events = (await collectEvents(agent.resume('allow'))) as Array<{
      type: string;
      payload: Record<string, unknown>;
    }>;

    const errorEvent = events.find((event) => event.type === 'agent:error');
    expect(errorEvent).toBeTruthy();
    expect((errorEvent?.payload.error as string) || '').toContain('No pending tool calls to resume');
  });
});
