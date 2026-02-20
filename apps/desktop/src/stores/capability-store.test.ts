// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapabilityStore, normalizeCapabilitySnapshot } from './capability-store';
import { clearMockInvokeResponses, setMockInvokeResponse } from '../test/mocks/tauri-core';

describe('capability-store', () => {
  beforeEach(() => {
    useCapabilityStore.setState({
      snapshot: null,
      isLoading: false,
      error: null,
      lastUpdatedAt: null,
    });
    clearMockInvokeResponses();
    vi.clearAllMocks();
  });

  it('normalizes partial payloads safely', () => {
    const snapshot = normalizeCapabilitySnapshot({
      provider: 'legacy_provider',
      mediaRouting: { imageBackend: 'legacy_backend' },
      toolAccess: [{ toolName: 'web_search', enabled: true }],
    });

    expect(snapshot.provider).toBe('google');
    expect(snapshot.mediaRouting.imageBackend).toBe('google');
    expect(snapshot.mediaRouting.videoBackend).toBe('google');
    expect(snapshot.toolAccess[0].toolName).toBe('web_search');
    expect(snapshot.approvalMode).toBe('ask');
  });

  it('loads capability snapshot via tauri command', async () => {
    setMockInvokeResponse('agent_get_capability_snapshot', {
      provider: 'google',
      mediaRouting: { imageBackend: 'google', videoBackend: 'google' },
      keyStatus: {
        providerKeyConfigured: true,
        googleKeyConfigured: true,
        falKeyConfigured: false,
        stitchKeyConfigured: false,
      },
      toolAccess: [
        {
          toolName: 'web_search',
          enabled: true,
          reason: 'Ready',
        },
      ],
      integrationAccess: [],
      approvalMode: 'full',
      notes: [],
    });

    await useCapabilityStore.getState().refreshSnapshot();

    const state = useCapabilityStore.getState();
    expect(state.snapshot).not.toBeNull();
    expect(state.snapshot?.approvalMode).toBe('full');
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('stores an error when snapshot fetch fails', async () => {
    setMockInvokeResponse('agent_get_capability_snapshot', () => {
      throw new Error('capability snapshot unavailable');
    });

    await useCapabilityStore.getState().refreshSnapshot();

    const state = useCapabilityStore.getState();
    expect(state.snapshot).toBeNull();
    expect(state.error).toBe('capability snapshot unavailable');
    expect(state.isLoading).toBe(false);
  });
});
