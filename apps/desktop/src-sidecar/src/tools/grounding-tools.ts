import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ToolHandler, ToolResult } from '@gemini-cowork/core';

export function createGroundingTools(getApiKey: () => string | null): ToolHandler[] {
  const groundedSearch: ToolHandler = {
    name: 'google_grounded_search',
    description: 'Run a Google-grounded search and return a summary with citations.',
    parameters: z.object({
      query: z.string().describe('Search query'),
      model: z.string().optional().describe('Gemini model id for grounded search'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const apiKey = getApiKey();
      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
      }

      const { query, model } = args as { query: string; model?: string };
      const client = new GoogleGenerativeAI(apiKey);
      const gm = client.getGenerativeModel({ model: model || 'gemini-2.5-flash' });
      const result = await gm.generateContent({
        contents: [{ role: 'user', parts: [{ text: query }] }],
        tools: [{ googleSearchRetrieval: {} }],
      });

      const response = result.response;
      const text = response.text();
      const grounding = response.candidates?.[0]?.groundingMetadata;
      const sources = (grounding?.groundingChunks ?? [])
        .map((chunk: { web?: { title?: string; uri?: string } }) => {
          const web = chunk.web;
          if (!web?.uri) return null;
          return { title: web.title || web.uri, url: web.uri };
        })
        .filter((source): source is { title: string; url: string } => Boolean(source));

      const searchQueries = grounding?.webSearchQueries ?? [];

      return {
        success: true,
        data: {
          summary: text,
          sources,
          searchQueries,
        },
      };
    },
  };

  return [groundedSearch];
}
