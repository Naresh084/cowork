// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { vi } from 'vitest';

// Use global to share mock responses across module instances
declare global {
  var __mockInvokeResponses: Record<string, unknown>;
}

const DEFAULT_MOCK_RESPONSES: Record<string, unknown> = {
  agent_get_initialization_status: { initialized: true, sessionCount: 0 },
  agent_set_skills: { success: true },
  agent_set_execution_mode: { success: true },
  agent_list_sessions: [],
  agent_get_context_usage: { used: 0, total: 1 },
};

// Initialize global mock responses
if (!globalThis.__mockInvokeResponses) {
  globalThis.__mockInvokeResponses = { ...DEFAULT_MOCK_RESPONSES };
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
  globalThis.__mockInvokeResponses = { ...DEFAULT_MOCK_RESPONSES };
};

export default { invoke };
