// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { PlatformType } from '@cowork/shared';

export type ExternalCliProvider = 'codex' | 'claude';

export type ExternalCliRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_user'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type ExternalCliInteractionType = 'permission' | 'question';

export type ExternalCliAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';

export interface ExternalCliProviderRuntimeSettings {
  enabled: boolean;
  allowBypassPermissions: boolean;
}

export interface ExternalCliRuntimeConfig {
  codex: ExternalCliProviderRuntimeSettings;
  claude: ExternalCliProviderRuntimeSettings;
}

export const DEFAULT_EXTERNAL_CLI_RUNTIME_CONFIG: ExternalCliRuntimeConfig = {
  codex: {
    enabled: false,
    allowBypassPermissions: false,
  },
  claude: {
    enabled: false,
    allowBypassPermissions: false,
  },
};

export interface ExternalCliAvailabilityEntry {
  provider: ExternalCliProvider;
  installed: boolean;
  binaryPath: string | null;
  binarySha256: string | null;
  binaryTrust: 'trusted' | 'untrusted' | 'unknown';
  trustReason: string | null;
  version: string | null;
  authStatus: ExternalCliAuthStatus;
  authMessage: string | null;
  checkedAt: number;
}

export interface ExternalCliAvailabilitySnapshot {
  codex: ExternalCliAvailabilityEntry;
  claude: ExternalCliAvailabilityEntry;
  checkedAt: number;
  ttlMs: number;
}

export interface ExternalCliProgressEntry {
  timestamp: number;
  kind: 'status' | 'assistant' | 'event' | 'error';
  message: string;
}

export interface ExternalCliDiagnostics {
  stdout: string;
  stderr: string;
  notes: string[];
  exitCode?: number | null;
  exitSignal?: string | null;
  truncated?: boolean;
}

export interface ExternalCliRunOrigin {
  source: 'desktop' | 'integration';
  platform?: PlatformType;
  chatId?: string;
  senderName?: string;
}

export interface ExternalCliPendingInteraction {
  interactionId: string;
  runId: string;
  sessionId: string;
  provider: ExternalCliProvider;
  type: ExternalCliInteractionType;
  prompt: string;
  options?: string[];
  requestedAt: number;
  origin: ExternalCliRunOrigin;
  metadata?: Record<string, unknown>;
}

export interface ExternalCliRunRecord {
  runId: string;
  sessionId: string;
  provider: ExternalCliProvider;
  prompt: string;
  launchCommand?: string;
  workingDirectory: string;
  resolvedWorkingDirectory?: string;
  createIfMissing?: boolean;
  requestedBypassPermission?: boolean;
  effectiveBypassPermission?: boolean;
  bypassPermission: boolean;
  status: ExternalCliRunStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  origin: ExternalCliRunOrigin;
  progress: ExternalCliProgressEntry[];
  pendingInteraction?: ExternalCliPendingInteraction;
  errorCode?: string;
  errorMessage?: string;
  resultSummary?: string;
  diagnostics?: ExternalCliDiagnostics;
}

export interface ExternalCliRunSummary {
  runId: string;
  sessionId: string;
  provider: ExternalCliProvider;
  status: ExternalCliRunStatus;
  launchCommand?: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  latestProgress: string | null;
  progressCount: number;
  pendingInteraction?: {
    interactionId: string;
    type: ExternalCliInteractionType;
    prompt: string;
    options?: string[];
    requestedAt: number;
  };
  errorCode?: string;
  errorMessage?: string;
  resultSummary?: string;
  diagnostics?: ExternalCliDiagnostics;
}

export interface ExternalCliStartRunInput {
  sessionId: string;
  provider: ExternalCliProvider;
  prompt: string;
  workingDirectory: string;
  createIfMissing: boolean;
  requestedBypassPermission?: boolean;
  bypassPermission: boolean;
  origin: ExternalCliRunOrigin;
}

export type ExternalCliResponseDecision =
  | 'allow_once'
  | 'allow_session'
  | 'deny'
  | 'cancel'
  | 'answer';

export interface ExternalCliResponsePayload {
  decision: ExternalCliResponseDecision;
  text: string;
}

export interface ExternalCliAdapterStartInput {
  runId: string;
  sessionId: string;
  provider: ExternalCliProvider;
  prompt: string;
  workingDirectory: string;
  bypassPermission: boolean;
}

export interface ExternalCliAdapterCallbacks {
  onLaunchCommand?: (command: string) => void;
  onProgress: (entry: ExternalCliProgressEntry) => void;
  onDiagnosticLog?: (entry: {
    stream: 'stdout' | 'stderr' | 'note';
    text: string;
    timestamp?: number;
  }) => void;
  onProcessExit?: (info: { code?: number | null; signal?: string | null }) => void;
  onWaitingInteraction: (interaction: ExternalCliPendingInteraction) => void;
  onInteractionResolved: (interactionId: string) => void;
  onCompleted: (summary: string) => void;
  onFailed: (code: string, message: string) => void;
  onCancelled: (message?: string) => void;
}

export interface ExternalCliAdapter {
  start(input: ExternalCliAdapterStartInput, callbacks: ExternalCliAdapterCallbacks): Promise<void>;
  respond(interactionId: string, response: ExternalCliResponsePayload): Promise<void>;
  cancel(reason?: string): Promise<void>;
  dispose(): Promise<void>;
}

export interface ExternalCliPersistedState {
  runs: ExternalCliRunRecord[];
  updatedAt: number;
}
