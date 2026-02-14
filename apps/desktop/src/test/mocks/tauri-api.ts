// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { vi } from 'vitest';

// Re-export from submodule mocks
export * from './tauri-core';
export * from './tauri-path';

// Mock event API
const eventListeners: Record<string, Array<(event: unknown) => void>> = {};

export const listen = vi.fn(async (event: string, handler: (event: unknown) => void) => {
  if (!eventListeners[event]) {
    eventListeners[event] = [];
  }
  eventListeners[event].push(handler);

  return () => {
    const idx = eventListeners[event].indexOf(handler);
    if (idx > -1) {
      eventListeners[event].splice(idx, 1);
    }
  };
});

export const emit = vi.fn((event: string, payload?: unknown) => {
  if (eventListeners[event]) {
    eventListeners[event].forEach((handler) =>
      handler({ payload })
    );
  }
});

// Helper to trigger mock events
export const triggerMockEvent = (event: string, payload: unknown) => {
  emit(event, payload);
};

export default {
  listen,
  emit,
};
