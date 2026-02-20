/**
 * SQLite-backed BaseStore implementation for persistent cross-session memory.
 *
 * Implements the LangGraph BaseStore interface using better-sqlite3,
 * providing durable key-value storage with namespace hierarchy,
 * filtering, and keyword-based search.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import {
  BaseStore,
  type Operation,
  type OperationResults,
  type GetOperation,
  type PutOperation,
  type SearchOperation,
  type ListNamespacesOperation,
  type Item,
  type SearchItem,
  type MatchCondition,
} from '@langchain/langgraph-checkpoint';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NAMESPACE_SEPARATOR = '|';

/** Encode a namespace tuple to a pipe-delimited string. */
function encodeNamespace(ns: string[]): string {
  return ns.join(NAMESPACE_SEPARATOR);
}

/** Decode a pipe-delimited string back to a namespace tuple. */
function decodeNamespace(encoded: string): string[] {
  return encoded.split(NAMESPACE_SEPARATOR);
}

/** Default database path: ~/.cowork/store.db */
function getDefaultStorePath(): string {
  const dir = join(homedir(), '.cowork');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'store.db');
}

// ---------------------------------------------------------------------------
// Type guards to distinguish operation types in the batch array
// ---------------------------------------------------------------------------

function isGetOp(op: Operation): op is GetOperation {
  return 'key' in op && 'namespace' in op && !('value' in op) && !('namespacePrefix' in op);
}

function isSearchOp(op: Operation): op is SearchOperation {
  return 'namespacePrefix' in op;
}

function isPutOp(op: Operation): op is PutOperation {
  return 'value' in op && 'namespace' in op;
}

function isListNamespacesOp(op: Operation): op is ListNamespacesOperation {
  return 'limit' in op && 'offset' in op && !('namespacePrefix' in op) && !('key' in op) && !('value' in op);
}

// ---------------------------------------------------------------------------
// Filter operators (mirrors compareValues from langgraph-checkpoint)
// ---------------------------------------------------------------------------

interface FilterOperators {
  $eq?: unknown;
  $ne?: unknown;
  $gt?: unknown;
  $gte?: unknown;
  $lt?: unknown;
  $lte?: unknown;
  $in?: unknown[];
  $nin?: unknown[];
}

function isFilterOperators(obj: unknown): obj is FilterOperators {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    Object.keys(obj).every(
      (k) =>
        k === '$eq' ||
        k === '$ne' ||
        k === '$gt' ||
        k === '$gte' ||
        k === '$lt' ||
        k === '$lte' ||
        k === '$in' ||
        k === '$nin',
    )
  );
}

function compareValues(itemValue: unknown, filterValue: unknown): boolean {
  if (isFilterOperators(filterValue)) {
    return Object.entries(filterValue).every(([op, value]) => {
      switch (op) {
        case '$eq':
          return itemValue === value;
        case '$ne':
          return itemValue !== value;
        case '$gt':
          return Number(itemValue) > Number(value);
        case '$gte':
          return Number(itemValue) >= Number(value);
        case '$lt':
          return Number(itemValue) < Number(value);
        case '$lte':
          return Number(itemValue) <= Number(value);
        case '$in':
          return Array.isArray(value) ? value.includes(itemValue) : false;
        case '$nin':
          return Array.isArray(value) ? !value.includes(itemValue) : true;
        default:
          return false;
      }
    });
  }
  return itemValue === filterValue;
}

// ---------------------------------------------------------------------------
// Row shape coming out of SQLite
// ---------------------------------------------------------------------------

interface StoreRow {
  namespace: string;
  key: string;
  value: string;
  created_at: number;
  updated_at: number;
}

