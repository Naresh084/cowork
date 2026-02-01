import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';

// ============================================================================
// Database Configuration
// ============================================================================

const APP_DIR = '.gemini-cowork';
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
const SCHEMA_VERSION = 1;

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
      verbose: process.env.DEBUG_SQL ? console.log : undefined,
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
  private runMigrations(_fromVersion: number): void {
    // Future migrations go here
    // For now, just update the version
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
