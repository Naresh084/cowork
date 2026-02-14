// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type {
  CreateWorkflowDraftInput,
  UpdateWorkflowDraftInput,
  WorkflowDefinition,
  WorkflowStatus,
} from '@cowork/shared';
import { generateId, now, StorageError } from '@cowork/shared';
import type { DatabaseConnection } from '../database.js';

interface WorkflowRow {
  id: string;
  version: number;
  status: WorkflowStatus;
  name: string;
  description: string | null;
  tags: string;
  schema_version: string;
  triggers: string;
  nodes: string;
  edges: string;
  defaults: string;
  permissions_profile: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

interface WorkflowAliasRow {
  workflow_id: string;
  draft_version: number | null;
  published_version: number | null;
  updated_at: number;
}

export class WorkflowRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  createDraft(input: CreateWorkflowDraftInput, createdBy?: string): WorkflowDefinition {
    const timestamp = now();
    const workflowId = generateId('wf');
    const version = 1;

    const definition: WorkflowDefinition = {
      id: workflowId,
      version,
      status: 'draft',
      name: input.name,
      description: input.description,
      tags: input.tags || [],
      schemaVersion: '1',
      triggers: input.triggers || [{ id: generateId('trg'), type: 'manual', enabled: true }],
      nodes:
        input.nodes || [
          { id: 'start', type: 'start', name: 'Start', config: {} },
          { id: 'end', type: 'end', name: 'End', config: {} },
        ],
      edges:
        input.edges || [
          { id: 'edge_start_end', from: 'start', to: 'end', condition: 'always' },
        ],
      defaults:
        input.defaults || {
          maxRunTimeMs: 30 * 60 * 1000,
          nodeTimeoutMs: 5 * 60 * 1000,
          retry: {
            maxAttempts: 3,
            backoffMs: 1000,
            maxBackoffMs: 20000,
            jitterRatio: 0.2,
          },
        },
      permissionsProfile: input.permissionsProfile,
      createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.transaction(() => {
      this.insertDefinition(definition);
      this.db.instance
        .prepare(
          `
          INSERT INTO workflow_aliases (workflow_id, draft_version, published_version, updated_at)
          VALUES (?, ?, ?, ?)
          `,
        )
        .run(workflowId, version, null, timestamp);
    });

    return definition;
  }

  listLatest(limit = 100, offset = 0): WorkflowDefinition[] {
    const rows = this.db.instance
      .prepare(
        `
        SELECT w.*
        FROM workflow_aliases wa
        JOIN workflows w
          ON w.id = wa.workflow_id
         AND w.version = COALESCE(wa.published_version, wa.draft_version)
        ORDER BY wa.updated_at DESC
        LIMIT ? OFFSET ?
        `,
      )
      .all(limit, offset) as WorkflowRow[];

    return rows.map((row) => this.rowToDefinition(row));
  }

  getAlias(workflowId: string): WorkflowAliasRow | null {
    const row = this.db.instance
      .prepare(
        `
        SELECT workflow_id, draft_version, published_version, updated_at
        FROM workflow_aliases
        WHERE workflow_id = ?
        `,
      )
      .get(workflowId) as WorkflowAliasRow | undefined;

    return row ?? null;
  }

  getByVersion(workflowId: string, version: number): WorkflowDefinition | null {
    const row = this.db.instance
      .prepare(
        `
        SELECT *
        FROM workflows
        WHERE id = ? AND version = ?
        `,
      )
      .get(workflowId, version) as WorkflowRow | undefined;

    return row ? this.rowToDefinition(row) : null;
  }

  getPublished(workflowId: string): WorkflowDefinition | null {
    const alias = this.getAlias(workflowId);
    if (!alias?.published_version) return null;
    return this.getByVersion(workflowId, alias.published_version);
  }

  getDraft(workflowId: string): WorkflowDefinition | null {
    const alias = this.getAlias(workflowId);
    if (!alias?.draft_version) return null;
    return this.getByVersion(workflowId, alias.draft_version);
  }

  get(workflowId: string, version?: number): WorkflowDefinition | null {
    if (typeof version === 'number') {
      return this.getByVersion(workflowId, version);
    }

    const alias = this.getAlias(workflowId);
    if (!alias) return null;

    if (alias.published_version) {
      return this.getByVersion(workflowId, alias.published_version);
    }

    if (alias.draft_version) {
      return this.getByVersion(workflowId, alias.draft_version);
    }

    return null;
  }

