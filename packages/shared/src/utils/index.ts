import { randomBytes, createHash } from 'crypto';

// ============================================================================
// ID Generation
// ============================================================================

export function generateId(prefix?: string): string {
  const id = randomBytes(12).toString('base64url');
  return prefix ? `${prefix}_${id}` : id;
}

export function generateSessionId(): string {
  return generateId('sess');
}

export function generateMessageId(): string {
  return generateId('msg');
}

export function generateToolCallId(): string {
  return generateId('call');
}

// ============================================================================
// Time Utilities
// ============================================================================

export function now(): number {
  return Date.now();
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function isExpired(expiresAt: number, bufferMs = 0): boolean {
  return now() >= expiresAt - bufferMs;
}

// ============================================================================
// String Utilities
// ============================================================================

export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

// ============================================================================
// Object Utilities
// ============================================================================

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

// ============================================================================
// Async Utilities
// ============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number; backoff?: boolean } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoff = true } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        throw lastError;
      }

      const waitTime = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
      await sleep(waitTime);
    }
  }

  throw lastError;
}

export function timeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ============================================================================
// Path Utilities
// ============================================================================

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function joinPaths(...paths: string[]): string {
  return normalizePath(paths.filter(Boolean).join('/'));
}

export function getFileName(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

export function getFileExtension(path: string): string {
  const fileName = getFileName(path);
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? '' : fileName.slice(lastDot + 1);
}

export function getDirectory(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? '' : normalized.slice(0, lastSlash);
}

// ============================================================================
// Event Emitter
// ============================================================================

import type { EventType, EventHandler, AppEvent, EventEmitter as IEventEmitter } from '../types/index.js';

export function createEventEmitter(): IEventEmitter {
  const handlers = new Map<EventType, Set<EventHandler>>();

  return {
    on<T>(type: EventType, handler: EventHandler<T>): () => void {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler as EventHandler);
      return () => this.off(type, handler);
    },

    off<T>(type: EventType, handler: EventHandler<T>): void {
      handlers.get(type)?.delete(handler as EventHandler);
    },

    emit<T>(type: EventType, payload: T): void {
      const event: AppEvent<T> = {
        type,
        timestamp: now(),
        payload,
      };

      handlers.get(type)?.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${type}:`, error);
        }
      });
    },
  };
}
