type CallbackFn = (data: unknown) => unknown;

interface TauriInternalsLike {
  runCallback?: (id: number, data: unknown) => void;
  callbacks?: Map<number, CallbackFn> | Record<number, CallbackFn>;
}

interface TauriCallbackGuardState {
  installed: boolean;
  suppressUntilMs: number;
}

type WindowWithTauriGuard = Window & {
  __TAURI_INTERNALS__?: TauriInternalsLike;
  __coworkTauriCallbackGuard__?: TauriCallbackGuardState;
};

const TAURI_MISSING_CALLBACK_PREFIX = "[TAURI] Couldn't find callback id";
const HMR_SUPPRESSION_WINDOW_MS = 15_000;
const PAGE_TEARDOWN_SUPPRESSION_WINDOW_MS = 60_000;

export function isBenignTauriMissingCallbackWarning(message: string): boolean {
  const normalized = message.trim();
  return (
    normalized.includes(TAURI_MISSING_CALLBACK_PREFIX) &&
    normalized.includes('asynchronous operation')
  );
}

function ensureGuardState(win: WindowWithTauriGuard): TauriCallbackGuardState {
  if (!win.__coworkTauriCallbackGuard__) {
    win.__coworkTauriCallbackGuard__ = {
      installed: false,
      suppressUntilMs: 0,
    };
  }

  return win.__coworkTauriCallbackGuard__;
}

function hasCallback(
  callbacks: Map<number, CallbackFn> | Record<number, CallbackFn> | undefined,
  id: number,
): boolean {
  if (!callbacks) return false;
  if (callbacks instanceof Map) return callbacks.has(id);
  return Object.prototype.hasOwnProperty.call(callbacks, id);
}

export function installTauriCallbackGuard(): void {
  if (typeof window === 'undefined') return;
  try {
    const win = window as WindowWithTauriGuard;
    const guard = ensureGuardState(win);

    if (guard.installed) return;
    guard.installed = true;

    const markSuppressed = (durationMs: number) => {
      guard.suppressUntilMs = Math.max(guard.suppressUntilMs, Date.now() + durationMs);
    };

    // Keep suppression metadata fresh across reload/teardown transitions.
    window.addEventListener(
      'beforeunload',
      () => markSuppressed(PAGE_TEARDOWN_SUPPRESSION_WINDOW_MS),
      { capture: true },
    );
    window.addEventListener(
      'pagehide',
      () => markSuppressed(PAGE_TEARDOWN_SUPPRESSION_WINDOW_MS),
      { capture: true },
    );

    if (import.meta.hot) {
      import.meta.hot.on('vite:beforeUpdate', () => {
        markSuppressed(HMR_SUPPRESSION_WINDOW_MS);
      });
      import.meta.hot.dispose(() => {
        markSuppressed(HMR_SUPPRESSION_WINDOW_MS);
      });
    }

    const internals = win.__TAURI_INTERNALS__;
    if (!internals || typeof internals.runCallback !== 'function') return;

    const descriptor = Object.getOwnPropertyDescriptor(internals, 'runCallback');
    const canPatch =
      !descriptor ||
      Boolean(descriptor.writable) ||
      typeof descriptor.set === 'function' ||
      Boolean(descriptor.configurable);
    if (!canPatch) {
      return;
    }

    const originalRunCallback = internals.runCallback.bind(internals);
    internals.runCallback = (id: number, data: unknown) => {
      const callbackExists = hasCallback(internals.callbacks, id);
      const isSuppressed = Date.now() <= guard.suppressUntilMs;

      // During HMR/page teardown, stale callback IDs are expected and safe to ignore.
      if (!callbackExists && isSuppressed) {
        return;
      }

      originalRunCallback(id, data);
    };
  } catch {
    // Never allow diagnostics guards to break app startup.
  }
}
