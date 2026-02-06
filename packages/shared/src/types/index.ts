import { z } from 'zod';

// ============================================================================
// Skill Types (re-exported from skill.ts)
// ============================================================================

export * from './skill.js';

// ============================================================================
// Command Types (re-exported from command.ts)
// ============================================================================

export * from './command.js';

// ============================================================================
// Cron Types (re-exported from cron.ts)
// ============================================================================

export * from './cron.js';

// ============================================================================
// Heartbeat Types (re-exported from heartbeat.ts)
// ============================================================================

export * from './heartbeat.js';

// ============================================================================
// Tool Policy Types (re-exported from tool-policy.ts)
// ============================================================================

export * from './tool-policy.js';

// ============================================================================
// ChatItem Types (re-exported from chat-item.ts)
// ============================================================================

export * from './chat-item.js';

// ============================================================================
// Connector Types (re-exported from connector.ts)
// ============================================================================

export * from './connector.js';

// ============================================================================
// Platform Integration Types
// ============================================================================

export type PlatformType = 'whatsapp' | 'slack' | 'telegram';

export interface PlatformStatus {
  platform: PlatformType;
  connected: boolean;
  displayName?: string;
  identityPhone?: string;
  identityName?: string;
  error?: string;
  connectedAt?: number;
  lastMessageAt?: number;
}

export interface IncomingMessage {
  platform: PlatformType;
  chatId: string;
  senderName: string;
  senderId: string;
  content: string;
  timestamp: number;
  replyToMessageId?: string;
}

export interface OutgoingMessage {
  platform: PlatformType;
  chatId: string;
  content: string;
  replyToMessageId?: string;
}

export interface PlatformConfig {
  platform: PlatformType;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface WhatsAppSenderControlConfig {
  senderPolicy: 'allowlist';
  allowFrom: string[];
  denialMessage: string;
}

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
    type: z.literal('audio'),
    mimeType: z.string(),
    data: z.string(), // base64
  }),
  z.object({
    type: z.literal('video'),
    mimeType: z.string(),
    data: z.string(), // base64
  }),
  z.object({
    type: z.literal('file'),
    name: z.string(),
    mimeType: z.string().optional(),
    data: z.string().optional(),
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
// Error Metadata Types (for structured error rendering)
// ============================================================================

export interface ErrorMessageDetails {
  retryAfterSeconds?: number;
  quotaMetric?: string;
  model?: string;
  docsUrl?: string;
}

export interface ErrorMessageMetadata {
  kind: 'error';
  code?: string;
  details?: ErrorMessageDetails;
  raw?: string;
}

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

export type ToolParameter = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: Array<string | number | boolean>;
  items?: ToolParameter;
  properties?: ToolParameter[];
};

export const ToolParameterSchema: z.ZodType<ToolParameter> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    description: z.string(),
    required: z.boolean().default(false),
    default: z.unknown().optional(),
    enum: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
    items: ToolParameterSchema.optional(),
    properties: z.array(ToolParameterSchema).optional(),
  })
);

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
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
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

// ============================================================================
// Enhanced Session Types
// ============================================================================

// Note: SessionType is exported from tool-policy.ts

/**
 * Compaction strategy for sessions
 */
export const CompactionStrategySchema = z.enum(['summarize', 'truncate', 'smart']);
export type CompactionStrategy = z.infer<typeof CompactionStrategySchema>;

/**
 * Session compaction configuration
 */
export const CompactionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  strategy: CompactionStrategySchema.default('smart'),
  messageThreshold: z.number().int().positive().default(100).describe('Compact after N messages'),
  tokenThreshold: z.number().int().positive().default(50000).describe('Compact at N tokens'),
  keepRecentMessages: z.number().int().positive().default(10).describe('Always keep last N messages'),
  keepSystemMessages: z.boolean().default(true).describe('Preserve system messages'),
  summaryMaxTokens: z.number().int().positive().default(1000).describe('Max tokens for summary'),
});

export type CompactionConfig = z.infer<typeof CompactionConfigSchema>;

/**
 * Enhanced session metadata with type, compaction, and lifecycle info
 */
export const EnhancedSessionMetadataSchema = z.object({
  id: z.string(),
  type: z.enum(['main', 'isolated', 'cron', 'ephemeral', 'integration']),
  prefix: z.string().describe('Session prefix (e.g., "main-abc123-001")'),
  title: z.string().nullable(),
  workingDirectory: z.string(),
  model: z.string(),

  // Compaction state
  isCompacted: z.boolean().default(false),
  compactedAt: z.number().optional(),
  originalMessageCount: z.number().optional(),

  // Lifecycle
  parentSessionId: z.string().optional().describe('For forked sessions'),
  expiresAt: z.number().optional().describe('For ephemeral/cron sessions'),

  // Stats
  totalTokensUsed: z.number().default(0),
  lastActivityAt: z.number(),

  // Timestamps
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EnhancedSessionMetadata = z.infer<typeof EnhancedSessionMetadataSchema>;

/**
 * Session query options for listing/filtering sessions
 */
export const SessionQueryOptionsSchema = z.object({
  type: z.union([
    z.enum(['main', 'isolated', 'cron', 'ephemeral', 'integration']),
    z.array(z.enum(['main', 'isolated', 'cron', 'ephemeral', 'integration'])),
  ]).optional(),
  workingDirectory: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'lastActivityAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  includeCompacted: z.boolean().optional(),
});

export type SessionQueryOptions = z.infer<typeof SessionQueryOptionsSchema>;

/**
 * Result of session compaction
 */
export const CompactionResultSchema = z.object({
  sessionId: z.string(),
  originalMessageCount: z.number(),
  newMessageCount: z.number(),
  tokensSaved: z.number().optional(),
  summaryLength: z.number().optional(),
});

export type CompactionResult = z.infer<typeof CompactionResultSchema>;
