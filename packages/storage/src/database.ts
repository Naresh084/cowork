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
const SCHEMA_VERSION = 2;

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

    this.db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
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
