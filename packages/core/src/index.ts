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

// Tools
export { FILE_TOOLS, readFileTool, writeFileTool, listDirectoryTool, getFileInfoTool, createDirectoryTool, deleteFileTool } from './tools/file-tools.js';
export { SHELL_TOOLS, executeCommandTool, analyzeCommandTool } from './tools/shell-tools.js';

// Re-export from providers for convenience
export type { AIProvider, GenerateRequest, GenerateResponse, StreamChunk } from '@gemini-cowork/providers';
export { createGeminiProvider, GEMINI_MODELS } from '@gemini-cowork/providers';

// Combined default tools
import { FILE_TOOLS } from './tools/file-tools.js';
import { SHELL_TOOLS } from './tools/shell-tools.js';
import type { ToolHandler } from './types.js';

export const DEFAULT_TOOLS: ToolHandler[] = [
  ...FILE_TOOLS,
  ...SHELL_TOOLS,
];
