// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { WorkflowEvent } from '@cowork/shared';
import { generateId, now } from '@cowork/shared';
import type { DatabaseConnection } from '../database.js';

interface WorkflowEventRow {
  id: string;
  run_id: string;
  ts: number;
  type: WorkflowEvent['type'];
  payload: string;
}

export class WorkflowEventRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  append(event: Omit<WorkflowEvent, 'id' | 'ts'> & { ts?: number }): WorkflowEvent {
    const full: WorkflowEvent = {
      id: generateId('evt'),
      ts: event.ts ?? now(),
      runId: event.runId,
      type: event.type,
      payload: event.payload || {},
    };

    this.db.instance
      .prepare(
        `
        INSERT INTO workflow_events (id, run_id, ts, type, payload)
        VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(full.id, full.runId, full.ts, full.type, JSON.stringify(full.payload || {}));

    return full;
  }

  appendMany(events: Array<Omit<WorkflowEvent, 'id' | 'ts'> & { ts?: number }>): WorkflowEvent[] {
    return this.db.transaction(() => events.map((event) => this.append(event)));
  }

  list(runId: string, sinceTs?: number): WorkflowEvent[] {
    const rows = sinceTs
      ? (this.db.instance
          .prepare(
            `
            SELECT id, run_id, ts, type, payload
            FROM workflow_events
            WHERE run_id = ? AND ts >= ?
            ORDER BY ts ASC
            `,
          )
          .all(runId, sinceTs) as WorkflowEventRow[])
      : (this.db.instance
          .prepare(
            `
            SELECT id, run_id, ts, type, payload
            FROM workflow_events
            WHERE run_id = ?
            ORDER BY ts ASC
            `,
          )
          .all(runId) as WorkflowEventRow[]);

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      ts: row.ts,
      type: row.type,
      payload: JSON.parse(row.payload || '{}'),
    }));
  }

  deleteByRun(runId: string): number {
    const result = this.db.instance
      .prepare('DELETE FROM workflow_events WHERE run_id = ?')
      .run(runId);
    return result.changes;
  }
}
