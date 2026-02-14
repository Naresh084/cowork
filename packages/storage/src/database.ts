// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';

// ============================================================================
// Database Configuration
// ============================================================================

const APP_DIR = '.cowork';
const DB_FILE = 'data.db';

export interface DatabaseOptions {
  path?: string;
  inMemory?: boolean;
}

/**
 * Get the default database path.
 */
export function getDefaultDatabasePath(): string {
  const dir = join(homedir(), APP_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, DB_FILE);
}

/**
 * Database schema version for migrations.
 */
const SCHEMA_VERSION = 6;

/**
 * SQL statements for creating the database schema.
 */
const SCHEMA_SQL = `
-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  working_directory TEXT,
  model TEXT DEFAULT 'gemini-2.0-flash',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  metadata TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  resource TEXT NOT NULL,
  decision TEXT NOT NULL,
  session_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_permissions_type_resource ON permissions(type, resource);
CREATE INDEX IF NOT EXISTS idx_permissions_session_id ON permissions(session_id);

-- Settings table for key-value storage
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

-- Workflows table (draft and published versions)
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  schema_version TEXT NOT NULL DEFAULT '1',
  triggers TEXT NOT NULL DEFAULT '[]',
  nodes TEXT NOT NULL DEFAULT '[]',
  edges TEXT NOT NULL DEFAULT '[]',
  defaults TEXT NOT NULL DEFAULT '{}',
  permissions_profile TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);

-- Workflow aliases (points to draft and latest published version)
CREATE TABLE IF NOT EXISTS workflow_aliases (
  workflow_id TEXT PRIMARY KEY,
  draft_version INTEGER,
  published_version INTEGER,
  updated_at INTEGER NOT NULL
);

-- Workflow runs
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_context TEXT NOT NULL DEFAULT '{}',
  input TEXT NOT NULL DEFAULT '{}',
  output TEXT,
  status TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  current_node_id TEXT,
  error TEXT,
  correlation_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON workflow_runs(created_at DESC);

-- Per-node run records
CREATE TABLE IF NOT EXISTS workflow_node_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '{}',
  output TEXT,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_run ON workflow_node_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_node ON workflow_node_runs(node_id);

-- Event log for workflow runs
CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_run_ts ON workflow_events(run_id, ts ASC);

-- Materialized trigger definitions for schedule/webhook/integration events
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type ON workflow_triggers(type);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_next_run ON workflow_triggers(next_run_at);

-- Webhook metadata references (secrets are stored outside DB)
CREATE TABLE IF NOT EXISTS workflow_webhooks (
  endpoint_key TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  auth_mode TEXT NOT NULL,
  secret_ref TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Lightweight run lock table for recovery/resume semantics
CREATE TABLE IF NOT EXISTS workflow_run_locks (
  run_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Memory atoms (normalized long-term memory store)
CREATE TABLE IF NOT EXISTS memory_atoms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  session_id TEXT,
  run_id TEXT,
  atom_type TEXT NOT NULL DEFAULT 'semantic',
  content TEXT NOT NULL,
  summary TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  provenance TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.5,
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_memory_atoms_project ON memory_atoms(project_id);
CREATE INDEX IF NOT EXISTS idx_memory_atoms_session ON memory_atoms(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_atoms_updated_at ON memory_atoms(updated_at DESC);

CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  from_atom_id TEXT NOT NULL,
  to_atom_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_from_to ON memory_edges(from_atom_id, to_atom_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_type ON memory_edges(edge_type);

CREATE TABLE IF NOT EXISTS memory_query_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  project_id TEXT NOT NULL DEFAULT 'default',
  query_text TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '{}',
  result_atom_ids TEXT NOT NULL DEFAULT '[]',
  latency_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_query_logs_session ON memory_query_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_query_logs_created_at ON memory_query_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS memory_feedback (
  id TEXT PRIMARY KEY,
  query_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_feedback_query ON memory_feedback(query_id);
CREATE INDEX IF NOT EXISTS idx_memory_feedback_atom ON memory_feedback(atom_id);

CREATE TABLE IF NOT EXISTS memory_consolidation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL,
  stats_json TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_consolidation_project ON memory_consolidation_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_memory_consolidation_started_at ON memory_consolidation_runs(started_at DESC);

-- Branching and merge lineage
CREATE TABLE IF NOT EXISTS session_branches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  parent_branch_id TEXT,
  from_turn_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_branches_session ON session_branches(session_id);
CREATE INDEX IF NOT EXISTS idx_session_branches_status ON session_branches(status);

CREATE TABLE IF NOT EXISTS session_branch_merges (
  id TEXT PRIMARY KEY,
  source_branch_id TEXT NOT NULL,
  target_branch_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  result_status TEXT NOT NULL,
  conflict_summary TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_branch_merges_source ON session_branch_merges(source_branch_id);
CREATE INDEX IF NOT EXISTS idx_session_branch_merges_target ON session_branch_merges(target_branch_id);

-- Run checkpoints for resumable execution
CREATE TABLE IF NOT EXISTS run_checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  branch_id TEXT,
  checkpoint_index INTEGER NOT NULL,
  stage TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_checkpoints_run_idx ON run_checkpoints(run_id, checkpoint_index DESC);
CREATE INDEX IF NOT EXISTS idx_run_checkpoints_session ON run_checkpoints(session_id);

-- Benchmark and release gate artifacts
CREATE TABLE IF NOT EXISTS benchmark_suites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  summary_json TEXT NOT NULL DEFAULT '{}',
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_benchmark_runs_suite ON benchmark_runs(suite_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_status ON benchmark_runs(status);
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_started_at ON benchmark_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS benchmark_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_results_run ON benchmark_results(run_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_dimension ON benchmark_results(dimension);

CREATE TABLE IF NOT EXISTS release_gate_snapshots (
  id TEXT PRIMARY KEY,
  benchmark_run_id TEXT,
  status TEXT NOT NULL,
  scorecard_json TEXT NOT NULL DEFAULT '{}',
  gates_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_release_gate_snapshots_created_at ON release_gate_snapshots(created_at DESC);
`;

