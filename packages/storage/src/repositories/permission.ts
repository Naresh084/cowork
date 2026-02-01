import type { PermissionRequest, PermissionDecision } from '@gemini-cowork/shared';
import { now } from '@gemini-cowork/shared';
import type { DatabaseConnection } from '../database.js';

// ============================================================================
// Permission Repository
// ============================================================================

interface PermissionRow {
  id: number;
  type: string;
  resource: string;
  decision: string;
  session_id: string | null;
  created_at: number;
  expires_at: number | null;
}

export interface StoredPermission {
  id: number;
  type: string;
  resource: string;
  decision: PermissionDecision;
  sessionId?: string;
  createdAt: number;
  expiresAt?: number;
}

export class PermissionRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Grant a permission.
   */
  grant(
    request: PermissionRequest,
    decision: PermissionDecision,
    sessionId?: string,
    expiresAt?: number
  ): StoredPermission {
    // Remove any existing permission for this type/resource combo
    this.revoke(request.type, request.resource, sessionId);

    const timestamp = now();
    const stmt = this.db.instance.prepare(`
      INSERT INTO permissions (type, resource, decision, session_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      request.type,
      request.resource,
      decision,
      sessionId || null,
      timestamp,
      expiresAt || null
    );

    return {
      id: result.lastInsertRowid as number,
      type: request.type,
      resource: request.resource,
      decision,
      sessionId,
      createdAt: timestamp,
      expiresAt,
    };
  }

  /**
   * Check if a permission is granted.
   */
  isAllowed(type: string, resource: string, sessionId?: string): boolean {
    const permission = this.find(type, resource, sessionId);

    if (!permission) {
      return false;
    }

    // Check if expired
    if (permission.expiresAt && permission.expiresAt < now()) {
      this.delete(permission.id);
      return false;
    }

    return permission.decision === 'allow' || permission.decision === 'allow_session';
  }

  /**
   * Find a specific permission.
   */
  find(type: string, resource: string, sessionId?: string): StoredPermission | null {
    // First check for session-specific permission
    if (sessionId) {
      const sessionStmt = this.db.instance.prepare(`
        SELECT id, type, resource, decision, session_id, created_at, expires_at
        FROM permissions
        WHERE type = ? AND resource = ? AND session_id = ?
      `);
      const sessionRow = sessionStmt.get(type, resource, sessionId) as PermissionRow | undefined;
      if (sessionRow) {
        return this.rowToPermission(sessionRow);
      }
    }

    // Then check for global permission
    const globalStmt = this.db.instance.prepare(`
      SELECT id, type, resource, decision, session_id, created_at, expires_at
      FROM permissions
      WHERE type = ? AND resource = ? AND session_id IS NULL
    `);
    const globalRow = globalStmt.get(type, resource) as PermissionRow | undefined;

    return globalRow ? this.rowToPermission(globalRow) : null;
  }

  /**
   * Find all permissions matching a type.
   */
  findByType(type: string, sessionId?: string): StoredPermission[] {
    let sql = `
      SELECT id, type, resource, decision, session_id, created_at, expires_at
      FROM permissions
      WHERE type = ?
    `;
    const params: (string | null)[] = [type];

    if (sessionId) {
      sql += ' AND (session_id = ? OR session_id IS NULL)';
      params.push(sessionId);
    }

    const stmt = this.db.instance.prepare(sql);
    const rows = stmt.all(...params) as PermissionRow[];

    return rows.map((row) => this.rowToPermission(row));
  }

  /**
   * Get all permissions for a session.
   */
  findBySessionId(sessionId: string): StoredPermission[] {
    const stmt = this.db.instance.prepare(`
      SELECT id, type, resource, decision, session_id, created_at, expires_at
      FROM permissions
      WHERE session_id = ? OR session_id IS NULL
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(sessionId) as PermissionRow[];
    return rows.map((row) => this.rowToPermission(row));
  }

  /**
   * Revoke a specific permission.
   */
  revoke(type: string, resource: string, sessionId?: string): void {
    if (sessionId) {
      this.db.instance.prepare(
        'DELETE FROM permissions WHERE type = ? AND resource = ? AND session_id = ?'
      ).run(type, resource, sessionId);
    } else {
      this.db.instance.prepare(
        'DELETE FROM permissions WHERE type = ? AND resource = ? AND session_id IS NULL'
      ).run(type, resource);
    }
  }

  /**
   * Revoke all permissions of a type.
   */
  revokeByType(type: string, sessionId?: string): number {
    if (sessionId) {
      const result = this.db.instance.prepare(
        'DELETE FROM permissions WHERE type = ? AND session_id = ?'
      ).run(type, sessionId);
      return result.changes;
    } else {
      const result = this.db.instance.prepare(
        'DELETE FROM permissions WHERE type = ?'
      ).run(type);
      return result.changes;
    }
  }

  /**
   * Delete a permission by ID.
   */
  delete(id: number): void {
    this.db.instance.prepare('DELETE FROM permissions WHERE id = ?').run(id);
  }

  /**
   * Clear all session-specific permissions for a session.
   */
  clearSessionPermissions(sessionId: string): number {
    const result = this.db.instance.prepare(
      'DELETE FROM permissions WHERE session_id = ?'
    ).run(sessionId);
    return result.changes;
  }

  /**
   * Clear expired permissions.
   */
  clearExpired(): number {
    const result = this.db.instance.prepare(
      'DELETE FROM permissions WHERE expires_at IS NOT NULL AND expires_at < ?'
    ).run(now());
    return result.changes;
  }

  /**
   * Clear all permissions.
   */
  clearAll(): void {
    this.db.instance.prepare('DELETE FROM permissions').run();
  }

  /**
   * Convert a row to a StoredPermission.
   */
  private rowToPermission(row: PermissionRow): StoredPermission {
    return {
      id: row.id,
      type: row.type,
      resource: row.resource,
      decision: row.decision as PermissionDecision,
      sessionId: row.session_id || undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at || undefined,
    };
  }
}
