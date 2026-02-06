/**
 * CronService - Main entry point for cron scheduling system
 *
 * Coordinates:
 * - CronStore: Persistence layer for jobs and runs
 * - CronScheduler: Timer management and job execution
 * - CronExecutor: Job execution in isolated sessions
 */

import { EventEmitter } from 'events';
import type { CronJob, CronRun } from '@gemini-cowork/shared';
import { cronStore } from './store.js';
import { cronScheduler } from './scheduler.js';
import { cronExecutor } from './executor.js';
import type {
  CreateCronJobInput,
  UpdateCronJobInput,
  RunQueryOptions,
  CronServiceStatus,
} from './types.js';
import type { AgentRunner } from '../agent-runner.js';

/**
 * CronService coordinates all cron-related functionality
 */
export class CronService extends EventEmitter {
  private initialized = false;

  constructor() {
    super();

    // Forward scheduler events
    cronScheduler.on('job:due', (job: CronJob) => this.emit('job:due', job));
    cronScheduler.on('job:executed', (job: CronJob, success: boolean) =>
      this.emit('job:executed', job, success)
    );
    cronScheduler.on('scheduler:tick', (nextWakeTime: number | null) =>
      this.emit('scheduler:tick', nextWakeTime)
    );
    cronScheduler.on('scheduler:started', () => this.emit('scheduler:started'));
    cronScheduler.on('scheduler:stopped', () => this.emit('scheduler:stopped'));
  }

  /**
   * Initialize the service with AgentRunner
   * Must be called before start()
   */
  initialize(agentRunner: AgentRunner): void {
    cronExecutor.setAgentRunner(agentRunner);
    cronScheduler.setExecutor(cronExecutor);
  }

  /**
   * Start the cron service
   */
  async start(): Promise<void> {
    if (this.initialized) return;

    await cronStore.initialize();
    await cronScheduler.start();
    this.initialized = true;
    this.emit('started');
  }

