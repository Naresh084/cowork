// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { appendFile, chmod, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const SECURITY_DIR_NAME = 'security';
const AUDIT_LOG_FILE_NAME = 'audit.log';
const MAX_STRING_LENGTH = 256;
const MAX_ARRAY_LENGTH = 20;
const REDACT_KEY_PATTERN = /(secret|token|password|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}…[truncated:${value.length - MAX_STRING_LENGTH}]`;
}

function sanitizeValue(value: unknown, depth = 0): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (depth >= 4) {
      return [`[array depth limit:${value.length}]`];
    }
    return value.slice(0, MAX_ARRAY_LENGTH).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= 4) {
      return { _note: '[object depth limit]' };
    }

    const record = value as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (REDACT_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
        continue;
      }
      result[key] = sanitizeValue(entry, depth + 1);
    }
    return result;
  }

  return String(value);
}

export interface SecurityAuditEntry {
  category: string;
  command: string;
  outcome: 'success' | 'failed' | 'cached';
  sessionId?: string | null;
  connectorId?: string | null;
  runId?: string | null;
  provider?: string | null;
  metadata?: Record<string, unknown>;
  error?: string;
}

class SecurityAuditLogService {
  private baseDir = join(homedir(), '.cowork');
  private filePath = join(this.baseDir, SECURITY_DIR_NAME, AUDIT_LOG_FILE_NAME);
  private initialized = false;

  setBaseDir(baseDir: string): void {
    const trimmed = baseDir.trim();
    if (!trimmed) {
      return;
    }
    this.baseDir = trimmed;
    this.filePath = join(this.baseDir, SECURITY_DIR_NAME, AUDIT_LOG_FILE_NAME);
    this.initialized = false;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const securityDir = join(this.baseDir, SECURITY_DIR_NAME);
    await mkdir(securityDir, { recursive: true });
    await writeFile(this.filePath, '', { flag: 'a' });
    try {
      await chmod(this.filePath, 0o600);
    } catch {
      // Best effort for platforms where chmod may not apply.
    }
    this.initialized = true;
  }

  async log(entry: SecurityAuditEntry): Promise<void> {
    try {
      await this.ensureInitialized();

      const payload = {
        timestamp: Date.now(),
        category: entry.category,
        command: entry.command,
        outcome: entry.outcome,
        sessionId: entry.sessionId || null,
        connectorId: entry.connectorId || null,
        runId: entry.runId || null,
        provider: entry.provider || null,
        metadata: sanitizeValue(entry.metadata || {}),
        error: entry.error ? truncateString(entry.error) : null,
      };

      await appendFile(this.filePath, `${JSON.stringify(payload)}\n`, 'utf8');
    } catch {
      // Logging must never crash command handling.
    }
  }
}

export const securityAuditLog = new SecurityAuditLogService();
