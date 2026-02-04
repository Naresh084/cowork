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
  prompt?: string;
  contextFileName?: string;
  status?: 'connected' | 'disconnected' | 'error';
  error?: string;
}

export interface SkillConfig {
  id: string;
  name: string;
  path: string;
  description?: string;
  enabled: boolean;
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

export type ApprovalMode = 'auto' | 'read_only' | 'full';

export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large';
export type ViewMode = 'chat' | 'cowork' | 'code';

export interface SpecializedModels {
  imageGeneration: string;
  videoGeneration: string;
  computerUse: string;
}

export const DEFAULT_SPECIALIZED_MODELS: SpecializedModels = {
  imageGeneration: 'imagen-4.0-generate-001',
  videoGeneration: 'veo-2.0-generate-001',
  computerUse: 'gemini-2.5-computer-use-preview-10-2025',
};

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

  // Specialized models (for tasks that require specific model types)
  specializedModels: SpecializedModels;

  // Permissions
  permissionDefaults: PermissionDefaults;
  approvalMode: ApprovalMode;

  // MCP Servers
  mcpServers: MCPServerConfig[];

  // Skills
  skills: SkillConfig[];

  // UI State
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  rightPanelPinned: boolean;
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
  syncMCPServers: (servers: MCPServerConfig[]) => Promise<void>;
  loadGeminiExtensions: () => Promise<void>;

  // Skills management
  addSkill: (config: Omit<SkillConfig, 'id'>) => void;
  updateSkill: (skillId: string, updates: Partial<SkillConfig>) => void;
  removeSkill: (skillId: string) => void;
  toggleSkill: (skillId: string) => void;
  syncSkills: (skills: SkillConfig[]) => Promise<void>;

  // Specialized models management
  updateSpecializedModel: (key: keyof SpecializedModels, value: string) => Promise<void>;
  syncSpecializedModels: () => Promise<void>;

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
  toggleRightPanelPinned: () => void;
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

  // Model - populated from Google Models API
  selectedModel: '',
  temperature: 0.7,
  maxOutputTokens: 0,
  availableModels: [],
  modelsLoading: false,

  // Specialized models
  specializedModels: { ...DEFAULT_SPECIALIZED_MODELS },

  // Permissions
  permissionDefaults: defaultPermissions,
  approvalMode: 'auto',

  // MCP Servers
  mcpServers: [],

  // Skills
  skills: [],

  // UI State
  sidebarCollapsed: false,
  rightPanelCollapsed: true,
  rightPanelPinned: false,
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
          const state = useSettingsStore.getState();
          await state.syncMCPServers(state.mcpServers);
          await state.syncSkills(state.skills);
          await state.syncSpecializedModels();
          await state.loadGeminiExtensions();
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

          const selected = useSettingsStore.getState().selectedModel;
          const hasSelected = mappedModels.some((model) => model.id === selected);
          const nextSelected = hasSelected ? selected : (mappedModels[0]?.id ?? selected);

          set({
            availableModels: mappedModels,
            modelsLoading: false,
            selectedModel: nextSelected,
          });

