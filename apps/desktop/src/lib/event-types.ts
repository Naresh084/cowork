import type { Message, PermissionRequest } from '@gemini-cowork/shared';
import type { Task, Artifact } from '../stores/agent-store';

/**
 * Tool call information for events
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  toolCallId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * Extended permission request with additional context
 */
export interface ExtendedPermissionRequest extends PermissionRequest {
  id: string;
  sessionId: string;
  toolName?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  createdAt: number;
}

/**
 * Question option for agent questions
 */
export interface QuestionOption {
  label: string;
  description?: string;
}

/**
 * Question request from the agent
 */
export interface QuestionRequest {
  id: string;
  question: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
  header?: string;
  timestamp: number;
}

/**
 * All possible agent event types
 */
export type AgentEvent =
  // Streaming events
  | { type: 'stream:start'; sessionId: string }
  | { type: 'stream:chunk'; sessionId: string; content: string }
  | {
      type: 'stream:done';
      sessionId: string;
      message: Message;
    }
  // Tool execution events
  | { type: 'tool:start'; sessionId: string; toolCall: ToolCall }
  | {
      type: 'tool:result';
      sessionId: string;
      toolCallId: string;
      result: ToolResult;
    }
  // Permission events
  | {
      type: 'permission:request';
      sessionId: string;
      request: ExtendedPermissionRequest;
    }
  | {
      type: 'permission:resolved';
      sessionId: string;
      permissionId: string;
      decision: 'allow' | 'deny';
    }
  // Question events (for agent asking user questions)
  | {
      type: 'question:ask';
      sessionId: string;
      request: QuestionRequest;
    }
  | {
      type: 'question:answered';
      sessionId: string;
      questionId: string;
      answer: string | string[];
    }
  // Task events
  | { type: 'task:create'; sessionId: string; task: Task }
  | { type: 'task:update'; sessionId: string; task: Task }
  | { type: 'task:delete'; sessionId: string; taskId: string }
  // Artifact events
  | { type: 'artifact:created'; sessionId: string; artifact: Artifact }
  | { type: 'artifact:updated'; sessionId: string; artifact: Artifact }
  | { type: 'artifact:deleted'; sessionId: string; artifactId: string }
  // Context events
  | {
      type: 'context:update';
      sessionId: string;
      used: number;
      total: number;
    }
  | {
      type: 'research:progress';
      sessionId: string;
      status: string;
      progress: number;
    }
  // Error events
  | {
      type: 'error';
      sessionId: string;
      error: string;
      code?: string;
      recoverable?: boolean;
    }
  // Session events
  | {
      type: 'session:updated';
      sessionId: string;
      title?: string;
      messageCount?: number;
    }
  // Agent state events
  | { type: 'agent:started'; sessionId: string }
  | { type: 'agent:stopped'; sessionId: string };

/**
 * Event handler function type
 */
export type AgentEventHandler = (event: AgentEvent) => void;

/**
 * Tauri event payload structure (from Rust backend)
 */
export interface TauriEventPayload {
  type: string;
  sessionId?: string;
  data: unknown;
}

/**
 * Map of Tauri event names to their corresponding AgentEvent types
 */
export const TAURI_EVENT_NAMES = [
  'agent:stream:start',
  'agent:stream:chunk',
  'agent:stream:done',
  'agent:tool:start',
  'agent:tool:result',
  'agent:permission:request',
  'agent:permission:resolved',
  'agent:question:ask',
  'agent:question:answered',
  'agent:task:create',
  'agent:task:update',
  'agent:task:delete',
  'agent:artifact:created',
  'agent:artifact:updated',
  'agent:artifact:deleted',
  'agent:context:update',
  'agent:research:progress',
  'agent:error',
  'agent:session:updated',
  'agent:started',
  'agent:stopped',
] as const;

export type TauriEventName = (typeof TAURI_EVENT_NAMES)[number];
