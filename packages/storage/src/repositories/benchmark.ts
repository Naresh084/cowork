// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type {
  BenchmarkDimension,
  BenchmarkMetric,
  BenchmarkRunStatus,
  BenchmarkScorecard,
  ReleaseGateStatus,
} from '@cowork/shared';
import type { DatabaseConnection } from '../database.js';

interface BenchmarkRunRow {
  id: string;
  suite_id: string;
  profile: string;
  status: string;
  started_at: number | null;
  completed_at: number | null;
  summary_json: string;
  error: string | null;
}

interface ReleaseGateSnapshotRow {
  id: string;
  benchmark_run_id: string | null;
  status: string;
  scorecard_json: string;
  gates_json: string;
  created_at: number;
}

export interface BenchmarkSuiteRecord {
  id: string;
  name: string;
  description?: string;
  version: string;
  config?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface BenchmarkRunRecord {
  id: string;
  suiteId: string;
  profile: string;
  status: BenchmarkRunStatus;
  startedAt?: number;
  completedAt?: number;
  scorecard?: BenchmarkScorecard;
  error?: string;
}

export interface BenchmarkResultRecord {
  id: string;
  runId: string;
  scenarioId: string;
  dimension: BenchmarkDimension;
  score: number;
  maxScore: number;
  details?: Record<string, unknown>;
  createdAt: number;
}

export class BenchmarkRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  upsertSuite(suite: BenchmarkSuiteRecord): BenchmarkSuiteRecord {
    this.db.instance
      .prepare(
        `
        INSERT INTO benchmark_suites (
          id, name, description, version, config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          version = excluded.version,
          config_json = excluded.config_json,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        suite.id,
        suite.name,
        suite.description || null,
        suite.version,
        JSON.stringify(suite.config || {}),
        suite.createdAt,
        suite.updatedAt,
      );
    return suite;
  }

  createRun(run: BenchmarkRunRecord): BenchmarkRunRecord {
    this.db.instance
      .prepare(
        `
        INSERT INTO benchmark_runs (
          id, suite_id, profile, status, started_at, completed_at, summary_json, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        run.id,
        run.suiteId,
        run.profile,
        run.status,
        run.startedAt || null,
        run.completedAt || null,
        JSON.stringify(run.scorecard || {}),
        run.error || null,
      );
    return run;
  }

  updateRun(runId: string, updates: Partial<BenchmarkRunRecord>): BenchmarkRunRecord {
    const current = this.getRun(runId);
    if (!current) {
      throw new Error(`Benchmark run not found: ${runId}`);
    }

    const merged: BenchmarkRunRecord = {
      ...current,
      ...updates,
      id: runId,
      suiteId: updates.suiteId || current.suiteId,
      profile: updates.profile || current.profile,
      status: updates.status || current.status,
      startedAt: updates.startedAt ?? current.startedAt,
      completedAt: updates.completedAt ?? current.completedAt,
      scorecard: updates.scorecard ?? current.scorecard,
      error: updates.error ?? current.error,
    };

    this.db.instance
      .prepare(
        `
        UPDATE benchmark_runs
        SET suite_id = ?, profile = ?, status = ?, started_at = ?, completed_at = ?, summary_json = ?, error = ?
        WHERE id = ?
      `,
      )
      .run(
        merged.suiteId,
        merged.profile,
        merged.status,
        merged.startedAt || null,
        merged.completedAt || null,
        JSON.stringify(merged.scorecard || {}),
        merged.error || null,
        runId,
      );

    return merged;
  }

  getRun(runId: string): BenchmarkRunRecord | null {
    const row = this.db.instance
      .prepare(
        `
        SELECT id, suite_id, profile, status, started_at, completed_at, summary_json, error
        FROM benchmark_runs
        WHERE id = ?
      `,
      )
      .get(runId) as BenchmarkRunRow | undefined;

    return row ? this.rowToRun(row) : null;
  }

  writeResults(results: BenchmarkResultRecord[]): void {
    if (results.length === 0) return;
    const insert = this.db.instance.prepare(
      `
      INSERT INTO benchmark_results (
        id, run_id, scenario_id, dimension, score, max_score, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );
    this.db.transaction(() => {
      for (const row of results) {
        insert.run(
          row.id,
          row.runId,
          row.scenarioId,
          row.dimension,
          row.score,
          row.maxScore,
          JSON.stringify(row.details || {}),
          row.createdAt,
        );
      }
    });
  }

  createReleaseGateSnapshot(input: {
    id: string;
    benchmarkRunId?: string;
    status: ReleaseGateStatus['status'];
    scorecard?: BenchmarkScorecard;
    gates?: Record<string, unknown>;
    createdAt: number;
  }): void {
    this.db.instance
      .prepare(
        `
        INSERT INTO release_gate_snapshots (
          id, benchmark_run_id, status, scorecard_json, gates_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.id,
        input.benchmarkRunId || null,
        input.status,
        JSON.stringify(input.scorecard || {}),
        JSON.stringify(input.gates || {}),
        input.createdAt,
      );
  }

  getLatestReleaseGateStatus(): ReleaseGateStatus | null {
    const row = this.db.instance
      .prepare(
        `
        SELECT id, benchmark_run_id, status, scorecard_json, gates_json, created_at
        FROM release_gate_snapshots
        ORDER BY created_at DESC
        LIMIT 1
      `,
      )
      .get() as ReleaseGateSnapshotRow | undefined;

    if (!row) return null;

    const gates = JSON.parse(row.gates_json || '{}') as Record<string, unknown>;
    const reasonsRaw = gates.reasons;
    const reasons = Array.isArray(reasonsRaw)
      ? reasonsRaw.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const scorecard = JSON.parse(row.scorecard_json || '{}') as BenchmarkScorecard;

    return {
      status: row.status as ReleaseGateStatus['status'],
      reasons,
      scorecard: scorecard.runId ? scorecard : undefined,
      evaluatedAt: row.created_at,
    };
  }

  private rowToRun(row: BenchmarkRunRow): BenchmarkRunRecord {
    const parsed = JSON.parse(row.summary_json || '{}') as BenchmarkScorecard;
    const scorecard = parsed.runId ? parsed : undefined;
    return {
      id: row.id,
      suiteId: row.suite_id,
      profile: row.profile,
      status: row.status as BenchmarkRunStatus,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      scorecard,
      error: row.error || undefined,
    };
  }
}

export function toBenchmarkMetricsByDimension(
  dimensions: BenchmarkScorecard['dimensions'],
): BenchmarkMetric[] {
  return dimensions.map((dimension) => ({
    dimension: dimension.dimension,
    score: dimension.score,
    maxScore: dimension.maxScore,
    weight: dimension.weight,
    threshold: dimension.threshold,
    passed: dimension.passed,
  }));
}
