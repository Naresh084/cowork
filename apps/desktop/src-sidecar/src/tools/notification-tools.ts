/**
 * Notification Tools - Agent tools for sending messages to connected platforms
 *
 * Conditionally creates tools ONLY for currently connected platforms.
 * When no platforms are connected, returns empty array (no tools registered).
 */

import { z } from 'zod';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import type { IntegrationBridgeService } from '../integrations/index.js';

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  telegram: 'Telegram',
  discord: 'Discord',
  imessage: 'iMessage',
  teams: 'Microsoft Teams',
};

/**
 * Create notification tools for all currently connected platforms.
 * Returns empty array if no platforms connected.
 *
 * Follows the same pattern as cron-tool.ts and media-tools.ts.
 */
export function createNotificationTools(
  getBridge: () => IntegrationBridgeService | null,
): ToolHandler[] {
  const bridge = getBridge();
  if (!bridge) return [];

  const statuses = bridge.getStatuses();
  const tools: ToolHandler[] = [];

  for (const status of statuses) {
    if (!status.connected) continue;

    const platform = status.platform;
    const displayName = PLATFORM_DISPLAY_NAMES[platform] || platform;

    tools.push({
      name: `send_notification_${platform}`,
      description:
        `Send a message/notification to the user via ${displayName}. ` +
        `Use this to proactively notify the user about task completion, important findings, ` +
        `or scheduled task results. The user has connected their ${displayName} account` +
        `${status.displayName ? ` (${status.displayName})` : ''}. ` +
        `Keep messages concise and use plain text.`,
      parameters: z.object({
        message: z
          .string()
          .describe(
            'The message text to send. Keep it concise. Use plain text, not markdown.',
          ),
        chatId: z
          .string()
          .optional()
          .describe(
            'Target chat/channel ID. Defaults to the last active conversation. ' +
              'Only specify if you need to send to a different chat.',
          ),
      }),
      requiresPermission: () => null, // No permission needed for notifications
      execute: async (
        args: unknown,
        _context: ToolContext,
      ): Promise<ToolResult> => {
        const { message, chatId } = args as {
          message: string;
          chatId?: string;
        };

        try {
          const currentBridge = getBridge();
          if (!currentBridge) {
            return {
              success: false,
              data: 'Integration bridge not available',
            };
          }

          await currentBridge.sendNotification(platform, message, chatId);

          const preview =
            message.length > 100
              ? message.substring(0, 100) + '...'
              : message;
          return {
            success: true,
            data: `Notification sent via ${displayName}${chatId ? ` to ${chatId}` : ''}: "${preview}"`,
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            data: `Failed to send ${displayName} notification: ${errMsg}`,
          };
        }
      },
    });
  }

  return tools;
}
