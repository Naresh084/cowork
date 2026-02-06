import { z } from 'zod';

// ============================================================================
// ChatItem Types - Unified Chat Storage
// ============================================================================

/**
 * Base properties shared by all chat items
 */
export const ChatItemBaseSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  turnId: z.string().optional(), // Links to user message that started this turn
  sequence: z.number().int().nonnegative().optional(), // Stable ordering within a session
});

export type ChatItemBase = z.infer<typeof ChatItemBaseSchema>;

// ============================================================================
// User Message Item
// ============================================================================

export const UserMessageItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('user_message'),
  content: z.union([z.string(), z.array(z.any())]), // string | MessageContentPart[]
  attachments: z.array(z.object({
    type: z.enum(['file', 'image', 'text', 'audio', 'video', 'pdf']),
    name: z.string(),
    path: z.string().optional(),
    mimeType: z.string().optional(),
    data: z.string().optional(),
    size: z.number().optional(),
    duration: z.number().optional(),
  })).optional(),
});

export type UserMessageItem = z.infer<typeof UserMessageItemSchema>;

// ============================================================================
// Assistant Message Item
// ============================================================================

export const AssistantMessageStreamSchema = z.object({
  phase: z.enum(['intermediate', 'final']),
  status: z.enum(['streaming', 'done']),
  segmentIndex: z.number().int().nonnegative(),
});

export type AssistantMessageStream = z.infer<typeof AssistantMessageStreamSchema>;

export const AssistantMessageItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('assistant_message'),
  content: z.union([z.string(), z.array(z.any())]), // string | MessageContentPart[]
  metadata: z.record(z.unknown()).optional(),
  stream: AssistantMessageStreamSchema.optional(),
});

export type AssistantMessageItem = z.infer<typeof AssistantMessageItemSchema>;

// ============================================================================
// System Message Item
// ============================================================================

export const SystemMessageItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('system_message'),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type SystemMessageItem = z.infer<typeof SystemMessageItemSchema>;

// ============================================================================
// Thinking Item - AI internal reasoning
// ============================================================================

export const ThinkingItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('thinking'),
  content: z.string(),
  status: z.enum(['active', 'done']),
});

export type ThinkingItem = z.infer<typeof ThinkingItemSchema>;

// ============================================================================
// Tool Start Item - Preserves running state
// ============================================================================

export const ToolStartItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('tool_start'),
  toolId: z.string(),
  name: z.string(),
  args: z.record(z.unknown()),
  status: z.enum(['running', 'completed', 'error']),
  parentToolId: z.string().optional(), // For sub-tools within task tools
});

export type ToolStartItem = z.infer<typeof ToolStartItemSchema>;

// ============================================================================
// Tool Result Item
// ============================================================================

export const ToolResultItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('tool_result'),
  toolId: z.string(),
  name: z.string(),
  status: z.enum(['success', 'error']),
  result: z.unknown().optional(),
  error: z.string().optional(),
  duration: z.number().optional(),
  parentToolId: z.string().optional(),
});

export type ToolResultItem = z.infer<typeof ToolResultItemSchema>;

// ============================================================================
// Permission Item
// ============================================================================

export const PermissionItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('permission'),
  permissionId: z.string(),
  request: z.object({
    type: z.string(),
    resource: z.string(),
    reason: z.string().optional(),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
    command: z.string().optional(),
  }),
  status: z.enum(['pending', 'resolved']),
  decision: z.enum(['allow', 'deny', 'allow_once', 'allow_session']).optional(),
});

export type PermissionItem = z.infer<typeof PermissionItemSchema>;

// ============================================================================
// Question Item - User questions from agent
// ============================================================================

export const QuestionItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('question'),
  questionId: z.string(),
  question: z.string(),
  header: z.string().optional(),
  options: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
    value: z.string().optional(),
  })).optional(),
  multiSelect: z.boolean().optional(),
  status: z.enum(['pending', 'answered']),
  answer: z.union([z.string(), z.array(z.string())]).optional(),
});

export type QuestionItem = z.infer<typeof QuestionItemSchema>;

// ============================================================================
// Media Item - Images/Videos generated by tools
// ============================================================================

export const MediaItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('media'),
  mediaType: z.enum(['image', 'video']),
  path: z.string().optional(),
  url: z.string().optional(),
  mimeType: z.string().optional(),
  data: z.string().optional(), // base64 for reliable display
  toolId: z.string().optional(), // Link to generating tool
});

export type MediaItem = z.infer<typeof MediaItemSchema>;

// ============================================================================
// Report Item - Deep research reports
// ============================================================================

export const ReportItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('report'),
  title: z.string().optional(),
  path: z.string().optional(),
  snippet: z.string().optional(),
  toolId: z.string().optional(),
});

export type ReportItem = z.infer<typeof ReportItemSchema>;

// ============================================================================
// Design Item - Design previews
// ============================================================================

export const DesignItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('design'),
  title: z.string().optional(),
  preview: z.object({
    name: z.string().optional(),
    content: z.string().optional(),
    url: z.string().optional(),
    path: z.string().optional(),
    mimeType: z.string().optional(),
  }).optional(),
  toolId: z.string().optional(),
});