  /**
   * Stop the cron service
   */
  stop(): void {
    if (!this.initialized) return;
    cronScheduler.stop();
    this.initialized = false;
    this.emit('stopped');
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Job Management
  // ============================================================================

  /**
   * List all cron jobs
   */
  async listJobs(): Promise<CronJob[]> {
    return cronStore.getAllJobs();
  }

  /**
   * Get jobs by status
   */
  async getJobsByStatus(status: CronJob['status']): Promise<CronJob[]> {
    return cronStore.getJobsByStatus(status);
  }

  /**
   * Get a single job by ID
   */
  async getJob(jobId: string): Promise<CronJob | null> {
    return cronStore.getJob(jobId);
  }

  /**
   * Create a new cron job
   */
  async createJob(input: CreateCronJobInput): Promise<CronJob> {
    const created = await cronStore.createJob(input);

    // Compute next run time
    const nextRun = cronScheduler.computeNextRun(created);
    if (nextRun) {
      await cronStore.updateJob(created.id, { nextRunAt: nextRun });
      created.nextRunAt = nextRun;
    }

    // Notify scheduler of new job
    await cronScheduler.onJobAdded(created);

    this.emit('job:created', created);
    return created;
  }

  /**
   * Update an existing cron job
   */
  async updateJob(jobId: string, updates: UpdateCronJobInput): Promise<CronJob> {
    const updated = await cronStore.updateJob(jobId, updates);

    // Recompute next run if schedule changed
    if (updates.schedule) {
      const nextRun = cronScheduler.computeNextRun(updated);
      await cronStore.updateJob(jobId, { nextRunAt: nextRun });
      updated.nextRunAt = nextRun;
    }

    // Notify scheduler of update
    await cronScheduler.onJobUpdated(updated);

    this.emit('job:updated', updated);
    return updated;
  }

  /**
   * Delete a cron job
   */
  async deleteJob(jobId: string): Promise<void> {
    await cronStore.deleteJob(jobId);
    await cronScheduler.onJobDeleted();
    this.emit('job:deleted', jobId);
  }

  /**
   * Pause a cron job
   */
  async pauseJob(jobId: string): Promise<CronJob> {
    await cronScheduler.pauseJob(jobId);
    const job = await cronStore.getJob(jobId);
    if (job) {
      this.emit('job:paused', job);
    }
    return job!;
  }

  /**
   * Resume a paused cron job
   */
  async resumeJob(jobId: string): Promise<CronJob> {
    await cronScheduler.resumeJob(jobId);
    const job = await cronStore.getJob(jobId);
    if (job) {
      this.emit('job:resumed', job);
    }
    return job!;
  }

  /**
   * Trigger a job to run immediately
   */
  async triggerJob(jobId: string): Promise<CronRun> {
    const job = await cronStore.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const run = await cronExecutor.execute(job);
    await cronStore.appendRun(run);

    // Update job state
    await cronStore.updateJob(jobId, {
      lastRunAt: run.startedAt,
      lastStatus: run.result === 'success' ? 'ok' : 'error',
      lastError: run.error,
      lastDurationMs: run.completedAt ? run.completedAt - run.startedAt : undefined,
      runCount: job.runCount + 1,
    });

    this.emit('job:triggered', job, run);
    return run;
  }

  // ============================================================================
  // Run History
  // ============================================================================

  /**
   * Get run history for a job
   */
  async getJobRuns(jobId: string, options?: RunQueryOptions): Promise<CronRun[]> {
    return cronStore.getRuns(jobId, options);
  }

  /**
   * Get the count of runs for a job
   */
  async getRunCount(jobId: string): Promise<number> {
    return cronStore.getRunCount(jobId);
  }

  /**
   * Get the latest run for a job
   */
  async getLatestRun(jobId: string): Promise<CronRun | null> {
    return cronStore.getLatestRun(jobId);
  }

  // ============================================================================
  // Status and Utilities
  // ============================================================================

  /**
   * Get service status
   */
  async getStatus(): Promise<CronServiceStatus> {
    const jobs = await cronStore.getAllJobs();
    const activeJobs = jobs.filter(j => j.status === 'active');
    const schedulerStatus = cronScheduler.getStatus();

    // Find next job
    const nextJob = activeJobs
      .filter(j => j.nextRunAt)
      .sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0))[0];

    return {
      isRunning: schedulerStatus.isRunning,
      jobCount: jobs.length,
      activeJobCount: activeJobs.length,
      nextRunAt: schedulerStatus.nextWakeTime,
      nextJobId: nextJob?.id ?? null,
    };
  }

  /**
   * Get jobs for a specific working directory
   */
  async getJobsByWorkingDirectory(workingDirectory: string): Promise<CronJob[]> {
    return cronStore.getJobsByWorkingDirectory(workingDirectory);
  }

  /**
   * Get jobs with a specific tag
   */
  async getJobsByTag(tag: string): Promise<CronJob[]> {
    return cronStore.getJobsByTag(tag);
  }

  /**
   * Export all data for backup
   */
  async exportAll(): Promise<{ jobs: CronJob[]; runs: Record<string, CronRun[]> }> {
    return cronStore.exportAll();
  }

  /**
   * Import data from backup
   */
  async importAll(data: { jobs: CronJob[]; runs: Record<string, CronRun[]> }): Promise<void> {
    await cronStore.importAll(data);

    // Restart scheduler with new data
    if (this.initialized) {
      cronScheduler.stop();
      await cronScheduler.start();
    }
  }
}

/**
 * Singleton instance of CronService
 */
export const cronService = new CronService();

// Re-export components for direct access if needed
export { cronStore, CronStore } from './store.js';
export { cronScheduler, CronScheduler } from './scheduler.js';
export { cronExecutor, CronExecutor } from './executor.js';
export type * from './types.js';
