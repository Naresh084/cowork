import { z } from 'zod';
import type { ToolContext, ToolHandler, ToolResult } from '@gemini-cowork/core';
import type { IntegrationBridgeService } from '../integrations/index.js';
import type { IntegrationAction } from '../integrations/types.js';

const ACTIONS: IntegrationAction[] = [
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

export function createMessageTool(
  getBridge: () => IntegrationBridgeService | null,
): ToolHandler | null {
  const bridge = getBridge();
  if (!bridge) return null;

  const connected = bridge.getStatuses().some((status) => status.connected);
  if (!connected) return null;

  return {
    name: 'message',
    description:
      'Perform rich messaging operations on connected integration channels. ' +
      'Supports send/search/read/edit/delete/reactions/pins/polls/threads/moderation based on channel capabilities.',
    parameters: z.object({
      channel: z.string().describe('Target integration channel, e.g. slack, discord, teams.'),
      action: z.enum(ACTIONS as [IntegrationAction, ...IntegrationAction[]]).describe('Operation to execute.'),
      target: z
        .object({
          chatId: z.string().optional(),
          channelId: z.string().optional(),
          threadId: z.string().optional(),
          messageId: z.string().optional(),
          userId: z.string().optional(),
          pollId: z.string().optional(),
        })
        .optional()
        .describe('Target IDs (chat/channel/thread/message/user/poll) depending on action.'),
      payload: z
        .object({
          text: z.string().optional(),
          query: z.string().optional(),
          reaction: z.string().optional(),
          reason: z.string().optional(),
          durationMs: z.number().optional(),
          options: z.array(z.string()).optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .optional()
        .describe('Action payload (text/query/reaction/reason/options/metadata).'),
    }),
    requiresPermission: () => null,
    execute: async (args: unknown, _context: ToolContext): Promise<ToolResult> => {
      const request = args as {
        channel: string;
        action: IntegrationAction;
        target?: Record<string, unknown>;
        payload?: Record<string, unknown>;
      };

      try {
        const currentBridge = getBridge();
        if (!currentBridge) {
          return {
            success: false,
            data: 'Integration bridge not available',
          };
        }

        const result = await currentBridge.callAction({
          channel: request.channel,
          action: request.action,
          target: request.target as never,
          payload: request.payload as never,
        });

        return {
          success: result.success,
          data: result,
          error: result.success ? undefined : result.reason,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          data: `Integration action failed: ${message}`,
        };
      }
    },
  };
}

