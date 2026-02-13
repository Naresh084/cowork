import type { PermissionDecision } from '@gemini-cowork/shared';
import type { ApprovalMode } from './types.js';

export interface SessionPermissionBootstrap {
  version: 1;
  sourceSessionId?: string;
  approvalMode?: ApprovalMode;
  permissionScopes: Record<string, string[]>;
  permissionCache: Record<string, PermissionDecision>;
  createdAt: number;
}

const BOOTSTRAP_PREFIX = 'session_permissions_v1:';

function isPermissionDecision(value: unknown): value is PermissionDecision {
  return (
    value === 'allow' ||
    value === 'deny' ||
    value === 'allow_once' ||
    value === 'allow_session'
  );
}

function normalizeBootstrap(
  input: Partial<SessionPermissionBootstrap> | null | undefined,
): SessionPermissionBootstrap | null {
  if (!input || typeof input !== 'object') return null;
  const rawScopes = input.permissionScopes;
  const rawCache = input.permissionCache;

  const permissionScopes: Record<string, string[]> = {};
  if (rawScopes && typeof rawScopes === 'object') {
    for (const [type, values] of Object.entries(rawScopes)) {
      if (!Array.isArray(values)) continue;
      const normalized = values
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      if (normalized.length > 0) {
        permissionScopes[type] = Array.from(new Set(normalized));
      }
    }
  }

  const permissionCache: Record<string, PermissionDecision> = {};
  if (rawCache && typeof rawCache === 'object') {
    for (const [cacheKey, decision] of Object.entries(rawCache)) {
      if (!isPermissionDecision(decision)) continue;
      permissionCache[cacheKey] = decision;
    }
  }

  const approvalMode = input.approvalMode;
  const safeApprovalMode =
    approvalMode === 'auto' || approvalMode === 'read_only' || approvalMode === 'full'
      ? approvalMode
      : undefined;

  return {
    version: 1,
    sourceSessionId:
      typeof input.sourceSessionId === 'string' && input.sourceSessionId.trim()
        ? input.sourceSessionId.trim()
        : undefined,
    approvalMode: safeApprovalMode,
    permissionScopes,
    permissionCache,
    createdAt:
      typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
        ? input.createdAt
        : Date.now(),
  };
}

export function encodeSessionPermissionBootstrap(
  bootstrap: SessionPermissionBootstrap,
): string {
  const normalized = normalizeBootstrap(bootstrap);
  if (!normalized) {
    return '';
  }
  const payload = JSON.stringify(normalized);
  return `${BOOTSTRAP_PREFIX}${Buffer.from(payload, 'utf-8').toString('base64')}`;
}

export function decodeSessionPermissionBootstrap(
  encoded: string | null | undefined,
): SessionPermissionBootstrap | null {
  if (!encoded || typeof encoded !== 'string') return null;
  if (!encoded.startsWith(BOOTSTRAP_PREFIX)) return null;

  const raw = encoded.slice(BOOTSTRAP_PREFIX.length);
  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as Partial<SessionPermissionBootstrap>;
    return normalizeBootstrap(parsed);
  } catch {
    return null;
  }
}
