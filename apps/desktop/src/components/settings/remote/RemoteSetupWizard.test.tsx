import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMockInvokeResponses, setMockInvokeResponse } from '@/test/mocks/tauri-core';
import { useRemoteAccessStore, type RemoteAccessStatus } from '@/stores/remote-access-store';
import { RemoteSetupWizard } from './RemoteSetupWizard';

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

function resetRemoteStore(status: RemoteAccessStatus) {
  useRemoteAccessStore.getState().stopAdaptivePolling();
  useRemoteAccessStore.setState({
    status,
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
    draftProvider: status.tunnelMode,
    draftOptions: {
      publicBaseUrl: status.publicBaseUrl || '',
      tunnelName: status.tunnelName || '',
      tunnelDomain: status.tunnelDomain || '',
      tunnelVisibility: status.tunnelVisibility,
    },
    draftDirty: false,
    hasHydratedDraft: true,
    pollingTimer: null,
    pollingLastAt: Date.now(),
    pollingInFlight: false,
  });
}

describe('RemoteSetupWizard', () => {
  beforeEach(() => {
    clearMockInvokeResponses();
  });

  it('supports strict next/back progression with slide step content', async () => {
    resetRemoteStore(makeStatus({ tunnelMode: 'tailscale' }));
    useRemoteAccessStore.setState({ draftProvider: 'cloudflare', draftDirty: true });

    setMockInvokeResponse('remote_access_set_tunnel_mode', makeStatus({ tunnelMode: 'cloudflare' }));

    const onComplete = vi.fn();
    render(<RemoteSetupWizard isHydrating={false} onComplete={onComplete} />);

    expect(screen.getByText('Choose tunnel provider')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save provider/i }));

    await waitFor(() => {
      expect(screen.getByText('Configure tunnel options')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    await waitFor(() => {
      expect(screen.getByText('Choose tunnel provider')).toBeInTheDocument();
    });
  });

  it('blocks step 2 progression when custom endpoint is missing', async () => {
    resetRemoteStore(
      makeStatus({
        tunnelMode: 'custom',
        tunnelState: 'stopped',
        tunnelPublicUrl: null,
        publicBaseUrl: null,
        tunnelDomain: null,
      }),
    );

    useRemoteAccessStore.setState({
      draftProvider: 'custom',
      draftOptions: {
        publicBaseUrl: '',
        tunnelName: 'Cowork',
        tunnelDomain: '',
        tunnelVisibility: 'public',
      },
      draftDirty: true,
    });

    render(<RemoteSetupWizard isHydrating={false} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

    await waitFor(() => {
      expect(screen.getByText('Configure tunnel options')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Apply configuration/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Custom mode needs endpoint URL or domain before continuing.').length).toBeGreaterThan(0);
    });
  });
});
