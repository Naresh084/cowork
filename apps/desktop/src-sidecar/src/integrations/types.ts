import type {
  PlatformType,
  PlatformStatus,
  IncomingMessage,
  OutgoingMessage,
  PlatformConfig,
} from '@gemini-cowork/shared';

// Re-export shared types for convenience within integrations
export type { PlatformType, PlatformStatus, IncomingMessage, OutgoingMessage, PlatformConfig };

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

export type PlatformConfigMap = {
  whatsapp: WhatsAppConfig;
  slack: SlackConfig;
  telegram: TelegramConfig;
};

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
