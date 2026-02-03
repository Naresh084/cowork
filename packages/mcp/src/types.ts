import { z } from 'zod';

// ============================================================================
// MCP Types
// ============================================================================

export const MCPServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
  prompt: z.string().optional(),
  contextFileName: z.string().optional(),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverId: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  serverId: string;
}

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPServerState {
  id: string;
  config: MCPServerConfig;
  status: MCPConnectionStatus;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
  error?: string;
}

// ============================================================================
// MCP Events
// ============================================================================

export type MCPEventType =
  | 'server:connected'
  | 'server:disconnected'
  | 'server:error'
  | 'tool:discovered'
  | 'resource:discovered'
  | 'prompt:discovered';

export interface MCPEvent<T = unknown> {
  type: MCPEventType;
  timestamp: number;
  serverId: string;
  payload: T;
}

export type MCPEventHandler<T = unknown> = (event: MCPEvent<T>) => void | Promise<void>;
