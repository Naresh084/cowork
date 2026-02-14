// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { BranchMergeResult, BranchSession } from '@cowork/shared';
import type { DatabaseConnection } from '../database.js';

interface SessionBranchRow {
  id: string;
  session_id: string;
  parent_branch_id: string | null;
  from_turn_id: string | null;
  name: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface SessionBranchMergeRow {
  id: string;
  source_branch_id: string;
  target_branch_id: string;
  strategy: string;
  result_status: string;
  conflict_summary: string | null;
  created_at: number;
}

export class SessionBranchRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  createBranch(branch: BranchSession): BranchSession {
    this.db.instance
      .prepare(
        `
        INSERT INTO session_branches (
          id, session_id, parent_branch_id, from_turn_id, name, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        branch.id,
        branch.sessionId,
        branch.parentBranchId || null,
        branch.fromTurnId || null,
        branch.name,
        branch.status,
        branch.createdAt,
        branch.updatedAt,
      );

    return branch;
  }

  getBranchById(branchId: string): BranchSession | null {
    const row = this.db.instance
      .prepare(
        `
        SELECT
          id, session_id, parent_branch_id, from_turn_id, name, status, created_at, updated_at
        FROM session_branches
        WHERE id = ?
      `,
      )
      .get(branchId) as SessionBranchRow | undefined;

    return row ? this.rowToBranchSession(row) : null;
  }

  listBranchesForSession(sessionId: string): BranchSession[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT
          id, session_id, parent_branch_id, from_turn_id, name, status, created_at, updated_at
        FROM session_branches
        WHERE session_id = ?
        ORDER BY created_at ASC
      `,
      )
      .all(sessionId) as SessionBranchRow[];

    return rows.map((row) => this.rowToBranchSession(row));
  }

  updateBranchStatus(branchId: string, status: BranchSession['status']): boolean {
    const result = this.db.instance
      .prepare(
        `
        UPDATE session_branches
        SET status = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(status, Date.now(), branchId);

    return result.changes > 0;
  }

  recordMerge(result: BranchMergeResult): BranchMergeResult {
    this.db.instance
      .prepare(
        `
        INSERT INTO session_branch_merges (
          id, source_branch_id, target_branch_id, strategy, result_status, conflict_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        result.mergeId,
        result.sourceBranchId,
        result.targetBranchId,
        result.strategy,
        result.status,
        JSON.stringify(result.conflicts || []),
        result.mergedAt,
      );

    return result;
  }

  listMergesForBranch(branchId: string): BranchMergeResult[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT
          id, source_branch_id, target_branch_id, strategy, result_status, conflict_summary, created_at
        FROM session_branch_merges
        WHERE source_branch_id = ? OR target_branch_id = ?
        ORDER BY created_at DESC
      `,
      )
      .all(branchId, branchId) as SessionBranchMergeRow[];

    return rows.map((row) => this.rowToMergeResult(row));
  }

  private rowToBranchSession(row: SessionBranchRow): BranchSession {
    return {
      id: row.id,
      sessionId: row.session_id,
      parentBranchId: row.parent_branch_id || undefined,
      fromTurnId: row.from_turn_id || undefined,
      name: row.name,
      status: row.status as BranchSession['status'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToMergeResult(row: SessionBranchMergeRow): BranchMergeResult {
    const conflicts = JSON.parse(row.conflict_summary || '[]') as BranchMergeResult['conflicts'];
    return {
      mergeId: row.id,
      sourceBranchId: row.source_branch_id,
      targetBranchId: row.target_branch_id,
      strategy: row.strategy as BranchMergeResult['strategy'],
      status: row.result_status as BranchMergeResult['status'],
      conflictCount: conflicts.length,
      conflicts,
      mergedAt: row.created_at,
    };
  }
}
