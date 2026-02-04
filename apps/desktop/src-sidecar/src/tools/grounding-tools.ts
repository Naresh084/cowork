import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import type { ToolHandler, ToolResult } from '@gemini-cowork/core';

export function createGroundingTools(
  getApiKey: () => string | null,
  getSessionModel: () => string
): ToolHandler[] {
  const groundedSearch: ToolHandler = {
    name: 'google_grounded_search',
    description: 'Search the web using Google and return a summary with citations. Use this for current information, news, or facts that may have changed.',
    parameters: z.object({
      query: z.string().describe('Search query - be specific for better results'),
      model: z.string().optional().describe('Model to use (default: gemini-2.0-flash)'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const apiKey = getApiKey();
      if (!apiKey) {
        return {
          success: false,
          error: 'API key not configured. Please set your Google AI API key.',
        };
      }

      const { query, model } = args as { query: string; model?: string };

      if (!query?.trim()) {
        return { success: false, error: 'Search query cannot be empty.' };
      }

      // Use the new @google/genai SDK with googleSearch tool
      const ai = new GoogleGenAI({ apiKey });
      // Use provided model, session model, or fall back to gemini-2.0-flash for search
      const modelId = model || getSessionModel() || 'gemini-2.0-flash';

      try {
        const response = await ai.models.generateContent({
          model: modelId,
          contents: `Search and provide current information about: ${query}\n\nPlease provide a comprehensive summary with specific facts, dates, and details.`,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const text = response.text || '';

        // Extract grounding metadata from the response
        const candidate = response.candidates?.[0];
        const grounding = candidate?.groundingMetadata;

        // Extract sources from grounding chunks
        const sources: Array<{ title: string; url: string }> = [];
        if (grounding?.groundingChunks) {
          for (const chunk of grounding.groundingChunks) {
            const web = chunk.web;
            if (web?.uri) {
              try {
                sources.push({
                  title: web.title || new URL(web.uri).hostname,
                  url: web.uri,
                });
              } catch {
                sources.push({ title: web.title || web.uri, url: web.uri });
              }
            }
          }
        }

        // Extract search queries used
        const searchQueries = grounding?.webSearchQueries ?? [];

        // Extract grounding supports for inline citations
        const groundingSupports = grounding?.groundingSupports ?? [];

        return {
          success: true,
          data: {
            summary: text,
            sources,
            searchQueries,
            groundingSupports,
            model: modelId,
          },
        };

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        // Log the full error for debugging
        console.error('[grounding-tools] Search error:', error);

        // Handle known error cases
        if (errMsg.includes('google_search_retrieval')) {
          return {
            success: false,
            error: 'API error: Please use googleSearch instead of googleSearchRetrieval. The API has been updated.',
          };
        }

        if (errMsg.includes('controlled generation is not supported')) {
          return {
            success: false,
            error: 'Google Search cannot be used with structured output. This is a known API limitation.',
          };
        }

        if (errMsg.includes('not supported') || errMsg.includes('invalid tool') || errMsg.includes('Unknown field')) {
          return {
            success: false,
            error: `Google Search not available with model ${modelId}. Try using gemini-2.0-flash or gemini-1.5-flash.`,
          };
        }

        if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          return {
            success: false,
            error: 'Rate limit exceeded. Please wait a moment and try again.',
          };
        }

        if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED')) {
          return {
            success: false,
            error: 'API key invalid or lacks permission for Google Search.',
          };
        }

        if (errMsg.includes('400') || errMsg.includes('INVALID_ARGUMENT')) {
          return {
            success: false,
            error: `Invalid request: ${errMsg}`,
          };
        }

        // Generic error with full message
        return { success: false, error: `Search failed: ${errMsg}` };
      }
    },
  };

  return [groundedSearch];
}
