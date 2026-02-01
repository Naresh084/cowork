import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  status?: 'connected' | 'disconnected' | 'error';
  error?: string;
}

export interface PermissionDefaults {
  fileRead: 'ask' | 'allow' | 'deny';
  fileWrite: 'ask' | 'allow' | 'deny';
  fileDelete: 'ask' | 'allow' | 'deny';
  shellExecute: 'ask' | 'allow' | 'deny';
  networkRequest: 'ask' | 'allow' | 'deny';
  allowedPaths: string[];
  deniedPaths: string[];
  trustedCommands: string[];
}

export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large';
export type ViewMode = 'chat' | 'cowork' | 'code';

export interface RightPanelSections {
  progress: boolean;
  workingFolder: boolean;
  scratchpad: boolean;
  context: boolean;
}

interface SettingsState {
  // General
  defaultWorkingDirectory: string;
  theme: Theme;
  fontSize: FontSize;
  showLineNumbers: boolean;
  autoSave: boolean;

  // Model
  selectedModel: string;
  temperature: number;
  maxOutputTokens: number;
  availableModels: ModelInfo[];
  modelsLoading: boolean;

  // Permissions
  permissionDefaults: PermissionDefaults;

  // MCP Servers
  mcpServers: MCPServerConfig[];

  // UI State
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  rightPanelTab: 'tasks' | 'artifacts' | 'memory';
  viewMode: ViewMode;
  scratchpadContent: string;
  rightPanelSections: RightPanelSections;

  // Meta
  isLoading: boolean;
  error: string | null;
}

interface SettingsActions {
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  updateSetting: <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) => void;
  resetSettings: () => void;
  fetchModels: (apiKey: string) => Promise<void>;

  // MCP Server management
  addMCPServer: (config: Omit<MCPServerConfig, 'id' | 'status'>) => void;
  updateMCPServer: (
    serverId: string,
    updates: Partial<MCPServerConfig>
  ) => void;
  removeMCPServer: (serverId: string) => void;
  toggleMCPServer: (serverId: string) => void;

  // Permission management
  updatePermissionDefaults: (
    updates: Partial<PermissionDefaults>
  ) => void;
  addAllowedPath: (path: string) => void;
  removeAllowedPath: (path: string) => void;
  addDeniedPath: (path: string) => void;
  removeDeniedPath: (path: string) => void;
  addTrustedCommand: (command: string) => void;
  removeTrustedCommand: (command: string) => void;

  // UI State
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setRightPanelTab: (tab: 'tasks' | 'artifacts' | 'memory') => void;
  setViewMode: (mode: ViewMode) => void;
  setScratchpadContent: (content: string) => void;
  toggleRightPanelSection: (section: keyof RightPanelSections) => void;

  clearError: () => void;
}

const defaultPermissions: PermissionDefaults = {
  fileRead: 'allow',
  fileWrite: 'ask',
  fileDelete: 'ask',
  shellExecute: 'ask',
  networkRequest: 'ask',
  allowedPaths: [],
  deniedPaths: ['/etc', '/System', '/usr'],
  trustedCommands: ['ls', 'pwd', 'git status', 'git diff'],
};

