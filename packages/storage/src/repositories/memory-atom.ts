import type { MemoryAtom } from '@gemini-cowork/shared';
import type { DatabaseConnection } from '../database.js';

interface MemoryAtomRow {
  id: string;
  project_id: string;
  session_id: string | null;
  run_id: string | null;
  atom_type: string;
  content: string;
  summary: string | null;
  keywords: string;
  provenance: string;
  confidence: number;
  sensitivity: string;
  pinned: number;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export class MemoryAtomRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  upsert(atom: MemoryAtom): MemoryAtom {
    this.db.instance
      .prepare(
        `
        INSERT INTO memory_atoms (
          id, project_id, session_id, run_id, atom_type, content, summary, keywords, provenance,
          confidence, sensitivity, pinned, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          session_id = excluded.session_id,
          run_id = excluded.run_id,
          atom_type = excluded.atom_type,
          content = excluded.content,
          summary = excluded.summary,
          keywords = excluded.keywords,
          provenance = excluded.provenance,
          confidence = excluded.confidence,
          sensitivity = excluded.sensitivity,
          pinned = excluded.pinned,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
      `,
      )
      .run(
        atom.id,
        atom.projectId,
        atom.sessionId || null,
        atom.runId || null,
        atom.atomType,
        atom.content,
        atom.summary || null,
        JSON.stringify(atom.keywords || []),
        JSON.stringify(atom.provenance || {}),
        atom.confidence,
        atom.sensitivity,
        atom.pinned ? 1 : 0,
        atom.createdAt,
        atom.updatedAt,
        atom.expiresAt || null,
      );

    return atom;
  }

  findById(id: string): MemoryAtom | null {
    const row = this.db.instance
      .prepare(
        `
        SELECT
          id, project_id, session_id, run_id, atom_type, content, summary, keywords, provenance,
          confidence, sensitivity, pinned, created_at, updated_at, expires_at
        FROM memory_atoms
        WHERE id = ?
      `,
      )
      .get(id) as MemoryAtomRow | undefined;

    return row ? this.rowToMemoryAtom(row) : null;
  }

  listByProject(projectId: string, limit = 100, offset = 0): MemoryAtom[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT
          id, project_id, session_id, run_id, atom_type, content, summary, keywords, provenance,
          confidence, sensitivity, pinned, created_at, updated_at, expires_at
        FROM memory_atoms
        WHERE project_id = ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(projectId, limit, offset) as MemoryAtomRow[];

    return rows.map((row) => this.rowToMemoryAtom(row));
  }

  listBySession(sessionId: string): MemoryAtom[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT
          id, project_id, session_id, run_id, atom_type, content, summary, keywords, provenance,
          confidence, sensitivity, pinned, created_at, updated_at, expires_at
        FROM memory_atoms
        WHERE session_id = ?
        ORDER BY updated_at DESC
      `,
      )
      .all(sessionId) as MemoryAtomRow[];

    return rows.map((row) => this.rowToMemoryAtom(row));
  }

  search(projectId: string, query: string, limit = 20): MemoryAtom[] {
    const searchTerm = `%${query}%`;
    const rows = this.db.instance
      .prepare(
        `
        SELECT
          id, project_id, session_id, run_id, atom_type, content, summary, keywords, provenance,
          confidence, sensitivity, pinned, created_at, updated_at, expires_at
        FROM memory_atoms
        WHERE project_id = ?
          AND (content LIKE ? OR summary LIKE ?)
        ORDER BY pinned DESC, updated_at DESC
        LIMIT ?
      `,
      )
      .all(projectId, searchTerm, searchTerm, limit) as MemoryAtomRow[];

    return rows.map((row) => this.rowToMemoryAtom(row));
  }

  delete(id: string): boolean {
    const result = this.db.instance.prepare('DELETE FROM memory_atoms WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private rowToMemoryAtom(row: MemoryAtomRow): MemoryAtom {
    return {
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id || undefined,
      runId: row.run_id || undefined,
      atomType: row.atom_type as MemoryAtom['atomType'],
      content: row.content,
      summary: row.summary || undefined,
      keywords: JSON.parse(row.keywords || '[]') as string[],
      provenance: JSON.parse(row.provenance || '{}') as MemoryAtom['provenance'],
      confidence: row.confidence,
      sensitivity: row.sensitivity as MemoryAtom['sensitivity'],
      pinned: row.pinned === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at || undefined,
    };
  }
}
