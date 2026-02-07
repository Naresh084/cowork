import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import {
  useAuthStore,
  type ProviderId,
  type CommandSandboxSettings,
  type SandboxMode,
  type RuntimeSoulProfile,
} from './auth-store';
import { useAppStore } from './app-store';

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

export interface SkillsSettings {
  /** Directory for managed skills (installed from marketplace) */
  managedDir: string;
  /** Custom skill directories to scan */
  customDirs: string[];
  /** Whether to show unavailable skills in marketplace */
  showUnavailable: boolean;
  /** Whether to auto-check eligibility on startup */
  autoCheckEligibility: boolean;
}

export interface InstalledSkillConfig {
  id: string;
  name: string;
  enabled: boolean;
  installedAt: number;
  source: 'bundled' | 'managed' | 'workspace' | 'custom' | 'platform';
}

export interface InstalledCommandConfig {
  id: string;
  name: string;
  enabled: boolean;
  installedAt: number;
  source: 'bundled' | 'managed' | 'platform';
}

export interface InstalledConnectorConfig {
  id: string;
  name: string;
  enabled: boolean;
  installedAt: number;
  source: 'managed' | 'workspace';
  /** Whether all required secrets are configured */
  secretsConfigured: boolean;
  /** Whether OAuth authentication is configured (for OAuth connectors) */
  oauthConfigured?: boolean;
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
  deepResearchAgent: string;
}

export const DEFAULT_SPECIALIZED_MODELS: SpecializedModels = {
  imageGeneration: 'imagen-4.0-generate-001',
  videoGeneration: 'veo-3.1-generate-preview',
  computerUse: 'gemini-2.5-computer-use-preview-10-2025',
  deepResearchAgent: 'deep-research-pro-preview-12-2025',
};

export interface SpecializedModelsV2 {
  google: {
    imageGeneration: string;
    videoGeneration: string;
    computerUse: string;
    deepResearchAgent: string;
  };
  openai: {
    imageGeneration: string;
    videoGeneration: string;
  };
  fal: {
    imageGeneration: string;
    videoGeneration: string;
  };
}

export interface MediaRoutingSettings {
  imageBackend: 'google' | 'openai' | 'fal';
  videoBackend: 'google' | 'openai' | 'fal';
}

export type ExternalSearchProvider = 'google' | 'exa' | 'tavily';
export type MemoryStyle = 'conservative' | 'balanced' | 'aggressive';

export interface MemorySettings {
  enabled: boolean;
  autoExtract: boolean;
  maxInPrompt: number;
  style: MemoryStyle;
}

export interface ExternalCliProviderSettings {
  enabled: boolean;
  allowBypassPermissions: boolean;
}

export interface ExternalCliSettings {
  codex: ExternalCliProviderSettings;
  claude: ExternalCliProviderSettings;
}

export const DEFAULT_MEDIA_ROUTING: MediaRoutingSettings = {
  imageBackend: 'google',
  videoBackend: 'google',
};

export const DEFAULT_EXTERNAL_SEARCH_PROVIDER: ExternalSearchProvider = 'google';
export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  autoExtract: true,
  maxInPrompt: 5,
  style: 'balanced',
};
export const DEFAULT_EXTERNAL_CLI_SETTINGS: ExternalCliSettings = {
  codex: {
    enabled: false,
    allowBypassPermissions: false,
  },
  claude: {
    enabled: false,
    allowBypassPermissions: false,
  },
};

export type SoulSource = 'preset' | 'custom';

export interface SoulProfile {
  id: string;
  title: string;
  content: string;
  source: SoulSource;
  path?: string;
}

interface SoulCatalogPayload {
  presets: SoulProfile[];
  customSouls: SoulProfile[];
  defaultSoulId: string;
  projectSoulsDir: string;
  userSoulsDir: string;
}

interface AgentCommandResult<T> {
  result: T;
}

const DEFAULT_SOUL_ID = 'preset:professional';

const FALLBACK_SOUL_PROFILE: SoulProfile = {
  id: DEFAULT_SOUL_ID,
  title: 'Professional',
  source: 'preset',
  content: [
    '# Professional Soul',
    '',
    '## Voice',
    '- Clear, factual, and respectful.',
    '- Avoid hype and filler.',
    '',
    '## Behavior',
    '- Prioritize correctness and direct execution.',
    '- Surface assumptions and constraints explicitly.',
  ].join('\n'),
};

function normalizeSoulProfile(value: SoulProfile): SoulProfile | null {
  const id = value.id?.trim() || '';
  const title = value.title?.trim() || '';
  const content = value.content?.trim() || '';
  const source: SoulSource = value.source === 'custom' ? 'custom' : 'preset';
  const path = value.path?.trim() || undefined;
  if (!id || !title || !content) return null;
  return { id, title, content, source, path };
}

function toRuntimeSoulProfile(value: SoulProfile | null): RuntimeSoulProfile | null {
  if (!value) return null;
  return {
    id: value.id,
    title: value.title,
    content: value.content,
    source: value.source,
    path: value.path,
  };
}

