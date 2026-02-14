// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

export type RemoteTunnelMode = 'tailscale' | 'cloudflare' | 'custom';

export interface PairingPayload {
  version: 1;
  endpoint: string;
  wsEndpoint: string;
  pairingCode: string;
  issuedAt: number;
  expiresAt: number;
}

export interface PairResponse {
  token: string;
  expiresAt: number;
  endpoint: string;
  wsEndpoint: string;
  device: {
    id: string;
    name: string;
    platform: string;
    createdAt: number;
    lastUsedAt: number;
    expiresAt: number;
    revokedAt?: number;
  };
}

export interface SessionSummary {
  id: string;
  type?: string;
  provider?: string;
  executionMode?: 'execute' | 'plan';
  title: string | null;
  firstMessage: string | null;
  workingDirectory: string | null;
  model: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

export interface SessionDetails {
  id: string;
  type?: string;
  provider?: string;
  executionMode?: 'execute' | 'plan';
  title?: string | null;
  workingDirectory?: string | null;
  model?: string | null;
  messages: Array<Record<string, unknown>>;
  chatItems?: ChatItem[];
  tasks?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  contextUsage?: {
    usedTokens: number;
    maxTokens: number;
    percentUsed: number;
  };
}

export type ChatItemKind =
  | 'user_message'
  | 'assistant_message'
  | 'system_message'
  | 'thinking'
  | 'tool_start'
  | 'tool_result'
  | 'permission'
  | 'question'
  | 'media'
  | 'report'
  | 'design'
  | 'error';

export interface ChatItemBase {
  id: string;
  kind: ChatItemKind;
  timestamp: number;
  turnId?: string;
}

export type ChatItem = ChatItemBase & Record<string, unknown>;

export interface AttachmentPayload {
  type: 'file' | 'image' | 'text' | 'audio' | 'video' | 'pdf';
  name: string;
  mimeType?: string;
  data: string;
}

export interface CronJob {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  nextRunAt?: number | null;
  runCount: number;
  prompt: string;
}

export interface WorkflowScheduledTaskSummary {
  workflowId: string;
  name: string;
  enabled: boolean;
  runCount: number;
  nextRunAt?: number | null;
  schedules: Array<Record<string, unknown>>;
}

export interface RemoteStatus {
  enabled: boolean;
  running: boolean;
  bindHost: string;
  bindPort: number | null;
  localBaseUrl: string | null;
  publicBaseUrl: string | null;
  tunnelMode: RemoteTunnelMode;
  tunnelHints: string[];
  deviceCount: number;
}

export interface RemoteEventEnvelope {
  type: 'event' | 'ready' | 'error' | 'ack' | 'pong' | 'subscribed';
  timestamp?: number;
  event?: SidecarEvent;
  error?: string;
  [key: string]: unknown;
}

export interface SidecarEvent {
  type: string;
  sessionId: string | null;
  data: unknown;
}
