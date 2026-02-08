export type RemoteTunnelMode = 'tailscale' | 'cloudflare' | 'custom';
export type RemoteTunnelState = 'stopped' | 'starting' | 'running' | 'error';
export type RemoteTunnelAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';

export interface RemoteAccessDevice {
  id: string;
  name: string;
  platform: string;
  tokenHash: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt?: number;
}

export interface RemoteAccessConfig {
  enabled: boolean;
  bindHost: string;
  bindPort: number;
  publicBaseUrl: string | null;
  tunnelMode: RemoteTunnelMode;
  devices: RemoteAccessDevice[];
  createdAt: number;
  updatedAt: number;
}

export interface RemoteAccessStatus {
  enabled: boolean;
  running: boolean;
  bindHost: string;
  bindPort: number | null;
  localBaseUrl: string | null;
  publicBaseUrl: string | null;
  tunnelMode: RemoteTunnelMode;
  tunnelHints: string[];
  tunnelState: RemoteTunnelState;
  tunnelPublicUrl: string | null;
  tunnelLastError: string | null;
  tunnelBinaryInstalled: boolean;
  tunnelBinaryPath: string | null;
  tunnelAuthStatus: RemoteTunnelAuthStatus;
  tunnelStartedAt: number | null;
  tunnelPid: number | null;
  deviceCount: number;
  devices: RemoteAccessDeviceSummary[];
}

export interface RemoteAccessDeviceSummary {
  id: string;
  name: string;
  platform: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt?: number;
}

export interface RemoteEnableInput {
  publicBaseUrl?: string | null;
  tunnelMode?: RemoteTunnelMode;
  bindPort?: number;
}

export interface PairingPayload {
  version: 1;
  endpoint: string;
  wsEndpoint: string;
  pairingCode: string;
  issuedAt: number;
  expiresAt: number;
}

export interface PairingQrResult {
  qrDataUrl: string;
  pairingUri: string;
  expiresAt: number;
}
