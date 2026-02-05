import { z } from 'zod';

// ============================================================================
// Cron Schedule Types
// ============================================================================

/**
 * One-shot schedule: runs once at a specific timestamp
 */
export const CronScheduleAtSchema = z.object({
  type: z.literal('at'),
  timestamp: z.number().describe('UTC timestamp in milliseconds'),
});

/**
 * Recurring interval schedule: runs every N milliseconds
 */
export const CronScheduleEverySchema = z.object({
  type: z.literal('every'),
  intervalMs: z.number().min(60000).describe('Interval in milliseconds (min 1 minute)'),
  startAt: z.number().optional().describe('Optional start timestamp for alignment'),
});

/**
 * Cron expression schedule: standard cron format
 */
export const CronScheduleCronSchema = z.object({
  type: z.literal('cron'),
  expression: z.string().describe('Cron expression (e.g., "0 9 * * MON-FRI")'),
  timezone: z.string().optional().describe('IANA timezone (e.g., "America/Los_Angeles")'),
});

/**
 * Discriminated union of all schedule types
 */
export const CronScheduleSchema = z.discriminatedUnion('type', [
  CronScheduleAtSchema,
  CronScheduleEverySchema,
  CronScheduleCronSchema,
]);

export type CronSchedule = z.infer<typeof CronScheduleSchema>;
export type CronScheduleAt = z.infer<typeof CronScheduleAtSchema>;
export type CronScheduleEvery = z.infer<typeof CronScheduleEverySchema>;
export type CronScheduleCron = z.infer<typeof CronScheduleCronSchema>;

// ============================================================================
// Cron Job Types
// ============================================================================

/**
 * Session target determines where the job runs
 */
export const CronSessionTargetSchema = z.enum(['main', 'isolated']);
export type CronSessionTarget = z.infer<typeof CronSessionTargetSchema>;

/**
 * Job status
 */
export const CronJobStatusSchema = z.enum(['active', 'paused', 'completed', 'failed']);
export type CronJobStatus = z.infer<typeof CronJobStatusSchema>;

/**
 * Wake mode for main session jobs
 */
export const CronWakeModeSchema = z.enum(['next-heartbeat', 'now']);
export type CronWakeMode = z.infer<typeof CronWakeModeSchema>;

/**
 * Last run status
 */
export const CronLastStatusSchema = z.enum(['ok', 'error', 'skipped']);
export type CronLastStatus = z.infer<typeof CronLastStatusSchema>;

/**
 * Core cron job definition
 */
export const CronJobSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  prompt: z.string().min(1).max(10000),
  schedule: CronScheduleSchema,
  sessionTarget: CronSessionTargetSchema,
  wakeMode: CronWakeModeSchema,
  workingDirectory: z.string(),
  model: z.string().optional(),
  status: CronJobStatusSchema,
  deleteAfterRun: z.boolean().optional(),
  maxRuns: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),

  // Timestamps
  createdAt: z.number(),
  updatedAt: z.number(),

  // State
  runCount: z.number().int().nonnegative(),
  lastRunAt: z.number().optional(),
  nextRunAt: z.number().optional(),
  lastStatus: CronLastStatusSchema.optional(),
  lastError: z.string().optional(),
  lastDurationMs: z.number().optional(),
});

export type CronJob = z.infer<typeof CronJobSchema>;

// ============================================================================
// Cron Run Types
// ============================================================================

/**
 * Run result status
 */
export const CronRunResultSchema = z.enum(['success', 'error', 'timeout', 'cancelled']);
export type CronRunResult = z.infer<typeof CronRunResultSchema>;

/**
 * Run history entry (stored as JSONL)
 */
export const CronRunSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  sessionId: z.string(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  result: CronRunResultSchema,
  error: z.string().optional(),
  summary: z.string().optional(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
});

export type CronRun = z.infer<typeof CronRunSchema>;

// ============================================================================
// Cron Service Types
// ============================================================================

/**
 * Tool actions for agent tool
 */
export const CronToolActionSchema = z.enum([
  'status',
  'list',
  'add',
  'update',
  'remove',
  'pause',
  'resume',
  'run',
  'runs',
  'wake',
]);

export type CronToolAction = z.infer<typeof CronToolActionSchema>;

/**
 * Cron service status
 */
export const CronServiceStatusSchema = z.object({
  isRunning: z.boolean(),
  jobCount: z.number(),
  activeJobCount: z.number(),
  nextRunAt: z.number().nullable(),
  nextJobId: z.string().nullable(),
});

export type CronServiceStatus = z.infer<typeof CronServiceStatusSchema>;

// ============================================================================
// Input Types (for API/IPC)
// ============================================================================

/**
 * Create job input (without auto-generated fields)
 */
export const CreateCronJobInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  prompt: z.string().min(1).max(10000),
  schedule: CronScheduleSchema,
  sessionTarget: CronSessionTargetSchema,
  wakeMode: CronWakeModeSchema,
  workingDirectory: z.string(),
  model: z.string().optional(),
  deleteAfterRun: z.boolean().optional(),
  maxRuns: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateCronJobInput = z.infer<typeof CreateCronJobInputSchema>;

/**
 * Update job input (all fields optional)
 */
export const UpdateCronJobInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  prompt: z.string().min(1).max(10000).optional(),
  schedule: CronScheduleSchema.optional(),
  sessionTarget: CronSessionTargetSchema.optional(),
  wakeMode: CronWakeModeSchema.optional(),
  workingDirectory: z.string().optional(),
  model: z.string().optional(),
  status: z.enum(['active', 'paused']).optional(),
  deleteAfterRun: z.boolean().optional(),
  maxRuns: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
});

export type UpdateCronJobInput = z.infer<typeof UpdateCronJobInputSchema>;

/**
 * Run query options
 */
export const RunQueryOptionsSchema = z.object({
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  result: CronRunResultSchema.optional(),
});

export type RunQueryOptions = z.infer<typeof RunQueryOptionsSchema>;
