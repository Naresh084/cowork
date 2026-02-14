// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { RemoteTunnelMode } from '@/stores/remote-access-store';

export interface TunnelProviderMeta {
  id: RemoteTunnelMode;
  label: string;
  subtitle: string;
  installLabel: string;
  authLabel: string;
}

export const tunnelProviderModes: TunnelProviderMeta[] = [
  {
    id: 'tailscale',
    label: 'Tailscale',
    subtitle: 'Private mesh networking with optional public funnel.',
    installLabel: 'tailscale',
    authLabel: 'Tailscale login',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Tunnel',
    subtitle: 'Managed HTTPS tunnel with quick URL or your own domain.',
    installLabel: 'cloudflared',
    authLabel: 'Cloudflare tunnel login',
  },
  {
    id: 'custom',
    label: 'Custom endpoint',
    subtitle: 'Use your own tunnel/reverse proxy URL.',
    installLabel: 'none',
    authLabel: 'not required',
  },
];

export function getTunnelProviderMeta(mode: RemoteTunnelMode): TunnelProviderMeta {
  return tunnelProviderModes.find((item) => item.id === mode) ?? tunnelProviderModes[0];
}

export function normalizeDomainInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const withScheme =
      trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    return parsed.hostname.replace(/\.$/, '').toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.replace(/\.$/, '')
      .toLowerCase();
  }
}

export function formatTimestamp(value: number | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function formatCountdown(epochMs: number): string {
  const diff = Math.max(0, epochMs - Date.now());
  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