function dedupeSouls(values: SoulProfile[]): SoulProfile[] {
  const map = new Map<string, SoulProfile>();
  for (const soul of values) {
    const normalized = normalizeSoulProfile(soul);
    if (!normalized) continue;
    map.set(normalized.id, normalized);
  }
  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export function resolveActiveSoul(
  souls: SoulProfile[],
  activeSoulId: string,
  defaultSoulId: string,
): SoulProfile {
  const byId = new Map(souls.map((soul) => [soul.id, soul] as const));
  return (
    byId.get(activeSoulId) ||
    byId.get(defaultSoulId) ||
    byId.get(DEFAULT_SOUL_ID) ||
    souls[0] ||
    FALLBACK_SOUL_PROFILE
  );
}

function normalizeSoulCatalog(catalog: SoulCatalogPayload): {
  souls: SoulProfile[];
  defaultSoulId: string;
  projectSoulsDirectory: string;
  userSoulsDirectory: string;
} {
  const combined = dedupeSouls([...(catalog.presets || []), ...(catalog.customSouls || [])]);
  const defaultSoulId =
    catalog.defaultSoulId?.trim() ||
    combined.find((soul) => soul.id === DEFAULT_SOUL_ID)?.id ||
    combined[0]?.id ||
    DEFAULT_SOUL_ID;

  return {
    souls: combined.length > 0 ? combined : [{ ...FALLBACK_SOUL_PROFILE }],
    defaultSoulId,
    projectSoulsDirectory: catalog.projectSoulsDir || '',
    userSoulsDirectory: catalog.userSoulsDir || '',
  };
}

async function invokeAgentCommand<T>(
  command: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await invoke<AgentCommandResult<T>>('agent_command', {
    command,
    params,
  });
  return response.result;
}

export const DEFAULT_SPECIALIZED_MODELS_V2: SpecializedModelsV2 = {
  google: { ...DEFAULT_SPECIALIZED_MODELS },
  openai: {
    imageGeneration: 'gpt-image-1',
    videoGeneration: 'sora',
  },
  fal: {
    imageGeneration: 'fal-ai/flux/schnell',
    videoGeneration: 'fal-ai/kling-video/v1.6/standard/text-to-video',
  },
};

const SPECIALIZED_MODEL_MIGRATIONS: Record<keyof SpecializedModels, Record<string, string>> = {
  imageGeneration: {
    'imagen-3.0-generate-001': 'imagen-4.0-generate-001',
    'imagen-3.0-generate-002': 'imagen-4.0-generate-001',
    'imagen-3.0-capability-001': 'imagen-4.0-generate-001',
  },
  videoGeneration: {
    'veo-2.0-generate-001': 'veo-3.1-generate-preview',
    'veo-3.0-generate-preview': 'veo-3.1-generate-preview',
    'veo-3.0-fast-generate-preview': 'veo-3.1-generate-preview',
  },
  computerUse: {
    'gemini-2.5-computer-use-preview': 'gemini-2.5-computer-use-preview-10-2025',
  },
  deepResearchAgent: {},
};

function normalizeSpecializedModelValue(
  key: keyof SpecializedModels,
  value: string | undefined
): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return DEFAULT_SPECIALIZED_MODELS[key];
  }

  const migrated = SPECIALIZED_MODEL_MIGRATIONS[key][trimmed] ?? trimmed;

  // Keep user-entered custom model IDs, but reject malformed values.
  if (migrated.includes(':') || !/^[\w.-]+$/.test(migrated)) {
    return DEFAULT_SPECIALIZED_MODELS[key];
  }

  if (key === 'videoGeneration' && (migrated.startsWith('veo-2.') || migrated.startsWith('veo-3.0-'))) {
    return DEFAULT_SPECIALIZED_MODELS.videoGeneration;
  }

  if (key === 'imageGeneration' && migrated.startsWith('imagen-3.')) {
    return DEFAULT_SPECIALIZED_MODELS.imageGeneration;
  }

  return migrated;
}

function normalizeSpecializedModels(models: Partial<SpecializedModels> | undefined): SpecializedModels {
  return {
    imageGeneration: normalizeSpecializedModelValue('imageGeneration', models?.imageGeneration),
    videoGeneration: normalizeSpecializedModelValue('videoGeneration', models?.videoGeneration),
    computerUse: normalizeSpecializedModelValue('computerUse', models?.computerUse),
    deepResearchAgent: normalizeSpecializedModelValue('deepResearchAgent', models?.deepResearchAgent),
  };
}

export interface RightPanelSections {
  progress: boolean;
  workingFolder: boolean;
  toolsUsed: boolean;
  context: boolean;
  scheduled: boolean;
}

export interface SessionListFilters {
  chat: boolean;
  shared: boolean;
  cron: boolean;
}

export interface AutomationListFilters {
  pending: boolean;
  completed: boolean;
  failed: boolean;
}

interface SettingsState {
  // User
  userName: string;

  activeProvider: ProviderId;

  // General
  defaultWorkingDirectory: string;
  theme: Theme;
  fontSize: FontSize;
  showLineNumbers: boolean;
  autoSave: boolean;

  // Model
  selectedModel: string;
  selectedModelByProvider: Partial<Record<ProviderId, string>>;
  temperature: number;
  maxOutputTokens: number;
  availableModels: ModelInfo[];
  availableModelsByProvider: Partial<Record<ProviderId, ModelInfo[]>>;
  customModelsByProvider: Partial<Record<ProviderId, string[]>>;
  modelsLoading: boolean;
  providerBaseUrls: Partial<Record<ProviderId, string>>;

  // Specialized models (for tasks that require specific model types)
  specializedModels: SpecializedModels;
  specializedModelsV2: SpecializedModelsV2;
  mediaRouting: MediaRoutingSettings;
  mediaRoutingCustomized: boolean;
  externalSearchProvider: ExternalSearchProvider;
  memory: MemorySettings;
  souls: SoulProfile[];
  activeSoulId: string;
  defaultSoulId: string;
  projectSoulsDirectory: string;
  userSoulsDirectory: string;
  soulsLoading: boolean;

  // Permissions
  permissionDefaults: PermissionDefaults;
  approvalMode: ApprovalMode;
  commandSandbox: CommandSandboxSettings;
  externalCli: ExternalCliSettings;

  // MCP Servers
  mcpServers: MCPServerConfig[];

  // Skills (legacy)
  skills: SkillConfig[];

  // Skills Marketplace
  skillsSettings: SkillsSettings;
  installedSkillConfigs: InstalledSkillConfig[];

  // Commands Marketplace
  installedCommandConfigs: InstalledCommandConfig[];

  // Connectors Marketplace
  installedConnectorConfigs: InstalledConnectorConfig[];

  // UI State
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  rightPanelPinned: boolean;
  rightPanelTab: 'tasks' | 'artifacts' | 'memory';
  viewMode: ViewMode;
  rightPanelSections: RightPanelSections;
  sessionListFilters: SessionListFilters;
  automationListFilters: AutomationListFilters;

  // Live Browser View
  liveViewOpen: boolean;
  liveViewSplitRatio: number;  // 0.3 to 0.7, default 0.5 (50/50 split)

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
  fetchProviderModels: (provider?: ProviderId) => Promise<void>;
  setActiveProvider: (provider: ProviderId) => Promise<void>;
  setSelectedModelForProvider: (provider: ProviderId, modelId: string) => void;
  addCustomModelForProvider: (provider: ProviderId, modelId: string) => void;
  setProviderBaseUrl: (provider: ProviderId, baseUrl: string) => Promise<void>;
  setMediaRouting: (routing: Partial<MediaRoutingSettings>) => Promise<void>;
  setExternalSearchProvider: (provider: ExternalSearchProvider) => Promise<void>;
  setMemorySettings: (updates: Partial<MemorySettings>) => Promise<void>;
  setCommandSandbox: (updates: Partial<CommandSandboxSettings>) => Promise<void>;
  updateExternalCliSettings: (
    provider: keyof ExternalCliSettings,
    updates: Partial<ExternalCliProviderSettings>,
  ) => Promise<void>;
  loadSoulProfiles: () => Promise<void>;
  setActiveSoul: (soulId: string) => Promise<void>;
  saveCustomSoul: (title: string, content: string, existingSoulId?: string) => Promise<void>;
  deleteCustomSoul: (soulId: string) => Promise<void>;

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

  // Skills management (legacy)
  addSkill: (config: Omit<SkillConfig, 'id'>) => void;
  updateSkill: (skillId: string, updates: Partial<SkillConfig>) => void;
  removeSkill: (skillId: string) => void;
  toggleSkill: (skillId: string) => void;
  syncSkills: (skills: SkillConfig[]) => Promise<void>;