  updateDraft(workflowId: string, updates: UpdateWorkflowDraftInput): WorkflowDefinition {
    const draft = this.getDraft(workflowId);
    if (!draft) {
      throw StorageError.notFound('Workflow draft', workflowId);
    }

    const updated: WorkflowDefinition = {
      ...draft,
      ...updates,
      id: draft.id,
      version: draft.version,
      status: 'draft',
      updatedAt: now(),
    };

    this.upsertDefinition(updated);
    this.touchAlias(workflowId, {
      draftVersion: draft.version,
      publishedVersion: this.getAlias(workflowId)?.published_version ?? null,
    });

    return updated;
  }

  publish(workflowId: string): WorkflowDefinition {
    const draft = this.getDraft(workflowId);
    if (!draft) {
      throw StorageError.notFound('Workflow draft', workflowId);
    }

    const maxVersionRow = this.db.instance
      .prepare('SELECT MAX(version) as max_version FROM workflows WHERE id = ?')
      .get(workflowId) as { max_version: number | null };

    const nextVersion = (maxVersionRow.max_version ?? 0) + 1;
    const timestamp = now();
    const published: WorkflowDefinition = {
      ...draft,
      version: nextVersion,
      status: 'published',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.transaction(() => {
      this.insertDefinition(published);
      this.touchAlias(workflowId, {
        draftVersion: draft.version,
        publishedVersion: nextVersion,
      });
    });

    return published;
  }

  archive(workflowId: string): WorkflowDefinition {
    const existing = this.get(workflowId);
    if (!existing) {
      throw StorageError.notFound('Workflow', workflowId);
    }

    const archived: WorkflowDefinition = {
      ...existing,
      status: 'archived',
      updatedAt: now(),
    };

    this.upsertDefinition(archived);
    return archived;
  }

  private touchAlias(
    workflowId: string,
    versions: { draftVersion: number | null; publishedVersion: number | null },
  ): void {
    this.db.instance
      .prepare(
        `
        INSERT INTO workflow_aliases (workflow_id, draft_version, published_version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workflow_id) DO UPDATE SET
          draft_version = excluded.draft_version,
          published_version = excluded.published_version,
          updated_at = excluded.updated_at
        `,
      )
      .run(workflowId, versions.draftVersion, versions.publishedVersion, now());
  }

  private upsertDefinition(def: WorkflowDefinition): void {
    this.db.instance
      .prepare(
        `
        INSERT INTO workflows (
          id, version, status, name, description, tags, schema_version,
          triggers, nodes, edges, defaults, permissions_profile, created_by,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id, version) DO UPDATE SET
          status = excluded.status,
          name = excluded.name,
          description = excluded.description,
          tags = excluded.tags,
          schema_version = excluded.schema_version,
          triggers = excluded.triggers,
          nodes = excluded.nodes,
          edges = excluded.edges,
          defaults = excluded.defaults,
          permissions_profile = excluded.permissions_profile,
          created_by = excluded.created_by,
          updated_at = excluded.updated_at
        `,
      )
      .run(
        def.id,
        def.version,
        def.status,
        def.name,
        def.description || null,
        JSON.stringify(def.tags || []),
        def.schemaVersion || '1',
        JSON.stringify(def.triggers || []),
        JSON.stringify(def.nodes || []),
        JSON.stringify(def.edges || []),
        JSON.stringify(def.defaults || {}),
        def.permissionsProfile || null,
        def.createdBy || null,
        def.createdAt,
        def.updatedAt,
      );
  }

  private insertDefinition(def: WorkflowDefinition): void {
    this.db.instance
      .prepare(
        `
        INSERT INTO workflows (
          id, version, status, name, description, tags, schema_version,
          triggers, nodes, edges, defaults, permissions_profile, created_by,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        def.id,
        def.version,
        def.status,
        def.name,
        def.description || null,
        JSON.stringify(def.tags || []),
        def.schemaVersion || '1',
        JSON.stringify(def.triggers || []),
        JSON.stringify(def.nodes || []),
        JSON.stringify(def.edges || []),
        JSON.stringify(def.defaults || {}),
        def.permissionsProfile || null,
        def.createdBy || null,
        def.createdAt,
        def.updatedAt,
      );
  }

  private rowToDefinition(row: WorkflowRow): WorkflowDefinition {
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      name: row.name,
      description: row.description || undefined,
      tags: JSON.parse(row.tags || '[]'),
      schemaVersion: row.schema_version || '1',
      triggers: JSON.parse(row.triggers || '[]'),
      nodes: JSON.parse(row.nodes || '[]'),
      edges: JSON.parse(row.edges || '[]'),
      defaults: JSON.parse(row.defaults || '{}'),
      permissionsProfile: row.permissions_profile || undefined,
      createdBy: row.created_by || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
