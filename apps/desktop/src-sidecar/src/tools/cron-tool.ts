/**
 * Cron Tools - Agent tools for creating and managing scheduled tasks
 *
 * Provides:
 * - schedule_task: Create new scheduled tasks
 * - manage_scheduled_task: List, pause, resume, run, delete tasks
 */

import { z } from 'zod';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import { cronService } from '../cron/index.js';
import type { CronSchedule, PlatformType } from '@gemini-cowork/shared';
import { workflowService } from '../workflow/index.js';
import { WORKFLOWS_ENABLED } from '../config/feature-flags.js';

const WORKFLOW_ENGINE = WORKFLOWS_ENABLED ? 'workflow' : 'automation';
const WORKFLOW_LABEL = WORKFLOWS_ENABLED ? 'Workflow' : 'Automation';

// ============================================================================
// Schedule Conversion Utilities
// ============================================================================

/**
 * Day name to cron day number (0 = Sunday)
 */
const DAY_TO_CRON: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Parse time string "HH:MM" to hours and minutes
 */
function parseTime(time: string): { hours: number; minutes: number } {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format: ${time}. Expected HH:MM`);
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time: ${time}. Hours must be 0-23, minutes 0-59`);
  }
  return { hours, minutes };
}

/**
 * Parse natural language datetime
 */
function parseNaturalDatetime(input: string): number {
  const now = new Date();
  const lower = input.toLowerCase().trim();

  // Handle relative times: "in X minutes/hours/days"
  const inMatch = lower.match(/^in\s+(\d+)\s+(minute|hour|day|week)s?$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const ms: Record<string, number> = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    };
    return now.getTime() + amount * ms[unit];
  }

  // Handle "tomorrow at HH:MM am/pm"
  const tomorrowMatch = lower.match(/^tomorrow\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (tomorrowMatch) {
    let hours = parseInt(tomorrowMatch[1], 10);
    const minutes = parseInt(tomorrowMatch[2], 10);
    const period = tomorrowMatch[3]?.toLowerCase();
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hours, minutes, 0, 0);
    return tomorrow.getTime();
  }

  // Handle "today at HH:MM am/pm"
  const todayMatch = lower.match(/^today\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (todayMatch) {
    let hours = parseInt(todayMatch[1], 10);
    const minutes = parseInt(todayMatch[2], 10);
    const period = todayMatch[3]?.toLowerCase();
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    const today = new Date(now);
    today.setHours(hours, minutes, 0, 0);
    // If time has passed, schedule for tomorrow
    if (today.getTime() <= now.getTime()) {
      today.setDate(today.getDate() + 1);
    }
    return today.getTime();
  }

  // Try ISO 8601 parsing
  const parsed = Date.parse(input);
  if (!isNaN(parsed)) {
    return parsed;
  }

  throw new Error(`Could not parse datetime: ${input}`);
}

/**
 * User-facing schedule types
 */
interface OnceSchedule {
  type: 'once';
  datetime: string;
}

interface DailySchedule {
  type: 'daily';
  time: string;
  timezone?: string;
}

interface WeeklySchedule {
  type: 'weekly';
  dayOfWeek: string;
  time: string;
  timezone?: string;
}

interface IntervalSchedule {
  type: 'interval';
  every: number;
}

interface CronExprSchedule {
  type: 'cron';
  expression: string;
  timezone?: string;
}

type UserSchedule =
  | OnceSchedule
  | DailySchedule
  | WeeklySchedule
  | IntervalSchedule
  | CronExprSchedule;

function isWorkflowTaskId(taskId: string): boolean {
  return taskId.startsWith('wf_');
}

export interface ScheduledTaskDefaultNotificationTarget {
  platform: PlatformType;
  chatId?: string;
  senderName?: string;
}

export type ResolveScheduledTaskDefaultNotificationTarget = (
  sessionId: string,
) => ScheduledTaskDefaultNotificationTarget | null;

/**
 * Convert user-friendly schedule to internal CronSchedule
 */