function rowToItem(row: StoreRow): Item {
  return {
    namespace: decodeNamespace(row.namespace),
    key: row.key,
    value: JSON.parse(row.value) as Record<string, unknown>,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// SqliteBaseStore
// ---------------------------------------------------------------------------

export class SqliteBaseStore extends BaseStore {
  private db: Database.Database;
  private isSetup = false;

  constructor(dbPath?: string) {
    super();
    const resolvedPath = dbPath ?? getDefaultStorePath();
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.setup();
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  override start(): void {
    if (!this.isSetup) {
      this.setup();
    }
  }

  override stop(): void {
    if (this.db.open) {
      this.db.close();
    }
  }

  // -----------------------------------------------------------------------
  // Schema setup
  // -----------------------------------------------------------------------

  private setup(): void {
    if (this.isSetup) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS store_items (
        namespace TEXT NOT NULL,
        key       TEXT NOT NULL,
        value     TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, key)
      );
      CREATE INDEX IF NOT EXISTS idx_store_items_namespace ON store_items(namespace);
      CREATE INDEX IF NOT EXISTS idx_store_items_updated_at ON store_items(updated_at DESC);
    `);

    this.isSetup = true;
  }

  // -----------------------------------------------------------------------
  // Core batch implementation (the only abstract method)
  // -----------------------------------------------------------------------

  async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const results: unknown[] = new Array(operations.length);

    // We execute everything inside a single synchronous transaction for
    // atomicity and to avoid multiple disk flushes.
    const run = this.db.transaction(() => {
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];

        if (isGetOp(op)) {
          results[i] = this.execGet(op);
        } else if (isSearchOp(op)) {
          results[i] = this.execSearch(op);
        } else if (isPutOp(op)) {
          this.execPut(op);
          results[i] = undefined; // PutOperation returns void
        } else if (isListNamespacesOp(op)) {
          results[i] = this.execListNamespaces(op);
        }
      }
    });

    run();

    return results as OperationResults<Op>;
  }

  // -----------------------------------------------------------------------
  // Individual operation executors (synchronous, called inside transaction)
  // -----------------------------------------------------------------------

  private execGet(op: GetOperation): Item | null {
    const nsKey = encodeNamespace(op.namespace);
    const row = this.db
      .prepare('SELECT namespace, key, value, created_at, updated_at FROM store_items WHERE namespace = ? AND key = ?')
      .get(nsKey, op.key) as StoreRow | undefined;

    return row ? rowToItem(row) : null;
  }

  private execSearch(op: SearchOperation): SearchItem[] {
    const nsPrefix = encodeNamespace(op.namespacePrefix);
    const limit = op.limit ?? 10;
    const offset = op.offset ?? 0;

    // Fetch candidates whose namespace starts with the prefix.
    // If the prefix is empty (namespacePrefix: []) we match everything.
    let rows: StoreRow[];
    if (op.namespacePrefix.length === 0) {
      rows = this.db
        .prepare('SELECT namespace, key, value, created_at, updated_at FROM store_items ORDER BY updated_at DESC')
        .all() as StoreRow[];
    } else {
      // Match exact prefix or prefix followed by the separator.
      rows = this.db
        .prepare(
          `SELECT namespace, key, value, created_at, updated_at FROM store_items
           WHERE namespace = ? OR namespace LIKE ?
           ORDER BY updated_at DESC`,
        )
        .all(nsPrefix, `${nsPrefix}${NAMESPACE_SEPARATOR}%`) as StoreRow[];
    }

    // Apply keyword search on serialized value text if query is provided.
    if (op.query) {
      const lowerQuery = op.query.toLowerCase();
      rows = rows.filter((row) => row.value.toLowerCase().includes(lowerQuery));
    }

    // Apply filter on parsed value fields.
    let items: SearchItem[] = rows.map((row) => ({
      ...rowToItem(row),
      score: undefined,
    }));

    if (op.filter) {
      items = items.filter((item) =>
        Object.entries(op.filter!).every(([key, value]) => compareValues(item.value[key], value)),
      );
    }

    // Paginate
    return items.slice(offset, offset + limit);
  }

  private execPut(op: PutOperation): void {
    const nsKey = encodeNamespace(op.namespace);
    const now = Date.now();

    if (op.value === null) {
      // Delete
      this.db.prepare('DELETE FROM store_items WHERE namespace = ? AND key = ?').run(nsKey, op.key);
    } else {
      // Upsert
      const existing = this.db
        .prepare('SELECT created_at FROM store_items WHERE namespace = ? AND key = ?')
        .get(nsKey, op.key) as { created_at: number } | undefined;

      if (existing) {
        this.db
          .prepare('UPDATE store_items SET value = ?, updated_at = ? WHERE namespace = ? AND key = ?')
          .run(JSON.stringify(op.value), now, nsKey, op.key);
      } else {
        this.db
          .prepare('INSERT INTO store_items (namespace, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(nsKey, op.key, JSON.stringify(op.value), now, now);
      }
    }
  }

  private execListNamespaces(op: ListNamespacesOperation): string[][] {
    // Fetch all distinct namespaces
    const rows = this.db
      .prepare('SELECT DISTINCT namespace FROM store_items ORDER BY namespace')
      .all() as Array<{ namespace: string }>;

    let namespaces = rows.map((r) => decodeNamespace(r.namespace));

    // Apply match conditions (prefix / suffix with wildcard support)
    if (op.matchConditions && op.matchConditions.length > 0) {
      namespaces = namespaces.filter((ns) =>
        op.matchConditions!.every((condition) => this.doesMatch(condition, ns)),
      );
    }

    // Apply maxDepth: truncate namespaces to maxDepth levels and deduplicate
    if (op.maxDepth !== undefined) {
      const seen = new Set<string>();
      const truncated: string[][] = [];
      for (const ns of namespaces) {
        const sliced = ns.slice(0, op.maxDepth);
        const key = encodeNamespace(sliced);
        if (!seen.has(key)) {
          seen.add(key);
          truncated.push(sliced);
        }
      }
      namespaces = truncated;
    }

    // Sort lexicographically
    namespaces.sort((a, b) => encodeNamespace(a).localeCompare(encodeNamespace(b)));

    // Paginate
    const offsetVal = op.offset ?? 0;
    const limitVal = op.limit ?? namespaces.length;
    return namespaces.slice(offsetVal, offsetVal + limitVal);
  }

  // -----------------------------------------------------------------------
  // Match condition helper (mirrors InMemoryStore logic)
  // -----------------------------------------------------------------------

  private doesMatch(condition: MatchCondition, ns: string[]): boolean {
    const { matchType, path } = condition;

    if (matchType === 'prefix') {
      if (path.length > ns.length) return false;
      return path.every((pElem, index) => pElem === '*' || ns[index] === pElem);
    }

    if (matchType === 'suffix') {
      if (path.length > ns.length) return false;
      return path.every((pElem, index) => {
        const kElem = ns[ns.length - path.length + index];
        return pElem === '*' || kElem === pElem;
      });
    }

    throw new Error(`Unsupported match type: ${matchType}`);
  }
}
