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
} from '@gemini-cowork/shared';

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

interface ConnectorStoreActions {
  // Discovery
  discoverConnectors: (workingDirectory?: string) => Promise<void>;

  // Installation
  installConnector: (connectorId: string) => Promise<void>;
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
  isDiscovering: false,
  isInstalling: new Set(),
  isConnecting: new Set(),
  searchQuery: '',
  selectedCategory: 'all',
  activeTab: 'available',
  selectedConnectorId: null,
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useConnectorStore = create<ConnectorStoreState & ConnectorStoreActions>()(
  (set, get) => ({
    ...initialState,

    // ========================================================================
    // Discovery
    // ========================================================================

    discoverConnectors: async (workingDirectory) => {
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
          states.set(connector.id, existingState || {
            id: connector.id,
            manifest: connector,
            status: connector.source.type === 'managed' ? 'installed' : 'available',
            tools: [],
            resources: [],
            prompts: [],
          });
        }

        set({ availableConnectors: connectors, connectorStates: states, isDiscovering: false });

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

    installConnector: async (connectorId) => {
      set((state) => ({
        isInstalling: new Set([...state.isInstalling, connectorId]),
        error: null,
      }));

      try {
        await invoke('install_connector', { connectorId });

        // Find the connector manifest
        const connector = get().availableConnectors.find((c) => c.id === connectorId);
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
        await get().discoverConnectors();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
        });
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
        await get().discoverConnectors();
      } catch (error) {
        // Even if backend fails, try to clean up the config
        const settingsStore = useSettingsStore.getState();
        settingsStore.removeInstalledConnectorConfig(connectorId);
        settingsStore.removeInstalledConnectorConfig(managedConnectorId);

        set({
          error: error instanceof Error ? error.message : String(error),
        });

        // Re-discover to sync state
        await get().discoverConnectors();
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

        set((state) => {
          const states = new Map(state.connectorStates);
          const existing = states.get(connectorId);
          if (existing) {
            states.set(connectorId, {
              ...existing,
              status: 'error',
              error: errorMessage,
              lastError: errorMessage,
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
        await get().discoverConnectors();

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
