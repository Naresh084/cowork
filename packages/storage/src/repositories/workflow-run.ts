import type {
  WorkflowEvent,
  WorkflowNodeRun,
  WorkflowNodeRunStatus,
  WorkflowRun,
  WorkflowRunStatus,
} from '@gemini-cowork/shared';
import { generateId, now, StorageError } from '@gemini-cowork/shared';
import type { DatabaseConnection } from '../database.js';

interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  workflow_version: number;
  trigger_type: string;
  trigger_context: string;
  input: string;
  output: string | null;
  status: WorkflowRunStatus;
  started_at: number | null;
  completed_at: number | null;
  current_node_id: string | null;
  error: string | null;
  correlation_id: string | null;
  created_at: number;
  updated_at: number;
}

interface WorkflowNodeRunRow {
  id: string;
  run_id: string;
  node_id: string;
  attempt: number;
  status: WorkflowNodeRunStatus;
  input: string;
  output: string | null;
  error: string | null;
  started_at: number | null;
  completed_at: number | null;
  duration_ms: number | null;
}

export class WorkflowRunRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  create(input: Omit<WorkflowRun, 'id' | 'createdAt' | 'updatedAt'>): WorkflowRun {
    const timestamp = now();
    const run: WorkflowRun = {
      ...input,
      id: generateId('run'),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.instance
      .prepare(
        `
        INSERT INTO workflow_runs (
          id, workflow_id, workflow_version, trigger_type, trigger_context,
          input, output, status, started_at, completed_at, current_node_id,
          error, correlation_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        run.id,
        run.workflowId,
        run.workflowVersion,
        run.triggerType,
        JSON.stringify(run.triggerContext || {}),
        JSON.stringify(run.input || {}),
        run.output ? JSON.stringify(run.output) : null,
        run.status,
        run.startedAt || null,
        run.completedAt || null,
        run.currentNodeId || null,
        run.error || null,
        run.correlationId || null,
        run.createdAt,
        run.updatedAt,
      );

    return run;
  }

  getById(runId: string): WorkflowRun | null {
    const row = this.db.instance
      .prepare('SELECT * FROM workflow_runs WHERE id = ?')
      .get(runId) as WorkflowRunRow | undefined;

    return row ? this.rowToRun(row) : null;
  }

  getByIdOrThrow(runId: string): WorkflowRun {
    const run = this.getById(runId);
    if (!run) throw StorageError.notFound('WorkflowRun', runId);
    return run;
  }

  list(options?: {
    workflowId?: string;
    status?: WorkflowRunStatus;
    limit?: number;
    offset?: number;
  }): WorkflowRun[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (options?.workflowId) {
      conditions.push('workflow_id = ?');
      params.push(options.workflowId);
    }

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const rows = this.db.instance
      .prepare(
        `
        SELECT * FROM workflow_runs
        ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        `,
      )
      .all(...params, limit, offset) as WorkflowRunRow[];

    return rows.map((row) => this.rowToRun(row));
  }

  updateStatus(
    runId: string,
    updates: Partial<Pick<WorkflowRun, 'status' | 'startedAt' | 'completedAt' | 'currentNodeId' | 'error' | 'output'>>,
  ): WorkflowRun {
    const existing = this.getByIdOrThrow(runId);
    const updated: WorkflowRun = {
      ...existing,
      ...updates,
      updatedAt: now(),
    };

    this.db.instance
      .prepare(
        `
        UPDATE workflow_runs
        SET status = ?, started_at = ?, completed_at = ?, current_node_id = ?,
            error = ?, output = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(
        updated.status,
        updated.startedAt || null,
        updated.completedAt || null,
        updated.currentNodeId || null,
        updated.error || null,
        updated.output ? JSON.stringify(updated.output) : null,
        updated.updatedAt,
        runId,
      );

    return updated;
  }

  createNodeRun(input: Omit<WorkflowNodeRun, 'id'>): WorkflowNodeRun {
    const nodeRun: WorkflowNodeRun = {
      ...input,
      id: generateId('nr'),
    };

    this.db.instance
      .prepare(
        `
        INSERT INTO workflow_node_runs (
          id, run_id, node_id, attempt, status, input, output,
          error, started_at, completed_at, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        nodeRun.id,
        nodeRun.runId,
        nodeRun.nodeId,
        nodeRun.attempt,
        nodeRun.status,
        JSON.stringify(nodeRun.input || {}),
        nodeRun.output ? JSON.stringify(nodeRun.output) : null,
        nodeRun.error || null,
        nodeRun.startedAt || null,
        nodeRun.completedAt || null,
        nodeRun.durationMs || null,
      );

    return nodeRun;
  }

  updateNodeRun(
    nodeRunId: string,
    updates: Partial<Pick<WorkflowNodeRun, 'status' | 'output' | 'error' | 'startedAt' | 'completedAt' | 'durationMs'>>,
  ): WorkflowNodeRun {
    const existing = this.getNodeRunById(nodeRunId);
    if (!existing) throw StorageError.notFound('WorkflowNodeRun', nodeRunId);

    const updated: WorkflowNodeRun = {
      ...existing,
      ...updates,
    };

    this.db.instance
      .prepare(
        `
        UPDATE workflow_node_runs
        SET status = ?, output = ?, error = ?, started_at = ?, completed_at = ?, duration_ms = ?
        WHERE id = ?
        `,
      )
      .run(
        updated.status,
        updated.output ? JSON.stringify(updated.output) : null,
        updated.error || null,
        updated.startedAt || null,
        updated.completedAt || null,
        updated.durationMs || null,
        nodeRunId,
      );

    return updated;
  }

  getNodeRuns(runId: string): WorkflowNodeRun[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT * FROM workflow_node_runs
        WHERE run_id = ?
        ORDER BY started_at ASC, attempt ASC
        `,
      )
      .all(runId) as WorkflowNodeRunRow[];

    return rows.map((row) => this.rowToNodeRun(row));
  }

  private getNodeRunById(nodeRunId: string): WorkflowNodeRun | null {
    const row = this.db.instance
      .prepare('SELECT * FROM workflow_node_runs WHERE id = ?')
      .get(nodeRunId) as WorkflowNodeRunRow | undefined;
    return row ? this.rowToNodeRun(row) : null;
  }

  private rowToRun(row: WorkflowRunRow): WorkflowRun {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowVersion: row.workflow_version,
      triggerType: row.trigger_type,
      triggerContext: JSON.parse(row.trigger_context || '{}'),
      input: JSON.parse(row.input || '{}'),
      output: row.output ? JSON.parse(row.output) : undefined,
      status: row.status,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      currentNodeId: row.current_node_id ?? undefined,
      error: row.error ?? undefined,
      correlationId: row.correlation_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToNodeRun(row: WorkflowNodeRunRow): WorkflowNodeRun {
    return {
      id: row.id,
      runId: row.run_id,
      nodeId: row.node_id,
      attempt: row.attempt,
      status: row.status,
      input: JSON.parse(row.input || '{}'),
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      durationMs: row.duration_ms ?? undefined,
    };
  }
}

export interface WorkflowRunWithDetails {
  run: WorkflowRun;
  nodeRuns: WorkflowNodeRun[];
  events: WorkflowEvent[];
}