  // Skills marketplace management
  updateSkillsSettings: (updates: Partial<SkillsSettings>) => void;
  addCustomSkillDir: (path: string) => void;
  removeCustomSkillDir: (path: string) => void;
  addInstalledSkillConfig: (config: InstalledSkillConfig) => void;
  removeInstalledSkillConfig: (skillId: string) => void;
  updateInstalledSkillConfig: (skillId: string, updates: Partial<InstalledSkillConfig>) => void;
  toggleInstalledSkillEnabled: (skillId: string) => void;
  syncInstalledSkills: () => Promise<void>;

  // Commands marketplace management
  addInstalledCommandConfig: (config: InstalledCommandConfig) => void;
  removeInstalledCommandConfig: (commandId: string) => void;
  updateInstalledCommandConfig: (commandId: string, updates: Partial<InstalledCommandConfig>) => void;
  toggleInstalledCommandEnabled: (commandId: string) => void;

  // Connectors marketplace management
  addInstalledConnectorConfig: (config: InstalledConnectorConfig) => void;
  removeInstalledConnectorConfig: (connectorId: string) => void;
  updateInstalledConnectorConfig: (connectorId: string, updates: Partial<InstalledConnectorConfig>) => void;
  toggleInstalledConnectorEnabled: (connectorId: string) => void;
  syncInstalledConnectors: () => Promise<void>;

  // Specialized models management
  updateSpecializedModel: (key: keyof SpecializedModels, value: string) => Promise<void>;
  updateSpecializedModelV2: (
    provider: keyof SpecializedModelsV2,
    key:
      | keyof SpecializedModelsV2['google']
      | keyof SpecializedModelsV2['openai']
      | keyof SpecializedModelsV2['fal'],
    value: string
  ) => Promise<void>;
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
  toggleRightPanelSection: (section: keyof RightPanelSections) => void;
  toggleSessionListFilter: (filter: keyof SessionListFilters) => void;
  setSessionListFilters: (filters: Partial<SessionListFilters>) => void;
  toggleAutomationListFilter: (filter: keyof AutomationListFilters) => void;
  setAutomationListFilters: (filters: Partial<AutomationListFilters>) => void;

  // Live Browser View
  setLiveViewOpen: (open: boolean) => void;
  setLiveViewSplitRatio: (ratio: number) => void;
  closeLiveView: () => void;

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

export const DEFAULT_COMMAND_SANDBOX: CommandSandboxSettings = {
  mode: 'workspace-write',
  allowNetwork: false,
  allowProcessSpawn: true,
  allowedPaths: [],
  deniedPaths: ['/etc', '/System', '/usr'],
  trustedCommands: ['ls', 'pwd', 'git status', 'git diff'],
  maxExecutionTimeMs: 30000,
  maxOutputBytes: 1024 * 1024,
};

function normalizeCommandSandbox(
  value: Partial<CommandSandboxSettings> | undefined,
  permissionDefaults?: PermissionDefaults,
): CommandSandboxSettings {
  const mode = value?.mode;
  const normalizedMode: SandboxMode =
    mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access'
      ? mode
      : DEFAULT_COMMAND_SANDBOX.mode;

  const fallbackAllowed = permissionDefaults?.allowedPaths || [];
  const fallbackDenied = permissionDefaults?.deniedPaths || DEFAULT_COMMAND_SANDBOX.deniedPaths;
  const fallbackTrusted =
    permissionDefaults?.trustedCommands || DEFAULT_COMMAND_SANDBOX.trustedCommands;

  return {
    mode: normalizedMode,
    allowNetwork:
      typeof value?.allowNetwork === 'boolean'
        ? value.allowNetwork
        : DEFAULT_COMMAND_SANDBOX.allowNetwork,
    allowProcessSpawn:
      typeof value?.allowProcessSpawn === 'boolean'
        ? value.allowProcessSpawn
        : DEFAULT_COMMAND_SANDBOX.allowProcessSpawn,
    allowedPaths: Array.isArray(value?.allowedPaths)
      ? value.allowedPaths
      : fallbackAllowed,
    deniedPaths: Array.isArray(value?.deniedPaths)
      ? value.deniedPaths
      : fallbackDenied,
    trustedCommands: Array.isArray(value?.trustedCommands)
      ? value.trustedCommands
      : fallbackTrusted,
    maxExecutionTimeMs:
      typeof value?.maxExecutionTimeMs === 'number' && value.maxExecutionTimeMs > 0
        ? value.maxExecutionTimeMs
        : DEFAULT_COMMAND_SANDBOX.maxExecutionTimeMs,
    maxOutputBytes:
      typeof value?.maxOutputBytes === 'number' && value.maxOutputBytes > 0
        ? value.maxOutputBytes
        : DEFAULT_COMMAND_SANDBOX.maxOutputBytes,
  };
}

function buildRuntimeConfigFromSettings(state: SettingsState) {
  return {
    activeProvider: state.activeProvider,
    providerBaseUrls: state.providerBaseUrls,
    externalSearchProvider: state.externalSearchProvider,
    memory: state.memory,
    mediaRouting: state.mediaRouting,
    sandbox: state.commandSandbox,
    externalCli: state.externalCli,
    specializedModels: state.specializedModelsV2,
    activeSoul: toRuntimeSoulProfile(
      resolveActiveSoul(state.souls, state.activeSoulId, state.defaultSoulId),
    ),
  };
}

const initialState: SettingsState = {
  // User
  userName: '',

  activeProvider: 'google',

  // General
  defaultWorkingDirectory: '',
  theme: 'dark',
  fontSize: 'medium',
  showLineNumbers: true,
  autoSave: true,

  // Model - populated from Google Models API
  selectedModel: '',
  selectedModelByProvider: {},
  temperature: 0.7,
  maxOutputTokens: 0,
  availableModels: [],
  availableModelsByProvider: {},
  customModelsByProvider: {},
  modelsLoading: false,
  providerBaseUrls: {},

  // Specialized models
  specializedModels: { ...DEFAULT_SPECIALIZED_MODELS },
  specializedModelsV2: { ...DEFAULT_SPECIALIZED_MODELS_V2 },
  mediaRouting: { ...DEFAULT_MEDIA_ROUTING },
  mediaRoutingCustomized: false,
  externalSearchProvider: DEFAULT_EXTERNAL_SEARCH_PROVIDER,
  memory: { ...DEFAULT_MEMORY_SETTINGS },
  souls: [{ ...FALLBACK_SOUL_PROFILE }],
  activeSoulId: DEFAULT_SOUL_ID,
  defaultSoulId: DEFAULT_SOUL_ID,
  projectSoulsDirectory: '',
  userSoulsDirectory: '',
  soulsLoading: false,

  // Permissions
  permissionDefaults: defaultPermissions,
  approvalMode: 'auto',
  commandSandbox: { ...DEFAULT_COMMAND_SANDBOX },
  externalCli: { ...DEFAULT_EXTERNAL_CLI_SETTINGS },

  // MCP Servers
  mcpServers: [],

  // Skills (legacy)
  skills: [],

  // Skills Marketplace
  skillsSettings: {
    managedDir: '', // Will be set to ~/.cowork/skills
    customDirs: [],
    showUnavailable: true,
    autoCheckEligibility: true,
  },
  installedSkillConfigs: [],

  // Commands Marketplace
  installedCommandConfigs: [],

  // Connectors Marketplace
  installedConnectorConfigs: [],

  // UI State
  sidebarCollapsed: false,
  rightPanelCollapsed: true,
  rightPanelPinned: false,
  rightPanelTab: 'tasks',
  viewMode: 'cowork',
  rightPanelSections: {
    progress: true,
    workingFolder: true,
    toolsUsed: true,
    context: true,
    scheduled: true,
  },
  sessionListFilters: {
    chat: true,
    shared: true,
    cron: false,
  },
  automationListFilters: {
    pending: true,
    completed: false,
    failed: false,
  },

  // Live Browser View
  liveViewOpen: false,
  liveViewSplitRatio: 0.5,  // Default 50/50 split

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
          await state.loadSoulProfiles();
          const nextState = useSettingsStore.getState();
          await useAuthStore.getState().setActiveProvider(state.activeProvider);
          await useAuthStore.getState().applyRuntimeConfig(
            buildRuntimeConfigFromSettings(nextState),
          );
          if (
            useAuthStore.getState().providerApiKeys[state.activeProvider] ||
            state.activeProvider === 'lmstudio'
          ) {
            await state.fetchProviderModels(state.activeProvider);
          }
          await state.syncMCPServers(state.mcpServers);
          await state.syncSkills(state.skills);
          await state.syncInstalledSkills(); // Sync marketplace/installed skills
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
        if (key === 'selectedModel') {
          set((state) => ({
            selectedModel: value as SettingsState[typeof key] as string,
            selectedModelByProvider: {
              ...state.selectedModelByProvider,
              [state.activeProvider]: value as SettingsState[typeof key] as string,
            },
          }));
          return;
        }

        if (key === 'activeProvider') {
          const provider = value as SettingsState[typeof key] as ProviderId;
          set((state) => ({
            activeProvider: provider,
            selectedModel: state.selectedModelByProvider[provider] || '',
            availableModels: state.availableModelsByProvider[provider] || [],
          }));
          return;
        }

        set({ [key]: value } as Pick<SettingsState, typeof key>);
      },

