import { z } from 'zod';

// ============================================================================
// MCP Types
// ============================================================================

/**
 * Transport type for MCP servers
 * - stdio: Local process with stdin/stdout communication
 * - http: Remote server with HTTP/SSE communication
 */
export const MCPTransportTypeSchema = z.enum(['stdio', 'http']);
export type MCPTransportType = z.infer<typeof MCPTransportTypeSchema>;

/**
 * Configuration for an MCP server
 * Supports both stdio (local process) and HTTP (remote server) transports
 */
export const MCPServerConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),

  // Transport type selection (defaults to stdio for backward compatibility)
  transport: MCPTransportTypeSchema.optional().default('stdio'),

  // Stdio transport fields (required when transport === 'stdio')
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),

  // HTTP transport fields (required when transport === 'http')
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),

  // Optional fields
  prompt: z.string().optional(),
  contextFileName: z.string().optional(),
}).refine(
  (data) => {
    // Validate based on transport type
    if (data.transport === 'http') {
      return !!data.url;
    }
    // For stdio (default), command is required
    return !!data.command;
  },
  {
    message: "For stdio transport, 'command' is required. For http transport, 'url' is required.",
  }
);

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
