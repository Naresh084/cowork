import type {
  PlatformType,
  PlatformStatus,
  IncomingMessage,
  OutgoingMessage,
  PlatformConfig,
  PlatformMessageAttachment,
  IntegrationAction,
  IntegrationActionRequest,
  IntegrationActionResult,
  IntegrationCapabilityMatrix,
  IntegrationChannelManifest,
  IntegrationPluginManifest,
} from '@gemini-cowork/shared';
import { SUPPORTED_PLATFORM_TYPES } from '@gemini-cowork/shared';

// Re-export shared types for convenience within integrations
export type {
  PlatformType,
  PlatformStatus,
  IncomingMessage,
  OutgoingMessage,
  PlatformConfig,
  PlatformMessageAttachment,
  IntegrationAction,
  IntegrationActionRequest,
  IntegrationActionResult,
  IntegrationCapabilityMatrix,
  IntegrationChannelManifest,
  IntegrationPluginManifest,
};

export const SUPPORTED_INTEGRATION_PLATFORMS = [...SUPPORTED_PLATFORM_TYPES];

export interface IntegrationPlatformMetadata {
  displayName: string;
  supportsQr: boolean;
  osConstraint?: 'darwin';
}

export const INTEGRATION_PLATFORM_METADATA: Record<PlatformType, IntegrationPlatformMetadata> = {
  whatsapp: {
    displayName: 'WhatsApp',
    supportsQr: true,
  },
  slack: {
    displayName: 'Slack',
    supportsQr: false,
  },
  telegram: {
    displayName: 'Telegram',
    supportsQr: false,
  },
  discord: {
    displayName: 'Discord',
    supportsQr: false,
  },
  imessage: {
    displayName: 'iMessage',
    supportsQr: false,
    osConstraint: 'darwin',
  },
  teams: {
    displayName: 'Microsoft Teams',
    supportsQr: false,
  },
  matrix: {
    displayName: 'Matrix',
    supportsQr: false,
  },
  line: {
    displayName: 'LINE',
    supportsQr: false,
  },
};

export interface IntegrationMediaPayload {
  mediaType: 'image' | 'video';
  path?: string;
  url?: string;
  mimeType?: string;
  data?: string;
  caption?: string;
  itemId?: string;
}

// ============================================================================
// Platform-Specific Config Interfaces
// ============================================================================

export const DEFAULT_WHATSAPP_DENIAL_MESSAGE =
  'This Cowork bot is private. You are not authorized to chat with it.';

export interface WhatsAppConfig {
  /** Directory to store WhatsApp session data. Defaults to ~/.cowork/integrations/whatsapp/ */
  sessionDataDir?: string;
  /** Sender policy (currently allowlist-only mode) */
  senderPolicy?: 'allowlist';
  /** E.164-like allowlist of authorized sender numbers */
  allowFrom?: string[];
  /** Message sent to unauthorized senders */
  denialMessage?: string;
}

export interface SlackConfig {
  /** App-Level Token for Socket Mode (starts with xapp-) */
  appToken: string;
  /** Bot User OAuth Token (starts with xoxb-) */
  botToken: string;
  /** Optional default channel for notifications */
  defaultChannel?: string;
}

export interface TelegramConfig {
  /** Bot token from @BotFather */
  botToken: string;
  /** Optional whitelist of allowed chat IDs */
  allowedChatIds?: string[];
}

export interface DiscordConfig {
  /** Bot token from Discord Developer Portal */
  botToken: string;
  /** Optional allowlist of guild IDs */
  allowedGuildIds?: string[];
  /** Optional allowlist of channel IDs */
  allowedChannelIds?: string[];
  /** Enable/disable DM ingress (default true) */
  allowDirectMessages?: boolean;
}

export interface IMessageBlueBubblesConfig {
  /** BlueBubbles server URL, e.g. http://localhost:1234 */
  serverUrl: string;
  /** BlueBubbles API token */
  accessToken: string;
  /** Optional default chat GUID for outbound messages */
  defaultChatGuid?: string;
  /** Optional allowlist of handles/chat GUID fragments */
  allowHandles?: string[];
  /** Poll interval fallback in seconds if websocket stream is unavailable */
  pollIntervalSeconds?: number;
}

export interface TeamsConfig {
  /** Azure tenant ID */
  tenantId: string;
  /** Azure app client ID */
  clientId: string;
  /** Azure app client secret */
  clientSecret: string;
  /** Default Team ID */
  teamId: string;
  /** Default Channel ID */
  channelId: string;
  /** Poll interval for inbound messages */
  pollIntervalSeconds?: number;
}

export interface MatrixConfig {
  /** Matrix homeserver URL (e.g. https://matrix.org) */
  homeserverUrl: string;
  /** Matrix access token for the bot/user */
  accessToken: string;
  /** Optional default room ID */
  defaultRoomId?: string;
}

export interface LineConfig {
  /** LINE Messaging API channel access token */
  channelAccessToken: string;
  /** Optional default user or group ID */
  defaultTargetId?: string;
}

export type PlatformConfigMap = {
  whatsapp: WhatsAppConfig;
  slack: SlackConfig;
  telegram: TelegramConfig;
  discord: DiscordConfig;
  imessage: IMessageBlueBubblesConfig;
  teams: TeamsConfig;
  matrix: MatrixConfig;
  line: LineConfig;
};

export const ALL_INTEGRATION_ACTIONS: IntegrationAction[] = [
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
];

export function buildCapabilityMatrix(
  enabledActions: IntegrationAction[],
): IntegrationCapabilityMatrix {
  const enabled = new Set(enabledActions);
  return ALL_INTEGRATION_ACTIONS.reduce(
    (acc, action) => {
      acc[action] = enabled.has(action);
      return acc;
    },
    {} as IntegrationCapabilityMatrix,
  );
}

// ============================================================================
// Adapter Event Interfaces
// ============================================================================

export interface AdapterEvents {
  message: (msg: IncomingMessage) => void;
  status: (status: PlatformStatus) => void;
  qr: (qrDataUrl: string) => void;
  error: (error: Error) => void;
}

// ============================================================================
// Integration Session Info
// ============================================================================

export interface IntegrationSessionInfo {
  sessionId: string;
  isProcessing: boolean;
  queueSize: number;
  lastMessageAt: number | null;
}
