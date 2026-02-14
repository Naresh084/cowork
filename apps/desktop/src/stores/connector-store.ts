// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './settings-store';
import type {
  ConnectorManifest,
  ConnectorStatus,
  ConnectorCategory,
  InstalledConnectorConfig,
  MCPTool as ConnectorMCPTool,
  MCPResource as ConnectorMCPResource,
  MCPPrompt as ConnectorMCPPrompt,
} from '@cowork/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * Runtime state for a connected/connecting connector
 */
interface ConnectorRuntimeState {
  id: string;
  manifest: ConnectorManifest;
  status: ConnectorStatus;
  error?: string;
  lastError?: string;
  retryCount?: number;
  tools: ConnectorMCPTool[];
  resources?: ConnectorMCPResource[];
  prompts?: ConnectorMCPPrompt[];
  connectedAt?: number;
  lastErrorAt?: number;
}

interface ConnectorStoreState {
  // Available connectors from all sources
  availableConnectors: ConnectorManifest[];

  // Runtime state for each connector
  connectorStates: Map<string, ConnectorRuntimeState>;
  lastDiscoveredAt: number | null;
  lastWorkingDirectory: string | null;

  // UI State
  isDiscovering: boolean;
  isInstalling: Set<string>;
  isConnecting: Set<string>;

  // Filters
  searchQuery: string;
  selectedCategory: ConnectorCategory | 'all';
  activeTab: 'available' | 'installed' | 'apps';

  // Selected connector for details panel
  selectedConnectorId: string | null;

  // Error state
  error: string | null;
}

/**
 * Parameters for creating a custom connector
 */
interface CreateCustomConnectorParams {
  name: string;
  displayName: string;
  description: string;
  icon?: string;
  category?: ConnectorCategory;
  tags?: string[];
  transport: {
    type: 'stdio' | 'http';
    command?: string;
    args?: string[];
    url?: string;
  };
  auth: {
    type: 'none' | 'env';
    secrets?: Array<{
      key: string;
      description: string;
      required: boolean;
    }>;
  };
}

interface InstallConnectorOptions {
  autoSetup?: boolean;
}

interface InstallConnectorResult {
  installedConnectorId: string | null;
  nextStep: 'none' | 'configure' | 'oauth' | 'connected';
  connectionError?: string;
}

interface ConnectorStoreActions {
  // Discovery
  discoverConnectors: (
    workingDirectory?: string,
    options?: { force?: boolean }
  ) => Promise<void>;

  // Installation
  installConnector: (
    connectorId: string,
    options?: InstallConnectorOptions
  ) => Promise<InstallConnectorResult>;
  uninstallConnector: (connectorId: string) => Promise<void>;

  // Connection
  connectConnector: (connectorId: string) => Promise<void>;
  disconnectConnector: (connectorId: string) => Promise<void>;
  reconnectConnector: (connectorId: string) => Promise<void>;
  connectAllEnabled: () => Promise<void>;

  // Configuration
  configureSecrets: (connectorId: string, secrets: Record<string, string>) => Promise<void>;

  // OAuth
  getOAuthStatus: (connectorId: string) => Promise<{ authenticated: boolean; expiresAt?: number }>;
  revokeOAuthTokens: (connectorId: string) => Promise<void>;

  // Custom connector
  createCustomConnector: (params: CreateCustomConnectorParams) => Promise<string>;

  // Enable/Disable (for installed connectors)
  toggleConnector: (connectorId: string) => void;
  enableConnector: (connectorId: string) => void;
  disableConnector: (connectorId: string) => void;

  // UI Actions
  setSearchQuery: (query: string) => void;
  setCategory: (category: ConnectorCategory | 'all') => void;
  setActiveTab: (tab: 'available' | 'installed' | 'apps') => void;
  selectConnector: (connectorId: string | null) => void;

  // Selectors (computed)
  getFilteredConnectors: () => ConnectorManifest[];
  getInstalledConnectors: () => ConnectorRuntimeState[];
  getConnectedConnectors: () => ConnectorRuntimeState[];
  getConnectorState: (connectorId: string) => ConnectorRuntimeState | undefined;
  getInstalledCount: () => number;
  getConnectedCount: () => number;
  isConnectorInstalled: (connectorId: string) => boolean;
  isConnectorConnected: (connectorId: string) => boolean;
  isConnectorEnabled: (connectorId: string) => boolean;
  getAllTools: () => ConnectorMCPTool[];

