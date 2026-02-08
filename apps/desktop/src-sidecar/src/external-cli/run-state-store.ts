import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import type {
  ExternalCliPersistedState,
  ExternalCliRunRecord,
  ExternalCliRunStatus,
} from './types.js';

const DEFAULT_FILE_NAME = 'external-cli-runs.json';

function isInFlightStatus(status: ExternalCliRunStatus): boolean {
  return status === 'running' || status === 'waiting_user' || status === 'queued';
}

export class ExternalCliRunStateStore {
  private readonly filePath: string;

  constructor(appDataDir: string) {
    this.filePath = join(appDataDir, DEFAULT_FILE_NAME);
  }

  async load(): Promise<ExternalCliRunRecord[]> {
    if (!existsSync(this.filePath)) {
      return [];
    }

    try {
      const raw = await readFile(this.filePath, 'utf-8');
      if (!raw.trim()) {
        const backupPath = await this.backupCorruptFile('empty persisted state file');
        process.stderr.write(
          `[external-cli] Persisted state file was empty and was reset${backupPath ? ` (backup: ${backupPath})` : ''}.\n`,
        );
        return [];
      }

      const parsed = JSON.parse(raw) as ExternalCliPersistedState;
      if (!parsed || !Array.isArray(parsed.runs)) {
        return [];
      }

      const now = Date.now();
      return parsed.runs.map((run) => {
        if (!isInFlightStatus(run.status)) {
          return run;
        }

        return {
          ...run,
          status: 'interrupted',
          updatedAt: now,
          finishedAt: now,
          errorCode: run.errorCode || 'CLI_RUN_INTERRUPTED',
          errorMessage:
            run.errorMessage ||
            'External CLI run was interrupted because the sidecar restarted.',
          pendingInteraction: undefined,
          progress: [
            ...(run.progress || []),
            {
              timestamp: now,
              kind: 'error' as const,
              message: 'Run interrupted after sidecar restart.',
            },
          ],
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backupPath = await this.backupCorruptFile(message);
      process.stderr.write(
        `[external-cli] Failed to load persisted state: ${message}${backupPath ? ` (backup: ${backupPath})` : ''}\n`,
      );
      return [];
    }
  }

  async save(runs: ExternalCliRunRecord[]): Promise<void> {
    const payload: ExternalCliPersistedState = {
      runs,
      updatedAt: Date.now(),
    };

    await mkdir(dirname(this.filePath), { recursive: true });
    const serialized = JSON.stringify(payload, null, 2);
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await writeFile(tempPath, serialized, 'utf-8');
    await rename(tempPath, this.filePath);
  }

  private async backupCorruptFile(reason: string): Promise<string | null> {
    if (!existsSync(this.filePath)) {
      return null;
    }

    const backupPath = `${this.filePath}.corrupt-${Date.now()}.json`;
    try {
      await rename(this.filePath, backupPath);
      return backupPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[external-cli] Failed to backup corrupt state (${reason}): ${message}\n`,
      );
      return null;
    }
  }
}
