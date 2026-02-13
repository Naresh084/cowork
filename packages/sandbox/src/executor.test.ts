import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { CommandExecutor } from './executor.js';

async function createWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'sandbox-executor-idempotency-'));
}

describe('CommandExecutor idempotency markers', () => {
  it('reuses cached result for duplicate mutating command with same idempotency key', async () => {
    const workspace = await createWorkspace();
    const targetFile = join(workspace, 'idempotent.txt');
    const executor = new CommandExecutor({
      mode: 'danger-full-access',
      allowedPaths: [workspace, '/tmp'],
    });

    try {
      const command = `printf "one\\n" >> "${targetFile}"`;
      const first = await executor.execute(command, {
        cwd: workspace,
        idempotencyKey: 'mutating-write-1',
      });
      const second = await executor.execute(command, {
        cwd: workspace,
        idempotencyKey: 'mutating-write-1',
      });

      const contents = await readFile(targetFile, 'utf8');
      const lines = contents.trim().split('\n');

      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      expect(second.idempotencyReused).toBe(true);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('one');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('executes again when idempotency key changes', async () => {
    const workspace = await createWorkspace();
    const targetFile = join(workspace, 'idempotent-multi.txt');
    const executor = new CommandExecutor({
      mode: 'danger-full-access',
      allowedPaths: [workspace, '/tmp'],
    });

    try {
      const command = `printf "one\\n" >> "${targetFile}"`;
      await executor.execute(command, {
        cwd: workspace,
        idempotencyKey: 'mutating-write-key-a',
      });
      await executor.execute(command, {
        cwd: workspace,
        idempotencyKey: 'mutating-write-key-b',
      });

      const contents = await readFile(targetFile, 'utf8');
      const lines = contents.trim().split('\n');
      expect(lines).toHaveLength(2);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('rejects duplicate retries when idempotency strategy is reject', async () => {
    const workspace = await createWorkspace();
    const targetFile = join(workspace, 'idempotent-reject.txt');
    const executor = new CommandExecutor({
      mode: 'danger-full-access',
      allowedPaths: [workspace, '/tmp'],
    });

    try {
      const command = `printf "one\\n" >> "${targetFile}"`;
      await executor.execute(command, {
        cwd: workspace,
        idempotencyKey: 'mutating-write-reject',
      });

      await expect(
        executor.execute(command, {
          cwd: workspace,
          idempotencyKey: 'mutating-write-reject',
          idempotencyStrategy: 'reject',
        }),
      ).rejects.toThrow();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
