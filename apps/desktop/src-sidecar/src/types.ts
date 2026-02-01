import type { Message, PermissionRequest, PermissionDecision } from '@gemini-cowork/shared';

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

export interface StopGenerationParams {
  sessionId: string;
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
  title: string | null;
  workingDirectory: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface SessionDetails extends SessionInfo {
  messages: Message[];
}

export interface Attachment {
  type: 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'other';
  mimeType: string;
  data: string; // base64
  name: string;
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
  | 'tool:start'
  | 'tool:result'
  | 'permission:request'
  | 'permission:resolved'
  | 'task:create'
  | 'task:update'
  | 'artifact:created'
  | 'context:update'
  | 'session:updated'
  | 'error';

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
  type: 'created' | 'modified' | 'deleted';
  language?: string;
  content?: string;
  previousContent?: string;
  timestamp: number;
}

export interface ToolExecution {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface ExtendedPermissionRequest extends PermissionRequest {
  id: string;
  riskLevel: 'safe' | 'moderate' | 'dangerous';
  riskAnalysis?: {
    concerns: string[];
    mitigations: string[];
  };
  command?: string;
  toolName?: string;
  timestamp: number;
}
