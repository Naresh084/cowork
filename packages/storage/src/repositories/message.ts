import type { Message, MessageRole, MessageContentPart } from '@gemini-cowork/shared';
import { generateMessageId, now, StorageError } from '@gemini-cowork/shared';
import type { DatabaseConnection } from '../database.js';

// ============================================================================
// Message Repository
// ============================================================================

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
  metadata: string | null;
}

export class MessageRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Create a new message.
   */
  create(sessionId: string, data: Omit<Message, 'id' | 'createdAt'>): Message {
    const message: Message = {
      id: generateMessageId(),
      role: data.role,
      content: data.content,
      createdAt: now(),
      metadata: data.metadata,
    };

    const stmt = this.db.instance.prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const contentStr = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);

    stmt.run(
      message.id,
      sessionId,
      message.role,
      contentStr,
      message.createdAt,
      message.metadata ? JSON.stringify(message.metadata) : null
    );

    // Update session timestamp
    this.db.instance.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
      .run(message.createdAt, sessionId);

    return message;
  }

  /**
   * Create multiple messages in a batch.
   */
  createMany(sessionId: string, messages: Array<Omit<Message, 'id' | 'createdAt'>>): Message[] {
    return this.db.transaction(() => {
      return messages.map((msg) => this.create(sessionId, msg));
    });
  }

  /**
   * Get a message by ID.
   */
  findById(id: string): Message | null {
    const stmt = this.db.instance.prepare(`
      SELECT id, session_id, role, content, created_at, metadata
      FROM messages
      WHERE id = ?
    `);

    const row = stmt.get(id) as MessageRow | undefined;
    return row ? this.rowToMessage(row) : null;
  }

  /**
   * Get all messages for a session.
   */
  findBySessionId(sessionId: string): Message[] {
    const stmt = this.db.instance.prepare(`
      SELECT id, session_id, role, content, created_at, metadata
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);

    const rows = stmt.all(sessionId) as MessageRow[];
    return rows.map((row) => this.rowToMessage(row));
  }

  /**
   * Get the last N messages for a session.
   */
  findLastN(sessionId: string, count: number): Message[] {
    const stmt = this.db.instance.prepare(`
      SELECT id, session_id, role, content, created_at, metadata
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(sessionId, count) as MessageRow[];
    // Reverse to get chronological order
    return rows.reverse().map((row) => this.rowToMessage(row));
  }

  /**
   * Update a message's content.
   */
  update(id: string, content: string | MessageContentPart[]): Message {
    const existing = this.findById(id);
    if (!existing) {
      throw StorageError.notFound('Message', id);
    }

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    this.db.instance.prepare('UPDATE messages SET content = ? WHERE id = ?')
      .run(contentStr, id);

    return {
      ...existing,
      content,
    };
  }

  /**
   * Delete a message.
   */
  delete(id: string): void {
    const stmt = this.db.instance.prepare('DELETE FROM messages WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw StorageError.notFound('Message', id);
    }
  }

  /**
   * Delete all messages for a session.
   */
  deleteBySessionId(sessionId: string): number {
    const stmt = this.db.instance.prepare('DELETE FROM messages WHERE session_id = ?');
    const result = stmt.run(sessionId);
    return result.changes;
  }

  /**
   * Count messages in a session.
   */
  countBySessionId(sessionId: string): number {
    const result = this.db.instance.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE session_id = ?'
    ).get(sessionId) as { count: number };
    return result.count;
  }

  /**
   * Get total message count across all sessions.
   */
  count(): number {
    const result = this.db.instance.prepare(
      'SELECT COUNT(*) as count FROM messages'
    ).get() as { count: number };
    return result.count;
  }

  /**
   * Search messages by content.
   */
  search(query: string, sessionId?: string, limit = 50): Array<Message & { sessionId: string }> {
    let sql = `
      SELECT id, session_id, role, content, created_at, metadata
      FROM messages
      WHERE content LIKE ?
    `;
    const params: (string | number)[] = [`%${query}%`];

    if (sessionId) {
      sql += ' AND session_id = ?';
      params.push(sessionId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.instance.prepare(sql);
    const rows = stmt.all(...params) as MessageRow[];

    return rows.map((row) => ({
      ...this.rowToMessage(row),
      sessionId: row.session_id,
    }));
  }

  /**
   * Convert a database row to a Message object.
   */
  private rowToMessage(row: MessageRow): Message {
    let content: string | MessageContentPart[];

    try {
      // Try to parse as JSON (for multipart content)
      const parsed = JSON.parse(row.content);
      content = Array.isArray(parsed) ? parsed : row.content;
    } catch {
      // Plain text content
      content = row.content;
    }

    return {
      id: row.id,
      role: row.role as MessageRole,
      content,
      createdAt: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
