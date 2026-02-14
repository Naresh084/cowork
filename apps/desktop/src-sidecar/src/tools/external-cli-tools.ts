import { z } from 'zod';
import { isAbsolute, resolve } from 'path';
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

function resolveWorkingDirectory(baseDirectory: string, workingDirectory: string): string {
  const trimmed = workingDirectory.trim();
  if (!trimmed) {
    throw new ExternalCliError(
      'CLI_PROTOCOL_ERROR',
      'working_directory is required. Confirm a directory in conversation and retry.',
    );
  }

  if (isAbsolute(trimmed)) {
    return resolve(trimmed);
  }

  return resolve(baseDirectory, trimmed);
}

function normalizeBypassValue(input: {
  bypassPermission?: boolean;
  bypass_permission?: boolean;
}): boolean {
  const value = input.bypassPermission ?? input.bypass_permission;
  if (typeof value !== 'boolean') {
    throw new ExternalCliError(
      'CLI_PROTOCOL_ERROR',
      'bypassPermission is required. Confirm bypass choice in conversation and retry.',
    );
  }
  return value;
}

type ExternalCliComplexity = 'low' | 'medium' | 'high';
type ExternalCliRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_user'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | string;

const TERMINAL_STATUSES = new Set<string>(['completed', 'failed', 'cancelled', 'interrupted']);
const MEDIUM_COMPLEXITY_HINTS = [
  'build',
  'feature',
  'website',
  'app',
  'frontend',
  'backend',
  'test',
  'integration',
  'api',
  'database',
];
const HIGH_COMPLEXITY_HINTS = [
  'refactor',
  'migration',
  'end-to-end',
  'architecture',
  'multi-step',
  'multi file',
  'deploy',
  'production',
  'full stack',
];

function derivePollingPlan(prompt: string): {
  complexity: ExternalCliComplexity;
  intervalSeconds: 5 | 10 | 60;
  reason: string;
} {
  const normalizedPrompt = String(prompt || '').toLowerCase();
  let score = 0;

  if (prompt.length > 320) score += 1;
  if (prompt.length > 800) score += 2;
  if (MEDIUM_COMPLEXITY_HINTS.some((keyword) => normalizedPrompt.includes(keyword))) score += 1;
  if (HIGH_COMPLEXITY_HINTS.some((keyword) => normalizedPrompt.includes(keyword))) score += 2;

  if (score >= 4) {
    return {
      complexity: 'high',
      intervalSeconds: 60,
      reason: 'Long-running or high-complexity workflow detected.',
    };
  }

  if (score >= 2) {
    return {
      complexity: 'medium',
      intervalSeconds: 10,
      reason: 'Moderate complexity workflow detected.',
    };
  }

  return {
    complexity: 'low',
    intervalSeconds: 5,
    reason: 'Quick iteration workflow detected.',
  };
}

function statusPollingHint(
  status: ExternalCliRunStatus,
  plan: { intervalSeconds: 5 | 10 | 60; complexity: ExternalCliComplexity },
): { terminal: boolean; nextPollSeconds: number | null; shouldRespond: boolean } {
  const normalizedStatus = String(status || '').toLowerCase();

  if (TERMINAL_STATUSES.has(normalizedStatus)) {
    return {
      terminal: true,
      nextPollSeconds: null,
      shouldRespond: false,
    };
  }

  if (normalizedStatus === 'waiting_user') {
    return {
      terminal: false,
      nextPollSeconds: 5,
      shouldRespond: true,
    };
  }

  return {
    terminal: false,
    nextPollSeconds: plan.intervalSeconds,
    shouldRespond: false,
  };
}

function buildMonitoringRecommendation(nextPollSeconds: number | null, terminal: boolean): string {
  if (terminal) {
    return 'Run reached a terminal state. Report outcome to user.';
  }
  if (!nextPollSeconds) {
    return 'Continue monitoring with external_cli_get_progress until terminal state.';
  }
  return `Call external_cli_get_progress again in ${nextPollSeconds}s.`;
}

