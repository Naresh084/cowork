import { z } from 'zod';

// ============================================================================
// Message Types
// ============================================================================

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageContentPartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    mimeType: z.string(),
    data: z.string(), // base64
  }),
  z.object({
    type: z.literal('tool_call'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('tool_result'),
    toolCallId: z.string(),
    toolName: z.string().optional(),
    result: z.unknown(),
    isError: z.boolean().optional(),
  }),
]);

export type MessageContentPart = z.infer<typeof MessageContentPartSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  role: MessageRoleSchema,
  content: z.union([z.string(), z.array(MessageContentPartSchema)]),
  createdAt: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// ============================================================================
// Session Types
// ============================================================================

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  workingDirectory: z.string().optional(),
  model: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  messages: z.array(MessageSchema),
  metadata: z.record(z.unknown()).optional(),
});

export type Session = z.infer<typeof SessionSchema>;

// ============================================================================
// Tool Types
// ============================================================================

export const ToolParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string(),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
});

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.array(ToolParameterSchema),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export interface ToolExecutionContext {
  sessionId: string;
  workingDirectory: string;
  permissions: PermissionSet;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// Permission Types
// ============================================================================

export const PermissionTypeSchema = z.enum([
  'file_read',
  'file_write',
  'file_delete',
  'shell_execute',
  'network_request',
  'clipboard_read',
  'clipboard_write',
]);

export type PermissionType = z.infer<typeof PermissionTypeSchema>;

export const PermissionRequestSchema = z.object({
  type: PermissionTypeSchema,
  resource: z.string(),
  reason: z.string().optional(),
});

export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;

export const PermissionDecisionSchema = z.enum(['allow', 'deny', 'allow_once', 'allow_session']);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export interface PermissionSet {
  isAllowed(request: PermissionRequest): boolean;
  grant(request: PermissionRequest, decision: PermissionDecision): void;
  revoke(
    type: 'file_read' | 'file_write' | 'file_delete' | 'shell_execute' | 'network_request' | 'clipboard_read' | 'clipboard_write',
    resource?: string
  ): void;
}

// ============================================================================
// Auth Types
// ============================================================================

export const AuthMethodSchema = z.enum(['api_key', 'oauth']);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

export const AuthStateSchema = z.object({
  isAuthenticated: z.boolean(),
  method: AuthMethodSchema.optional(),
  email: z.string().optional(),
  expiresAt: z.number().optional(),
});

export type AuthState = z.infer<typeof AuthStateSchema>;

export interface AuthCredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
}

// ============================================================================
// Provider Types
// ============================================================================

export const ModelCapabilitySchema = z.enum([
  'text_generation',
  'code_generation',
  'vision',
  'function_calling',
  'streaming',
]);

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  capabilities: z.array(ModelCapabilitySchema),
  maxTokens: z.number().optional(),
  contextWindow: z.number().optional(),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export interface GenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'error' | 'done';
  text?: string;
  toolCall?: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  };
  error?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export type EventType =
  | 'message:created'
  | 'message:updated'
  | 'message:deleted'
  | 'session:created'
  | 'session:updated'
  | 'session:deleted'
  | 'tool:executing'
  | 'tool:executed'
  | 'permission:requested'
  | 'permission:granted'
  | 'permission:denied'
  | 'auth:changed'
  | 'error:occurred';

export interface AppEvent<T = unknown> {
  type: EventType;
  timestamp: number;
  payload: T;
}

export type EventHandler<T = unknown> = (event: AppEvent<T>) => void | Promise<void>;

export interface EventEmitter {
  on<T>(type: EventType, handler: EventHandler<T>): () => void;
  off<T>(type: EventType, handler: EventHandler<T>): void;
  emit<T>(type: EventType, payload: T): void;
}
