import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearMockInvokeResponses, setMockInvokeResponse } from '@/test/mocks/tauri-core';
import type { RemoteAccessStatus } from '@/stores/remote-access-store';
import { useRemoteAccessStore } from '@/stores/remote-access-store';
import { RemoteAccessSettings } from './RemoteAccessSettings';

function makeStatus(overrides: Partial<RemoteAccessStatus> = {}): RemoteAccessStatus {
  return {
    enabled: true,
    running: true,
    bindHost: '127.0.0.1',
    bindPort: 58995,
    localBaseUrl: 'http://127.0.0.1:58995',
    publicBaseUrl: 'https://cowork.example.test',
    tunnelMode: 'cloudflare',
    tunnelName: 'Cowork',
    tunnelDomain: 'cowork.example.test',
    tunnelVisibility: 'public',
    tunnelHints: [],
    tunnelState: 'running',
    tunnelPublicUrl: 'https://cowork.example.test',
    tunnelLastError: null,
    tunnelBinaryInstalled: true,
    tunnelBinaryPath: '/opt/homebrew/bin/cloudflared',
    tunnelAuthStatus: 'authenticated',
    tunnelStartedAt: Date.now(),
    tunnelPid: 111,
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

beforeEach(() => {
  clearMockInvokeResponses();
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
    draftOptions: { publicBaseUrl: '', tunnelName: '', tunnelDomain: '', tunnelVisibility: 'public' },
    draftDirty: false,
    hasHydratedDraft: false,
    pollingTimer: null,
    pollingLastAt: 0,
    pollingInFlight: false,
  });
});

describe('RemoteAccessSettings', () => {
  it('shows summary card when remote runtime is already complete', async () => {
    setMockInvokeResponse('remote_access_get_status', makeStatus({ tunnelState: 'running' }));
    setMockInvokeResponse('remote_access_refresh_tunnel', makeStatus({ tunnelState: 'running' }));

    render(<RemoteAccessSettings />);

    await waitFor(() => {
      expect(screen.getByText('Remote active summary')).toBeInTheDocument();
    });
  });

  it('shows guided setup wizard when tunnel is not running', async () => {
    setMockInvokeResponse(
      'remote_access_get_status',
      makeStatus({
        tunnelState: 'stopped',
        tunnelPublicUrl: null,
        publicBaseUrl: null,
      }),
    );
    setMockInvokeResponse('remote_access_refresh_tunnel', makeStatus({ tunnelState: 'stopped' }));

    render(<RemoteAccessSettings />);

    await waitFor(() => {
      expect(screen.getByText('Guided Remote Setup')).toBeInTheDocument();
      expect(screen.getByText('Choose tunnel provider')).toBeInTheDocument();
    });
  });
});