function convertSchedule(userSchedule: UserSchedule): CronSchedule {
  switch (userSchedule.type) {
    case 'once': {
      const timestamp = parseNaturalDatetime(userSchedule.datetime);
      return { type: 'at', timestamp };
    }

    case 'daily': {
      const { hours, minutes } = parseTime(userSchedule.time);
      const expression = `${minutes} ${hours} * * *`;
      return { type: 'cron', expression, timezone: userSchedule.timezone };
    }

    case 'weekly': {
      const { hours, minutes } = parseTime(userSchedule.time);
      const dayNum = DAY_TO_CRON[userSchedule.dayOfWeek.toLowerCase()];
      if (dayNum === undefined) {
        throw new Error(`Invalid day of week: ${userSchedule.dayOfWeek}`);
      }
      const expression = `${minutes} ${hours} * * ${dayNum}`;
      return { type: 'cron', expression, timezone: userSchedule.timezone };
    }

    case 'interval': {
      const intervalMs = userSchedule.every * 60 * 1000;
      return { type: 'every', intervalMs };
    }

    case 'cron': {
      return {
        type: 'cron',
        expression: userSchedule.expression,
        timezone: userSchedule.timezone,
      };
    }
  }
}

/**
 * Format schedule for display
 */
function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.type) {
    case 'at': {
      const date = new Date(schedule.timestamp);
      return `One-time: ${date.toLocaleString()}`;
    }
    case 'every': {
      const minutes = schedule.intervalMs / 60000;
      if (minutes < 60) return `Every ${minutes} minute${minutes !== 1 ? 's' : ''}`;
      const hours = minutes / 60;
      if (hours < 24) return `Every ${hours} hour${hours !== 1 ? 's' : ''}`;
      const days = hours / 24;
      return `Every ${days} day${days !== 1 ? 's' : ''}`;
    }
    case 'cron': {
      const tz = schedule.timezone ? ` (${schedule.timezone})` : '';
      return `Cron: ${schedule.expression}${tz}`;
    }
  }
}

/**
 * Format next run time for display
 */
