/**
 * CronStore - File-based persistence for cron jobs
 *
 * Storage structure:
 * ~/.cowork/cron/
 *   jobs.json         - All cron job definitions
 *   runs/{jobId}.jsonl - Run history per job (JSONL format)
 */

import type { CronJob, CronRun, CreateCronJobInput, RunQueryOptions } from '@gemini-cowork/shared';
import {
  ensureCronDir,
  getCronJobsPath,
  getCronRunsPath,
  readJsonFile,
  writeJsonFileAtomic,
  appendJsonLine,
  readJsonLines,
  deleteFileIfExists,
} from '../utils/paths.js';

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * CronStore class for managing cron job persistence
 */
export class CronStore {
  private jobCache: Map<string, CronJob> = new Map();
  private initialized = false;

  /**
   * Initialize the store - creates directories and loads jobs
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await ensureCronDir();
    await this.loadJobs();
    this.initialized = true;
  }

  /**
   * Ensure store is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CronStore not initialized. Call initialize() first.');
    }
  }

  /**
   * Load all jobs from disk into cache
   */
  private async loadJobs(): Promise<void> {
    const jobs = await readJsonFile<CronJob[]>(getCronJobsPath(), []);
    this.jobCache.clear();
    for (const job of jobs) {
      this.jobCache.set(job.id, job);
    }
  }

  /**
   * Save all jobs from cache to disk atomically
   */
  private async saveJobs(): Promise<void> {
    const jobs = Array.from(this.jobCache.values());
    await writeJsonFileAtomic(getCronJobsPath(), jobs);
  }

  // ============================================================================
  // Job CRUD Operations
  // ============================================================================

  /**
   * Get all jobs
   */
  async getAllJobs(): Promise<CronJob[]> {
    this.ensureInitialized();
    return Array.from(this.jobCache.values());
  }

  /**
   * Get jobs by status
   */
  async getJobsByStatus(status: CronJob['status']): Promise<CronJob[]> {
    this.ensureInitialized();
    return Array.from(this.jobCache.values()).filter(job => job.status === status);
  }

  /**
   * Get a single job by ID
   */
  async getJob(jobId: string): Promise<CronJob | null> {
    this.ensureInitialized();
    return this.jobCache.get(jobId) ?? null;
  }

  /**
   * Create a new job
   */
  async createJob(input: CreateCronJobInput): Promise<CronJob> {
    this.ensureInitialized();

    const now = Date.now();
    const job: CronJob = {
      id: generateId('job'),
      name: input.name,
      description: input.description,
      prompt: input.prompt,
      schedule: input.schedule,
      sessionTarget: input.sessionTarget,
      wakeMode: input.wakeMode,
      workingDirectory: input.workingDirectory,
      model: input.model,
      deleteAfterRun: input.deleteAfterRun,
      maxRuns: input.maxRuns,
      maxTurns: input.maxTurns,
      tags: input.tags,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    };

    this.jobCache.set(job.id, job);
    await this.saveJobs();

    return job;
  }

  /**
   * Update an existing job
   */
  async updateJob(jobId: string, updates: Partial<CronJob>): Promise<CronJob> {
    this.ensureInitialized();

    const existing = this.jobCache.get(jobId);
    if (!existing) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const updated: CronJob = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID changes
      createdAt: existing.createdAt, // Prevent createdAt changes
      updatedAt: Date.now(),
    };

    this.jobCache.set(jobId, updated);
    await this.saveJobs();

    return updated;
  }

  /**
   * Delete a job and its run history
   */
  async deleteJob(jobId: string): Promise<void> {
    this.ensureInitialized();

    if (!this.jobCache.has(jobId)) {
      throw new Error(`Job not found: ${jobId}`);
    }

    this.jobCache.delete(jobId);
    await this.saveJobs();

    // Delete run history
    await this.deleteRunHistory(jobId);
  }

  // ============================================================================
  // Run History Operations
  // ============================================================================

  /**
   * Append a run to the job's history
   */
  async appendRun(run: CronRun): Promise<void> {
    this.ensureInitialized();
    await appendJsonLine(getCronRunsPath(run.jobId), run);
  }

  /**
   * Get runs for a job with optional filtering and pagination
   */
  async getRuns(jobId: string, options?: RunQueryOptions): Promise<CronRun[]> {
    this.ensureInitialized();

    let runs = await readJsonLines<CronRun>(getCronRunsPath(jobId));

    // Filter by result if specified
    if (options?.result) {
      runs = runs.filter(run => run.result === options.result);
    }

    // Sort by startedAt descending (newest first)
    runs.sort((a, b) => b.startedAt - a.startedAt);

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? runs.length;

    return runs.slice(offset, offset + limit);
  }

  /**
   * Get the count of runs for a job
   */
  async getRunCount(jobId: string): Promise<number> {
    this.ensureInitialized();
    const runs = await readJsonLines<CronRun>(getCronRunsPath(jobId));
    return runs.length;
  }

  /**
   * Delete all run history for a job
   */
  async deleteRunHistory(jobId: string): Promise<void> {
    await deleteFileIfExists(getCronRunsPath(jobId));
  }

  /**
   * Get the latest run for a job
   */
  async getLatestRun(jobId: string): Promise<CronRun | null> {
    const runs = await this.getRuns(jobId, { limit: 1 });
    return runs[0] ?? null;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Check if a job exists
   */
  async jobExists(jobId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.jobCache.has(jobId);
  }

  /**
   * Get jobs by working directory
   */
  async getJobsByWorkingDirectory(workingDirectory: string): Promise<CronJob[]> {
    this.ensureInitialized();
    return Array.from(this.jobCache.values()).filter(
      job => job.workingDirectory === workingDirectory
    );
  }

  /**
   * Get jobs with tags
   */
  async getJobsByTag(tag: string): Promise<CronJob[]> {
    this.ensureInitialized();
    return Array.from(this.jobCache.values()).filter(
      job => job.tags?.includes(tag)
    );
  }

  /**
   * Reload jobs from disk (useful after external changes)
   */
  async reload(): Promise<void> {
    await this.loadJobs();
  }

  /**
   * Export all data for backup
   */
  async exportAll(): Promise<{ jobs: CronJob[]; runs: Record<string, CronRun[]> }> {
    this.ensureInitialized();

    const jobs = Array.from(this.jobCache.values());
    const runs: Record<string, CronRun[]> = {};

    for (const job of jobs) {
      runs[job.id] = await this.getRuns(job.id);
    }

    return { jobs, runs };
  }

  /**
   * Import data from backup
   */
  async importAll(data: { jobs: CronJob[]; runs: Record<string, CronRun[]> }): Promise<void> {
    await ensureCronDir();

    // Import jobs
    this.jobCache.clear();
    for (const job of data.jobs) {
      this.jobCache.set(job.id, job);
    }
    await this.saveJobs();

    // Import runs
    for (const [jobId, runs] of Object.entries(data.runs)) {
      // Delete existing runs
      await deleteFileIfExists(getCronRunsPath(jobId));
      // Append each run
      for (const run of runs) {
        await appendJsonLine(getCronRunsPath(jobId), run);
      }
    }

    this.initialized = true;
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    const jobs = Array.from(this.jobCache.keys());
    for (const jobId of jobs) {
      await deleteFileIfExists(getCronRunsPath(jobId));
    }
    this.jobCache.clear();
    await this.saveJobs();
  }
}

/**
 * Singleton instance of CronStore
 */
export const cronStore = new CronStore();
