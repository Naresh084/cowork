import type { MemoryFeedback, MemoryQueryResult } from '@gemini-cowork/shared';
import type { DatabaseConnection } from '../database.js';

interface MemoryQueryLogRow {
  id: string;
  session_id: string | null;
  project_id: string;
  query_text: string;
  options_json: string;
  result_atom_ids: string;
  latency_ms: number | null;
  created_at: number;
}

interface MemoryFeedbackRow {
  id: string;
  query_id: string;
  atom_id: string;
  feedback_type: string;
  note: string | null;
  created_at: number;
}

export interface MemoryQueryLog {
  id: string;
  sessionId?: string;
  projectId: string;
  query: string;
  options: Record<string, unknown>;
  resultAtomIds: string[];
  latencyMs?: number;
  createdAt: number;
}

export class MemoryQueryRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  logQuery(result: MemoryQueryResult, projectId = 'default'): MemoryQueryLog {
    const record: MemoryQueryLog = {
      id: result.queryId,
      sessionId: result.sessionId,
      projectId,
      query: result.query,
      options: result.options as unknown as Record<string, unknown>,
      resultAtomIds: result.atoms.map((atom) => atom.id),
      latencyMs: result.latencyMs,
      createdAt: result.createdAt,
    };

    this.db.instance
      .prepare(
        `
        INSERT INTO memory_query_logs (
          id, session_id, project_id, query_text, options_json, result_atom_ids, latency_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        record.id,
        record.sessionId || null,
        record.projectId,
        record.query,
        JSON.stringify(record.options || {}),
        JSON.stringify(record.resultAtomIds || []),
        record.latencyMs || null,
        record.createdAt,
      );

    return record;
  }

  findById(queryId: string): MemoryQueryLog | null {
    const row = this.db.instance
      .prepare(
        `
        SELECT id, session_id, project_id, query_text, options_json, result_atom_ids, latency_ms, created_at
        FROM memory_query_logs
        WHERE id = ?
      `,
      )
      .get(queryId) as MemoryQueryLogRow | undefined;

    return row ? this.rowToQueryLog(row) : null;
  }

  listRecentBySession(sessionId: string, limit = 50): MemoryQueryLog[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT id, session_id, project_id, query_text, options_json, result_atom_ids, latency_ms, created_at
        FROM memory_query_logs
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(sessionId, limit) as MemoryQueryLogRow[];

    return rows.map((row) => this.rowToQueryLog(row));
  }

  addFeedback(feedback: MemoryFeedback): MemoryFeedback {
    this.db.instance
      .prepare(
        `
        INSERT INTO memory_feedback (id, query_id, atom_id, feedback_type, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        feedback.id,
        feedback.queryId,
        feedback.atomId,
        feedback.feedback,
        feedback.note || null,
        feedback.createdAt,
      );

    return feedback;
  }

  listFeedbackForQuery(queryId: string): MemoryFeedback[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT id, query_id, atom_id, feedback_type, note, created_at
        FROM memory_feedback
        WHERE query_id = ?
        ORDER BY created_at DESC
      `,
      )
      .all(queryId) as MemoryFeedbackRow[];

    return rows.map((row) => ({
      id: row.id,
      sessionId: '',
      queryId: row.query_id,
      atomId: row.atom_id,
      feedback: row.feedback_type as MemoryFeedback['feedback'],
      note: row.note || undefined,
      createdAt: row.created_at,
    }));
  }

  private rowToQueryLog(row: MemoryQueryLogRow): MemoryQueryLog {
    return {
      id: row.id,
      sessionId: row.session_id || undefined,
      projectId: row.project_id,
      query: row.query_text,
      options: JSON.parse(row.options_json || '{}') as Record<string, unknown>,
      resultAtomIds: JSON.parse(row.result_atom_ids || '[]') as string[],
      latencyMs: row.latency_ms || undefined,
      createdAt: row.created_at,
    };
  }
}
