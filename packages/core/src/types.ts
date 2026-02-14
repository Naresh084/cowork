// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import type { Message, ToolDefinition, PermissionRequest, PermissionDecision, GenerationConfig } from '@cowork/shared';

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentConfig {
  model: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxIterations?: number;
  generationConfig?: GenerationConfig;
  streaming?: boolean;
}

export interface AgentState {
  messages: Message[];
  currentIteration: number;
  pendingToolCalls: ToolCall[];
  pendingPermissions: PermissionRequest[];
  isRunning: boolean;
  lastError?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'executed' | 'error';
  result?: unknown;
  error?: string;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolHandler {
  name: string;
  description: string;
  parameters: z.ZodType<unknown>;
  execute: (args: unknown, context: ToolContext) => Promise<ToolResult>;
  requiresPermission?: (args: unknown) => PermissionRequest | null;
}

export interface ToolContext {
  workingDirectory: string;
  sessionId: string;
  agentId: string;
  /** App data directory for session-based storage (e.g., ~/.cowork) */
  appDataDir?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// Permission Types
// ============================================================================

export type PermissionHandler = (
  request: PermissionRequest,
  context: PermissionContext
) => Promise<PermissionDecision>;

export interface PermissionContext {
  toolCall: ToolCall;
  sessionId: string;
  history: Message[];
}

// ============================================================================
// Agent Events
// ============================================================================

export type AgentEventType =
  | 'agent:stream_chunk'
  | 'agent:started'
  | 'agent:stopped'
  | 'agent:iteration'
  | 'agent:message'
  | 'agent:tool_call'
  | 'agent:tool_result'
  | 'agent:permission_request'
  | 'agent:permission_decision'
  | 'agent:error'
  | 'agent:complete';

export interface AgentEvent<T = unknown> {
  type: AgentEventType;
  timestamp: number;
  agentId: string;
  payload: T;
}

export type AgentEventHandler<T = unknown> = (event: AgentEvent<T>) => void | Promise<void>;

// ============================================================================
// Agent Interface
// ============================================================================

export interface Agent {
  readonly id: string;
  readonly config: AgentConfig;

  /**
   * Run the agent with a user message.
   */
  run(userMessage: string | Message['content']): AsyncGenerator<AgentEvent>;

  /**
   * Resume the agent after a permission decision.
   */
  resume(decision: PermissionDecision): AsyncGenerator<AgentEvent>;

  /**
   * Stop the agent.
   */
  stop(): void;

  /**
   * Get the current state.
   */
  getState(): AgentState;

  /**
   * Reset the agent to initial state.
   */
  reset(): void;

  /**
   * Subscribe to events.
   */
  on<T>(type: AgentEventType, handler: AgentEventHandler<T>): () => void;
}
