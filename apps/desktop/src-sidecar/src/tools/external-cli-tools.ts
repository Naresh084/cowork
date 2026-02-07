import { z } from 'zod';
import type { ToolHandler, ToolResult } from '@gemini-cowork/core';
import type { ExternalCliRunManager } from '../external-cli/run-manager.js';
import type { ExternalCliRunOrigin } from '../external-cli/types.js';
import { ExternalCliError } from '../external-cli/errors.js';

interface ExternalCliToolFactoryOptions {
  runManager: ExternalCliRunManager;
  getSessionOrigin: (sessionId: string) => ExternalCliRunOrigin;
}

function formatError(error: unknown): string {
  if (error instanceof ExternalCliError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function ok(data: unknown): ToolResult {
  return {
    success: true,
    data,
  };
}

function fail(error: unknown): ToolResult {
  return {
    success: false,
    error: formatError(error),
  };
}

export function createExternalCliTools(options: ExternalCliToolFactoryOptions): ToolHandler[] {
  const startCodexCliRun: ToolHandler = {
    name: 'start_codex_cli_run',
    description:
      'Start a Codex CLI background run with prompt, working directory, and optional bypass-permission mode.',
    parameters: z.object({
      prompt: z.string().min(1).describe('Detailed prompt to run in Codex CLI.'),
      working_directory: z
        .string()
        .optional()
        .describe('Working directory for the external CLI run. Defaults to current session working directory.'),
      bypass_permission: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, request bypass-permission mode (must be allowed in settings).'),
    }),
    execute: async (args: unknown, context): Promise<ToolResult> => {
      const input = args as {
        prompt: string;
        working_directory?: string;
        bypass_permission?: boolean;
      };

      try {
        const result = await options.runManager.startRun({
          sessionId: context.sessionId,
          provider: 'codex',
          prompt: input.prompt,
          workingDirectory: input.working_directory || context.workingDirectory,
          bypassPermission: Boolean(input.bypass_permission),
          origin: options.getSessionOrigin(context.sessionId),
        });

        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  };

  const startClaudeCliRun: ToolHandler = {
    name: 'start_claude_cli_run',
    description:
      'Start a Claude CLI background run with prompt, working directory, and optional bypass-permission mode.',
    parameters: z.object({
      prompt: z.string().min(1).describe('Detailed prompt to run in Claude CLI.'),
      working_directory: z
        .string()
        .optional()
        .describe('Working directory for the external CLI run. Defaults to current session working directory.'),
      bypass_permission: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, request bypass-permission mode (must be allowed in settings).'),
    }),
    execute: async (args: unknown, context): Promise<ToolResult> => {
      const input = args as {
        prompt: string;
        working_directory?: string;
        bypass_permission?: boolean;
      };

      try {
        const result = await options.runManager.startRun({
          sessionId: context.sessionId,
          provider: 'claude',
          prompt: input.prompt,
          workingDirectory: input.working_directory || context.workingDirectory,
          bypassPermission: Boolean(input.bypass_permission),
          origin: options.getSessionOrigin(context.sessionId),
        });

        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  };

  const getProgress: ToolHandler = {
    name: 'external_cli_get_progress',
    description: 'Get concise progress for the latest or specified external CLI run.',
    parameters: z.object({
      run_id: z.string().optional().describe('Specific run ID. If omitted, uses latest run in this session.'),
      provider: z.enum(['codex', 'claude']).optional().describe('Optional provider filter when run_id is omitted.'),
      include_recent_entries: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .default(10)
        .describe('How many recent progress entries to include.'),
    }),
    execute: async (args: unknown, context): Promise<ToolResult> => {
      const input = args as {
        run_id?: string;
        provider?: 'codex' | 'claude';
        include_recent_entries?: number;
      };

      try {
        const run = input.run_id
          ? options.runManager.getRun(input.run_id)
          : options.runManager.getLatestRun(context.sessionId, input.provider);

        if (!run) {
          return ok({
            found: false,
            message: 'No external CLI run found for this session and filter.',
          });
        }

        const limit = input.include_recent_entries || 10;

        return ok({
          found: true,
          summary: {
            runId: run.runId,
            provider: run.provider,
            status: run.status,
            startedAt: run.startedAt,
            updatedAt: run.updatedAt,
            finishedAt: run.finishedAt,
            pendingInteraction: run.pendingInteraction
              ? {
                  interactionId: run.pendingInteraction.interactionId,
                  type: run.pendingInteraction.type,
                  prompt: run.pendingInteraction.prompt,
                  options: run.pendingInteraction.options,
                }
              : null,
            resultSummary: run.resultSummary || null,
            errorCode: run.errorCode || null,
            errorMessage: run.errorMessage || null,
          },
          recentProgress: run.progress.slice(Math.max(0, run.progress.length - limit)),
        });
      } catch (error) {
        return fail(error);
      }
    },
  };

  const respondTool: ToolHandler = {
    name: 'external_cli_respond',
    description:
      'Respond to a pending external CLI interaction (permission/question) using natural language (allow/deny/cancel or answer text).',
    parameters: z.object({
      response_text: z
        .string()
        .min(1)
        .describe('Natural language response text. For permissions, use allow / allow session / deny / cancel.'),
      run_id: z.string().optional().describe('Specific run ID. If omitted, uses latest waiting run in this session.'),
    }),
    execute: async (args: unknown, context): Promise<ToolResult> => {
      const input = args as {
        response_text: string;
        run_id?: string;
      };

      try {
        const run = input.run_id
          ? options.runManager.getRun(input.run_id)
          : options
              .runManager
              .listRuns(context.sessionId)
              .find((item) => item.status === 'waiting_user');

        const runId = isRunSummary(run) ? run.runId : run?.runId;
        if (!runId) {
          return ok({
            acknowledged: false,
            message: 'No waiting external CLI run found for this session.',
          });
        }

        const summary = await options.runManager.respond(runId, input.response_text);
        return ok({
          acknowledged: true,
          summary,
        });
      } catch (error) {
        return fail(error);
      }
    },
  };

  const cancelTool: ToolHandler = {
    name: 'external_cli_cancel_run',
    description: 'Cancel an active external CLI run.',
    parameters: z.object({
      run_id: z.string().optional().describe('Specific run ID. If omitted, uses latest active run in this session.'),
      provider: z.enum(['codex', 'claude']).optional().describe('Optional provider filter when run_id is omitted.'),
    }),
    execute: async (args: unknown, context): Promise<ToolResult> => {
      const input = args as {
        run_id?: string;
        provider?: 'codex' | 'claude';
      };

      try {
        const selectedRun = input.run_id
          ? options.runManager.getRun(input.run_id)
          : options
              .runManager
              .listRuns(context.sessionId)
              .find((item) => {
                if (input.provider && item.provider !== input.provider) {
                  return false;
                }
                return item.status === 'running' || item.status === 'waiting_user' || item.status === 'queued';
              });

        const runId = isRunSummary(selectedRun) ? selectedRun.runId : selectedRun?.runId;

        if (!runId) {
          return ok({
            cancelled: false,
            message: 'No active external CLI run found to cancel.',
          });
        }

        const summary = await options.runManager.cancel(runId);
        return ok({
          cancelled: true,
          summary,
        });
      } catch (error) {
        return fail(error);
      }
    },
  };

  return [
    startCodexCliRun,
    startClaudeCliRun,
    getProgress,
    respondTool,
    cancelTool,
  ];
}

function isRunSummary(value: unknown): value is { runId: string } {
  return isObject(value) && typeof value.runId === 'string';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