  clearError: () => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: ConnectorStoreState = {
  availableConnectors: [],
  connectorStates: new Map(),
  lastDiscoveredAt: null,
  lastWorkingDirectory: null,
  isDiscovering: false,
  isInstalling: new Set(),
  isConnecting: new Set(),
  searchQuery: '',
  selectedCategory: 'all',
  activeTab: 'available',
  selectedConnectorId: null,
  error: null,
};

const DISCOVERY_CACHE_TTL_MS = 30_000;

function isRemoteBrowserOAuthConnector(connector: ConnectorManifest): boolean {
  if (connector.auth.type !== 'none' || connector.transport.type !== 'stdio') {
    return false;
  }

  const commandName = connector.transport.command.trim().split(/[\\/]/).pop() || '';
  if (commandName !== 'npx') {
    return false;
  }

  return connector.transport.args.some((arg) => arg === 'mcp-remote');
}

function isConnectionClosedError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('connection closed') ||
    normalized.includes('socket hang up') ||
    normalized.includes('econnreset') ||
    normalized.includes('stream closed') ||
    normalized.includes('broken pipe') ||
    normalized.includes('-32000')
  );
}

// ============================================================================
// Store
// ============================================================================

export const useConnectorStore = create<ConnectorStoreState & ConnectorStoreActions>()(
  (set, get) => ({
    ...initialState,

    // ========================================================================
    // Discovery
    // ========================================================================

    discoverConnectors: async (workingDirectory, options) => {
      const force = options?.force === true;
      const normalizedWorkingDirectory = workingDirectory?.trim() || null;
      const cacheState = get();
      if (
        !force &&
        cacheState.lastDiscoveredAt !== null &&
        cacheState.lastWorkingDirectory === normalizedWorkingDirectory &&
        Date.now() - cacheState.lastDiscoveredAt < DISCOVERY_CACHE_TTL_MS
      ) {
        return;
      }

      set({ isDiscovering: true, error: null });

      try {
        const result = await invoke<{ connectors: ConnectorManifest[] }>('discover_connectors', {
          workingDirectory,
        });

        const connectors = result.connectors;

        // Initialize states for each connector
        const states = new Map<string, ConnectorRuntimeState>();
        for (const connector of connectors) {
          const existingState = get().connectorStates.get(connector.id);
          if (existingState) {
            const normalizedExistingState =
              existingState.status === 'installed' && connector.auth.type === 'none'
                ? { ...existingState, status: 'configured' as const }
                : existingState;
            states.set(connector.id, normalizedExistingState);
            continue;
          }

          states.set(connector.id, {
            id: connector.id,
            manifest: connector,
            status:
              connector.source.type === 'managed'
                ? connector.auth.type === 'none'
                  ? 'configured'
                  : 'installed'
                : 'available',
            tools: [],
            resources: [],
            prompts: [],
          });
        }

        set({
          availableConnectors: connectors,
          connectorStates: states,
          isDiscovering: false,
          lastDiscoveredAt: Date.now(),
          lastWorkingDirectory: normalizedWorkingDirectory,
        });

        // Prune stale connector states that no longer match any discovered connector
        const validIds = new Set(connectors.map(c => c.id));
        const currentStates = get().connectorStates;
        const prunedStates = new Map([...currentStates].filter(([id]) => validIds.has(id)));
        if (prunedStates.size !== currentStates.size) {
          set({ connectorStates: prunedStates });
        }

        // Sync with settings store - remove stale configs
        const { installedConnectorConfigs, removeInstalledConnectorConfig } = useSettingsStore.getState();
        const managedNames = new Set(
          connectors.filter((c) => c.source.type === 'managed').map((c) => c.name)
        );
        for (const config of installedConnectorConfigs) {
          if (!managedNames.has(config.name)) {
            removeInstalledConnectorConfig(config.id);
          }
        }
      } catch (error) {
        set({
          isDiscovering: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    // ========================================================================
    // Installation
    // ========================================================================

    installConnector: async (connectorId, options) => {
      let requestedConnector: ConnectorManifest | undefined;
      set((state) => ({
        isInstalling: new Set([...state.isInstalling, connectorId]),
        error: null,
      }));

      try {
        requestedConnector = get().availableConnectors.find((c) => c.id === connectorId);
        await invoke('install_connector', { connectorId });

        // Find the connector manifest
        const connector = requestedConnector || get().availableConnectors.find((c) => c.id === connectorId);
        if (connector) {
          // After install, the connector becomes managed with a new ID
          const managedConnectorId = `managed:${connector.name}`;

          // Add to installed configs in settings store
          const config: InstalledConnectorConfig = {
            id: managedConnectorId,
            name: connector.name,
            enabled: true,
            installedAt: Date.now(),
            source: 'managed',
            secretsConfigured: connector.auth.type === 'none',
          };
          useSettingsStore.getState().addInstalledConnectorConfig(config);
        }

        // Re-discover to update connector list
        const rediscoverWorkingDirectory = get().lastWorkingDirectory || undefined;
        await get().discoverConnectors(rediscoverWorkingDirectory, { force: true });

        const latestState = get();
        const managedConnector =
          requestedConnector
            ? latestState.availableConnectors.find(
                (c) => c.source.type === 'managed' && c.name === requestedConnector?.name
              )
            : undefined;
        const installedConnectorId = managedConnector?.id || null;

        if (!managedConnector) {
          return {
            installedConnectorId,
            nextStep: 'none',
          };
        }

        if (managedConnector.auth.type === 'env') {
          return {
            installedConnectorId,
            nextStep: 'configure',
          };
        }

        if (managedConnector.auth.type === 'oauth') {
          return {
            installedConnectorId,
            nextStep: 'oauth',
          };
        }

        if (options?.autoSetup !== false) {
          await get().connectConnector(managedConnector.id);
          const refreshed = get().connectorStates.get(managedConnector.id);

          if (refreshed?.status === 'connected') {
            return {
              installedConnectorId,
              nextStep: 'connected',
            };
          }

          return {
            installedConnectorId,
            nextStep: 'none',
            connectionError: refreshed?.error,
          };
        }

        return {
          installedConnectorId,
          nextStep: 'none',
        };
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          installedConnectorId:
            requestedConnector?.name ? `managed:${requestedConnector.name}` : null,
          nextStep: 'none',
          connectionError: error instanceof Error ? error.message : String(error),
        };
      } finally {
        set((state) => {
          const newInstalling = new Set(state.isInstalling);
          newInstalling.delete(connectorId);
          return { isInstalling: newInstalling };
        });
      }
    },

    uninstallConnector: async (connectorId) => {
      const { availableConnectors } = get();

      // Find the connector to get its name
      const connector = availableConnectors.find((c) => c.id === connectorId);
      if (!connector) {
        set({ error: `Connector not found: ${connectorId}` });
        return;
      }

      // Find the managed version of this connector (for uninstall)
      const managedConnectorId = `managed:${connector.name}`;
      const managedConnector = availableConnectors.find((c) => c.id === managedConnectorId);

      set((state) => ({
        isInstalling: new Set([...state.isInstalling, connectorId]),
        error: null,
      }));

      try {
        // Only call backend if managed connector exists on disk
        if (managedConnector) {
          await invoke('uninstall_connector', { connectorId: managedConnectorId });
        }

        // Always clean up configs (handles stale configs)
        const settingsStore = useSettingsStore.getState();
        settingsStore.removeInstalledConnectorConfig(connectorId);
        settingsStore.removeInstalledConnectorConfig(managedConnectorId);

        // Close the details panel
        set({ selectedConnectorId: null });

        // Re-discover to update connector list
        const rediscoverWorkingDirectory = get().lastWorkingDirectory || undefined;
        await get().discoverConnectors(rediscoverWorkingDirectory, { force: true });
      } catch (error) {
        // Even if backend fails, try to clean up the config
        const settingsStore = useSettingsStore.getState();
        settingsStore.removeInstalledConnectorConfig(connectorId);
        settingsStore.removeInstalledConnectorConfig(managedConnectorId);

        set({
          error: error instanceof Error ? error.message : String(error),
        });

        // Re-discover to sync state
        const rediscoverWorkingDirectory = get().lastWorkingDirectory || undefined;
        await get().discoverConnectors(rediscoverWorkingDirectory, { force: true });
      } finally {
        set((state) => {
          const newInstalling = new Set(state.isInstalling);
          newInstalling.delete(connectorId);
          return { isInstalling: newInstalling };
        });
      }
    },

    // ========================================================================
    // Connection
    // ========================================================================

    connectConnector: async (connectorId) => {
      set((state) => ({
        isConnecting: new Set([...state.isConnecting, connectorId]),
      }));

      // Update state to connecting
      set((state) => {
        const states = new Map(state.connectorStates);
        const existing = states.get(connectorId);
        if (existing) {
          states.set(connectorId, { ...existing, status: 'connecting', error: undefined });
        }
        return { connectorStates: states };
      });

      try {
        const result = await invoke<{
          tools: ConnectorMCPTool[];
          resources: ConnectorMCPResource[];
          prompts: ConnectorMCPPrompt[];
        }>('connect_connector', { connectorId });

        // Update state to connected with discovered capabilities
        set((state) => {
          const states = new Map(state.connectorStates);
          const existing = states.get(connectorId);
          if (existing) {
            states.set(connectorId, {
              ...existing,
              status: 'connected',
              tools: result.tools,
              resources: result.resources,
              prompts: result.prompts,
              connectedAt: Date.now(),
              error: undefined,
              retryCount: 0,
            });
          }
          return { connectorStates: states };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const connector = get().availableConnectors.find((c) => c.id === connectorId);
        const remoteBrowserOAuth = connector ? isRemoteBrowserOAuthConnector(connector) : false;
        const shouldNormalizeClosedConnectionError =
          remoteBrowserOAuth && isConnectionClosedError(errorMessage);
        const normalizedErrorMessage = shouldNormalizeClosedConnectionError
          ? 'OAuth browser session closed before authorization completed. Click Connect again after finishing browser login.'
          : errorMessage;
        const normalizedStatus =
          shouldNormalizeClosedConnectionError && remoteBrowserOAuth ? 'configured' : 'error';

        set((state) => {
          const states = new Map(state.connectorStates);
          const existing = states.get(connectorId);
          if (existing) {
            states.set(connectorId, {
              ...existing,
              status: normalizedStatus,
              error: normalizedErrorMessage,
              lastError: normalizedErrorMessage,
              lastErrorAt: Date.now(),
              retryCount: (existing.retryCount || 0) + 1,
            });
          }
          return { connectorStates: states };
        });
      } finally {
        set((state) => {
          const newConnecting = new Set(state.isConnecting);
          newConnecting.delete(connectorId);
          return { isConnecting: newConnecting };
        });
      }
    },

    disconnectConnector: async (connectorId) => {
      try {
        await invoke('disconnect_connector', { connectorId });

        set((state) => {
          const states = new Map(state.connectorStates);
          const existing = states.get(connectorId);
          if (existing) {
            states.set(connectorId, {
              ...existing,
              status: 'configured',
              tools: [],
              resources: [],
              prompts: [],
            });
          }
          return { connectorStates: states };
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    reconnectConnector: async (connectorId) => {
      await get().disconnectConnector(connectorId);
      await get().connectConnector(connectorId);
    },

    connectAllEnabled: async () => {
      const { installedConnectorConfigs } = useSettingsStore.getState();
      const enabledConfigs = installedConnectorConfigs.filter((c) => c.enabled && c.secretsConfigured);

      // Connect all enabled connectors in parallel
      await Promise.allSettled(
        enabledConfigs.map((config) => {
          const connector = get().availableConnectors.find((c) => c.name === config.name);
          if (connector) {
            return get().connectConnector(connector.id);
          }
          return Promise.resolve();
        })
      );
    },

    // ========================================================================
    // Configuration
    // ========================================================================

    configureSecrets: async (connectorId, secrets) => {
      try {
        await invoke('configure_connector_secrets', { connectorId, secrets });

        // Update config to mark secrets as configured
        const { installedConnectorConfigs, updateInstalledConnectorConfig } = useSettingsStore.getState();
        const config = installedConnectorConfigs.find((c) => c.id.includes(connectorId) || c.id === connectorId);
        if (config) {
          updateInstalledConnectorConfig(config.id, { secretsConfigured: true });
        }

        // Update state
        set((state) => {
          const states = new Map(state.connectorStates);
          const existing = states.get(connectorId);
          if (existing) {
            states.set(connectorId, { ...existing, status: 'configured' });
          }
          return { connectorStates: states };
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },

    // ========================================================================
    // OAuth
    // ========================================================================

    getOAuthStatus: async (connectorId) => {
      try {
        const result = await invoke<{ authenticated: boolean; expiresAt?: number }>('get_oauth_status', {
          connectorId,
        });
        return result;
      } catch (error) {
        console.error('Failed to get OAuth status:', error);
        return { authenticated: false };
      }
    },

    revokeOAuthTokens: async (connectorId) => {
      try {
        await invoke('revoke_oauth_tokens', { connectorId });

        // Update config to mark secrets as not configured
        const { installedConnectorConfigs, updateInstalledConnectorConfig } = useSettingsStore.getState();
        const connector = get().availableConnectors.find((c) => c.id === connectorId);
        if (connector) {
          const config = installedConnectorConfigs.find((c) => c.name === connector.name);
          if (config) {
            updateInstalledConnectorConfig(config.id, { secretsConfigured: false });
          }
        }

        // Update state to installed (needs reconfiguration)
        set((state) => {
          const states = new Map(state.connectorStates);
          const existing = states.get(connectorId);
          if (existing) {
            states.set(connectorId, { ...existing, status: 'installed', tools: [], resources: [], prompts: [] });
          }
          return { connectorStates: states };
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },

    // ========================================================================
    // Custom Connector
    // ========================================================================

    createCustomConnector: async (params) => {
      set({ error: null });

      try {
        const result = await invoke<{ connectorId: string }>('create_connector', { params });

        // Auto-install the created connector by adding to settings
        const config: InstalledConnectorConfig = {
          id: result.connectorId,
          name: params.name,
          enabled: true,
          installedAt: Date.now(),
          source: 'managed',
          secretsConfigured: params.auth.type === 'none',
        };
        useSettingsStore.getState().addInstalledConnectorConfig(config);

        // Refresh connector list to include the new connector
        const rediscoverWorkingDirectory = get().lastWorkingDirectory || undefined;
        await get().discoverConnectors(rediscoverWorkingDirectory, { force: true });

        return result.connectorId;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set({ error: errorMessage });
        throw error;
      }
    },

    // ========================================================================
    // Enable/Disable
    // ========================================================================

    toggleConnector: (connectorId) => {
      const { availableConnectors } = get();
      const connector = availableConnectors.find((c) => c.id === connectorId);
      if (!connector) return;

      // Find config by name
      const { installedConnectorConfigs } = useSettingsStore.getState();
      const config = installedConnectorConfigs.find((c) => c.name === connector.name);
      if (config) {
        useSettingsStore.getState().toggleInstalledConnectorEnabled(config.id);
      }
    },

    enableConnector: (connectorId) => {
      const { availableConnectors } = get();
      const connector = availableConnectors.find((c) => c.id === connectorId);
      if (!connector) return;

      const { installedConnectorConfigs } = useSettingsStore.getState();
      const config = installedConnectorConfigs.find((c) => c.name === connector.name);
      if (config) {
        useSettingsStore.getState().updateInstalledConnectorConfig(config.id, { enabled: true });
      }
    },

    disableConnector: (connectorId) => {
      const { availableConnectors } = get();
      const connector = availableConnectors.find((c) => c.id === connectorId);
      if (!connector) return;

      const { installedConnectorConfigs } = useSettingsStore.getState();
      const config = installedConnectorConfigs.find((c) => c.name === connector.name);
      if (config) {
        useSettingsStore.getState().updateInstalledConnectorConfig(config.id, { enabled: false });
      }
    },

    // ========================================================================
    // UI Actions
    // ========================================================================

    setSearchQuery: (query) => {
      set({ searchQuery: query });
    },

    setCategory: (category) => {
      set({ selectedCategory: category });
    },

    setActiveTab: (tab) => {
      set({ activeTab: tab });
    },

    selectConnector: (connectorId) => {
      set({ selectedConnectorId: connectorId });
    },

    // ========================================================================
    // Selectors
    // ========================================================================

    getFilteredConnectors: () => {
      const { availableConnectors, searchQuery, selectedCategory, activeTab } = get();
      const { installedConnectorConfigs } = useSettingsStore.getState();
      const installedNames = new Set(installedConnectorConfigs.map((c) => c.name));

      let connectors = availableConnectors;

      // Filter by tab
      if (activeTab === 'available') {
        // Show bundled connectors that don't have a managed version (not installed)
        connectors = connectors.filter((c) => {
          if (c.source.type === 'managed') return false; // Don't show managed on available tab
          return true; // Show all bundled connectors
        });
      } else if (activeTab === 'installed') {
        // Show only managed connectors that are in installed configs
        connectors = connectors.filter(
          (c) => c.source.type === 'managed' && installedNames.has(c.name)
        );
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        connectors = connectors.filter(
          (c) =>
            c.displayName.toLowerCase().includes(query) ||
            c.description.toLowerCase().includes(query) ||
            c.tags.some((t) => t.toLowerCase().includes(query))
        );
      }

      // Filter by category
      if (selectedCategory !== 'all') {
        connectors = connectors.filter((c) => c.category === selectedCategory);
      }

      return connectors;
    },

    getInstalledConnectors: () => {
      const { connectorStates } = get();
      return Array.from(connectorStates.values()).filter(
        (s) => s.manifest.source.type === 'managed'
      );
    },

    getConnectedConnectors: () => {
      const { connectorStates } = get();
      return Array.from(connectorStates.values()).filter((s) => s.status === 'connected');
    },

    getConnectorState: (connectorId) => {
      return get().connectorStates.get(connectorId);
    },

    getInstalledCount: () => {
      // Count based on actual managed connectors, not just configs
      const { availableConnectors } = get();
      return availableConnectors.filter((c) => c.source.type === 'managed').length;
    },

    getConnectedCount: () => {
      return get().getConnectedConnectors().length;
    },

    isConnectorInstalled: (connectorId) => {
      const { availableConnectors } = get();

      const connector = availableConnectors.find((c) => c.id === connectorId);
      if (!connector) return false;

      // A connector is installed if a managed version exists on disk
      const managedConnectorExists = availableConnectors.some(
        (c) => c.source.type === 'managed' && c.name === connector.name
      );

      return managedConnectorExists;
    },

    isConnectorConnected: (connectorId) => {
      const state = get().connectorStates.get(connectorId);
      return state?.status === 'connected';
    },

    isConnectorEnabled: (connectorId) => {
      const { availableConnectors } = get();
      const { installedConnectorConfigs } = useSettingsStore.getState();

      const connector = availableConnectors.find((c) => c.id === connectorId);
      if (!connector) return false;

      // Look up config by name since IDs differ between bundled and managed
      const config = installedConnectorConfigs.find((c) => c.name === connector.name);
      return config?.enabled ?? false;
    },

    getAllTools: () => {
      const { connectorStates } = get();
      const tools: ConnectorMCPTool[] = [];
      for (const state of connectorStates.values()) {
        if (state.status === 'connected') {
          tools.push(...state.tools);
        }
      }
      return tools;
    },

    clearError: () => {
      set({ error: null });
    },

    reset: () => {
      set(initialState);
    },
  })
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const useAvailableConnectors = () => useConnectorStore((state) => state.availableConnectors);
export const useConnectorStates = () => useConnectorStore((state) => state.connectorStates);
export const useIsDiscoveringConnectors = () => useConnectorStore((state) => state.isDiscovering);
export const useConnectorSearchQuery = () => useConnectorStore((state) => state.searchQuery);
export const useConnectorCategory = () => useConnectorStore((state) => state.selectedCategory);
export const useConnectorActiveTab = () => useConnectorStore((state) => state.activeTab);
export const useSelectedConnectorId = () => useConnectorStore((state) => state.selectedConnectorId);
export const useConnectorError = () => useConnectorStore((state) => state.error);