export function createExternalCliTools(options: ExternalCliToolFactoryOptions): ToolHandler[] {
  const startCodexCliRun: ToolHandler = {
    name: 'start_codex_cli_run',
    description:
      'Start a Codex CLI background run only when the user explicitly asks to launch Codex CLI. Use explicit directory/create-if-missing/bypass arguments. If values are clear, launch directly; otherwise ask only missing/ambiguous follow-ups. For generic web lookup tasks, use web_search/web_fetch instead. Then keep monitoring with external_cli_get_progress until terminal state.',
    parameters: z.object({
      prompt: z.string().min(1).describe('Detailed prompt to run in Codex CLI.'),
      working_directory: z
        .string()
        .min(1)
        .describe('Explicit working directory confirmed in conversation.'),
      create_if_missing: z
        .boolean()
        .describe('Set true to auto-create missing directory (recommended unless user explicitly asked not to create).'),
      bypassPermission: z
        .boolean()
        .optional()
        .describe('Explicit bypass choice confirmed in conversation (true/false).'),
      bypass_permission: z
        .boolean()
        .optional()
        .describe('Legacy alias for bypassPermission.'),
    }),
    execute: async (args: unknown, context): Promise<ToolResult> => {
      const input = args as {
        prompt: string;
        working_directory: string;
        create_if_missing: boolean;
        bypassPermission?: boolean;
        bypass_permission?: boolean;
      };

      try {
        const bypassPermission = normalizeBypassValue(input);
        const resolvedWorkingDirectory = resolveWorkingDirectory(context.workingDirectory, input.working_directory);
        const pollingPlan = derivePollingPlan(input.prompt);
        const result = await options.runManager.startRun({
          sessionId: context.sessionId,
          provider: 'codex',
          prompt: input.prompt,
          workingDirectory: resolvedWorkingDirectory,
          createIfMissing: input.create_if_missing,
          requestedBypassPermission: bypassPermission,
          bypassPermission,
          origin: options.getSessionOrigin(context.sessionId),
        });
        const polling = statusPollingHint(result.status, pollingPlan);

        return ok({
          run: result,
          monitoring: {
            required: !polling.terminal,
            terminal: polling.terminal,
            complexity: pollingPlan.complexity,
            nextPollSeconds: polling.nextPollSeconds,
            shouldRespond: polling.shouldRespond,
            reason: pollingPlan.reason,
            recommendation: buildMonitoringRecommendation(polling.nextPollSeconds, polling.terminal),
          },
        });
      } catch (error) {
        return fail(error);
      }
    },
  };

  const startClaudeCliRun: ToolHandler = {
    name: 'start_claude_cli_run',
    description:
      'Start a Claude CLI background run only when the user explicitly asks to launch Claude CLI. Use explicit directory/create-if-missing/bypass arguments. If values are clear, launch directly; otherwise ask only missing/ambiguous follow-ups. For generic web lookup tasks, use web_search/web_fetch instead. Then keep monitoring with external_cli_get_progress until terminal state.',
    parameters: z.object({
      prompt: z.string().min(1).describe('Detailed prompt to run in Claude CLI.'),
      working_directory: z
        .string()
        .min(1)
        .describe('Explicit working directory confirmed in conversation.'),
      create_if_missing: z
        .boolean()
        .describe('Set true to auto-create missing directory (recommended unless user explicitly asked not to create).'),
      bypassPermission: z
        .boolean()
        .optional()
        .describe('Explicit bypass choice confirmed in conversation (true/false).'),
      bypass_permission: z
        .boolean()
        .optional()
        .describe('Legacy alias for bypassPermission.'),
    }),
    execute: async (args: unknown, context): Promise<ToolResult> => {
      const input = args as {
        prompt: string;
        working_directory: string;
        create_if_missing: boolean;
        bypassPermission?: boolean;
        bypass_permission?: boolean;
      };

      try {
        const bypassPermission = normalizeBypassValue(input);
        const resolvedWorkingDirectory = resolveWorkingDirectory(context.workingDirectory, input.working_directory);
        const pollingPlan = derivePollingPlan(input.prompt);
        const result = await options.runManager.startRun({
          sessionId: context.sessionId,
          provider: 'claude',
          prompt: input.prompt,
          workingDirectory: resolvedWorkingDirectory,
          createIfMissing: input.create_if_missing,
          requestedBypassPermission: bypassPermission,
          bypassPermission,
          origin: options.getSessionOrigin(context.sessionId),
        });
        const polling = statusPollingHint(result.status, pollingPlan);

        return ok({
          run: result,
          monitoring: {
            required: !polling.terminal,
            terminal: polling.terminal,
            complexity: pollingPlan.complexity,
            nextPollSeconds: polling.nextPollSeconds,
            shouldRespond: polling.shouldRespond,
            reason: pollingPlan.reason,
            recommendation: buildMonitoringRecommendation(polling.nextPollSeconds, polling.terminal),
          },
        });
      } catch (error) {
        return fail(error);
      }
    },
  };

  const getProgress: ToolHandler = {
    name: 'external_cli_get_progress',
    description:
      'Get concise progress for the latest or specified external CLI run. Use repeatedly on an adaptive cadence until status is terminal.',
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

        const pollingPlan = derivePollingPlan(run.prompt || '');
        const polling = statusPollingHint(run.status, pollingPlan);

        return ok({
          found: true,
          summary: {
            runId: run.runId,
            provider: run.provider,
            status: run.status,
            launchCommand: run.launchCommand || null,
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
            diagnostics: run.diagnostics || null,
          },
          recentProgress: run.progress.slice(Math.max(0, run.progress.length - limit)),
          monitoring: {
            required: !polling.terminal,
            terminal: polling.terminal,
            complexity: pollingPlan.complexity,
            nextPollSeconds: polling.nextPollSeconds,
            shouldRespond: polling.shouldRespond,
            reason: pollingPlan.reason,
            recommendation: buildMonitoringRecommendation(polling.nextPollSeconds, polling.terminal),
          },
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

        const runId = run?.runId;
        if (!runId) {
          return ok({
            acknowledged: false,
            message: 'No waiting external CLI run found for this session.',
          });
        }

        const summary = await options.runManager.respond(runId, input.response_text);
        const terminal = TERMINAL_STATUSES.has(String(summary.status || '').toLowerCase());
        return ok({
          acknowledged: true,
          summary,
          monitoring: {
            required: !terminal,
            terminal,
            nextPollSeconds: terminal ? null : 5,
            shouldRespond: false,
            recommendation: terminal
              ? 'Run reached terminal state. Report outcome to user.'
              : 'Call external_cli_get_progress in 5s to confirm post-response state.',
          },
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

        const runId = selectedRun?.runId;

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
          monitoring: {
            required: false,
            terminal: true,
            nextPollSeconds: null,
            shouldRespond: false,
            recommendation: 'Run cancelled. Report cancellation to user.',
          },
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