const initialState: SettingsState = {
  // General
  defaultWorkingDirectory: '',
  theme: 'dark',
  fontSize: 'medium',
  showLineNumbers: true,
  autoSave: true,

  // Model - Using Gemini 3.0 models only
  selectedModel: 'gemini-3.0-flash-preview',
  temperature: 0.7,
  maxOutputTokens: 8192,
  availableModels: [],
  modelsLoading: false,

  // Permissions
  permissionDefaults: defaultPermissions,

  // MCP Servers
  mcpServers: [],

  // UI State
  sidebarCollapsed: false,
  rightPanelCollapsed: true,
  rightPanelTab: 'tasks',
  viewMode: 'cowork',
  scratchpadContent: '',
  rightPanelSections: {
    progress: true,
    workingFolder: true,
    scratchpad: false,
    context: true,
  },

  // Meta
  isLoading: false,
  error: null,
};

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...initialState,

      loadSettings: async () => {
        set({ isLoading: true, error: null });
        try {
          // Settings are persisted locally, no backend call needed
          // But we could load additional settings from backend if needed
          set({ isLoading: false });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      saveSettings: async () => {
        set({ isLoading: true, error: null });
        try {
          // Settings are auto-persisted by zustand persist middleware
          set({ isLoading: false });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      updateSetting: (key, value) => {
        set({ [key]: value } as Pick<SettingsState, typeof key>);
      },

      resetSettings: () => {
        set(initialState);
      },

      fetchModels: async (apiKey: string) => {
        set({ modelsLoading: true, error: null });
        try {
          const models = await invoke<Array<{
            id: string;
            name: string;
            description: string;
            input_token_limit: number;
            output_token_limit: number;
          }>>('fetch_models', { apiKey });

          const mappedModels: ModelInfo[] = models.map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            inputTokenLimit: m.input_token_limit,
            outputTokenLimit: m.output_token_limit,
          }));

          set({ availableModels: mappedModels, modelsLoading: false });
        } catch (error) {
          set({
            modelsLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      // MCP Server management
      addMCPServer: (config) => {
        const newServer: MCPServerConfig = {
          ...config,
          id: `mcp-${Date.now()}`,
          status: 'disconnected',
        };
        set((state) => ({
          mcpServers: [...state.mcpServers, newServer],
        }));
      },

      updateMCPServer: (serverId, updates) => {
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === serverId ? { ...s, ...updates } : s
          ),
        }));
      },

      removeMCPServer: (serverId) => {
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.id !== serverId),
        }));
      },

      toggleMCPServer: (serverId) => {
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === serverId ? { ...s, enabled: !s.enabled } : s
          ),
        }));
      },

      // Permission management
      updatePermissionDefaults: (updates) => {
        set((state) => ({
          permissionDefaults: {
            ...state.permissionDefaults,
            ...updates,
          },
        }));
      },

      addAllowedPath: (path) => {
        set((state) => ({
          permissionDefaults: {
            ...state.permissionDefaults,
            allowedPaths: [
              ...state.permissionDefaults.allowedPaths.filter((p) => p !== path),
              path,
            ],
          },
        }));
      },

      removeAllowedPath: (path) => {
        set((state) => ({
          permissionDefaults: {
            ...state.permissionDefaults,
            allowedPaths: state.permissionDefaults.allowedPaths.filter(
              (p) => p !== path
            ),
          },
        }));
      },

      addDeniedPath: (path) => {
        set((state) => ({
          permissionDefaults: {
            ...state.permissionDefaults,
            deniedPaths: [
              ...state.permissionDefaults.deniedPaths.filter((p) => p !== path),
              path,
            ],
          },
        }));
      },

      removeDeniedPath: (path) => {
        set((state) => ({
          permissionDefaults: {
            ...state.permissionDefaults,
            deniedPaths: state.permissionDefaults.deniedPaths.filter(
              (p) => p !== path
            ),
          },
        }));
      },

      addTrustedCommand: (command) => {
        set((state) => ({
          permissionDefaults: {
            ...state.permissionDefaults,
            trustedCommands: [
              ...state.permissionDefaults.trustedCommands.filter(
                (c) => c !== command
              ),
              command,
            ],
          },
        }));
      },

      removeTrustedCommand: (command) => {
        set((state) => ({
          permissionDefaults: {
            ...state.permissionDefaults,
            trustedCommands: state.permissionDefaults.trustedCommands.filter(
              (c) => c !== command
            ),
          },
        }));
      },

      // UI State
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      toggleRightPanel: () => {
        set((state) => ({ rightPanelCollapsed: !state.rightPanelCollapsed }));
      },

      setRightPanelTab: (tab) => {
        set({ rightPanelTab: tab });
      },

      setViewMode: (mode) => {
        set({ viewMode: mode });
      },

      setScratchpadContent: (content) => {
        set({ scratchpadContent: content });
      },

      toggleRightPanelSection: (section) => {
        set((state) => ({
          rightPanelSections: {
            ...state.rightPanelSections,
            [section]: !state.rightPanelSections[section],
          },
        }));
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'settings-store',
      partialize: (state) => ({
        defaultWorkingDirectory: state.defaultWorkingDirectory,
        theme: state.theme,
        fontSize: state.fontSize,
        showLineNumbers: state.showLineNumbers,
        autoSave: state.autoSave,
        selectedModel: state.selectedModel,
        temperature: state.temperature,
        maxOutputTokens: state.maxOutputTokens,
        permissionDefaults: state.permissionDefaults,
        mcpServers: state.mcpServers,
        sidebarCollapsed: state.sidebarCollapsed,
        rightPanelCollapsed: state.rightPanelCollapsed,
        rightPanelTab: state.rightPanelTab,
        viewMode: state.viewMode,
        scratchpadContent: state.scratchpadContent,
        rightPanelSections: state.rightPanelSections,
      }),
    }
  )
);

// Selector hooks
export const useTheme = () => useSettingsStore((state) => state.theme);
export const useFontSize = () => useSettingsStore((state) => state.fontSize);
export const useSelectedModel = () =>
  useSettingsStore((state) => state.selectedModel);
export const useAvailableModels = () =>
  useSettingsStore((state) => state.availableModels);
export const useModelsLoading = () =>
  useSettingsStore((state) => state.modelsLoading);
export const useMCPServers = () =>
  useSettingsStore((state) => state.mcpServers);
export const usePermissionDefaults = () =>
  useSettingsStore((state) => state.permissionDefaults);
export const useSidebarCollapsed = () =>
  useSettingsStore((state) => state.sidebarCollapsed);
export const useRightPanelCollapsed = () =>
  useSettingsStore((state) => state.rightPanelCollapsed);
export const useRightPanelTab = () =>
  useSettingsStore((state) => state.rightPanelTab);
export const useViewMode = () =>
  useSettingsStore((state) => state.viewMode);
export const useScratchpadContent = () =>
  useSettingsStore((state) => state.scratchpadContent);
export const useRightPanelSections = () =>
  useSettingsStore((state) => state.rightPanelSections);
