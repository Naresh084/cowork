import type { Message, PermissionRequest, PermissionDecision, SessionType } from '@gemini-cowork/shared';

// Re-export types for use in persistence types
export type { Message, SessionType };

// ============================================================================
// IPC Message Types
// ============================================================================

export interface IPCRequest {
  id: string;
  command: string; // Rust sends 'command', not 'method'
  params: Record<string, unknown>;
  authToken?: string;
}

export interface IPCResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface IPCEvent {
  type: string;
  sessionId?: string;
  payload: unknown;
}

// ============================================================================
// Command Parameters
// ============================================================================

export interface CreateSessionParams {
  workingDirectory: string;
  model?: string;
  provider?: ProviderId;
  executionMode?: ExecutionMode;
  title?: string;
  type?: SessionType;
}

export interface SendMessageParams {
  sessionId: string;
  content: string;
  attachments?: Attachment[];
}

export interface SendMessageV2Params {
  sessionId: string;
  message: string;
  runOptions?: Record<string, unknown>;
  attachments?: Attachment[];
}

export interface ResumeRunParams {
  sessionId: string;
  runId: string;
}

export interface GetRunTimelineParams {
  runId: string;
}

export interface BranchSessionParams {
  sessionId: string;
  fromTurnId?: string;
  branchName: string;
}

export interface MergeBranchParams {
  sessionId: string;
  sourceBranchId: string;
  targetBranchId: string;
  strategy?: 'auto' | 'ours' | 'theirs' | 'manual';
}

export interface SetActiveBranchParams {
  sessionId: string;
  branchId: string;
}

export interface RespondPermissionParams {
  sessionId: string;
  permissionId: string;
  decision: PermissionDecision;
}

export type ApprovalMode = 'auto' | 'read_only' | 'full';
export type ExecutionMode = 'execute' | 'plan';

export interface SetApprovalModeParams {
  sessionId: string;
  mode: ApprovalMode;
}

export interface SetExecutionModeParams {
  sessionId: string;
  mode: ExecutionMode;
}

export interface SetModelsParams {
  models: Array<{
    id: string;
    name?: string;
    description?: string;
    provider?: ProviderId;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
  }>;
}
export interface StopGenerationParams {
  sessionId: string;
}

export interface RespondQuestionParams {
  sessionId: string;
  questionId: string;
  answer: string | string[];
}

export interface GetSessionParams {
  sessionId: string;
}

export interface ListSessionsPageParams {
  limit?: number;
  offset?: number;
  query?: string;
}

export interface GetSessionChunkParams extends GetSessionParams {
  chatItemLimit?: number;
  beforeSequence?: number;
}

export interface DeleteSessionParams {
  sessionId: string;
}

export interface LoadMemoryParams {
  workingDirectory: string;
}

export interface SaveMemoryParams {
  workingDirectory: string;
  entries: MemoryEntry[];
}

// ============================================================================
// Deep Memory System Parameters (New)
// ============================================================================

export interface MemoryCreateParams {
  workingDirectory: string;
  title: string;
  content: string;
  group: string;
  tags?: string[];
  source?: 'manual' | 'auto';
  confidence?: number;
}

export interface MemoryReadParams {
  workingDirectory: string;
  memoryId: string;
}

export interface MemoryUpdateParams {
  workingDirectory: string;
  memoryId: string;
  title?: string;
  content?: string;
  group?: string;
  tags?: string[];
}

export interface MemoryDeleteParams {
  workingDirectory: string;
  memoryId: string;
}

export interface MemoryListParams {
  workingDirectory: string;
  group?: string;
}

export interface MemorySearchParams {
  workingDirectory: string;
  query: string;
  limit?: number;
}

export interface MemoryGetRelevantParams {
  workingDirectory: string;
  context: string;
  limit?: number;
}

export interface MemoryGroupCreateParams {
  workingDirectory: string;
  groupName: string;
}

export interface MemoryGroupDeleteParams {
  workingDirectory: string;
  groupName: string;
}

export interface DeepMemoryQueryParams {
  sessionId: string;
  query: string;
  options?: Record<string, unknown>;
}

export interface DeepMemoryFeedbackParams {
  sessionId: string;
  queryId: string;
  atomId: string;
  feedback: 'positive' | 'negative' | 'pin' | 'unpin' | 'hide' | 'report_conflict';
  note?: string;
}

export interface DeepMemoryExportBundleParams {
  projectId: string;
  path: string;
  encrypted?: boolean;
}

export interface DeepMemoryImportBundleParams {
  projectId: string;
  path: string;
  mergeMode?: 'replace' | 'merge' | 'append';
}

export interface DeepMemoryMigrationReportParams {
  workingDirectory?: string;
  projectId?: string;
}

