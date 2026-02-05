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

// Command Store
export {
  useCommandStore,
  useCommands,
  useIsLoadingCommands,
  useIsExecutingCommand,
  useIsPaletteOpen,
  usePaletteQuery,
  useSelectedCommand,
  useCommandError,
  useLastCommandResult,
  parseCommandInput,
  isCommandInput,
  type Command,
  type CommandCategory,
  type CommandType,
  type CommandSource,
  type CommandArgument,
  type CommandResult,
} from './command-store';