/**
 * Database connection wrapper.
 */
export class DatabaseConnection {
  private db: Database.Database;
  private isOpen: boolean = true;

  constructor(options: DatabaseOptions = {}) {
    const dbPath = options.inMemory ? ':memory:' : (options.path || getDefaultDatabasePath());

    this.db = new Database(dbPath, {
      verbose: process.env.DEBUG_SQL ? (...args) => console.warn(...args) : undefined,
    });

    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    // Initialize schema
    this.initializeSchema();
  }

  /**
   * Initialize the database schema.
   */
  private initializeSchema(): void {
    // Check if schema exists
    const versionTable = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).get();

    if (!versionTable) {
      // First time setup - create all tables
      this.db.exec(SCHEMA_SQL);
      this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
      return;
    }

    // Check version and run migrations if needed
    const currentVersion = this.db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;

    if (!currentVersion || currentVersion.version < SCHEMA_VERSION) {
      this.runMigrations(currentVersion?.version || 0);
    }
  }

  /**
   * Run database migrations.
   */
  private runMigrations(fromVersion: number): void {
    const migrate = this.db.transaction(() => {
      if (fromVersion < 2) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS workflows (
            id TEXT NOT NULL,
            version INTEGER NOT NULL,
            status TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            tags TEXT NOT NULL DEFAULT '[]',
            schema_version TEXT NOT NULL DEFAULT '1',
            triggers TEXT NOT NULL DEFAULT '[]',
            nodes TEXT NOT NULL DEFAULT '[]',
            edges TEXT NOT NULL DEFAULT '[]',
            defaults TEXT NOT NULL DEFAULT '{}',
            permissions_profile TEXT,
            created_by TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (id, version)
          );
          CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
          CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);

          CREATE TABLE IF NOT EXISTS workflow_aliases (
            workflow_id TEXT PRIMARY KEY,
            draft_version INTEGER,
            published_version INTEGER,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            workflow_version INTEGER NOT NULL,
            trigger_type TEXT NOT NULL,
            trigger_context TEXT NOT NULL DEFAULT '{}',
            input TEXT NOT NULL DEFAULT '{}',
            output TEXT,
            status TEXT NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            current_node_id TEXT,
            error TEXT,
            correlation_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
          CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON workflow_runs(created_at DESC);

          CREATE TABLE IF NOT EXISTS workflow_node_runs (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            attempt INTEGER NOT NULL,
            status TEXT NOT NULL,
            input TEXT NOT NULL DEFAULT '{}',
            output TEXT,
            error TEXT,
            started_at INTEGER,
            completed_at INTEGER,
            duration_ms INTEGER
          );
          CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_run ON workflow_node_runs(run_id);
          CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_node ON workflow_node_runs(node_id);

          CREATE TABLE IF NOT EXISTS workflow_events (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            type TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}'
          );
          CREATE INDEX IF NOT EXISTS idx_workflow_events_run_ts ON workflow_events(run_id, ts ASC);

          CREATE TABLE IF NOT EXISTS workflow_triggers (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            workflow_version INTEGER NOT NULL,
            type TEXT NOT NULL,
            config TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            next_run_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type ON workflow_triggers(type);
          CREATE INDEX IF NOT EXISTS idx_workflow_triggers_next_run ON workflow_triggers(next_run_at);

          CREATE TABLE IF NOT EXISTS workflow_webhooks (
            endpoint_key TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            workflow_version INTEGER NOT NULL,
            auth_mode TEXT NOT NULL,
            secret_ref TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS workflow_run_locks (
            run_id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            acquired_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
          );
        `);
      }

      if (fromVersion < 3) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS memory_atoms (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL DEFAULT 'default',
            session_id TEXT,
            run_id TEXT,
            atom_type TEXT NOT NULL DEFAULT 'semantic',
            content TEXT NOT NULL,
            summary TEXT,
            keywords TEXT NOT NULL DEFAULT '[]',
            provenance TEXT NOT NULL DEFAULT '{}',
            confidence REAL NOT NULL DEFAULT 0.5,
            sensitivity TEXT NOT NULL DEFAULT 'normal',
            pinned INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            expires_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS idx_memory_atoms_project ON memory_atoms(project_id);
          CREATE INDEX IF NOT EXISTS idx_memory_atoms_session ON memory_atoms(session_id);
          CREATE INDEX IF NOT EXISTS idx_memory_atoms_updated_at ON memory_atoms(updated_at DESC);

          CREATE TABLE IF NOT EXISTS memory_edges (
            id TEXT PRIMARY KEY,
            from_atom_id TEXT NOT NULL,
            to_atom_id TEXT NOT NULL,
            edge_type TEXT NOT NULL,
            weight REAL NOT NULL DEFAULT 1.0,
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_memory_edges_from_to ON memory_edges(from_atom_id, to_atom_id);
          CREATE INDEX IF NOT EXISTS idx_memory_edges_type ON memory_edges(edge_type);

          CREATE TABLE IF NOT EXISTS memory_query_logs (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            project_id TEXT NOT NULL DEFAULT 'default',
            query_text TEXT NOT NULL,
            options_json TEXT NOT NULL DEFAULT '{}',
            result_atom_ids TEXT NOT NULL DEFAULT '[]',
            latency_ms INTEGER,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_memory_query_logs_session ON memory_query_logs(session_id);
          CREATE INDEX IF NOT EXISTS idx_memory_query_logs_created_at ON memory_query_logs(created_at DESC);

          CREATE TABLE IF NOT EXISTS memory_feedback (
            id TEXT PRIMARY KEY,
            query_id TEXT NOT NULL,
            atom_id TEXT NOT NULL,
            feedback_type TEXT NOT NULL,
            note TEXT,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_memory_feedback_query ON memory_feedback(query_id);
          CREATE INDEX IF NOT EXISTS idx_memory_feedback_atom ON memory_feedback(atom_id);

          CREATE TABLE IF NOT EXISTS memory_consolidation_runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL DEFAULT 'default',
            status TEXT NOT NULL,
            stats_json TEXT NOT NULL DEFAULT '{}',
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            error TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_memory_consolidation_project ON memory_consolidation_runs(project_id);
          CREATE INDEX IF NOT EXISTS idx_memory_consolidation_started_at ON memory_consolidation_runs(started_at DESC);
        `);
      }

      if (fromVersion < 4) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS session_branches (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            parent_branch_id TEXT,
            from_turn_id TEXT,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_session_branches_session ON session_branches(session_id);
          CREATE INDEX IF NOT EXISTS idx_session_branches_status ON session_branches(status);

          CREATE TABLE IF NOT EXISTS session_branch_merges (
            id TEXT PRIMARY KEY,
            source_branch_id TEXT NOT NULL,
            target_branch_id TEXT NOT NULL,
            strategy TEXT NOT NULL,
            result_status TEXT NOT NULL,
            conflict_summary TEXT,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_session_branch_merges_source ON session_branch_merges(source_branch_id);
          CREATE INDEX IF NOT EXISTS idx_session_branch_merges_target ON session_branch_merges(target_branch_id);
        `);
      }

      if (fromVersion < 5) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS run_checkpoints (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            branch_id TEXT,
            checkpoint_index INTEGER NOT NULL,
            stage TEXT NOT NULL,
            state_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_run_checkpoints_run_idx ON run_checkpoints(run_id, checkpoint_index DESC);
          CREATE INDEX IF NOT EXISTS idx_run_checkpoints_session ON run_checkpoints(session_id);

          CREATE TABLE IF NOT EXISTS benchmark_suites (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            version TEXT NOT NULL,
            config_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS benchmark_runs (
            id TEXT PRIMARY KEY,
            suite_id TEXT NOT NULL,
            profile TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            summary_json TEXT NOT NULL DEFAULT '{}',
            error TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_benchmark_runs_suite ON benchmark_runs(suite_id);
          CREATE INDEX IF NOT EXISTS idx_benchmark_runs_status ON benchmark_runs(status);
          CREATE INDEX IF NOT EXISTS idx_benchmark_runs_started_at ON benchmark_runs(started_at DESC);

          CREATE TABLE IF NOT EXISTS benchmark_results (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            scenario_id TEXT NOT NULL,
            dimension TEXT NOT NULL,
            score REAL NOT NULL,
            max_score REAL NOT NULL,
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_benchmark_results_run ON benchmark_results(run_id);
          CREATE INDEX IF NOT EXISTS idx_benchmark_results_dimension ON benchmark_results(dimension);
        `);
      }

      if (fromVersion < 6) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS release_gate_snapshots (
            id TEXT PRIMARY KEY,
            benchmark_run_id TEXT,
            status TEXT NOT NULL,
            scorecard_json TEXT NOT NULL DEFAULT '{}',
            gates_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_release_gate_snapshots_created_at ON release_gate_snapshots(created_at DESC);
        `);
      }

      const row = this.db.prepare('SELECT COUNT(*) as count FROM schema_version').get() as { count: number };
      if (!row || row.count === 0) {
        this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
      } else {
        this.db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
      }
    });

    migrate();
  }

  /**
   * Get the underlying database instance.
   */
  get instance(): Database.Database {
    if (!this.isOpen) {
      throw new Error('Database connection is closed');
    }
    return this.db;
  }

  /**
   * Run a function within a transaction.
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.isOpen) {
      this.db.close();
      this.isOpen = false;
    }
  }

  /**
   * Check if the database is open.
   */
  get opened(): boolean {
    return this.isOpen;
  }
}

// Singleton instance
let defaultConnection: DatabaseConnection | null = null;

/**
 * Get or create the default database connection.
 */
export function getDatabase(options?: DatabaseOptions): DatabaseConnection {
  if (!defaultConnection || !defaultConnection.opened) {
    defaultConnection = new DatabaseConnection(options);
  }
  return defaultConnection;
}

/**
 * Close the default database connection.
 */
export function closeDatabase(): void {
  if (defaultConnection) {
    defaultConnection.close();
    defaultConnection = null;
  }
}
