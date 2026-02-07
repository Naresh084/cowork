import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from './session-store';

export type PolicyAction = 'allow' | 'ask' | 'deny';

export interface ToolAccessEntry {
  toolName: string;
  enabled: boolean;
  reason: string;
  policyAction: PolicyAction;
}

export interface IntegrationAccessEntry {
  integrationName: string;
  enabled: boolean;
  reason: string;
}

export interface ConnectorAccessEntry {
  connectorName: string;
  enabled: boolean;
  reason: string;
}

export interface CapabilitySnapshot {
  provider: string;
  executionMode?: 'execute' | 'plan';
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
  keyStatus: {
    providerKeyConfigured: boolean;
    googleKeyConfigured: boolean;
    openaiKeyConfigured: boolean;
    falKeyConfigured: boolean;
    exaKeyConfigured: boolean;
    tavilyKeyConfigured: boolean;
    stitchKeyConfigured: boolean;
  };
  toolAccess: ToolAccessEntry[];
  integrationAccess: IntegrationAccessEntry[];
  connectorAccess: ConnectorAccessEntry[];
  policyProfile: string;
  notes: string[];
}

interface CapabilityState {
  snapshot: CapabilitySnapshot | null;
  isLoading: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
}

interface CapabilityActions {
  refreshSnapshot: () => Promise<void>;
  clearError: () => void;
}

function toPolicyAction(value: unknown): PolicyAction {
  if (value === 'allow' || value === 'ask' || value === 'deny') {
    return value;
  }
  return 'ask';
}

function toMediaBackend(value: unknown): 'google' | 'openai' | 'fal' {
  if (value === 'openai' || value === 'fal' || value === 'google') {
    return value;
  }
  return 'google';
}

function toSandboxMode(
  value: unknown,
): 'read-only' | 'workspace-write' | 'danger-full-access' {
  if (value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access') {
    return value;
  }
  return 'workspace-write';
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeCapabilitySnapshot(input: unknown): CapabilitySnapshot {
  const root = isRecord(input) ? input : {};
  const mediaRouting = isRecord(root.mediaRouting) ? root.mediaRouting : {};
  const sandbox = isRecord(root.sandbox) ? root.sandbox : {};
  const keyStatus = isRecord(root.keyStatus) ? root.keyStatus : {};

  const toolAccessRaw = Array.isArray(root.toolAccess) ? root.toolAccess : [];
  const integrationAccessRaw = Array.isArray(root.integrationAccess) ? root.integrationAccess : [];
  const connectorAccessRaw = Array.isArray(root.connectorAccess) ? root.connectorAccess : [];
  const notesRaw = Array.isArray(root.notes) ? root.notes : [];

  return {
    provider: asString(root.provider, 'google'),
    executionMode:
      root.executionMode === 'plan' || root.executionMode === 'execute'
        ? root.executionMode
        : 'execute',
    mediaRouting: {
      imageBackend: toMediaBackend(mediaRouting.imageBackend),
      videoBackend: toMediaBackend(mediaRouting.videoBackend),
    },
    sandbox: {
      mode: toSandboxMode(sandbox.mode),
      osEnforced: asBoolean(sandbox.osEnforced),
      networkAllowed: asBoolean(sandbox.networkAllowed),
      effectiveAllowedRoots: Array.isArray(sandbox.effectiveAllowedRoots)
        ? sandbox.effectiveAllowedRoots
            .map((entry) => asString(entry))
            .filter(Boolean)
        : [],
    },
    keyStatus: {
      providerKeyConfigured: asBoolean(keyStatus.providerKeyConfigured),
      googleKeyConfigured: asBoolean(keyStatus.googleKeyConfigured),
      openaiKeyConfigured: asBoolean(keyStatus.openaiKeyConfigured),
      falKeyConfigured: asBoolean(keyStatus.falKeyConfigured),
      exaKeyConfigured: asBoolean(keyStatus.exaKeyConfigured),
      tavilyKeyConfigured: asBoolean(keyStatus.tavilyKeyConfigured),
      stitchKeyConfigured: asBoolean(keyStatus.stitchKeyConfigured),
    },
    toolAccess: toolAccessRaw
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map((entry) => ({
        toolName: asString(entry.toolName, 'unknown_tool'),
        enabled: asBoolean(entry.enabled),
        reason: asString(entry.reason, 'No reason provided'),
        policyAction: toPolicyAction(entry.policyAction),
      })),
    integrationAccess: integrationAccessRaw
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map((entry) => ({
        integrationName: asString(entry.integrationName, 'unknown_integration'),
        enabled: asBoolean(entry.enabled),
        reason: asString(entry.reason, 'No reason provided'),
      })),
    connectorAccess: connectorAccessRaw
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map((entry) => ({
        connectorName: asString(entry.connectorName, 'unknown_connector'),
        enabled: asBoolean(entry.enabled),
        reason: asString(entry.reason, 'No reason provided'),
      })),
    policyProfile: asString(root.policyProfile, 'coding'),
    notes: notesRaw.map((note) => asString(note)).filter(Boolean),
  };
}

export const useCapabilityStore = create<CapabilityState & CapabilityActions>((set) => ({
  snapshot: null,
  isLoading: false,
  error: null,
  lastUpdatedAt: null,

  refreshSnapshot: async () => {
    set({ isLoading: true, error: null });
    try {
      const activeSessionId = useSessionStore.getState().activeSessionId;
      const raw = await invoke<unknown>('agent_get_capability_snapshot', {
        sessionId: activeSessionId || null,
      });
      const snapshot = normalizeCapabilitySnapshot(raw);
      set({
        snapshot,
        isLoading: false,
        error: null,
        lastUpdatedAt: Date.now(),
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  clearError: () => set({ error: null }),
}));
