// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

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
