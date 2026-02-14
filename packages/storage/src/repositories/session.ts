// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { Session } from '@cowork/shared';
import { generateSessionId, now, StorageError } from '@cowork/shared';
import type { DatabaseConnection } from '../database.js';

// ============================================================================
// Session Repository
// ============================================================================

interface SessionRow {
  id: string;
  title: string | null;
  working_directory: string | null;
  model: string | null;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

export class SessionRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Create a new session.
   */
  create(data: Partial<Omit<Session, 'id' | 'messages'>> = {}): Session {
    const timestamp = now();
    const session: Session = {
      id: generateSessionId(),
      title: data.title,
      workingDirectory: data.workingDirectory,
      model: data.model || 'gemini-2.0-flash',
      createdAt: data.createdAt || timestamp,
      updatedAt: data.updatedAt || timestamp,
      messages: [],
      metadata: data.metadata,
    };

    const stmt = this.db.instance.prepare(`
      INSERT INTO sessions (id, title, working_directory, model, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.title || null,
      session.workingDirectory || null,
      session.model || 'gemini-2.0-flash',
      session.createdAt,
      session.updatedAt,
      session.metadata ? JSON.stringify(session.metadata) : null
    );

    return session;
  }

  /**
   * Get a session by ID.
   */
  findById(id: string): Session | null {
    const stmt = this.db.instance.prepare(`
      SELECT id, title, working_directory, model, created_at, updated_at, metadata
      FROM sessions
      WHERE id = ?
    `);

    const row = stmt.get(id) as SessionRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToSession(row);
  }

  /**
   * Get a session by ID or throw an error.
   */
  findByIdOrThrow(id: string): Session {
    const session = this.findById(id);
    if (!session) {
      throw StorageError.notFound('Session', id);
    }
    return session;
  }

  /**
   * List all sessions, ordered by most recent first.
   */
  findAll(limit = 100, offset = 0): Session[] {
    const stmt = this.db.instance.prepare(`
      SELECT id, title, working_directory, model, created_at, updated_at, metadata
      FROM sessions
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as SessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Update a session.
   */
  update(id: string, data: Partial<Pick<Session, 'title' | 'workingDirectory' | 'model' | 'metadata'>>): Session {
    const session = this.findByIdOrThrow(id);
    const timestamp = now();

    const stmt = this.db.instance.prepare(`
      UPDATE sessions
      SET title = ?, working_directory = ?, model = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `);

    const newTitle = data.title !== undefined ? data.title : session.title;
    const newWorkingDirectory = data.workingDirectory !== undefined ? data.workingDirectory : session.workingDirectory;
    const newModel = data.model !== undefined ? data.model : session.model;
    const newMetadata = data.metadata !== undefined ? data.metadata : session.metadata;

    stmt.run(
      newTitle || null,
      newWorkingDirectory || null,
      newModel || 'gemini-2.0-flash',
      newMetadata ? JSON.stringify(newMetadata) : null,
      timestamp,
      id
    );

    return {
      ...session,
      title: newTitle,
      workingDirectory: newWorkingDirectory,
      model: newModel,
      metadata: newMetadata,
      updatedAt: timestamp,
    };
  }

  /**
   * Touch a session to update its timestamp.
   */
  touch(id: string): void {
    const stmt = this.db.instance.prepare(`
      UPDATE sessions SET updated_at = ? WHERE id = ?
    `);
    stmt.run(now(), id);
  }

  /**
   * Delete a session and all its messages.
   */
  delete(id: string): void {
    const stmt = this.db.instance.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw StorageError.notFound('Session', id);
    }
  }

  /**
   * Delete all sessions.
   */
  deleteAll(): void {
    this.db.instance.prepare('DELETE FROM sessions').run();
  }

  /**
   * Count total sessions.
   */
  count(): number {
    const result = this.db.instance.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    return result.count;
  }

  /**
   * Search sessions by title.
   */
  search(query: string, limit = 20): Session[] {
    const stmt = this.db.instance.prepare(`
      SELECT id, title, working_directory, model, created_at, updated_at, metadata
      FROM sessions
      WHERE title LIKE ? OR working_directory LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(`%${query}%`, `%${query}%`, limit) as SessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Convert a database row to a Session object.
   */
  private rowToSession(row: SessionRow): Session {
    return {
      id: row.id,
      title: row.title || undefined,
      workingDirectory: row.working_directory || undefined,
      model: row.model || 'gemini-2.0-flash',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: [], // Messages loaded separately
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
