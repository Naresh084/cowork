import { vi } from 'vitest';

// Use global to share mock responses across module instances
declare global {
  var __mockInvokeResponses: Record<string, unknown>;
}

// Initialize global mock responses
if (!globalThis.__mockInvokeResponses) {
  globalThis.__mockInvokeResponses = {};
}

export const invoke = vi.fn(async (cmd: string, args?: unknown) => {
  const responses = globalThis.__mockInvokeResponses;
  if (cmd in responses) {
    const response = responses[cmd];
    if (typeof response === 'function') {
      return response(args);
    }
    return response;
  }
  throw new Error(`No mock response for command: ${cmd}`);
});

// Helper to set mock responses
export const setMockInvokeResponse = (cmd: string, response: unknown) => {
  globalThis.__mockInvokeResponses[cmd] = response;
};

// Helper to clear all mock responses
export const clearMockInvokeResponses = () => {
  globalThis.__mockInvokeResponses = {};
};

export default { invoke };
