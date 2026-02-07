import { z } from 'zod';

// ============================================================================
// Integration Channel Types
// ============================================================================

export const SUPPORTED_PLATFORM_TYPES = [
  'whatsapp',
  'slack',
  'telegram',
  'discord',
  'imessage',
  'teams',
  'matrix',
  'line',
] as const;

export type PlatformType = (typeof SUPPORTED_PLATFORM_TYPES)[number];

export const SUPPORTED_INTEGRATION_CHANNEL_TYPES = [
  ...SUPPORTED_PLATFORM_TYPES,
  'custom',
] as const;

export type IntegrationChannelType =
  (typeof SUPPORTED_INTEGRATION_CHANNEL_TYPES)[number];

// ============================================================================
// Integration Action Types
// ============================================================================

export const IntegrationActionSchema = z.enum([
  'send',
  'search',
  'read',
  'edit',
  'delete',
  'react',
  'list_reactions',
  'pin',
  'unpin',
  'list_pins',
  'poll_create',
  'poll_vote',
  'poll_close',
  'thread_create',
  'thread_reply',
  'thread_list',
  'moderation_timeout',
  'moderation_kick',
  'moderation_ban',
]);

export type IntegrationAction = z.infer<typeof IntegrationActionSchema>;

export type IntegrationCapabilityMatrix = Record<IntegrationAction, boolean>;

export interface IntegrationActionTarget {
  chatId?: string;
  channelId?: string;
  threadId?: string;
  messageId?: string;
  userId?: string;
  pollId?: string;
}

export interface IntegrationActionPayload {
  text?: string;
  query?: string;
  reaction?: string;
  reason?: string;
  durationMs?: number;
  options?: string[];
  media?: {
    mediaType?: 'image' | 'video';
    path?: string;
    url?: string;
    mimeType?: string;
    data?: string;
    caption?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface IntegrationActionRequest {
  channel: string;
  action: IntegrationAction;
  target?: IntegrationActionTarget;
  payload?: IntegrationActionPayload;
}

export interface IntegrationActionResult {
  success: boolean;
  channel: string;
  action: IntegrationAction;
  unsupported?: boolean;
  reason?: string;
  fallbackSuggestion?: string;
  data?: unknown;
}

// ============================================================================
// Integration Catalog / Plugin Types
// ============================================================================

export interface IntegrationPluginManifest {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  channelType: IntegrationChannelType;
  configSchema?: Record<string, unknown>;
  capabilities?: Partial<Record<IntegrationAction, boolean>>;
  setupGuide?: string[];
}

export interface IntegrationChannelManifest {
  id: string;
  channelType: IntegrationChannelType;
  displayName: string;
  description: string;
  source: 'builtin' | 'plugin';
  setupGuide: string[];
  capabilities: Partial<Record<IntegrationAction, boolean>>;
  pluginId?: string;
}

// ============================================================================
// Legacy Compatibility Types (Platform Integration)
// ============================================================================

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
  attachments?: PlatformMessageAttachment[];
  timestamp: number;
  replyToMessageId?: string;
}

export interface OutgoingMessage {
  platform: PlatformType;
  chatId: string;
  content: string;
  replyToMessageId?: string;
}

export interface PlatformMessageAttachment {
  type: 'image' | 'audio' | 'video' | 'file' | 'pdf' | 'text';
  name: string;
  mimeType?: string;
  data?: string;
  size?: number;
  duration?: number;
}

export interface PlatformConfig {
  platform: PlatformType;
  enabled: boolean;
  config: Record<string, unknown>;
  source?: 'builtin' | 'plugin';
  pluginId?: string;
}

export interface WhatsAppSenderControlConfig {
  senderPolicy: 'allowlist';
  allowFrom: string[];
  denialMessage: string;
}

