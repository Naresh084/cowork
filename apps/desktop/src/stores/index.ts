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
  // Legacy compatibility
  useMemoryEntries,
  useMemoryEntriesByCategory,
  useIsMemoryDirty,
  type Memory,
  type MemoryEntry,
  type MemoryGroup,
  type MemorySource,
  type ScoredMemory,
  type CreateMemoryInput,
  type UpdateMemoryInput,
} from './memory-store';

// Command Store (Simplified - frontend only)
export {
  useCommandStore,
  useCommands,
  useIsPaletteOpen,
  usePaletteQuery,
  parseCommandInput,
  isCommandInput,
  type SlashCommand,
  type CommandCategory,
} from './command-store';
