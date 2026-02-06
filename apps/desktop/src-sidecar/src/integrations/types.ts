import type { PlatformType, PlatformStatus, IncomingMessage, OutgoingMessage, PlatformConfig } from '@gemini-cowork/shared';

// Re-export shared types for convenience within integrations
export type { PlatformType, PlatformStatus, IncomingMessage, OutgoingMessage, PlatformConfig };

// ============================================================================
// Platform-Specific Config Interfaces
// ============================================================================

export interface WhatsAppConfig {
  /** Directory to store WhatsApp session data. Defaults to ~/.cowork/integrations/whatsapp/ */
  sessionDataDir?: string;
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
