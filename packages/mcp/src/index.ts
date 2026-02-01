// Types
export type {
  MCPServerConfig,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPConnectionStatus,
  MCPServerState,
  MCPEventType,
  MCPEvent,
  MCPEventHandler,
} from './types.js';

export { MCPServerConfigSchema } from './types.js';

// Client
export { MCPClientManager, createMCPManager } from './client.js';
