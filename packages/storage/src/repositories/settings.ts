import { now } from '@gemini-cowork/shared';
import type { DatabaseConnection } from '../database.js';

// ============================================================================
// Settings Repository
// ============================================================================

interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface Setting {
  key: string;
  value: string;
  updatedAt: number;
}

export class SettingsRepository {
  private db: DatabaseConnection;
  private cache: Map<string, string> = new Map();

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Get a setting value.
   */
  get(key: string): string | null {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const stmt = this.db.instance.prepare(
      'SELECT value FROM settings WHERE key = ?'
    );
    const row = stmt.get(key) as { value: string } | undefined;

    if (row) {
      this.cache.set(key, row.value);
      return row.value;
    }

    return null;
  }

  /**
   * Get a setting as a typed value.
   */
  getTyped<T>(key: string, defaultValue: T): T {
    const value = this.get(key);
    if (value === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Set a setting value.
   */
  set(key: string, value: string): void {
    const timestamp = now();
    const stmt = this.db.instance.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(key, value, timestamp);
    this.cache.set(key, value);
  }

  /**
   * Set a typed value (serialized as JSON).
   */
  setTyped<T>(key: string, value: T): void {
    this.set(key, JSON.stringify(value));
  }

  /**
   * Delete a setting.
   */
  delete(key: string): void {
    this.db.instance.prepare('DELETE FROM settings WHERE key = ?').run(key);
    this.cache.delete(key);
  }

  /**
   * Get all settings.
   */
  getAll(): Setting[] {
    const stmt = this.db.instance.prepare(
      'SELECT key, value, updated_at FROM settings ORDER BY key'
    );
    const rows = stmt.all() as SettingRow[];

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get settings matching a prefix.
   */
  getByPrefix(prefix: string): Setting[] {
    const stmt = this.db.instance.prepare(
      'SELECT key, value, updated_at FROM settings WHERE key LIKE ? ORDER BY key'
    );
    const rows = stmt.all(`${prefix}%`) as SettingRow[];

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Clear all settings.
   */
  clearAll(): void {
    this.db.instance.prepare('DELETE FROM settings').run();
    this.cache.clear();
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
