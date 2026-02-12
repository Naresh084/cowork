import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { clearMockInvokeResponses, setMockInvokeResponse } from '@/test/mocks/tauri-core';
import {
  useRemoteAccessStore,
  type RemoteAccessStatus,
  type RemoteTunnelMode,
} from './remote-access-store';

function makeStatus(overrides: Partial<RemoteAccessStatus> = {}): RemoteAccessStatus {
  return {
    enabled: true,
    running: true,
    bindHost: '127.0.0.1',
    bindPort: 58995,
    localBaseUrl: 'http://127.0.0.1:58995',
    publicBaseUrl: 'https://cowork.example.test',
    tunnelMode: 'tailscale',
    tunnelName: 'Cowork',
    tunnelDomain: 'cowork.example.test',
    tunnelVisibility: 'public',
    tunnelHints: [],
    tunnelState: 'running',
    tunnelPublicUrl: 'https://cowork.example.test',
    tunnelLastError: null,
    tunnelBinaryInstalled: true,
    tunnelBinaryPath: '/opt/homebrew/bin/tailscale',
    tunnelAuthStatus: 'authenticated',
    tunnelStartedAt: Date.now(),
    tunnelPid: 2222,
    configHealth: 'valid',
    configRepairReason: null,
    lastOperation: 'refresh',
    lastOperationAt: Date.now(),
    diagnostics: [],
    deviceCount: 0,
    devices: [],
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function resetStore() {
  useRemoteAccessStore.getState().stopAdaptivePolling();
  useRemoteAccessStore.setState({
    status: null,
    pairingQr: null,
    isLoading: false,
    isRefreshing: false,
    isGeneratingQr: false,
    isInstallingTunnel: false,
    isAuthenticatingTunnel: false,
    isSavingProvider: false,
    isSavingOptions: false,
    isStartingTunnel: false,
    isStoppingTunnel: false,
    isDeletingRemote: false,
    error: null,
    draftProvider: null,
    draftOptions: {
      publicBaseUrl: '',
      tunnelName: '',
      tunnelDomain: '',
      tunnelVisibility: 'public',
    },
    draftDirty: false,
    hasHydratedDraft: false,
    pollingTimer: null,
    pollingLastAt: 0,
    pollingInFlight: false,
  });
}

describe('remote-access-store', () => {
  beforeEach(() => {
    vi.useRealTimers();
    clearMockInvokeResponses();
    resetStore();
  });

  afterEach(() => {
    useRemoteAccessStore.getState().stopAdaptivePolling();
    vi.useRealTimers();
  });

  it('does not overwrite dirty drafts on status refresh', async () => {
    setMockInvokeResponse('remote_access_get_status', makeStatus({ tunnelMode: 'tailscale' }));
    setMockInvokeResponse('remote_access_refresh_tunnel', makeStatus({ tunnelMode: 'cloudflare' }));

    await useRemoteAccessStore.getState().loadStatus();
    useRemoteAccessStore.getState().setDraftProvider('custom');
    useRemoteAccessStore.getState().setDraftOptions({ tunnelName: 'Local draft' });

    await useRemoteAccessStore.getState().refreshTunnel(true);

    const state = useRemoteAccessStore.getState();
    expect(state.draftProvider).toBe('custom');
    expect(state.draftOptions.tunnelName).toBe('Local draft');
    expect(state.draftDirty).toBe(true);
  });

  it('maps provider apply flow to isSavingProvider and persists selected mode', async () => {
    setMockInvokeResponse('remote_access_set_tunnel_mode', makeStatus({ tunnelMode: 'cloudflare' }));

    useRemoteAccessStore.setState({
      status: makeStatus({ tunnelMode: 'tailscale' }),
      draftProvider: 'cloudflare',
      hasHydratedDraft: true,
      draftDirty: true,
    });

    const pending = useRemoteAccessStore.getState().applyDraftProvider();
    expect(useRemoteAccessStore.getState().isSavingProvider).toBe(true);

    await pending;

    const state = useRemoteAccessStore.getState();
    expect(state.isSavingProvider).toBe(false);
    expect(state.status?.tunnelMode).toBe('cloudflare');
    expect(state.draftProvider).toBe('cloudflare');
    expect(state.draftDirty).toBe(false);
  });

  it('tracks start and stop tunnel loading flags independently', async () => {
    const startDeferred = createDeferred<RemoteAccessStatus>();
    const stopDeferred = createDeferred<RemoteAccessStatus>();

    setMockInvokeResponse('remote_access_start_tunnel', () => startDeferred.promise);
    setMockInvokeResponse('remote_access_stop_tunnel', () => stopDeferred.promise);

    const startPending = useRemoteAccessStore.getState().startTunnel();
    expect(useRemoteAccessStore.getState().isStartingTunnel).toBe(true);
    expect(useRemoteAccessStore.getState().isStoppingTunnel).toBe(false);

    startDeferred.resolve(makeStatus({ tunnelState: 'running' }));
    await startPending;

    const stopPending = useRemoteAccessStore.getState().stopTunnel();
    expect(useRemoteAccessStore.getState().isStoppingTunnel).toBe(true);
    expect(useRemoteAccessStore.getState().isStartingTunnel).toBe(false);

    stopDeferred.resolve(makeStatus({ tunnelState: 'stopped', tunnelPublicUrl: null, publicBaseUrl: null }));
    await stopPending;

    expect(useRemoteAccessStore.getState().isStoppingTunnel).toBe(false);
  });

  it('uses adaptive polling cadence for idle and active operations', async () => {
    vi.useFakeTimers();
    (invoke as unknown as { mockClear: () => void }).mockClear();
    setMockInvokeResponse('remote_access_get_status', makeStatus());
    setMockInvokeResponse('remote_access_refresh_tunnel', makeStatus());

    await useRemoteAccessStore.getState().loadStatus();
    useRemoteAccessStore.getState().beginAdaptivePolling();

    const refreshCallCount = () =>
      (invoke as unknown as { mock: { calls: Array<[string, unknown?]> } }).mock.calls.filter(
        ([cmd]) => cmd === 'remote_access_refresh_tunnel',
      ).length;

    const baselineCalls = refreshCallCount();

    await vi.advanceTimersByTimeAsync(8000);
    expect(refreshCallCount()).toBe(baselineCalls);

    await vi.advanceTimersByTimeAsync(1000);
    expect(refreshCallCount()).toBeGreaterThanOrEqual(baselineCalls + 1);

    useRemoteAccessStore.setState({ isStartingTunnel: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(refreshCallCount()).toBeGreaterThanOrEqual(2);
  });

  it('rehydrates deterministically after load while preserving dirty draft on repeated loads', async () => {
    setMockInvokeResponse('remote_access_get_status', makeStatus({ tunnelMode: 'tailscale' }));

    await useRemoteAccessStore.getState().loadStatus();
    expect(useRemoteAccessStore.getState().draftProvider).toBe('tailscale');
    expect(useRemoteAccessStore.getState().hasHydratedDraft).toBe(true);

    useRemoteAccessStore.getState().setDraftProvider('cloudflare' as RemoteTunnelMode);
    useRemoteAccessStore.getState().setDraftOptions({ tunnelName: 'Edited' });

    await useRemoteAccessStore.getState().loadStatus();
    expect(useRemoteAccessStore.getState().draftProvider).toBe('cloudflare');
    expect(useRemoteAccessStore.getState().draftOptions.tunnelName).toBe('Edited');

    useRemoteAccessStore.getState().discardDraftChanges();
    expect(useRemoteAccessStore.getState().draftProvider).toBe('tailscale');
    expect(useRemoteAccessStore.getState().draftDirty).toBe(false);
  });
});
