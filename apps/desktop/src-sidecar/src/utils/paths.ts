/**
 * Path utilities for data storage locations
 * All data is stored in ~/.geminicowork/
 */

import { homedir } from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Base data directory for Gemini Cowork
 */
export const DATA_DIR = path.join(homedir(), '.geminicowork');

/**
 * Subdirectory paths
 */
export const CRON_DIR = path.join(DATA_DIR, 'cron');
export const CRON_RUNS_DIR = path.join(CRON_DIR, 'runs');
export const POLICIES_DIR = path.join(DATA_DIR, 'policies');
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
export const MEMORY_DIR = path.join(DATA_DIR, 'memory');

/**
 * Ensure the base data directory exists
 */
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Ensure the cron directories exist
 */
export async function ensureCronDir(): Promise<void> {
  await fs.mkdir(CRON_DIR, { recursive: true });
  await fs.mkdir(CRON_RUNS_DIR, { recursive: true });
}

/**
 * Ensure the policies directory exists
 */
export async function ensurePoliciesDir(): Promise<void> {
  await fs.mkdir(POLICIES_DIR, { recursive: true });
}

/**
 * Ensure the sessions directory exists
 */
export async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

/**
 * Ensure the memory directory exists
 */
export async function ensureMemoryDir(): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

/**
 * Get path to cron jobs file
 */
export function getCronJobsPath(): string {
  return path.join(CRON_DIR, 'jobs.json');
}

/**
 * Get path to cron runs file for a job
 */
export function getCronRunsPath(jobId: string): string {
  return path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
}

/**
 * Get path to tool policy file
 */
export function getPolicyPath(): string {
  return path.join(POLICIES_DIR, 'policy.json');
}

/**
 * Get path to a session file
 */
export function getSessionPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

/**
 * Get path to heartbeat config file
 */
export function getHeartbeatConfigPath(): string {
  return path.join(DATA_DIR, 'heartbeat.json');
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read JSON file with fallback
 */
export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

/**
 * Write JSON file atomically (write to temp, then rename)
 */
export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;

  const content = JSON.stringify(data, null, 2);

  // Write to temp file
  await fs.writeFile(tempPath, content, 'utf-8');

  // Create backup of existing file if it exists
  try {
    await fs.access(filePath);
    await fs.copyFile(filePath, backupPath);
  } catch {
    // No existing file to backup
  }

  // Atomic rename
  await fs.rename(tempPath, filePath);
}

/**
 * Append line to JSONL file
 */
export async function appendJsonLine(filePath: string, data: unknown): Promise<void> {
  const line = JSON.stringify(data) + '\n';
  await fs.appendFile(filePath, line, 'utf-8');
}

/**
 * Read JSONL file and parse lines
 */
export async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map(line => JSON.parse(line) as T);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Delete a file if it exists
 */
export async function deleteFileIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}
