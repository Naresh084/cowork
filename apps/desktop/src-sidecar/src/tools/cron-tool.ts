// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Cron Tools - Agent tools for creating and managing scheduled tasks
 *
 * Provides:
 * - schedule_task: Create new scheduled tasks
 * - manage_scheduled_task: List, pause, resume, run, delete tasks
 */

import { z } from 'zod';
import type { ToolHandler, ToolContext, ToolResult } from '@cowork/core';
import { CronExpressionParser } from 'cron-parser';
import { cronService } from '../cron/index.js';
import type { CronSchedule, PlatformType, SkillBinding } from '@cowork/shared';
import { workflowService } from '../workflow/index.js';
import { WORKFLOWS_ENABLED } from '../config/feature-flags.js';
import {
  encodeSessionPermissionBootstrap,
  type SessionPermissionBootstrap,
} from '../permission-bootstrap.js';

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

export type ResolveScheduledTaskPermissionBootstrap = (
  sessionId: string,
) => SessionPermissionBootstrap | null;

export type ResolveScheduledTaskSkillBindings = (input: {
  sessionId: string;
  prompt: string;
  taskName: string;
  maxSkills?: number;
}) => Promise<SkillBinding[]>;

/**
 * Convert user-friendly schedule to internal CronSchedule
 */
function resolveSystemTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (typeof timezone === 'string' && timezone.trim().length > 0) {
    return timezone;
  }
  return 'UTC';
}

function applyDefaultTimezone(
  userSchedule: UserSchedule,
  defaultTimezone: string,
): UserSchedule {
  switch (userSchedule.type) {
    case 'daily':
      return { ...userSchedule, timezone: userSchedule.timezone || defaultTimezone };
    case 'weekly':
      return { ...userSchedule, timezone: userSchedule.timezone || defaultTimezone };
    case 'cron':
      return { ...userSchedule, timezone: userSchedule.timezone || defaultTimezone };
    default:
      return userSchedule;
  }
}