      resetSettings: () => {
        set(initialState);
      },

      fetchModels: async (_apiKey: string) => {
        await useSettingsStore.getState().fetchProviderModels();
      },

      fetchProviderModels: async (providerOverride) => {
        set({ modelsLoading: true, error: null });
        try {
          const state = useSettingsStore.getState();
          const authState = useAuthStore.getState();
          const provider = providerOverride || state.activeProvider || authState.activeProvider;
          const providerKey = authState.providerApiKeys[provider];
          const baseUrl = authState.providerBaseUrls[provider];

          if (!providerKey && provider !== 'lmstudio') {
            set({
              modelsLoading: false,
              availableModels: [],
              availableModelsByProvider: {
                ...state.availableModelsByProvider,
                [provider]: [],
              },
            });
            return;
          }

          const models = await invoke<Array<{
            id: string;
            name: string;
            description: string;
            input_token_limit: number;
            output_token_limit: number;
          }>>('fetch_provider_models', {
            providerId: provider,
            apiKey: providerKey || '',
            baseUrl: baseUrl || null,
          });

          const mappedModels: ModelInfo[] = models.map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            inputTokenLimit: m.input_token_limit,
            outputTokenLimit: m.output_token_limit,
          }));

          const customModels = state.customModelsByProvider[provider] || [];
          const mergedModels = [...mappedModels];
          for (const custom of customModels) {
            if (!mergedModels.some((model) => model.id === custom)) {
              mergedModels.push({
                id: custom,
                name: custom,
                description: 'Custom model ID',
                inputTokenLimit: 0,
                outputTokenLimit: 0,
              });
            }
          }

          const providerSelected = state.selectedModelByProvider[provider] || '';
          const hasSelected = mergedModels.some((model) => model.id === providerSelected);
          const nextSelected = hasSelected ? providerSelected : (mergedModels[0]?.id ?? providerSelected);

          set((prev) => ({
            availableModels: provider === prev.activeProvider ? mergedModels : prev.availableModels,
            availableModelsByProvider: {
              ...prev.availableModelsByProvider,
              [provider]: mergedModels,
            },
            selectedModel: provider === prev.activeProvider ? nextSelected : prev.selectedModel,
            selectedModelByProvider: {
              ...prev.selectedModelByProvider,
              [provider]: nextSelected,
            },
            modelsLoading: false,
          }));

          try {
            await invoke('agent_set_models', { models: mergedModels.map((m) => ({ ...m, provider })) });
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

      setActiveProvider: async (provider) => {
        set((state) => {
          const autoRouting = provider === 'openai'
            ? { imageBackend: 'openai' as const, videoBackend: 'openai' as const }
            : { imageBackend: 'google' as const, videoBackend: 'google' as const };
          const nextMediaRouting = state.mediaRoutingCustomized ? state.mediaRouting : autoRouting;
          return {
            activeProvider: provider,
            selectedModel: state.selectedModelByProvider[provider] || '',
            availableModels: state.availableModelsByProvider[provider] || [],
            mediaRouting: nextMediaRouting,
          };
        });

        await useAuthStore.getState().setActiveProvider(provider);
        await useSettingsStore.getState().fetchProviderModels(provider);
        const state = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(state),
        );
      },

      setSelectedModelForProvider: (provider, modelId) => {
        set((state) => ({
          selectedModelByProvider: {
            ...state.selectedModelByProvider,
            [provider]: modelId,
          },
          selectedModel: provider === state.activeProvider ? modelId : state.selectedModel,
        }));

        if (provider === useSettingsStore.getState().activeProvider) {
          useAppStore.getState().setRuntimeConfigNotice({
            requiresNewSession: true,
            reasons: ['model_changed'],
            affectedSessionIds: [],
          });
        }
      },

      addCustomModelForProvider: (provider, modelId) => {
        const trimmed = modelId.trim();
        if (!trimmed) return;
        set((state) => {
          const existing = state.customModelsByProvider[provider] || [];
          const nextCustom = existing.includes(trimmed) ? existing : [...existing, trimmed];
          const currentModels = state.availableModelsByProvider[provider] || [];
          const hasModel = currentModels.some((m) => m.id === trimmed);
          const mergedModels = hasModel
            ? currentModels
            : [
                ...currentModels,
                {
                  id: trimmed,
                  name: trimmed,
                  description: 'Custom model ID',
                  inputTokenLimit: 0,
                  outputTokenLimit: 0,
                },
              ];

          return {
            customModelsByProvider: {
              ...state.customModelsByProvider,
              [provider]: nextCustom,
            },
            availableModelsByProvider: {
              ...state.availableModelsByProvider,
              [provider]: mergedModels,
            },
            availableModels: provider === state.activeProvider ? mergedModels : state.availableModels,
          };
        });
      },

      setProviderBaseUrl: async (provider, baseUrl) => {
        const normalized = baseUrl.trim();
        set((state) => ({
          providerBaseUrls: {
            ...state.providerBaseUrls,
            [provider]: normalized,
          },
        }));
        await useAuthStore.getState().setProviderBaseUrl(provider, normalized);
        const state = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(state),
        );
      },

      setMediaRouting: async (routing) => {
        set((state) => ({
          mediaRouting: {
            ...state.mediaRouting,
            ...routing,
          },
          mediaRoutingCustomized: true,
        }));
        const state = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(state),
        );
      },

      setExternalSearchProvider: async (provider) => {
        set({ externalSearchProvider: provider });
        const state = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(state),
        );
      },

      setMemorySettings: async (updates) => {
        set((state) => ({
          memory: {
            ...state.memory,
            ...updates,
            maxInPrompt:
              typeof updates.maxInPrompt === 'number' && updates.maxInPrompt > 0
                ? Math.max(1, Math.min(20, Math.floor(updates.maxInPrompt)))
                : state.memory.maxInPrompt,
            style:
              updates.style === 'conservative' ||
              updates.style === 'balanced' ||
              updates.style === 'aggressive'
                ? updates.style
                : state.memory.style,
          },
        }));
        const state = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(state),
        );
      },

      setCommandSandbox: async (updates) => {
        set((state) => {
          const merged = normalizeCommandSandbox(
            {
              ...state.commandSandbox,
              ...updates,
            },
            state.permissionDefaults,
          );

          return {
            commandSandbox: merged,
            permissionDefaults: {
              ...state.permissionDefaults,
              allowedPaths: [...merged.allowedPaths],
              deniedPaths: [...merged.deniedPaths],
              trustedCommands: [...merged.trustedCommands],
            },
          };
        });

        const state = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(state),
        );
      },

      updateExternalCliSettings: async (provider, updates) => {
        set((state) => ({
          externalCli: {
            ...state.externalCli,
            [provider]: {
              ...state.externalCli[provider],
              ...updates,
            },
          },
        }));

        const state = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(state),
        );
      },

      loadSoulProfiles: async () => {
        set({ soulsLoading: true, error: null });
        try {
          const payload = await invokeAgentCommand<SoulCatalogPayload>('souls_list', {});
          const normalized = normalizeSoulCatalog(payload);
          const current = useSettingsStore.getState();
          const activeSoul = resolveActiveSoul(
            normalized.souls,
            current.activeSoulId,
            normalized.defaultSoulId,
          );

          set({
            souls: normalized.souls,
            defaultSoulId: normalized.defaultSoulId,
            activeSoulId: activeSoul.id,
            projectSoulsDirectory: normalized.projectSoulsDirectory,
            userSoulsDirectory: normalized.userSoulsDirectory,
            soulsLoading: false,
          });

          const next = useSettingsStore.getState();
          await useAuthStore.getState().applyRuntimeConfig(
            buildRuntimeConfigFromSettings(next),
          );
        } catch (error) {
          const fallbackSoul = resolveActiveSoul(
            useSettingsStore.getState().souls,
            useSettingsStore.getState().activeSoulId,
            useSettingsStore.getState().defaultSoulId,
          );
          set({
            soulsLoading: false,
            souls: dedupeSouls([...useSettingsStore.getState().souls, { ...FALLBACK_SOUL_PROFILE }]),
            activeSoulId: fallbackSoul.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      setActiveSoul: async (soulId) => {
        const current = useSettingsStore.getState();
        const nextActive = resolveActiveSoul(current.souls, soulId, current.defaultSoulId);
        set({ activeSoulId: nextActive.id });
        const next = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(next),
        );
      },

      saveCustomSoul: async (title, content, existingSoulId) => {
        const payload = await invokeAgentCommand<{ soul: SoulProfile; catalog: SoulCatalogPayload }>(
          'souls_save_custom',
          {
            title,
            content,
            id: existingSoulId,
          },
        );
        const normalized = normalizeSoulCatalog(payload.catalog);
        const activeSoul = resolveActiveSoul(
          normalized.souls,
          payload.soul.id,
          normalized.defaultSoulId,
        );

        set({
          souls: normalized.souls,
          defaultSoulId: normalized.defaultSoulId,
          activeSoulId: activeSoul.id,
          projectSoulsDirectory: normalized.projectSoulsDirectory,
          userSoulsDirectory: normalized.userSoulsDirectory,
        });

        const next = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(next),
        );
      },

      deleteCustomSoul: async (soulId) => {
        const payload = await invokeAgentCommand<{ catalog: SoulCatalogPayload }>(
          'souls_delete_custom',
          { id: soulId },
        );
        const normalized = normalizeSoulCatalog(payload.catalog);
        const current = useSettingsStore.getState();
        const activeSoul = resolveActiveSoul(
          normalized.souls,
          current.activeSoulId === soulId ? normalized.defaultSoulId : current.activeSoulId,
          normalized.defaultSoulId,
        );

        set({
          souls: normalized.souls,
          defaultSoulId: normalized.defaultSoulId,
          activeSoulId: activeSoul.id,
          projectSoulsDirectory: normalized.projectSoulsDirectory,
          userSoulsDirectory: normalized.userSoulsDirectory,
        });

        const next = useSettingsStore.getState();
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(next),
        );
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

      // Skills marketplace management
      updateSkillsSettings: (updates) => {
        set((state) => ({
          skillsSettings: { ...state.skillsSettings, ...updates },
        }));
      },

      addCustomSkillDir: (path) => {
        set((state) => ({
          skillsSettings: {
            ...state.skillsSettings,
            customDirs: [
              ...state.skillsSettings.customDirs.filter((p) => p !== path),
              path,
            ],
          },
        }));
      },

      removeCustomSkillDir: (path) => {
        set((state) => ({
          skillsSettings: {
            ...state.skillsSettings,
            customDirs: state.skillsSettings.customDirs.filter((p) => p !== path),
          },
        }));
      },

      addInstalledSkillConfig: (config) => {
        set((state) => ({
          installedSkillConfigs: [
            ...state.installedSkillConfigs.filter((c) => c.id !== config.id),
            config,
          ],
        }));
        void useSettingsStore.getState().syncInstalledSkills();
      },

      removeInstalledSkillConfig: (skillId) => {
        set((state) => ({
          installedSkillConfigs: state.installedSkillConfigs.filter((c) => c.id !== skillId),
        }));
        void useSettingsStore.getState().syncInstalledSkills();
      },

      updateInstalledSkillConfig: (skillId, updates) => {
        set((state) => ({
          installedSkillConfigs: state.installedSkillConfigs.map((c) =>
            c.id === skillId ? { ...c, ...updates } : c
          ),
        }));
        void useSettingsStore.getState().syncInstalledSkills();
      },

      toggleInstalledSkillEnabled: (skillId) => {
        set((state) => ({
          installedSkillConfigs: state.installedSkillConfigs.map((c) =>
            c.id === skillId ? { ...c, enabled: !c.enabled } : c
          ),
        }));
        void useSettingsStore.getState().syncInstalledSkills();
      },

      syncInstalledSkills: async () => {
        const { installedSkillConfigs } = useSettingsStore.getState();
        // Convert to SkillConfig format for backend
        const skills: SkillConfig[] = installedSkillConfigs.map((c) => ({
          id: c.id,
          name: c.name,
          path: '', // Path is resolved by the backend skill service
          description: '',
          enabled: c.enabled,
        }));

        try {
          await invoke('agent_set_skills', { skills });
        } catch (error) {
          console.warn('Failed to sync installed skills:', error);
        }
      },

      // Commands marketplace management
      addInstalledCommandConfig: (config) => {
        set((state) => {
          // Check if already exists
          const exists = state.installedCommandConfigs.some((c) => c.name === config.name);
          if (exists) {
            return state;
          }
          return {
            installedCommandConfigs: [...state.installedCommandConfigs, config],
          };
        });
      },

      removeInstalledCommandConfig: (commandId) => {
        set((state) => ({
          installedCommandConfigs: state.installedCommandConfigs.filter((c) => c.id !== commandId),
        }));
      },

      updateInstalledCommandConfig: (commandId, updates) => {
        set((state) => ({
          installedCommandConfigs: state.installedCommandConfigs.map((c) =>
            c.id === commandId ? { ...c, ...updates } : c
          ),
        }));
      },

      toggleInstalledCommandEnabled: (commandId) => {
        set((state) => ({
          installedCommandConfigs: state.installedCommandConfigs.map((c) =>
            c.id === commandId ? { ...c, enabled: !c.enabled } : c
          ),
        }));
      },

      // Connectors marketplace management
      addInstalledConnectorConfig: (config) => {
        set((state) => ({
          installedConnectorConfigs: [
            ...state.installedConnectorConfigs.filter((c) => c.id !== config.id),
            config,
          ],
        }));
        void useSettingsStore.getState().syncInstalledConnectors();
      },

      removeInstalledConnectorConfig: (connectorId) => {
        set((state) => ({
          installedConnectorConfigs: state.installedConnectorConfigs.filter((c) => c.id !== connectorId),
        }));
        void useSettingsStore.getState().syncInstalledConnectors();
      },

      updateInstalledConnectorConfig: (connectorId, updates) => {
        set((state) => ({
          installedConnectorConfigs: state.installedConnectorConfigs.map((c) =>
            c.id === connectorId ? { ...c, ...updates } : c
          ),
        }));
        void useSettingsStore.getState().syncInstalledConnectors();
      },

      toggleInstalledConnectorEnabled: (connectorId) => {
        set((state) => ({
          installedConnectorConfigs: state.installedConnectorConfigs.map((c) =>
            c.id === connectorId ? { ...c, enabled: !c.enabled } : c
          ),
        }));
        void useSettingsStore.getState().syncInstalledConnectors();
      },

      syncInstalledConnectors: async () => {
        // Connectors are managed by the connector-store which syncs with the sidecar
        // This function is called to ensure persistence is triggered
        // Actual connection state is managed by connector-store
      },

      // Specialized models management
      updateSpecializedModel: async (key, value) => {
        const normalized = normalizeSpecializedModelValue(key, value);
        set((state) => ({
          specializedModels: { ...state.specializedModels, [key]: normalized },
          specializedModelsV2: {
            ...state.specializedModelsV2,
            google: {
              ...state.specializedModelsV2.google,
              [key]: normalized,
            },
          },
        }));
        await useSettingsStore.getState().syncSpecializedModels();
      },

      updateSpecializedModelV2: async (provider, key, value) => {
        const trimmed = value.trim();
        set((state) => {
          if (provider === 'google') {
            const safeKey = key as keyof SpecializedModelsV2['google'];
            const normalized = normalizeSpecializedModelValue(
              safeKey as keyof SpecializedModels,
              trimmed,
            );
            return {
              specializedModelsV2: {
                ...state.specializedModelsV2,
                google: {
                  ...state.specializedModelsV2.google,
                  [safeKey]: normalized,
                },
              },
              specializedModels: {
                ...state.specializedModels,
                [safeKey]: normalized,
              },
            };
          }

          if (provider === 'openai') {
            const safeKey = key as keyof SpecializedModelsV2['openai'];
            return {
              specializedModelsV2: {
                ...state.specializedModelsV2,
                openai: {
                  ...state.specializedModelsV2.openai,
                  [safeKey]: trimmed,
                },
              },
            };
          }

          const safeKey = key as keyof SpecializedModelsV2['fal'];
          return {
            specializedModelsV2: {
              ...state.specializedModelsV2,
              fal: {
                ...state.specializedModelsV2.fal,
                [safeKey]: trimmed,
              },
            },
          };
        });
        await useSettingsStore.getState().syncSpecializedModels();
      },

      syncSpecializedModels: async () => {
        const { specializedModels } = useSettingsStore.getState();
        try {
          await invoke('agent_set_specialized_models', { models: specializedModels });
        } catch (error) {
          console.warn('Failed to sync specialized models:', error);
        }
        await useAuthStore.getState().applyRuntimeConfig(
          buildRuntimeConfigFromSettings(useSettingsStore.getState()),
        );
      },

      // Permission management
      updatePermissionDefaults: (updates) => {
        set((state) => ({
          permissionDefaults: {
            ...state.permissionDefaults,
            ...updates,
          },
          commandSandbox: normalizeCommandSandbox(
            {
              ...state.commandSandbox,
              allowedPaths:
                Array.isArray(updates.allowedPaths)
                  ? updates.allowedPaths
                  : state.commandSandbox.allowedPaths,
              deniedPaths:
                Array.isArray(updates.deniedPaths)
                  ? updates.deniedPaths
                  : state.commandSandbox.deniedPaths,
              trustedCommands:
                Array.isArray(updates.trustedCommands)
                  ? updates.trustedCommands
                  : state.commandSandbox.trustedCommands,
            },
            {
              ...state.permissionDefaults,
              ...updates,
            },
          ),
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
          commandSandbox: {
            ...state.commandSandbox,
            allowedPaths: [
              ...state.commandSandbox.allowedPaths.filter((p) => p !== path),
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
          commandSandbox: {
            ...state.commandSandbox,
            allowedPaths: state.commandSandbox.allowedPaths.filter((p) => p !== path),
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
          commandSandbox: {
            ...state.commandSandbox,
            deniedPaths: [
              ...state.commandSandbox.deniedPaths.filter((p) => p !== path),
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
          commandSandbox: {
            ...state.commandSandbox,
            deniedPaths: state.commandSandbox.deniedPaths.filter((p) => p !== path),
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
          commandSandbox: {
            ...state.commandSandbox,
            trustedCommands: [
              ...state.commandSandbox.trustedCommands.filter((c) => c !== command),
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
          commandSandbox: {
            ...state.commandSandbox,
            trustedCommands: state.commandSandbox.trustedCommands.filter((c) => c !== command),
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

      toggleRightPanelSection: (section) => {
        set((state) => ({
          rightPanelSections: {
            ...state.rightPanelSections,
            [section]: !state.rightPanelSections[section],
          },
        }));
      },

      toggleSessionListFilter: (filter) => {
        set((state) => ({
          sessionListFilters: {
            ...state.sessionListFilters,
            [filter]: !state.sessionListFilters[filter],
          },
        }));
      },

      setSessionListFilters: (filters) => {
        set((state) => ({
          sessionListFilters: {
            ...state.sessionListFilters,
            ...filters,
          },
        }));
      },

      toggleAutomationListFilter: (filter) => {
        set((state) => {
          const next = {
            ...state.automationListFilters,
            [filter]: !state.automationListFilters[filter],
          };

          // Keep at least one filter enabled to avoid empty list confusion.
          if (!next.pending && !next.completed && !next.failed) {
            next.pending = true;
          }

          return { automationListFilters: next };
        });
      },

      setAutomationListFilters: (filters) => {
        set((state) => {
          const next = {
            ...state.automationListFilters,
            ...filters,
          };

          if (!next.pending && !next.completed && !next.failed) {
            next.pending = true;
          }

          return { automationListFilters: next };
        });
      },

      clearError: () => {
        set({ error: null });
      },

      // Live Browser View actions
      setLiveViewOpen: (open) => set({ liveViewOpen: open }),

      setLiveViewSplitRatio: (ratio) => {
        // Clamp ratio between 0.3 and 0.7 to ensure min panel widths
        const clampedRatio = Math.max(0.3, Math.min(0.7, ratio));
        set({ liveViewSplitRatio: clampedRatio });
      },

      closeLiveView: () => set({ liveViewOpen: false }),
    }),
    {
      name: 'settings-store',
      partialize: (state) => ({
        userName: state.userName,
        activeProvider: state.activeProvider,
        defaultWorkingDirectory: state.defaultWorkingDirectory,
        theme: state.theme,
        fontSize: state.fontSize,
        showLineNumbers: state.showLineNumbers,
        autoSave: state.autoSave,
        selectedModel: state.selectedModel,
        selectedModelByProvider: state.selectedModelByProvider,
        temperature: state.temperature,
        maxOutputTokens: state.maxOutputTokens,
        customModelsByProvider: state.customModelsByProvider,
        providerBaseUrls: state.providerBaseUrls,
        specializedModels: state.specializedModels,
        specializedModelsV2: state.specializedModelsV2,
        mediaRouting: state.mediaRouting,
        mediaRoutingCustomized: state.mediaRoutingCustomized,
        externalSearchProvider: state.externalSearchProvider,
        memory: state.memory,
        activeSoulId: state.activeSoulId,
        defaultSoulId: state.defaultSoulId,
        permissionDefaults: state.permissionDefaults,
        approvalMode: state.approvalMode,
        commandSandbox: state.commandSandbox,
        externalCli: state.externalCli,
        mcpServers: state.mcpServers,
        skillsSettings: state.skillsSettings,
        installedSkillConfigs: state.installedSkillConfigs,
        installedCommandConfigs: state.installedCommandConfigs, // Persist installed commands
        installedConnectorConfigs: state.installedConnectorConfigs, // Persist installed connectors
        sidebarCollapsed: state.sidebarCollapsed,
        rightPanelCollapsed: state.rightPanelCollapsed,
        rightPanelPinned: state.rightPanelPinned,
        rightPanelTab: state.rightPanelTab,
        viewMode: state.viewMode,
        rightPanelSections: state.rightPanelSections,
        sessionListFilters: state.sessionListFilters,
        automationListFilters: state.automationListFilters,
        // liveViewOpen is intentionally NOT persisted - should always start closed
        liveViewSplitRatio: state.liveViewSplitRatio,
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
        const mergedPermissionDefaults: PermissionDefaults = {
          ...defaultPermissions,
          ...(persisted?.permissionDefaults || {}),
        };
        const validCommandSandbox = normalizeCommandSandbox(
          persisted?.commandSandbox,
          mergedPermissionDefaults,
        );
        const persistedExternalCli = persisted?.externalCli;
        const validExternalCli: ExternalCliSettings = {
          codex: {
            enabled: persistedExternalCli?.codex?.enabled ?? DEFAULT_EXTERNAL_CLI_SETTINGS.codex.enabled,
            allowBypassPermissions:
              persistedExternalCli?.codex?.allowBypassPermissions ??
              DEFAULT_EXTERNAL_CLI_SETTINGS.codex.allowBypassPermissions,
          },
          claude: {
            enabled: persistedExternalCli?.claude?.enabled ?? DEFAULT_EXTERNAL_CLI_SETTINGS.claude.enabled,
            allowBypassPermissions:
              persistedExternalCli?.claude?.allowBypassPermissions ??
              DEFAULT_EXTERNAL_CLI_SETTINGS.claude.allowBypassPermissions,
          },
        };

        const validSpecializedModels = normalizeSpecializedModels(persisted?.specializedModels);
        const persistedActiveProvider = persisted?.activeProvider;
        const validActiveProvider: ProviderId =
          persistedActiveProvider &&
          ['google', 'openai', 'anthropic', 'openrouter', 'moonshot', 'glm', 'deepseek', 'lmstudio'].includes(
            persistedActiveProvider,
          )
            ? (persistedActiveProvider as ProviderId)
            : initialState.activeProvider;

        const persistedExternalSearch = persisted?.externalSearchProvider;
        const validExternalSearchProvider: ExternalSearchProvider =
          persistedExternalSearch === 'exa' || persistedExternalSearch === 'tavily'
            ? persistedExternalSearch
            : DEFAULT_EXTERNAL_SEARCH_PROVIDER;
        const persistedMemory = persisted?.memory;
        const validMemory: MemorySettings = {
          enabled:
            typeof persistedMemory?.enabled === 'boolean'
              ? persistedMemory.enabled
              : DEFAULT_MEMORY_SETTINGS.enabled,
          autoExtract:
            typeof persistedMemory?.autoExtract === 'boolean'
              ? persistedMemory.autoExtract
              : DEFAULT_MEMORY_SETTINGS.autoExtract,
          maxInPrompt:
            typeof persistedMemory?.maxInPrompt === 'number' && persistedMemory.maxInPrompt > 0
              ? Math.max(1, Math.min(20, Math.floor(persistedMemory.maxInPrompt)))
              : DEFAULT_MEMORY_SETTINGS.maxInPrompt,
          style:
            persistedMemory?.style === 'conservative' ||
            persistedMemory?.style === 'balanced' ||
            persistedMemory?.style === 'aggressive'
              ? persistedMemory.style
              : DEFAULT_MEMORY_SETTINGS.style,
        };
        const persistedActiveSoulId =
          typeof persisted?.activeSoulId === 'string' ? persisted.activeSoulId.trim() : '';
        const persistedDefaultSoulId =
          typeof persisted?.defaultSoulId === 'string' ? persisted.defaultSoulId.trim() : '';

        const persistedSpecializedV2 = persisted?.specializedModelsV2;
        const validSpecializedModelsV2: SpecializedModelsV2 = {
          google: normalizeSpecializedModels(persistedSpecializedV2?.google || validSpecializedModels),
          openai: {
            imageGeneration:
              persistedSpecializedV2?.openai?.imageGeneration?.trim() ||
              DEFAULT_SPECIALIZED_MODELS_V2.openai.imageGeneration,
            videoGeneration:
              persistedSpecializedV2?.openai?.videoGeneration?.trim() ||
              DEFAULT_SPECIALIZED_MODELS_V2.openai.videoGeneration,
          },
          fal: {
            imageGeneration:
              persistedSpecializedV2?.fal?.imageGeneration?.trim() ||
              DEFAULT_SPECIALIZED_MODELS_V2.fal.imageGeneration,
            videoGeneration:
              persistedSpecializedV2?.fal?.videoGeneration?.trim() ||
              DEFAULT_SPECIALIZED_MODELS_V2.fal.videoGeneration,
          },
        };

        const persistedMediaRouting = persisted?.mediaRouting;
        const mediaRoutingCustomized = persisted?.mediaRoutingCustomized ?? false;
        const validMediaRouting: MediaRoutingSettings = {
          imageBackend: ['google', 'openai', 'fal'].includes(String(persistedMediaRouting?.imageBackend))
            ? (persistedMediaRouting?.imageBackend as MediaRoutingSettings['imageBackend'])
            : DEFAULT_MEDIA_ROUTING.imageBackend,
          videoBackend: ['google', 'openai', 'fal'].includes(String(persistedMediaRouting?.videoBackend))
            ? (persistedMediaRouting?.videoBackend as MediaRoutingSettings['videoBackend'])
            : DEFAULT_MEDIA_ROUTING.videoBackend,
        };
        const autoMediaRouting: MediaRoutingSettings =
          validActiveProvider === 'openai'
            ? { imageBackend: 'openai', videoBackend: 'openai' }
            : { imageBackend: 'google', videoBackend: 'google' };
        const resolvedMediaRouting = mediaRoutingCustomized ? validMediaRouting : autoMediaRouting;

        const persistedSelectedByProvider = persisted?.selectedModelByProvider || {};
        const selectedModelByProvider = {
          ...persistedSelectedByProvider,
          google: persistedSelectedByProvider.google || validModel,
        };

        const activeSelectedModel = selectedModelByProvider[validActiveProvider] || validModel;

        // Migrate installedCommandConfigs to include enabled field (backward compat)
        const migratedCommandConfigs = (persisted?.installedCommandConfigs || []).map(
          (c: InstalledCommandConfig & { enabled?: boolean }) => ({
            ...c,
            enabled: c.enabled !== undefined ? c.enabled : true,
          })
        );

        const persistedSessionListFilters = persisted?.sessionListFilters;
        const validSessionListFilters: SessionListFilters = {
          chat: persistedSessionListFilters?.chat ?? initialState.sessionListFilters.chat,
          shared: persistedSessionListFilters?.shared ?? initialState.sessionListFilters.shared,
          cron: persistedSessionListFilters?.cron ?? initialState.sessionListFilters.cron,
        };

        const persistedAutomationListFilters = persisted?.automationListFilters;
        const validAutomationListFilters: AutomationListFilters = {
          pending: persistedAutomationListFilters?.pending ?? initialState.automationListFilters.pending,
          completed: persistedAutomationListFilters?.completed ?? initialState.automationListFilters.completed,
          failed: persistedAutomationListFilters?.failed ?? initialState.automationListFilters.failed,
        };

        if (!validAutomationListFilters.pending && !validAutomationListFilters.completed && !validAutomationListFilters.failed) {
          validAutomationListFilters.pending = true;
        }

        return {
          ...currentState,
          ...persisted,
          activeProvider: validActiveProvider,
          approvalMode: validMode,
          selectedModel: activeSelectedModel,
          selectedModelByProvider,
          specializedModels: validSpecializedModels,
          specializedModelsV2: validSpecializedModelsV2,
          mediaRouting: resolvedMediaRouting,
          mediaRoutingCustomized,
          externalSearchProvider: validExternalSearchProvider,
          memory: validMemory,
          activeSoulId: persistedActiveSoulId || DEFAULT_SOUL_ID,
          defaultSoulId: persistedDefaultSoulId || DEFAULT_SOUL_ID,
          permissionDefaults: mergedPermissionDefaults,
          commandSandbox: validCommandSandbox,
          externalCli: validExternalCli,
          installedCommandConfigs: migratedCommandConfigs,
          sessionListFilters: validSessionListFilters,
          automationListFilters: validAutomationListFilters,
        };
      },
      // Sync with backend when store rehydrates from storage
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Sync installed skills with backend on startup
          // Use setTimeout to ensure it runs after store is fully initialized
          setTimeout(() => {
            void state.syncInstalledSkills();
            void useAuthStore.getState().setActiveProvider(state.activeProvider);
            void state.loadSoulProfiles();
          }, 100);
        }
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
export const useCommandSandboxSettings = () =>
  useSettingsStore((state) => state.commandSandbox);
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
export const useRightPanelSections = () =>
  useSettingsStore((state) => state.rightPanelSections);
export const useSpecializedModels = () =>
  useSettingsStore((state) => state.specializedModels);
export const useLiveViewOpen = () =>
  useSettingsStore((state) => state.liveViewOpen);
export const useLiveViewSplitRatio = () =>
  useSettingsStore((state) => state.liveViewSplitRatio);
export const useUserName = () =>
  useSettingsStore((state) => state.userName);
export const useInstalledConnectorConfigs = () =>
  useSettingsStore((state) => state.installedConnectorConfigs);
export const useActiveProvider = () =>
  useSettingsStore((state) => state.activeProvider);
export const useMediaRoutingSettings = () =>
  useSettingsStore((state) => state.mediaRouting);
export const useSpecializedModelsV2 = () =>
  useSettingsStore((state) => state.specializedModelsV2);
export const useExternalSearchProvider = () =>
  useSettingsStore((state) => state.externalSearchProvider);
export const useMemorySettings = () =>
  useSettingsStore((state) => state.memory);
export const useSoulProfiles = () =>
  useSettingsStore((state) => state.souls);
export const useActiveSoulId = () =>
  useSettingsStore((state) => state.activeSoulId);
export const useSoulsLoading = () =>
  useSettingsStore((state) => state.soulsLoading);
