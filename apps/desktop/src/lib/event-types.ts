import type { Message, PermissionRequest, ChatItem } from '@gemini-cowork/shared';
import type { Task, Artifact } from '../stores/agent-store';

/**
 * Tool call information for events
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** If set, this tool is a sub-tool executed within a parent task tool */
  parentToolId?: string;
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
  /** If set, this tool is a sub-tool executed within a parent task tool */
  parentToolId?: string;
}

export interface ErrorDetails {
  retryAfterSeconds?: number;
  quotaMetric?: string;
  model?: string;
  docsUrl?: string;
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
  // Thinking events (agent's internal reasoning)
  | { type: 'thinking:start'; sessionId: string }
  | { type: 'thinking:chunk'; sessionId: string; content: string }
  | { type: 'thinking:done'; sessionId: string }
  // Tool execution events
  | { type: 'tool:start'; sessionId: string; toolCall: ToolCall; parentToolId?: string }
  | {
      type: 'tool:result';
      sessionId: string;
      toolCallId: string;
      result: ToolResult;
      parentToolId?: string;
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
      decision: 'allow' | 'deny' | 'allow_once' | 'allow_session';
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
  | { type: 'task:set'; sessionId: string; tasks: Task[] }
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
      details?: ErrorDetails;
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
  | { type: 'agent:stopped'; sessionId: string }
  // Browser View events (for live browser screenshot streaming)
  | {
      type: 'browserView:screenshot';
      sessionId: string;
      data: string;        // base64 PNG screenshot
      mimeType: string;    // 'image/png'
      url: string;         // current browser URL
      timestamp: number;   // when captured
    }
  // V2 Unified ChatItem events
  | {
      type: 'chat:item';
      sessionId: string;
      item: ChatItem;
    }
  | {
      type: 'chat:update';
      sessionId: string;
      itemId: string;
      updates: Partial<ChatItem>;
    }
  | {
      type: 'chat:items';
      sessionId: string;
      items: ChatItem[];
    }
  | {
      type: 'context:usage';
      sessionId: string;
      usedTokens: number;
      maxTokens: number;
      percentUsed: number;
    }
  // Integration events
  | {
      type: 'integration:status';
      sessionId: string;
      platform: string;
      connected: boolean;
      displayName?: string;
      error?: string;
      connectedAt?: number;
      lastMessageAt?: number;
    }
  | {
      type: 'integration:qr';
      sessionId: string;
      qrDataUrl: string;
    }
  | {
      type: 'integration:message_in';
      sessionId: string;
      platform: string;
      sender: string;
      content: string;
      timestamp: number;
    }
  | {
      type: 'integration:message_out';
      sessionId: string;
      platform: string;
      chatId: string;
      timestamp: number;
    }
  | {
      type: 'integration:queued';
      sessionId: string;
      platform: string;
      queueSize: number;
      timestamp: number;
    };

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
  'agent:thinking:start',
  'agent:thinking:chunk',
  'agent:thinking:done',
  'agent:tool:start',
  'agent:tool:result',
  'agent:permission:request',
  'agent:permission:resolved',
  'agent:question:ask',
  'agent:question:answered',
  'agent:task:create',
  'agent:task:update',
  'agent:task:delete',
  'agent:task:set',
  'agent:artifact:created',
  'agent:artifact:updated',
  'agent:artifact:deleted',
  'agent:context:update',
  'agent:context:usage',
  'agent:research:progress',
  'agent:error',
  'agent:session:updated',
  'agent:started',
  'agent:stopped',
  'agent:browserView:screenshot',
  // V2 unified chat events
  'agent:chat:item',
  'agent:chat:update',
  'agent:chat:items',
  // Integration events
  'agent:integration:status',
  'agent:integration:qr',
  'agent:integration:message_in',
  'agent:integration:message_out',
  'agent:integration:queued',
] as const;

export type TauriEventName = (typeof TAURI_EVENT_NAMES)[number];
