import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir, writeFile } from 'fs/promises';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import { runDeepResearch } from '@gemini-cowork/providers';
import { eventEmitter } from '../event-emitter.js';
import { getModel } from '../model-config.js';

/**
 * Get the reports directory for a session.
 * Uses appDataDir if available, otherwise falls back to ~/.cowork
 */
function getReportsDir(context: ToolContext): string {
  const baseDir = context.appDataDir || join(homedir(), '.cowork');
  return join(baseDir, 'sessions', context.sessionId, 'reports');
}

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
          agent: getModel('deepResearchAgent'),
          onProgress: (status, progress) => {
            eventEmitter.researchProgress(context.sessionId, status, progress);
            eventEmitter.flushSync();
          },
        });
        const reportDir = getReportsDir(context);
        await mkdir(reportDir, { recursive: true });
        const reportPath = join(reportDir, `deep-research-${Date.now()}.md`);
        await writeFile(reportPath, result.report, 'utf-8');

        return { success: true, data: { ...result, reportPath } };
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
