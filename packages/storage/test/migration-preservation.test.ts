// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { DatabaseConnection } from '../src/database.js';

describe('schema migration preservation', () => {
  it('keeps existing sessions/messages/workflows untouched when migrating to v6', () => {
    const root = mkdtempSync(join(tmpdir(), 'cowork-storage-migrate-'));
    const dbPath = join(root, 'legacy.db');

    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (2);

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        working_directory TEXT,
        model TEXT DEFAULT 'gemini-2.0-flash',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE TABLE workflows (
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
    `);

    legacy
      .prepare(
        `INSERT INTO sessions (id, title, working_directory, model, created_at, updated_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'session_legacy',
        'Legacy Session',
        '/tmp/workspace',
        'gemini-2.5-pro',
        1700000000000,
        1700000005000,
        JSON.stringify({ pinned: true }),
      );

    legacy
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, created_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'msg_legacy',
        'session_legacy',
        'user',
        'Please preserve this transcript.',
        1700000006000,
        JSON.stringify({ source: 'legacy' }),
      );

    legacy
      .prepare(
        `INSERT INTO workflows (
          id, version, status, name, description, tags, schema_version, triggers, nodes, edges, defaults,
          permissions_profile, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'workflow_legacy',
        1,
        'published',
        'Legacy Workflow',
        'Preserved workflow',
        JSON.stringify(['legacy']),
        '1',
        JSON.stringify([]),
        JSON.stringify([{ id: 'node_1', type: 'task' }]),
        JSON.stringify([]),
        JSON.stringify({ retry: 1 }),
        'balanced',
        'legacy-owner',
        1700000010000,
        1700000015000,
      );
    legacy.close();

    const migrated = new DatabaseConnection({ path: dbPath });
    const db = migrated.instance;

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session_legacy') as
      | Record<string, unknown>
      | undefined;
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get('msg_legacy') as
      | Record<string, unknown>
      | undefined;
    const workflow = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND version = ?')
      .get('workflow_legacy', 1) as Record<string, unknown> | undefined;

    expect(session).toMatchObject({
      id: 'session_legacy',
      title: 'Legacy Session',
      working_directory: '/tmp/workspace',
      model: 'gemini-2.5-pro',
    });
    expect(message).toMatchObject({
      id: 'msg_legacy',
      session_id: 'session_legacy',
      role: 'user',
      content: 'Please preserve this transcript.',
    });
    expect(workflow).toMatchObject({
      id: 'workflow_legacy',
      version: 1,
      status: 'published',
      name: 'Legacy Workflow',
    });

    const schemaRow = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
    expect(schemaRow?.version).toBe(6);

    migrated.close();
    rmSync(root, { recursive: true, force: true });
  });
});