function convertSchedule(
  userSchedule: UserSchedule,
  defaultTimezone: string = resolveSystemTimezone(),
): CronSchedule {
  const schedule = applyDefaultTimezone(userSchedule, defaultTimezone);

  switch (schedule.type) {
    case 'once': {
      const timestamp = parseNaturalDatetime(schedule.datetime);
      return { type: 'at', timestamp };
    }

    case 'daily': {
      const { hours, minutes } = parseTime(schedule.time);
      const expression = `${minutes} ${hours} * * *`;
      return { type: 'cron', expression, timezone: schedule.timezone };
    }

    case 'weekly': {
      const { hours, minutes } = parseTime(schedule.time);
      const dayNum = DAY_TO_CRON[schedule.dayOfWeek.toLowerCase()];
      if (dayNum === undefined) {
        throw new Error(`Invalid day of week: ${schedule.dayOfWeek}`);
      }
      const expression = `${minutes} ${hours} * * ${dayNum}`;
      return { type: 'cron', expression, timezone: schedule.timezone };
    }

    case 'interval': {
      const intervalMs = schedule.every * 60 * 1000;
      return { type: 'every', intervalMs };
    }

    case 'cron': {
      return {
        type: 'cron',
        expression: schedule.expression,
        timezone: schedule.timezone,
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

function computeNextRunAt(schedule: CronSchedule, fromTime: number = Date.now()): number | undefined {
  switch (schedule.type) {
    case 'at':
      return schedule.timestamp > fromTime ? schedule.timestamp : undefined;
    case 'every': {
      const startAt = schedule.startAt ?? fromTime;
      const elapsed = fromTime - startAt;
      const intervals = Math.floor(elapsed / schedule.intervalMs);
      return startAt + (intervals + 1) * schedule.intervalMs;
    }
    case 'cron': {
      try {
        const parsed = CronExpressionParser.parse(schedule.expression, {
          currentDate: new Date(fromTime),
          tz: schedule.timezone,
        });
        return parsed.next().getTime();
      } catch {
        return undefined;
      }
    }
  }
}

function formatAbsoluteTimestamp(timestamp: number, timezone: string): string {
  const date = new Date(timestamp);
  const iso = date.toISOString();
  try {
    const localized = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
    return `${iso} (${localized} ${timezone})`;
  } catch {
    return iso;
  }
}

function buildTemporalGroundingInstruction(params: {
  createdAt: number;
  schedule: CronSchedule;
  timezone: string;
  nextRunAt?: number;
}): string {
  const lines = [
    'Temporal execution contract for this scheduled task:',
    `- Task created at: ${formatAbsoluteTimestamp(params.createdAt, params.timezone)}.`,
    `- Scheduler timezone: ${params.timezone}.`,
    `- Schedule configuration: ${formatSchedule(params.schedule)}.`,
  ];

  if (typeof params.nextRunAt === 'number') {
    lines.push(`- Next scheduled run target: ${formatAbsoluteTimestamp(params.nextRunAt, params.timezone)}.`);
  } else {
    lines.push('- Next scheduled run target: not currently computable from this schedule.');
  }

  lines.push(
    '- Preserve continuity by using prior run artifacts and workflow outputs when available.',
    '- Runtime anchor: {{system.now}} (Unix milliseconds). Convert this to calendar dates before writing reports.',
    '- Never use relative-only dates (for example: "today", "tomorrow", "yesterday") in final reports.',
    '- When referencing dates or ranges, always include explicit YYYY-MM-DD and timezone.',
    '- If relative time language appears, resolve it against the current run timestamp before responding.',
  );

  return lines.join('\n');
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

function skillNameFromId(skillId: string): string {
  if (!skillId.includes(':')) {
    return skillId.trim();
  }
  const [, ...rest] = skillId.split(':');
  return rest.join(':').trim();
}

function buildSkillExecutionInstruction(skillBindings: SkillBinding[]): string {
  const bindings = skillBindings.filter((binding) => binding.skillId.trim().length > 0);
  if (bindings.length === 0) {
    return '';
  }

  const lines = [
    'Skill execution requirement for this scheduled task:',
    '- You MUST load and apply all required skills before running any workflow steps.',
  ];

  for (const binding of bindings) {
    const skillName = binding.skillName || skillNameFromId(binding.skillId);
    lines.push(`- Mandatory skill: /skills/${skillName}/SKILL.md`);
  }

  lines.push(
    '- Read each skill first and follow its workflow/scripts/references exactly.',
    '- Include a short "Skill used: <skill-name>" line for every mandatory skill in the final output.',
    '- If any mandatory skill cannot be loaded, return an explicit error and stop.',
  );

  return lines.join('\n');
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * schedule_task tool - Create a new scheduled task
 */
export function createScheduleTaskTool(
  resolveDefaultNotificationTarget?: ResolveScheduledTaskDefaultNotificationTarget,
  resolvePermissionBootstrap?: ResolveScheduledTaskPermissionBootstrap,
  resolveSkillBindings?: ResolveScheduledTaskSkillBindings,
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
Always resolve relative time language into an explicit schedule and timezone.

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
        const createdAt = Date.now();
        const defaultTimezone = resolveSystemTimezone();

        // Convert user schedule to internal format first so prompt grounding can include exact schedule context.
        const cronSchedule = convertSchedule(schedule, defaultTimezone);
        const scheduleTimezone =
          cronSchedule.type === 'cron'
            ? cronSchedule.timezone || defaultTimezone
            : defaultTimezone;
        const computedNextRunAt = computeNextRunAt(cronSchedule, createdAt);
        const temporalInstruction = buildTemporalGroundingInstruction({
          createdAt,
          schedule: cronSchedule,
          timezone: scheduleTimezone,
          nextRunAt: computedNextRunAt,
        });

        const resolver = resolveDefaultNotificationTarget;
        const shouldApplyDefaultDelivery =
          Boolean(resolver) &&
          !hasExplicitNotificationInstruction(prompt);
        const defaultNotificationTarget =
          shouldApplyDefaultDelivery && context.sessionId && resolver
            ? resolver(context.sessionId)
            : null;

        const skillBindings = context.sessionId && resolveSkillBindings
          ? await resolveSkillBindings({
              sessionId: context.sessionId,
              prompt,
              taskName: name,
            })
          : [];
        const skillInstruction = buildSkillExecutionInstruction(skillBindings);

        if (resolveSkillBindings && skillBindings.length === 0) {
          throw new Error(
            'Scheduled task requires at least one generated skill binding but none were created.',
          );
        }

        const promptSections = [prompt.trim()];
        if (skillInstruction) {
          promptSections.push(skillInstruction);
        }
        promptSections.push(temporalInstruction);
        if (defaultNotificationTarget) {
          promptSections.push(buildDefaultNotificationInstruction(defaultNotificationTarget));
        }
        const effectivePrompt = promptSections.filter(Boolean).join('\n\n');
        const permissionBootstrap =
          resolvePermissionBootstrap && context.sessionId
            ? resolvePermissionBootstrap(context.sessionId)
            : null;
        const encodedPermissionsProfile = permissionBootstrap
          ? encodeSessionPermissionBootstrap(permissionBootstrap)
          : undefined;

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
                ...(skillBindings.length > 0
                  ? {
                      skillBinding: skillBindings[0],
                      skillBindings,
                    }
                  : {}),
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
            retryProfile: 'balanced',
            retry: {
              maxAttempts: 3,
              backoffMs: 1000,
              maxBackoffMs: 20000,
              jitterRatio: 0.2,
            },
          },
          permissionsProfile: encodedPermissionsProfile,
        });
        const published = workflowService.publish(draft.id);
        const workflowSummary = workflowService
          .listScheduledTasks(200, 0)
          .find((task) => task.workflowId === published.id);
        const nextRunAt = workflowSummary?.nextRunAt ?? computedNextRunAt;
        const nextRunAbsolute =
          typeof nextRunAt === 'number'
            ? formatAbsoluteTimestamp(nextRunAt, scheduleTimezone)
            : null;

        return {
          success: true,
          data: {
            workflowId: published.id,
            workflowVersion: published.version,
            name: published.name,
            schedule: formatSchedule(cronSchedule),
            timezone: scheduleTimezone,
            createdAt,
            createdAtIso: new Date(createdAt).toISOString(),
            nextRunAt: nextRunAt ?? null,
            nextRunAtIso: typeof nextRunAt === 'number' ? new Date(nextRunAt).toISOString() : null,
            nextRunAbsolute,
            maxRuns: maxRuns ?? 'unlimited',
            defaultNotification: defaultNotificationTarget
              ? {
                  platform: defaultNotificationTarget.platform,
                  chatId: defaultNotificationTarget.chatId ?? null,
                }
              : null,
            skillBindings,
            inheritedPermissionPolicy: Boolean(encodedPermissionsProfile),
            message:
              `Scheduled task "${name}" created successfully.` +
              `${maxRuns ? ` Will run ${maxRuns} time${maxRuns > 1 ? 's' : ''} then auto-stop.` : ''}` +
              `${nextRunAbsolute ? ` Next run target: ${nextRunAbsolute}.` : ''}` +
              `${skillBindings.length > 0 ? ` Using ${skillBindings.length} mandatory skill${skillBindings.length > 1 ? 's' : ''}.` : ''}` +
              `${encodedPermissionsProfile ? ' Session permission grants were inherited for this automation.' : ''}` +
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
  resolvePermissionBootstrap?: ResolveScheduledTaskPermissionBootstrap,
  resolveSkillBindings?: ResolveScheduledTaskSkillBindings,
): ToolHandler[] {
  return [
    createScheduleTaskTool(
      resolveDefaultNotificationTarget,
      resolvePermissionBootstrap,
      resolveSkillBindings,
    ),
    createManageScheduledTaskTool(),
  ];
}
