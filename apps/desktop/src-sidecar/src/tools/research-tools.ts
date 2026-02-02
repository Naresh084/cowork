import { z } from 'zod';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import { runDeepResearch } from '@gemini-cowork/providers';
import { eventEmitter } from '../event-emitter.js';

export function createDeepResearchTool(getApiKey: () => string | null): ToolHandler {
  return {
    name: 'deep_research',
    description: 'Perform deep autonomous research on a topic. Takes 5-60 minutes. Returns a report with citations.',
    parameters: z.object({
      query: z.string().describe('The research question or topic'),
      includeFiles: z.array(z.string()).optional().describe('File paths or context strings to include'),
    }),

    requiresPermission: (): { type: 'network_request'; resource: string; reason: string } => ({
      type: 'network_request',
      resource: 'Deep Research API',
      reason: 'Perform autonomous web research',
    }),

    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const { query, includeFiles } = args as { query: string; includeFiles?: string[] };
      const apiKey = getApiKey();

      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
      }

      try {
        const result = await runDeepResearch(apiKey, {
          query,
          files: includeFiles,
          onProgress: (status, progress) => {
            eventEmitter.researchProgress(context.sessionId, status, progress);
            eventEmitter.flushSync();
          },
        });

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function createResearchTools(getApiKey: () => string | null): ToolHandler[] {
  return [createDeepResearchTool(getApiKey)];
}
