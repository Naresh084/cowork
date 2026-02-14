// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

// Auth Store
export { useAuthStore } from './auth-store';

// Session Store
export {
  useSessionStore,
  useActiveSession,
  useSessions,
  useIsLoadingSessions,
  type SessionSummary,
  type SessionInfo,
} from './session-store';

// Chat Store
export {
  useChatStore,
  type Attachment,
  type ToolExecution,
  type ExtendedPermissionRequest,
} from './chat-store';

// Agent Store
export {
  useAgentStore,
  useSessionTasks,
  useActiveTasks,
  useCompletedTasks,
  useSessionArtifacts,
  useSessionContextUsage,
  useSessionResearchProgress,
  useSessionIsRunning,
  type Task,
  type Artifact,
  type ContextUsage,
} from './agent-store';

// Settings Store
export {
  useSettingsStore,
  useTheme,
  useFontSize,
  useSelectedModel,
  useMCPServers,
  usePermissionDefaults,
  useApprovalMode,
  useSidebarCollapsed,
  useRightPanelCollapsed,
  useRightPanelPinned,
  useRightPanelTab,
  useUserName,
  type MCPServerConfig,
  type PermissionDefaults,
  type ApprovalMode,
  type Theme,
  type FontSize,
} from './settings-store';

// Memory Store (Deep Agents)
export {
  useMemoryStore,
  useMemories,
  useMemoryGroups,
  useIsLoadingMemory,
  useIsCreatingMemory,
  useIsDeletingMemory,
  useSelectedGroup,
  useMemorySearchQuery,
  useSelectedMemoryId,
  useMemoryError,
  useDeepQueryResult,
  useDeepQueryAtoms,
  useDeepQueryLoading,
  useDeepFeedbackLog,
  useDeepFeedbackSubmitting,
  useLastDeepFeedback,
  useLastDeepQueryAt,
  // Legacy compatibility
  useMemoryEntries,
  useMemoryEntriesByCategory,
  useIsMemoryDirty,
  type Memory,
  type MemoryEntry,
  type MemoryGroup,
  type MemorySource,
  type ScoredMemory,
  type DeepMemoryFeedbackType,
  type DeepMemoryQueryOptions,
  type DeepMemoryQueryEvidence,
  type DeepMemoryAtom,
  type DeepMemoryQueryResult,
  type DeepMemoryFeedback,
  type DeepMemoryAtomView,
  type CreateMemoryInput,
  type UpdateMemoryInput,
} from './memory-store';

// Command Store (Marketplace-style)
export {
  useCommandStore,
  useCommands,
  useAvailableCommands,
  useIsDiscoveringCommands,
  useIsPaletteOpen,
  usePaletteQuery,
  useCommandSearchQuery,
  useCommandCategory,
  useCommandActiveTab,
  useSelectedCommandId,
  useCommandError,
  parseCommandInput,
  isCommandInput,
  type SlashCommand,
  type CommandCategory,
  type CommandManifest,
  type CommandFrontmatter,
  type CommandSource,
} from './command-store';
