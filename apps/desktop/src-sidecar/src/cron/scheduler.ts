/**
 * CronScheduler - Timer-based job scheduling
 *
 * Design:
 * - Single setTimeout for next job (not one per job)
 * - Recalculates after each execution
 * - Handles timer overflow (max ~24.8 days for 32-bit)
 * - Supports pause/resume at scheduler level
 */

import { EventEmitter } from 'events';
import { CronExpressionParser } from 'cron-parser';
import type { CronJob } from '@gemini-cowork/shared';
import { cronStore } from './store.js';
import type { CronExecutor } from './executor.js';

// Timer max value to avoid setTimeout overflow (2^31-1 ms ≈ 24.8 days)
const MAX_TIMEOUT_MS = 2147483647;

/**
 * CronScheduler manages job timers and execution
 */
export class CronScheduler extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private executor: CronExecutor | null = null;
  private nextWakeTime: number | null = null;

  /**
   * Set the executor (allows breaking circular dependency)
   */
  setExecutor(executor: CronExecutor): void {
    this.executor = executor;
  }

  /**
   * Start the scheduler - loads jobs and arms timer
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initialize store and compute next run times
    await cronStore.initialize();
    const jobs = await cronStore.getAllJobs();

    for (const job of jobs.filter(j => j.status === 'active')) {
      const nextRun = this.computeNextRun(job);
      if (nextRun !== job.nextRunAt) {
        await cronStore.updateJob(job.id, { nextRunAt: nextRun });
      }
    }

    await this.armTimer();
    this.emit('scheduler:started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) return;
    this.disarmTimer();
    this.isRunning = false;
    this.emit('scheduler:stopped');
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Compute next run time based on schedule type
   */
  computeNextRun(job: CronJob, fromTime?: number): number | undefined {
    const now = fromTime ?? Date.now();
    const schedule = job.schedule;

    switch (schedule.type) {
      case 'at':
        // One-shot: return timestamp if in future, undefined if passed
        return schedule.timestamp > now ? schedule.timestamp : undefined;

      case 'every': {
        // Interval: compute next aligned interval
        const startAt = schedule.startAt ?? job.createdAt;
        const elapsed = now - startAt;
        const intervals = Math.floor(elapsed / schedule.intervalMs);
        return startAt + (intervals + 1) * schedule.intervalMs;
      }

      case 'cron':
        // Cron expression: use cron-parser library
        return this.parseNextCron(schedule.expression, schedule.timezone, now);
    }
  }

  /**
   * Parse cron expression to get next run time
   */
  private parseNextCron(
    expression: string,
    timezone: string | undefined,
    fromTime: number
  ): number | undefined {
    try {
      const cronExpr = CronExpressionParser.parse(expression, {
        currentDate: new Date(fromTime),
        tz: timezone,
      });
      const next = cronExpr.next();
      return next.getTime();
    } catch {
      return undefined;
    }
  }

  /**
   * Arm the timer for next job
   */
  private async armTimer(): Promise<void> {
    this.disarmTimer();

    const nextAt = await this.findNextWakeTime();
    this.nextWakeTime = nextAt;
    this.emit('scheduler:tick', nextAt);

    if (!nextAt) return;

    // Clamp delay to avoid setTimeout overflow
    const delay = Math.min(Math.max(nextAt - Date.now(), 0), MAX_TIMEOUT_MS);

    this.timer = setTimeout(() => this.onTimer(), delay);

    // Don't prevent process exit
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Disarm the timer
   */
  private disarmTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Find earliest next run time across all active jobs
   */
  private async findNextWakeTime(): Promise<number | null> {
    const jobs = await cronStore.getAllJobs();
    const activeTimes = jobs
      .filter(j => j.status === 'active' && j.nextRunAt)
      .map(j => j.nextRunAt!)
      .sort((a, b) => a - b);

    return activeTimes[0] ?? null;
  }

  /**
   * Timer callback - execute due jobs
   */
  private async onTimer(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const now = Date.now();
      const jobs = await cronStore.getAllJobs();
      const dueJobs = jobs.filter(
        j => j.status === 'active' && j.nextRunAt && j.nextRunAt <= now
      );

      // Execute all due jobs in parallel
      await Promise.allSettled(
        dueJobs.map(job => this.executeJob(job))
      );

      // Failures are tracked per-job via run records
    } catch {
      // Error in scheduler timer callback - re-arm will still happen
    }

    // Re-arm timer for next job (always, even on error)
    await this.armTimer();
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: CronJob): Promise<void> {
    if (!this.executor) {
      throw new Error('Executor not set. Call setExecutor() first.');
    }

    this.emit('job:due', job);

    try {
      const run = await this.executor.execute(job);
      const success = run.result === 'success';

      // Update job state
      const updates: Partial<CronJob> = {
        lastRunAt: run.startedAt,
        lastStatus: success ? 'ok' : 'error',
        lastError: run.error,
        lastDurationMs: run.completedAt ? run.completedAt - run.startedAt : undefined,
        runCount: job.runCount + 1,
        updatedAt: Date.now(),
      };

      // Compute next run (or mark completed for one-shot)
      if (job.schedule.type === 'at') {
        updates.status = success ? 'completed' : 'failed';
        updates.nextRunAt = undefined;
      } else {
        updates.nextRunAt = this.computeNextRun(job, run.completedAt ?? Date.now());
      }

      // Check max runs limit
      if (job.maxRuns && updates.runCount! >= job.maxRuns) {
        updates.status = 'completed';
        updates.nextRunAt = undefined;
      }

      await cronStore.updateJob(job.id, updates);

      // Handle deleteAfterRun
      if (job.deleteAfterRun && success) {
        await cronStore.deleteJob(job.id);
      }

      // Append run to history
      await cronStore.appendRun(run);

      this.emit('job:executed', job, success);
    } catch {
      this.emit('job:executed', job, false);
    }
  }

  /**
   * Manually trigger a job (run now)
   */
  async triggerJob(jobId: string): Promise<void> {
    const job = await cronStore.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    await this.executeJob(job);
  }

  /**
   * Pause a job
   */
  async pauseJob(jobId: string): Promise<void> {
    await cronStore.updateJob(jobId, { status: 'paused', updatedAt: Date.now() });
    await this.armTimer(); // Re-arm to exclude paused job
  }

  /**
   * Resume a job
   */
  async resumeJob(jobId: string): Promise<void> {
    const job = await cronStore.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const nextRun = this.computeNextRun(job);
    await cronStore.updateJob(jobId, {
      status: 'active',
      nextRunAt: nextRun,
      updatedAt: Date.now(),
    });
    await this.armTimer(); // Re-arm to include resumed job
  }

  /**
   * Called when a new job is added - recalculate timers
   */
  async onJobAdded(job: CronJob): Promise<void> {
    if (job.status === 'active' && this.isRunning) {
      await this.armTimer();
    }
  }

  /**
   * Called when a job is updated - recalculate timers
   */
  async onJobUpdated(_job: CronJob): Promise<void> {
    if (this.isRunning) {
      await this.armTimer();
    }
  }

  /**
   * Called when a job is deleted - recalculate timers
   */
  async onJobDeleted(): Promise<void> {
    if (this.isRunning) {
      await this.armTimer();
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; nextWakeTime: number | null } {
    return {
      isRunning: this.isRunning,
      nextWakeTime: this.nextWakeTime,
    };
  }
}

/**
 * Singleton instance of CronScheduler
 */
export const cronScheduler = new CronScheduler();
