const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function randomBase64Url(length: number): string {
  const bytes = getRandomBytes(length);
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += BASE64URL_ALPHABET[bytes[index] & 63];
  }

  return output;
}

function toHex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
// ID Generation
// ============================================================================

export function generateId(prefix?: string): string {
  const id = randomBase64Url(16);
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
  // Deterministic 64-char hash for cache keys and IDs, safe in browser + Node.
  let h1 = 0x811c9dc5;
  let h2 = h1 ^ 0x9e3779b9;
  let h3 = h1 ^ 0x85ebca6b;
  let h4 = h1 ^ 0xc2b2ae35;

  for (let index = 0; index < str.length; index += 1) {
    const code = str.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
    h3 = Math.imul(h3 ^ code, 0xc2b2ae35);
    h4 = Math.imul(h4 ^ code, 0x27d4eb2f);
  }

  return (
    toHex32(h1) +
    toHex32(h2) +
    toHex32(h3) +
    toHex32(h4) +
    toHex32(h1 ^ h3) +
    toHex32(h2 ^ h4) +
    toHex32(h1 ^ h2) +
    toHex32(h3 ^ h4)
  );
}

/**
 * Normalize provider/API error messages so user-facing text shows model ids
 * without transport method suffixes (for example ":generateContent").
 */
export function sanitizeProviderErrorMessage(message: string): string {
  if (!message) return message;

  return message
    .replace(
      /\b(models\/[A-Za-z0-9._-]+):[A-Za-z][A-Za-z0-9_]*\b/g,
      '$1',
    )
    .replace(
      /\b([A-Za-z0-9][A-Za-z0-9._-]*):(generateContent|generateContentStream|streamGenerateContent|embedContent|batchEmbedContents)\b/g,
      '$1',
    );
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