export type DesignItem = z.infer<typeof DesignItemSchema>;

// ============================================================================
// Error Item - Recoverable errors shown in chat
// ============================================================================

export const ErrorItemSchema = ChatItemBaseSchema.extend({
  kind: z.literal('error'),
  message: z.string(),
  code: z.string().optional(),
  recoverable: z.boolean().optional(),
  details: z.record(z.unknown()).optional(),
});

export type ErrorItem = z.infer<typeof ErrorItemSchema>;

// ============================================================================
// Context Usage - Persisted separately but linked
// ============================================================================

export const ContextUsageSchema = z.object({
  usedTokens: z.number(),
  maxTokens: z.number(),
  percentUsed: z.number(),
  lastUpdated: z.number().optional(),
});

export type ContextUsage = z.infer<typeof ContextUsageSchema>;

// ============================================================================
// Unified ChatItem Type - Discriminated Union
// ============================================================================

export const ChatItemSchema = z.discriminatedUnion('kind', [
  UserMessageItemSchema,
  AssistantMessageItemSchema,
  SystemMessageItemSchema,
  ThinkingItemSchema,
  ToolStartItemSchema,
  ToolResultItemSchema,
  PermissionItemSchema,
  QuestionItemSchema,
  MediaItemSchema,
  ReportItemSchema,
  DesignItemSchema,
  ErrorItemSchema,
]);

export type ChatItem =
  | UserMessageItem
  | AssistantMessageItem
  | SystemMessageItem
  | ThinkingItem
  | ToolStartItem
  | ToolResultItem
  | PermissionItem
  | QuestionItem
  | MediaItem
  | ReportItem
  | DesignItem
  | ErrorItem;

// ============================================================================
// Helper type guards
// ============================================================================

export function isUserMessage(item: ChatItem): item is UserMessageItem {
  return item.kind === 'user_message';
}

export function isAssistantMessage(item: ChatItem): item is AssistantMessageItem {
  return item.kind === 'assistant_message';
}

export function isSystemMessage(item: ChatItem): item is SystemMessageItem {
  return item.kind === 'system_message';
}

export function isThinking(item: ChatItem): item is ThinkingItem {
  return item.kind === 'thinking';
}

export function isToolStart(item: ChatItem): item is ToolStartItem {
  return item.kind === 'tool_start';
}

export function isToolResult(item: ChatItem): item is ToolResultItem {
  return item.kind === 'tool_result';
}

export function isPermission(item: ChatItem): item is PermissionItem {
  return item.kind === 'permission';
}

export function isQuestion(item: ChatItem): item is QuestionItem {
  return item.kind === 'question';
}

export function isMedia(item: ChatItem): item is MediaItem {
  return item.kind === 'media';
}

export function isReport(item: ChatItem): item is ReportItem {
  return item.kind === 'report';
}

export function isDesign(item: ChatItem): item is DesignItem {
  return item.kind === 'design';
}

export function isError(item: ChatItem): item is ErrorItem {
  return item.kind === 'error';
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Generate a unique chat item ID
 */
export function generateChatItemId(prefix = 'ci'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get the turn ID for a chat item (the user message that started this turn)
 */
export function getTurnId(item: ChatItem): string | undefined {
  if (item.kind === 'user_message') {
    return item.id;
  }
  return item.turnId;
}

/**
 * Check if item is a message (user, assistant, or system)
 */
export function isMessage(item: ChatItem): item is UserMessageItem | AssistantMessageItem | SystemMessageItem {
  return item.kind === 'user_message' || item.kind === 'assistant_message' || item.kind === 'system_message';
}

/**
 * Check if item is tool-related (start or result)
 */
export function isToolItem(item: ChatItem): item is ToolStartItem | ToolResultItem {
  return item.kind === 'tool_start' || item.kind === 'tool_result';
}

/**
 * Get all items belonging to a specific turn
 */
export function getItemsForTurn(items: ChatItem[], turnId: string): ChatItem[] {
  return items.filter(item => getTurnId(item) === turnId);
}

/**
 * Get all user messages from chat items
 */
export function getUserMessages(items: ChatItem[]): UserMessageItem[] {
  return items.filter(isUserMessage);
}

/**
 * Get all assistant messages from chat items
 */
export function getAssistantMessages(items: ChatItem[]): AssistantMessageItem[] {
  return items.filter(isAssistantMessage);
}

/**
 * Get tool executions grouped by toolId (start + result pairs)
 */
export function getToolExecutions(items: ChatItem[]): Map<string, { start?: ToolStartItem; result?: ToolResultItem }> {
  const map = new Map<string, { start?: ToolStartItem; result?: ToolResultItem }>();

  for (const item of items) {
    if (isToolStart(item)) {
      const existing = map.get(item.toolId) || {};
      existing.start = item;
      map.set(item.toolId, existing);
    } else if (isToolResult(item)) {
      const existing = map.get(item.toolId) || {};
      existing.result = item;
      map.set(item.toolId, existing);
    }
  }

  return map;
}
