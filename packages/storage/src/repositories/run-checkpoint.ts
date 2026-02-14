// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { RunCheckpoint } from '@cowork/shared';
import type { DatabaseConnection } from '../database.js';

interface RunCheckpointRow {
  id: string;
  run_id: string;
  session_id: string;
  branch_id: string | null;
  checkpoint_index: number;
  stage: string;
  state_json: string;
  created_at: number;
}

export class RunCheckpointRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  upsert(checkpoint: RunCheckpoint): RunCheckpoint {
    this.db.instance
      .prepare(
        `
        INSERT INTO run_checkpoints (
          id, run_id, session_id, branch_id, checkpoint_index, stage, state_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          run_id = excluded.run_id,
          session_id = excluded.session_id,
          branch_id = excluded.branch_id,
          checkpoint_index = excluded.checkpoint_index,
          stage = excluded.stage,
          state_json = excluded.state_json,
          created_at = excluded.created_at
      `,
      )
      .run(
        checkpoint.id,
        checkpoint.runId,
        checkpoint.sessionId,
        checkpoint.branchId || null,
        checkpoint.checkpointIndex,
        checkpoint.stage,
        JSON.stringify(checkpoint.state || {}),
        checkpoint.createdAt,
      );

    return checkpoint;
  }

  getLatestForRun(runId: string): RunCheckpoint | null {
    const row = this.db.instance
      .prepare(
        `
        SELECT
          id, run_id, session_id, branch_id, checkpoint_index, stage, state_json, created_at
        FROM run_checkpoints
        WHERE run_id = ?
        ORDER BY checkpoint_index DESC, created_at DESC
        LIMIT 1
      `,
      )
      .get(runId) as RunCheckpointRow | undefined;

    return row ? this.rowToRunCheckpoint(row) : null;
  }

  listForRun(runId: string, limit = 200): RunCheckpoint[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT
          id, run_id, session_id, branch_id, checkpoint_index, stage, state_json, created_at
        FROM run_checkpoints
        WHERE run_id = ?
        ORDER BY checkpoint_index ASC, created_at ASC
        LIMIT ?
      `,
      )
      .all(runId, limit) as RunCheckpointRow[];

    return rows.map((row) => this.rowToRunCheckpoint(row));
  }

  listForSession(sessionId: string, limit = 200): RunCheckpoint[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT
          id, run_id, session_id, branch_id, checkpoint_index, stage, state_json, created_at
        FROM run_checkpoints
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(sessionId, limit) as RunCheckpointRow[];

    return rows.map((row) => this.rowToRunCheckpoint(row));
  }

  deleteByRun(runId: string): number {
    const result = this.db.instance
      .prepare('DELETE FROM run_checkpoints WHERE run_id = ?')
      .run(runId);
    return result.changes;
  }

  private rowToRunCheckpoint(row: RunCheckpointRow): RunCheckpoint {
    return {
      id: row.id,
      runId: row.run_id,
      sessionId: row.session_id,
      branchId: row.branch_id || undefined,
      checkpointIndex: row.checkpoint_index,
      stage: row.stage,
      state: JSON.parse(row.state_json || '{}') as Record<string, unknown>,
      createdAt: row.created_at,
    };
  }
}
