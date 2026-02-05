/**
 * Internal cron types for sidecar implementation
 */

import type { CronSchedule, CronSessionTarget, CronWakeMode } from '@gemini-cowork/shared';

/**
 * Input for creating a new cron job
 */
export interface CreateCronJobInput {
  name: string;
  description?: string;
  prompt: string;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  workingDirectory: string;
  model?: string;
  deleteAfterRun?: boolean;
  maxRuns?: number;
  tags?: string[];
}

/**
 * Input for updating an existing cron job
 */
export interface UpdateCronJobInput {
  name?: string;
  description?: string;
  prompt?: string;
  schedule?: CronSchedule;
  sessionTarget?: CronSessionTarget;
  wakeMode?: CronWakeMode;
  workingDirectory?: string;
  model?: string;
  status?: 'active' | 'paused';
  deleteAfterRun?: boolean;
  maxRuns?: number;
  tags?: string[];
}

/**
 * Options for querying run history
 */
export interface RunQueryOptions {
  /** Maximum number of runs to return */
  limit?: number;
  /** Number of runs to skip */
  offset?: number;
  /** Filter by result type */
  result?: 'success' | 'error' | 'timeout' | 'cancelled';
}

/**
 * Cron service status
 */
export interface CronServiceStatus {
  /** Whether the scheduler is running */
  isRunning: boolean;
  /** Total number of jobs */
  jobCount: number;
  /** Number of active (non-paused) jobs */
  activeJobCount: number;
  /** Timestamp of next scheduled job execution */
  nextRunAt: number | null;
  /** ID of the next job to run */
  nextJobId: string | null;
}
