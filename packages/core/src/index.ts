// Types
export type {
  AgentConfig,
  AgentState,
  ToolCall,
  ToolHandler,
  ToolContext,
  ToolResult,
  PermissionHandler,
  PermissionContext,
  AgentEventType,
  AgentEvent,
  AgentEventHandler,
  Agent,
} from './types.js';

// Agent
export { CoworkAgent, createAgent } from './agent.js';

// Re-export from providers for convenience
export type { AIProvider, GenerateRequest, GenerateResponse, StreamChunk } from '@gemini-cowork/providers';
export { createGeminiProvider, GEMINI_MODELS } from '@gemini-cowork/providers';
