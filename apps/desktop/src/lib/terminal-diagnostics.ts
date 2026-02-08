import { invoke } from '@tauri-apps/api/core';

type DiagnosticLevel = 'error' | 'warn' | 'info';

interface DiagnosticPayload {
  level: DiagnosticLevel;
  source: string;
  message: string;
  details?: string;
  contextJson?: string;
}

type WindowWithDiagnostics = Window & {
  __coworkTerminalDiagnosticsInstalled__?: boolean;
};

const MAX_FIELD_CHARS = 12_000;
const DEDUPE_WINDOW_MS = 750;
const MAX_PENDING_LOGS = 200;
const dedupeMap = new Map<string, number>();
const pendingQueue: DiagnosticPayload[] = [];
let isFlushingQueue = false;
let retryTimer: number | null = null;

function truncate(value: string): string {
  if (value.length <= MAX_FIELD_CHARS) return value;
  return `${value.slice(0, MAX_FIELD_CHARS)}...[truncated]`;
}

function normalizeLevel(level: string): DiagnosticLevel {
  if (level === 'error') return 'error';
  if (level === 'warn') return 'warn';
  return 'info';
}

function shouldSkip(payload: DiagnosticPayload): boolean {
  const key = `${payload.level}|${payload.source}|${payload.message}|${payload.details ?? ''}`;
  const now = Date.now();
  const previous = dedupeMap.get(key);
  if (previous && now - previous < DEDUPE_WINDOW_MS) {
    return true;
  }
  dedupeMap.set(key, now);

  if (dedupeMap.size > 200) {
    for (const [entryKey, ts] of dedupeMap.entries()) {
      if (now - ts > 30_000) {
        dedupeMap.delete(entryKey);
      }
    }
  }

  return false;
}

function safeStringify(value: unknown): string {
  if (value == null) return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Error) {
    const stack = value.stack ? `\n${value.stack}` : '';
    return `${value.name}: ${value.message}${stack}`;
  }

  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key, nested) => {
        if (typeof nested === 'object' && nested !== null) {
          if (seen.has(nested)) {
            return '[Circular]';
          }
          seen.add(nested);
        }
        if (typeof nested === 'bigint') {
          return nested.toString();
        }
        if (nested instanceof Error) {
          return {
            name: nested.name,
            message: nested.message,
            stack: nested.stack,
          };
        }
        return nested;
      },
      2,
    );
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable value]';
    }
  }
}

function summarizeConsoleArgs(args: unknown[]): Pick<DiagnosticPayload, 'message' | 'details' | 'contextJson'> {
  if (args.length === 0) {
    return { message: '(empty console payload)' };
  }

  const rendered = args.map((arg) => safeStringify(arg));
  const first = args[0];
  const message =
    typeof first === 'string'
      ? first
      : first instanceof Error
        ? `${first.name}: ${first.message}`
        : rendered[0];

  const details = rendered.join(' | ');
  const contextJson = JSON.stringify({
    argCount: args.length,
    arguments: rendered,
  });

  return {
    message,
    details,
    contextJson,
  };
}

export async function reportTerminalDiagnostic(
  level: DiagnosticLevel,
  source: string,
  message: string,
  details?: string,
  contextJson?: string,
): Promise<void> {
  const payload: DiagnosticPayload = {
    level: normalizeLevel(level),
    source: source || 'frontend',
    message: truncate(message || '(empty message)'),
    details: details ? truncate(details) : undefined,
    contextJson: contextJson ? truncate(contextJson) : undefined,
  };

  if (shouldSkip(payload)) {
    return;
  }

  try {
    await sendToTerminal(payload);
    void flushPendingQueue();
  } catch {
    enqueuePending(payload);
    scheduleQueueRetry();
  }
}

async function sendToTerminal(payload: DiagnosticPayload): Promise<void> {
  await invoke('agent_log_client_diagnostic', {
    level: payload.level,
    source: payload.source,
    message: payload.message,
    details: payload.details ?? null,
    contextJson: payload.contextJson ?? null,
    timestampMs: Date.now(),
  });
}

function enqueuePending(payload: DiagnosticPayload): void {
  if (pendingQueue.length >= MAX_PENDING_LOGS) {
    pendingQueue.shift();
  }
  pendingQueue.push(payload);
}

function scheduleQueueRetry(): void {
  if (typeof window === 'undefined') return;
  if (retryTimer != null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flushPendingQueue();
  }, 1200);
}

async function flushPendingQueue(): Promise<void> {
  if (isFlushingQueue) return;
  if (pendingQueue.length === 0) return;
  isFlushingQueue = true;

  try {
    while (pendingQueue.length > 0) {
      const next = pendingQueue[0];
      if (!next) break;
      try {
        await sendToTerminal(next);
        pendingQueue.shift();
      } catch {
        scheduleQueueRetry();
        break;
      }
    }
  } finally {
    isFlushingQueue = false;
  }
}

function installGlobalConsoleProxy(): void {
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    const info = summarizeConsoleArgs(args);
    void reportTerminalDiagnostic('warn', 'console.warn', info.message, info.details, info.contextJson);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    const info = summarizeConsoleArgs(args);
    void reportTerminalDiagnostic('error', 'console.error', info.message, info.details, info.contextJson);
  };
}

function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    const error = event.error;
    const message = event.message || (error instanceof Error ? error.message : 'Unhandled window error');
    const details = error instanceof Error ? safeStringify(error) : undefined;
    const contextJson = JSON.stringify({
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
    void reportTerminalDiagnostic('error', 'window.error', message, details, contextJson);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? `Unhandled rejection: ${reason.message}`
        : `Unhandled rejection: ${safeStringify(reason)}`;
    const details = safeStringify(reason);
    void reportTerminalDiagnostic('error', 'window.unhandledrejection', message, details);
  });
}

export function installGlobalTerminalDiagnostics(): void {
  if (typeof window === 'undefined') return;
  const win = window as WindowWithDiagnostics;
  if (win.__coworkTerminalDiagnosticsInstalled__) return;

  win.__coworkTerminalDiagnosticsInstalled__ = true;
  installGlobalConsoleProxy();
  installGlobalErrorHandlers();

  void reportTerminalDiagnostic(
    'info',
    'bootstrap',
    'Global terminal diagnostics initialized',
    undefined,
    JSON.stringify({ userAgent: navigator.userAgent }),
  );
}
