// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ToolHandler } from '@cowork/core';
import type { PlatformType, SessionType } from '@cowork/shared';
import type { ExecutionMode, ProviderId } from '../types.js';

export type PromptProviderId = ProviderId;
export type ToolAutonomyLevel = 'auto' | 'confirm';

export interface PromptSystemInfo {
  username: string;
  osName: string;
  osVersion: string;
  architecture: string;
  shell: string;
  computerName: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: string;
  timezone: string;
  timezoneOffset: string;
  locale: string;
  formattedDate: string;
  formattedTime: string;
}

export interface PromptCapabilityToolAccessEntry {
  toolName: string;
  enabled: boolean;
  reason: string;
  policyAction: 'allow' | 'ask' | 'deny';
}

export interface PromptCapabilityIntegrationAccessEntry {
  integrationName: string;
  enabled: boolean;
  reason: string;
}

export interface PromptCapabilitySnapshot {
  provider: PromptProviderId;
  executionMode: ExecutionMode;
  policyProfile: string;
  mediaRouting: {
    imageBackend: 'google' | 'openai' | 'fal';
    videoBackend: 'google' | 'openai' | 'fal';
  };
  sandbox: {
    mode: 'read-only' | 'workspace-write' | 'danger-full-access';
    osEnforced: boolean;
    networkAllowed: boolean;
    effectiveAllowedRoots: string[];
  };
  toolAccess: PromptCapabilityToolAccessEntry[];
  integrationAccess: PromptCapabilityIntegrationAccessEntry[];
  notes: string[];
}

export interface PromptDefaultNotificationTarget {
  platform: PlatformType;
  chatId?: string;
  senderName?: string;
}

export interface PromptTemplateSection {
  key: string;
  content: string;
}

export interface PromptBuildContext {
  provider: PromptProviderId;
  executionMode: ExecutionMode;
  sessionType: SessionType;
  workingDirectory: string;
  model: string;
  systemInfo: PromptSystemInfo;
  toolHandlers: ToolHandler[];
  capabilitySnapshot: PromptCapabilitySnapshot;
  additionalSections: PromptTemplateSection[];
  defaultNotificationTarget?: PromptDefaultNotificationTarget | null;
}

export interface PromptBuildDiagnostics {
  provider: PromptProviderId;
  providerTemplateKey: string;
  modeTemplateKey: string;
  sectionKeys: string[];
  toolCount: number;
  restrictedToolCount: number;
  integrationCount: number;
  promptLength: number;
  usingLegacyFallback: boolean;
}

export interface PromptBuildResult {
  prompt: string;
  sections: PromptTemplateSection[];
  diagnostics: PromptBuildDiagnostics;
}