function formatNextRun(timestamp: number | undefined): string {
  if (!timestamp) return 'Not scheduled';

  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) return 'Overdue';
  if (diff < 60000) return 'In less than a minute';
  if (diff < 3600000) {
    const mins = Math.round(diff / 60000);
    return `In ${mins} minute${mins !== 1 ? 's' : ''}`;
  }
  if (diff < 86400000) {
    const hours = Math.round(diff / 3600000);
    return `In ${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  const days = Math.round(diff / 86400000);
  return `In ${days} day${days !== 1 ? 's' : ''}`;
}

function hasExplicitNotificationInstruction(prompt: string): boolean {
  return /\bsend_notification_[a-z0-9_]+\b/i.test(prompt);
}

function platformDisplayName(platform: PlatformType): string {
  switch (platform) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'slack':
      return 'Slack';
    case 'telegram':
      return 'Telegram';
    case 'discord':
      return 'Discord';
    case 'imessage':
      return 'iMessage';
    case 'teams':
      return 'Microsoft Teams';
    default:
      return platform;
  }
}

function buildDefaultNotificationInstruction(
  target: ScheduledTaskDefaultNotificationTarget,
): string {
  const channelName = platformDisplayName(target.platform);
  const senderHint = target.senderName ? ` from ${target.senderName}` : '';
  const destinationHint = target.chatId
    ? ` with chatId ${JSON.stringify(target.chatId)}`
    : '';

  return [
    'Delivery requirement for this scheduled task:',
    `- This request originated from ${channelName}${senderHint}.`,
    `- After each run, send the final summary via send_notification_${target.platform}${destinationHint}.`,
    '- Keep the message concise and actionable.',
  ].join('\n');
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * schedule_task tool - Create a new scheduled task
 */
export function createScheduleTaskTool(
  resolveDefaultNotificationTarget?: ResolveScheduledTaskDefaultNotificationTarget,
): ToolHandler {
  return {
    name: 'schedule_task',
    description: `Create a scheduled task that runs automatically at specified times.

Use this when the user wants to:
- Set up recurring tasks (daily standup summary, weekly reports)
- Create reminders for future times
- Automate repetitive work (code review, backups, monitoring)
- Schedule one-time future tasks
- Run something N times then auto-stop (use maxRuns)

The scheduled task runs in an isolated session with fresh context.
IMPORTANT: Always create ONE task with the right schedule type. NEVER create multiple tasks for a repeating request.
If the user says "do X every Y minutes for N times", use schedule type "interval" with maxRuns set to N.

Schedule types:
- once: { type: "once", datetime: "tomorrow at 9am" } or { type: "once", datetime: "in 30 minutes" }
- daily: { type: "daily", time: "09:00", timezone: "America/Los_Angeles" }
- weekly: { type: "weekly", dayOfWeek: "monday", time: "09:00" }
- interval: { type: "interval", every: 30 } (every 30 minutes, combine with maxRuns to limit)
- cron: { type: "cron", expression: "0 9 * * MON-FRI" }`,

    parameters: z.object({
      name: z.string().describe('Short name for the task, e.g., "Daily Code Review"'),
      prompt: z
        .string()
        .describe('What the agent should do when the task runs. Be specific and detailed.'),
      schedule: z
        .object({
          type: z.enum(['once', 'daily', 'weekly', 'interval', 'cron']),
          datetime: z.string().optional().describe('For once: ISO datetime or natural language'),
          time: z.string().optional().describe('For daily/weekly: HH:MM format'),
          dayOfWeek: z.string().optional().describe('For weekly: day name'),
          every: z.number().optional().describe('For interval: minutes between runs'),
          expression: z.string().optional().describe('For cron: cron expression'),
          timezone: z.string().optional().describe('IANA timezone (optional)'),
        })
        .describe('When to run the task. See examples in tool description.'),
      workingDirectory: z
        .string()
        .optional()
        .describe('Working directory for the task. Defaults to current session directory.'),
      maxRuns: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Maximum number of times to run. Task auto-stops after this many runs. E.g., set to 5 to run 5 times then stop.'),
      maxTurns: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Maximum agent turns per execution. Limits how many steps the agent takes each run. Default: 25.'),
    }),

    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const parsed = args as {
        name: string;
        prompt: string;
        schedule: UserSchedule;
        workingDirectory?: string;
        maxRuns?: number;
        maxTurns?: number;
      };

      const { name, prompt, schedule, workingDirectory, maxRuns, maxTurns } = parsed;

      try {
        const resolver = resolveDefaultNotificationTarget;
        const shouldApplyDefaultDelivery =
          Boolean(resolver) &&
          !hasExplicitNotificationInstruction(prompt);
        const defaultNotificationTarget =
          shouldApplyDefaultDelivery && context.sessionId && resolver
            ? resolver(context.sessionId)
            : null;
        const effectivePrompt = defaultNotificationTarget
          ? `${prompt.trim()}\n\n${buildDefaultNotificationInstruction(defaultNotificationTarget)}`
          : prompt;

        // Convert user schedule to internal format
        const cronSchedule = convertSchedule(schedule);

        // Create workflow draft + publish (greenfield workflow runtime).
        const draft = workflowService.createDraft({
          name,
          description: 'Created via schedule_task tool',
          triggers: [
            {
              id: `schedule_${Date.now()}`,
              type: 'schedule',
              enabled: true,
              schedule: cronSchedule,
              maxRuns,
            },
          ],
          nodes: [
            { id: 'start', type: 'start', name: 'Start', config: {} },
            {
              id: 'agent_step_1',
              type: 'agent_step',
              name: 'Scheduled Agent Step',
              config: {
                promptTemplate: effectivePrompt,
                workingDirectory: workingDirectory || context.workingDirectory,
                maxTurns,
              },
            },
            { id: 'end', type: 'end', name: 'End', config: {} },
          ],
          edges: [
            { id: 'edge_start_to_step', from: 'start', to: 'agent_step_1', condition: 'always' },
            { id: 'edge_step_to_end', from: 'agent_step_1', to: 'end', condition: 'always' },
          ],
          defaults: {
            workingDirectory: workingDirectory || context.workingDirectory,
            maxRunTimeMs: 30 * 60 * 1000,
            nodeTimeoutMs: 5 * 60 * 1000,
            retry: {
              maxAttempts: 3,
              backoffMs: 1000,
              maxBackoffMs: 20000,
              jitterRatio: 0.2,
            },
          },
        });
        const published = workflowService.publish(draft.id);

        return {
          success: true,
          data: {
            workflowId: published.id,
            workflowVersion: published.version,
            name: published.name,
            schedule: formatSchedule(cronSchedule),
            maxRuns: maxRuns ?? 'unlimited',
            defaultNotification: defaultNotificationTarget
              ? {
                  platform: defaultNotificationTarget.platform,
                  chatId: defaultNotificationTarget.chatId ?? null,
                }
              : null,
            message:
              `Scheduled task "${name}" created successfully.` +
              `${maxRuns ? ` Will run ${maxRuns} time${maxRuns > 1 ? 's' : ''} then auto-stop.` : ''}` +
              `${defaultNotificationTarget ? ` Default delivery set to ${platformDisplayName(defaultNotificationTarget.platform)}${defaultNotificationTarget.chatId ? ` (${defaultNotificationTarget.chatId})` : ''}.` : ''}` +
              ' Managed by the automation runtime.',
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * manage_scheduled_task tool - List, pause, resume, run, delete tasks
 */
export function createManageScheduledTaskTool(): ToolHandler {
  return {
    name: 'manage_scheduled_task',
    description: `List, pause, resume, run, or delete scheduled tasks.

Actions:
- list: Show all scheduled tasks with their status
- pause: Temporarily pause a task (stops running but keeps configuration)
- resume: Resume a paused task
- run: Trigger immediate execution of a task
- delete: Permanently remove a task
- history: View run history for a task`,

    parameters: z.object({
      action: z
        .enum(['list', 'pause', 'resume', 'run', 'delete', 'history'])
        .describe('The action to perform'),
      taskId: z.string().optional().describe('Task ID (required for all actions except list)'),
      limit: z
        .number()
        .optional()
        .describe('For history: max number of runs to return (default: 10)'),
    }),

    execute: async (args: unknown): Promise<ToolResult> => {
      const parsed = args as {
        action: 'list' | 'pause' | 'resume' | 'run' | 'delete' | 'history';
        taskId?: string;
        limit?: number;
      };

      const { action, taskId, limit = 10 } = parsed;

      try {
        switch (action) {
          case 'list': {
            const jobs = await cronService.listJobs();
            const scheduledWorkflows = workflowService.listScheduledTasks(200, 0);
            return {
              success: true,
              data: {
                count: jobs.length + scheduledWorkflows.length,
                tasks: [
                  ...jobs.map(j => ({
                    id: j.id,
                    engine: 'cron',
                    name: j.name,
                    status: j.status,
                    schedule: formatSchedule(j.schedule),
                    nextRun: formatNextRun(j.nextRunAt),
                    runCount: j.runCount,
                    lastStatus: j.lastStatus,
                    lastRunAt: j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : null,
                  })),
                  ...scheduledWorkflows.map((wf) => {
                    const primarySchedule = wf.schedules[0];
                    return {
                      id: wf.workflowId,
                      engine: WORKFLOW_ENGINE,
                      name: wf.name,
                      status: wf.enabled ? wf.status : 'paused',
                      schedule: primarySchedule
                        ? formatSchedule(primarySchedule as CronSchedule)
                        : 'N/A',
                      nextRun: wf.nextRunAt ? formatNextRun(wf.nextRunAt) : 'Not scheduled',
                      runCount: wf.runCount,
                      lastStatus: wf.lastRunStatus,
                      lastRunAt: wf.lastRunAt ? new Date(wf.lastRunAt).toLocaleString() : null,
                    };
                  }),
                ],
              },
            };
          }

          case 'pause': {
            if (!taskId) {
              return { success: false, error: 'taskId is required for pause action' };
            }
            if (isWorkflowTaskId(taskId)) {
              const paused = workflowService.pauseScheduledWorkflow(taskId);
              return {
                success: true,
                data: {
                  message: `${WORKFLOW_LABEL} task ${taskId} paused successfully`,
                  pausedTriggers: paused.pausedTriggers,
                },
              };
            }
            await cronService.pauseJob(taskId);
            return {
              success: true,
              data: { message: `Task ${taskId} paused successfully` },
            };
          }

          case 'resume': {
            if (!taskId) {
              return { success: false, error: 'taskId is required for resume action' };
            }
            if (isWorkflowTaskId(taskId)) {
              const resumed = workflowService.resumeScheduledWorkflow(taskId);
              return {
                success: true,
                data: {
                  message: `${WORKFLOW_LABEL} task ${taskId} resumed`,
                  resumedTriggers: resumed.resumedTriggers,
                  nextRun: formatNextRun(resumed.nextRunAt ?? undefined),
                },
              };
            }
            await cronService.resumeJob(taskId);
            const job = await cronService.getJob(taskId);
            return {
              success: true,
              data: {
                message: `Task ${taskId} resumed`,
                nextRun: formatNextRun(job?.nextRunAt),
              },
            };
          }

          case 'run': {
            if (!taskId) {
              return { success: false, error: 'taskId is required for run action' };
            }
            if (isWorkflowTaskId(taskId)) {
              const run = await workflowService.run({
                workflowId: taskId,
                triggerType: 'manual',
                triggerContext: { source: 'manage_scheduled_task' },
              });
              return {
                success: true,
                data: {
                  message: `${WORKFLOW_LABEL} task ${taskId} triggered`,
                  runId: run.id,
                  result: run.status,
                },
              };
            }
            const run = await cronService.triggerJob(taskId);
            return {
              success: true,
              data: {
                message: `Task ${taskId} triggered`,
                runId: run.id,
                result: run.result,
                duration: run.completedAt ? `${run.completedAt - run.startedAt}ms` : 'running',
                summary: run.summary,
              },
            };
          }

          case 'delete': {
            if (!taskId) {
              return { success: false, error: 'taskId is required for delete action' };
            }
            if (isWorkflowTaskId(taskId)) {
              const archived = workflowService.archive(taskId);
              return {
                success: true,
                data: { message: `${WORKFLOW_LABEL} ${archived.id} archived successfully` },
              };
            }
            await cronService.deleteJob(taskId);
            return {
              success: true,
              data: { message: `Task ${taskId} deleted successfully` },
            };
          }

          case 'history': {
            if (!taskId) {
              return { success: false, error: 'taskId is required for history action' };
            }
            if (isWorkflowTaskId(taskId)) {
              const runs = workflowService.listRuns({
                workflowId: taskId,
                limit,
              });
              return {
                success: true,
                data: {
                  taskId,
                  count: runs.length,
                  runs: runs.map((r) => ({
                    id: r.id,
                    startedAt: r.startedAt ? new Date(r.startedAt).toLocaleString() : null,
                    completedAt: r.completedAt ? new Date(r.completedAt).toLocaleString() : null,
                    result: r.status,
                    duration:
                      r.startedAt && r.completedAt ? `${r.completedAt - r.startedAt}ms` : null,
                    error: r.error,
                    summary:
                      typeof r.output === 'object' && r.output && 'summary' in r.output
                        ? String((r.output as { summary?: unknown }).summary)
                        : undefined,
                  })),
                },
              };
            }
            const runs = await cronService.getJobRuns(taskId, { limit });
            return {
              success: true,
              data: {
                taskId,
                count: runs.length,
                runs: runs.map(r => ({
                  id: r.id,
                  startedAt: new Date(r.startedAt).toLocaleString(),
                  completedAt: r.completedAt ? new Date(r.completedAt).toLocaleString() : null,
                  result: r.result,
                  duration: r.completedAt ? `${r.completedAt - r.startedAt}ms` : null,
                  error: r.error,
                  summary: r.summary,
                })),
              },
            };
          }

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create all cron-related tools
 */
export function createCronTools(
  resolveDefaultNotificationTarget?: ResolveScheduledTaskDefaultNotificationTarget,
): ToolHandler[] {
  return [
    createScheduleTaskTool(resolveDefaultNotificationTarget),
    createManageScheduledTaskTool(),
  ];
}
