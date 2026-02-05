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
  title?: string;
  type?: SessionType;
}

export interface SendMessageParams {
  sessionId: string;
  content: string;
  attachments?: Attachment[];
}

export interface RespondPermissionParams {
  sessionId: string;
  permissionId: string;
  decision: PermissionDecision;
}

export type ApprovalMode = 'auto' | 'read_only' | 'full';

export interface SetApprovalModeParams {
  sessionId: string;
  mode: ApprovalMode;
}

export interface SetModelsParams {
  models: Array<{
    id: string;
    name?: string;
    description?: string;
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
// Response Types
// ============================================================================

export interface SessionInfo {
  id: string;
  type: SessionType;
  title: string | null;
  firstMessage: string | null;
  workingDirectory: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface SessionDetails extends SessionInfo {
  messages: Message[];
  tasks?: Task[];
  artifacts?: Artifact[];
  toolExecutions?: ToolExecution[];
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
  | 'thinking:start'
  | 'thinking:chunk'
  | 'thinking:done'
  | 'tool:start'
  | 'tool:result'
  | 'permission:request'
  | 'permission:resolved'
  | 'question:ask'
  | 'question:answered'
  | 'task:create'
  | 'task:update'
  | 'task:set'
  | 'artifact:created'
  | 'research:progress'
  | 'context:update'
  | 'session:updated'
  | 'browserView:screenshot'
  | 'error';

export interface QuestionRequest {
  id: string;
  question: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
  header?: string;
  timestamp: number;
}

export interface QuestionOption {
  label: string;
  description?: string;
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