export interface BenchmarkRunSuiteParams {
  suiteId: string;
  profile?: string;
}

// ============================================================================
// Command System Parameters (New)
// ============================================================================

export interface CommandListParams {
  workingDirectory?: string;
  includeMarketplace?: boolean;
}

export interface CommandExecuteParams {
  commandName: string;
  args?: Record<string, unknown>;
  sessionId?: string;
  workingDirectory: string;
}

export interface CommandInstallParams {
  commandId: string;
  appDataDir: string;
}

export interface CommandUninstallParams {
  commandId: string;
  appDataDir: string;
}

export interface CommandGetParams {
  commandName: string;
  workingDirectory?: string;
}

// ============================================================================
// AGENTS.md Parameters (New)
// ============================================================================

export interface AgentsMdLoadParams {
  workingDirectory: string;
}

export interface AgentsMdGenerateParams {
  workingDirectory: string;
  force?: boolean;
}

export interface AgentsMdUpdateSectionParams {
  workingDirectory: string;
  section: string;
  content: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface SessionInfo {
  id: string;
  type: SessionType;
  provider: ProviderId;
  executionMode: ExecutionMode;
  title: string | null;
  firstMessage: string | null;
  workingDirectory: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  messageCount: number;
}

export interface SessionDetails extends SessionInfo {
  messages: Message[];               // Kept for Rust IPC compat (derived from chatItems)
  chatItems: import('@gemini-cowork/shared').ChatItem[];  // V2: sole source of truth
  tasks: Task[];
  artifacts: Artifact[];
  contextUsage?: { usedTokens: number; maxTokens: number; percentUsed: number };
  hasMoreHistory?: boolean;
  oldestLoadedSequence?: number | null;
  runtime?: SessionRuntimeState;
}

export type SessionRunState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'waiting_permission'
  | 'waiting_question'
  | 'retrying'
  | 'paused'
  | 'recovered'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stopping'
  | 'errored';

export interface RuntimeToolSnapshot {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  parentToolId?: string;
  startedAt?: number;
}

export interface SessionRuntimeState {
  version: 1;
  runState: SessionRunState;
  isStreaming: boolean;
  isThinking: boolean;
  activeTurnId?: string;
  activeToolIds: string[];
  activeTools?: RuntimeToolSnapshot[];
  pendingPermissions: ExtendedPermissionRequest[];
  pendingQuestions: QuestionRequest[];
  messageQueue: Array<{ id: string; content: string; queuedAt: number }>;
  permissionScopes?: Record<string, string[]>;
  permissionCache?: Record<string, PermissionDecision>;
  lastError?: {
    message: string;
    code?: string;
    timestamp: number;
  } | null;
  updatedAt: number;
}

export interface RuntimeBootstrapState {
  sessions: SessionInfo[];
  runtime: Record<string, SessionRuntimeState>;
  eventCursor: number;
  timestamp: number;
}

export interface SequencedEventEnvelope {
  seq: number;
  timestamp: number;
  type: string;
  sessionId: string | null;
  data: unknown;
}

export interface SessionListPage {
  sessions: SessionInfo[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
  nextOffset: number | null;
}

export type ProviderId =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'moonshot'
  | 'glm'
  | 'deepseek'
  | 'lmstudio';

export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface CommandSandboxSettings {
  mode: SandboxMode;
  allowNetwork: boolean;
  allowProcessSpawn: boolean;
  allowedPaths: string[];
  deniedPaths: string[];
  trustedCommands: string[];
  maxExecutionTimeMs: number;
  maxOutputBytes: number;
}

export interface MediaRoutingSettings {
  imageBackend: 'google' | 'openai' | 'fal';
  videoBackend: 'google' | 'openai' | 'fal';
}

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

export interface ExternalCliProviderRuntimeSettings {
  enabled: boolean;
  allowBypassPermissions: boolean;
}

export interface ExternalCliRuntimeConfig {
  codex: ExternalCliProviderRuntimeSettings;
  claude: ExternalCliProviderRuntimeSettings;
}

export interface RuntimeSoulProfile {
  id: string;
  title: string;
  content: string;
  source: 'preset' | 'custom';
  path?: string;
}

export type UxProfile = 'simple' | 'pro';

export type RuntimeMemoryStyle = 'conservative' | 'balanced' | 'aggressive';

export interface RuntimeMemoryRetrievalSettings {
  enabled: boolean;
  lexicalWeight: number;
  denseWeight: number;
  graphWeight: number;
  rerankWeight: number;
  maxResults: number;
}

export interface RuntimeMemoryConsolidationSettings {
  enabled: boolean;
  intervalMinutes: number;
  redundancyThreshold: number;
  decayFactor: number;
  minConfidence?: number;
  staleAfterHours?: number;
  strategy?: 'balanced' | 'aggressive' | 'conservative';
}

export interface RuntimeMemorySettings {
  enabled: boolean;
  autoExtract: boolean;
  maxInPrompt: number;
  style: RuntimeMemoryStyle;
  retrieval?: RuntimeMemoryRetrievalSettings;
  consolidation?: RuntimeMemoryConsolidationSettings;
}

export interface RuntimeConfig {
  activeProvider: ProviderId;
  uxProfile?: UxProfile;
  providerApiKeys?: Partial<Record<ProviderId, string>>;
  providerBaseUrls?: Partial<Record<ProviderId, string>>;
  googleApiKey?: string | null;
  openaiApiKey?: string | null;
  falApiKey?: string | null;
  exaApiKey?: string | null;
  tavilyApiKey?: string | null;
  externalSearchProvider?: 'google' | 'exa' | 'tavily';
  mediaRouting?: MediaRoutingSettings;
  specializedModels?: SpecializedModelsV2;
  sandbox?: CommandSandboxSettings;
  externalCli?: ExternalCliRuntimeConfig;
  activeSoul?: RuntimeSoulProfile | null;
  memory?: RuntimeMemorySettings;
}

export interface RuntimeConfigUpdateResult {
  appliedImmediately: boolean;
  requiresNewSession: boolean;
  reasons: string[];
  affectedSessionIds: string[];
}

export interface Attachment {
  type: 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'file' | 'other';
  mimeType: string;
  data: string; // base64
  name: string;
}

export interface SkillConfig {
  id: string;
  name: string;
  path: string;
  description?: string;
  enabled?: boolean;
}

export interface MemoryEntry {
  id: string;
  category: 'project' | 'preferences' | 'patterns' | 'context' | 'custom';
  content: string;
  createdAt: number;
  updatedAt?: number;
  source?: 'user' | 'agent';
}

// ============================================================================
// Event Types
// ============================================================================

export type AgentEventType =
  | 'stream:start'
  | 'stream:chunk'
  | 'stream:done'
  | 'run:checkpoint'
  | 'run:recovered'
  | 'run:fallback_applied'
  | 'run:stalled'
  | 'run:health'
  | 'thinking:start'
  | 'thinking:chunk'
  | 'thinking:done'
  | 'tool:start'
  | 'tool:result'
  | 'branch:created'
  | 'branch:merged'
  | 'workflow:activated'
  | 'workflow:fallback'
  | 'memory:retrieved'
  | 'memory:consolidated'
  | 'memory:conflict_detected'
  | 'benchmark:progress'
  | 'benchmark:score_updated'
  | 'release_gate:status'
  | 'permission:request'
  | 'permission:resolved'
  | 'question:ask'
  | 'question:answered'
  | 'task:create'
  | 'task:update'
  | 'task:set'
  | 'artifact:created'
  | 'research:progress'
  | 'research:evidence'
  | 'browser:progress'
  | 'browser:checkpoint'
  | 'browser:blocker'
  | 'context:update'
  | 'context:usage'
  | 'session:updated'
  | 'browserView:screenshot'
  | 'chat:item'
  | 'chat:update'
  | 'chat:items'
  | 'queue:update'
  | 'integration:status'
  | 'integration:qr'
  | 'integration:message_in'
  | 'integration:message_out'
  | 'integration:queued'
  | 'error';

export interface QuestionRequest {
  id: string;
  question: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
  header?: string;
  allowCustom?: boolean;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface QuestionOption {
  label: string;
  description?: string;
  value?: string;
}

export interface Task {
  id: string;
  subject: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  createdAt: number;
  completedAt?: number;
}

export interface Artifact {
  id: string;
  path: string;
  type: 'created' | 'modified' | 'deleted' | 'touched';
  language?: string;
  content?: string;
  previousContent?: string;
  url?: string;
  timestamp: number;
}

export interface ToolExecution {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
  /** If set, this tool is a sub-tool executed within a parent task tool */
  parentToolId?: string;
}

// Extended types for persistence - track tool-to-turn associations
export interface PersistedMessage extends Message {
  toolExecutionIds?: string[];
}

export interface PersistedToolExecution extends ToolExecution {
  turnMessageId: string;
  turnOrder: number;
  /** If set, this tool is a sub-tool executed within a parent task tool */
  parentToolId?: string;
}

export interface ExtendedPermissionRequest extends PermissionRequest {
  id: string;
  riskLevel: 'low' | 'medium' | 'high';
  riskAnalysis?: {
    concerns: string[];
    mitigations: string[];
  };
  command?: string;
  toolName?: string;
  timestamp: number;
}

export interface ErrorDetails {
  retryAfterSeconds?: number;
  quotaMetric?: string;
  model?: string;
  docsUrl?: string;
}
