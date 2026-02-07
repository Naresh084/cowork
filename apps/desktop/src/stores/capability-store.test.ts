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
      provider: 'openai',
      mediaRouting: { imageBackend: 'openai' },
      toolAccess: [{ toolName: 'web_search', enabled: true }],
    });

    expect(snapshot.provider).toBe('openai');
    expect(snapshot.mediaRouting.imageBackend).toBe('openai');
    expect(snapshot.mediaRouting.videoBackend).toBe('google');
    expect(snapshot.toolAccess[0].toolName).toBe('web_search');
    expect(snapshot.toolAccess[0].policyAction).toBe('ask');
  });

  it('loads capability snapshot via tauri command', async () => {
    setMockInvokeResponse('agent_get_capability_snapshot', {
      provider: 'google',
      mediaRouting: { imageBackend: 'google', videoBackend: 'google' },
      keyStatus: {
        providerKeyConfigured: true,
        googleKeyConfigured: true,
        openaiKeyConfigured: false,
        falKeyConfigured: false,
        exaKeyConfigured: false,
        tavilyKeyConfigured: false,
        stitchKeyConfigured: false,
      },
      toolAccess: [
        {
          toolName: 'web_search',
          enabled: true,
          reason: 'Ready',
          policyAction: 'allow',
        },
      ],
      integrationAccess: [],
      policyProfile: 'coding',
      notes: [],
    });

    await useCapabilityStore.getState().refreshSnapshot();

    const state = useCapabilityStore.getState();
    expect(state.snapshot).not.toBeNull();
    expect(state.snapshot?.toolAccess[0]?.policyAction).toBe('allow');
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
