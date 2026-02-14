// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

export type RemoteTunnelMode = 'tailscale' | 'cloudflare' | 'custom';
export type RemoteTunnelState = 'stopped' | 'starting' | 'running' | 'error';
export type RemoteTunnelAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';
export type RemoteTunnelVisibility = 'public' | 'private';
export type RemoteConfigHealth = 'valid' | 'repair_required';
export type RemoteDiagnosticLevel = 'info' | 'warn' | 'error';

export interface RemoteDiagnosticEntry {
  id: string;
  level: RemoteDiagnosticLevel;
  message: string;
  step: string;
  at: number;
  commandHint?: string;
}

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
  tunnelName: string | null;
  tunnelDomain: string | null;
  tunnelVisibility: RemoteTunnelVisibility;
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
  tunnelName: string | null;
  tunnelDomain: string | null;
  tunnelVisibility: RemoteTunnelVisibility;
  tunnelHints: string[];
  tunnelState: RemoteTunnelState;
  tunnelPublicUrl: string | null;
  tunnelLastError: string | null;
  tunnelBinaryInstalled: boolean;
  tunnelBinaryPath: string | null;
  tunnelAuthStatus: RemoteTunnelAuthStatus;
  tunnelStartedAt: number | null;
  tunnelPid: number | null;
  configHealth: RemoteConfigHealth;
  configRepairReason: string | null;
  lastOperation: string | null;
  lastOperationAt: number | null;
  diagnostics: RemoteDiagnosticEntry[];
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
  tunnelName?: string | null;
  tunnelDomain?: string | null;
  tunnelVisibility?: RemoteTunnelVisibility;
  bindPort?: number;
}

export interface RemoteTunnelOptionsInput {
  tunnelName?: string | null;
  tunnelDomain?: string | null;
  tunnelVisibility?: RemoteTunnelVisibility;
  publicBaseUrl?: string | null;
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
