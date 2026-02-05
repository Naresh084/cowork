/**
 * /clear Command Handler
 *
 * Clears the current conversation while preserving memories
 */

import type { CommandHandler, CommandResult } from '../../apps/desktop/src-sidecar/src/commands/types.js';

export const handler: CommandHandler = async (ctx): Promise<CommandResult> => {
  try {
    const { args, sessionId } = ctx;
    const clearAll = args.all === true;

    if (!sessionId) {
      return {
        success: false,
        error: {
          code: 'NO_SESSION',
          message: 'No active session to clear',
        },
      };
    }

    // Emit action to clear the chat
    const actionPayload = {
      sessionId,
      clearMessages: true,
      clearTasks: clearAll,
      clearArtifacts: clearAll,
      preserveMemories: true,
    };

    return {
      success: true,
      message: clearAll
        ? 'Cleared conversation, tasks, and artifacts. Memories preserved.'
        : 'Conversation cleared. Memories and tasks preserved.',
      data: {
        sessionId,
        cleared: {
          messages: true,
          tasks: clearAll,
          artifacts: clearAll,
          memories: false,
        },
      },
      actions: [
        {
          type: 'clear_chat',
          payload: actionPayload,
        },
      ],
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'CLEAR_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

export default handler;
