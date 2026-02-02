import { z } from 'zod';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import { createComputerSession, runComputerUseStep } from '@gemini-cowork/providers';

export function createComputerUseTool(getApiKey: () => string | null): ToolHandler {
  return {
    name: 'computer_use',
    description: 'Use a browser to complete a multi-step goal. Returns actions taken and final URL.',
    parameters: z.object({
      goal: z.string().describe('The task or goal to accomplish in the browser'),
      startUrl: z.string().optional().describe('Optional starting URL'),
      maxSteps: z.number().optional().describe('Maximum number of steps (default: 15)'),
      headless: z.boolean().optional().describe('Run browser headless (default: false)'),
    }),

    requiresPermission: (): { type: 'network_request'; resource: string; reason: string } => ({
      type: 'network_request',
      resource: 'Computer Use',
      reason: 'Perform automated browsing to complete the requested task',
    }),

    execute: async (args: unknown, _context: ToolContext): Promise<ToolResult> => {
      const { goal, startUrl, maxSteps = 15, headless = false } = args as {
        goal: string;
        startUrl?: string;
        maxSteps?: number;
        headless?: boolean;
      };

      const apiKey = getApiKey();
      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
      }

      const session = await createComputerSession(apiKey, goal, startUrl, headless);

      try {
        let steps = 0;
        let completed = false;
        const actions: string[] = [];

        while (steps < maxSteps) {
          const stepResult = await runComputerUseStep(apiKey, session);
          steps += 1;
          actions.push(...stepResult.actions);

          if (stepResult.completed) {
            completed = true;
            break;
          }
        }

        const finalUrl = session.page.url();

        return {
          success: true,
          data: {
            completed,
            actions,
            finalUrl,
            steps,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        await session.browser.close().catch(() => undefined);
      }
    },
  };
}

export function createComputerUseTools(getApiKey: () => string | null): ToolHandler[] {
  return [createComputerUseTool(getApiKey)];
}