          try {
            await invoke('agent_set_models', { models: mappedModels });
          } catch (error) {
            console.warn('[SettingsStore] Failed to sync models to sidecar:', error);
          }
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
        void useSettingsStore.getState().syncMCPServers([
          ...useSettingsStore.getState().mcpServers,
          newServer,
        ]);
      },

      updateMCPServer: (serverId, updates) => {
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === serverId ? { ...s, ...updates } : s
          ),
        }));
        void useSettingsStore.getState().syncMCPServers(useSettingsStore.getState().mcpServers);
      },

      removeMCPServer: (serverId) => {
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.id !== serverId),
        }));
        void useSettingsStore.getState().syncMCPServers(useSettingsStore.getState().mcpServers);
      },

      toggleMCPServer: (serverId) => {
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === serverId ? { ...s, enabled: !s.enabled } : s
          ),
        }));
        void useSettingsStore.getState().syncMCPServers(useSettingsStore.getState().mcpServers);
      },

      syncMCPServers: async (servers) => {
        try {
          await invoke('agent_set_mcp_servers', { servers });
        } catch (error) {
          console.warn('Failed to sync MCP servers:', error);
        }
      },

      loadGeminiExtensions: async () => {
        try {
          const result = await invoke<{ servers: MCPServerConfig[] }>('agent_load_gemini_extensions');
          if (!result?.servers?.length) return;

          set((state) => {
            const existing = new Map(state.mcpServers.map((s) => [s.name + s.command, s]));
            const merged = [...state.mcpServers];

            for (const server of result.servers) {
              const key = server.name + server.command;
              if (!existing.has(key)) {
                merged.push({
                  ...server,
                  id: server.id || `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  status: 'disconnected',
                });
              }
            }

            return { mcpServers: merged };
          });

          await useSettingsStore.getState().syncMCPServers(useSettingsStore.getState().mcpServers);
        } catch (error) {
          console.warn('Failed to load Gemini extensions:', error);
        }
      },

      // Skills management
      addSkill: (config) => {
        const newSkill: SkillConfig = {
          ...config,
          id: `skill-${Date.now()}`,
        };
        set((state) => ({
          skills: [...state.skills, newSkill],
        }));
        void useSettingsStore.getState().syncSkills([
          ...useSettingsStore.getState().skills,
          newSkill,
        ]);
      },

      updateSkill: (skillId, updates) => {
        set((state) => ({
          skills: state.skills.map((s) =>
            s.id === skillId ? { ...s, ...updates } : s
          ),
        }));
        void useSettingsStore.getState().syncSkills(useSettingsStore.getState().skills);
      },

      removeSkill: (skillId) => {
        set((state) => ({
          skills: state.skills.filter((s) => s.id !== skillId),
        }));
        void useSettingsStore.getState().syncSkills(useSettingsStore.getState().skills);
      },

      toggleSkill: (skillId) => {
        set((state) => ({
          skills: state.skills.map((s) =>
            s.id === skillId ? { ...s, enabled: !s.enabled } : s
          ),
        }));
        void useSettingsStore.getState().syncSkills(useSettingsStore.getState().skills);
      },

      syncSkills: async (skills) => {
        try {
          await invoke('agent_set_skills', { skills });
        } catch (error) {
          console.warn('Failed to sync skills:', error);
        }
      },

      // Specialized models management
      updateSpecializedModel: async (key, value) => {
        set((state) => ({
          specializedModels: { ...state.specializedModels, [key]: value },
        }));
        await useSettingsStore.getState().syncSpecializedModels();
      },

      syncSpecializedModels: async () => {
        const { specializedModels } = useSettingsStore.getState();
        try {
          await invoke('agent_set_specialized_models', { models: specializedModels });
        } catch (error) {
          console.warn('Failed to sync specialized models:', error);
        }
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

      toggleRightPanelPinned: () => {
        set((state) => ({ rightPanelPinned: !state.rightPanelPinned }));
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
        specializedModels: state.specializedModels,
        permissionDefaults: state.permissionDefaults,
        approvalMode: state.approvalMode,
        mcpServers: state.mcpServers,
        sidebarCollapsed: state.sidebarCollapsed,
        rightPanelCollapsed: state.rightPanelCollapsed,
        rightPanelPinned: state.rightPanelPinned,
        rightPanelTab: state.rightPanelTab,
        viewMode: state.viewMode,
        scratchpadContent: state.scratchpadContent,
        rightPanelSections: state.rightPanelSections,
      }),
      // Validate persisted state on rehydration
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState> | undefined;

        // Ensure selectedModel is valid (not empty, null, or undefined)
        let validModel = persisted?.selectedModel && typeof persisted.selectedModel === 'string' && persisted.selectedModel.trim()
          ? persisted.selectedModel
          : initialState.selectedModel;

        // Migrate old model names to new format (3.0 -> 3)
        if (validModel.includes('3.0')) {
          validModel = validModel.replace('3.0', '3');
        }

        // Ensure valid format (no colons or invalid chars from API URL artifacts)
        if (!validModel || validModel.includes(':') || !/^[\w.-]+$/.test(validModel)) {
          validModel = initialState.selectedModel;
        }

        const persistedMode = persisted?.approvalMode;
        const validMode = persistedMode === 'auto' || persistedMode === 'read_only' || persistedMode === 'full'
          ? persistedMode
          : initialState.approvalMode;

        // Merge specialized models with defaults (ensure all keys exist)
        const validSpecializedModels = {
          ...DEFAULT_SPECIALIZED_MODELS,
          ...(persisted?.specializedModels || {}),
        };

        return {
          ...currentState,
          ...persisted,
          approvalMode: validMode,
          selectedModel: validModel,
          specializedModels: validSpecializedModels,
        };
      },
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
export const useApprovalMode = () =>
  useSettingsStore((state) => state.approvalMode);
export const useSidebarCollapsed = () =>
  useSettingsStore((state) => state.sidebarCollapsed);
export const useRightPanelCollapsed = () =>
  useSettingsStore((state) => state.rightPanelCollapsed);
export const useRightPanelPinned = () =>
  useSettingsStore((state) => state.rightPanelPinned);
export const useRightPanelTab = () =>
  useSettingsStore((state) => state.rightPanelTab);
export const useViewMode = () =>
  useSettingsStore((state) => state.viewMode);
export const useScratchpadContent = () =>
  useSettingsStore((state) => state.scratchpadContent);
export const useRightPanelSections = () =>
  useSettingsStore((state) => state.rightPanelSections);
export const useSpecializedModels = () =>
  useSettingsStore((state) => state.specializedModels);
