// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import type { ToolHandler, ToolResult } from '@cowork/core';

type SearchSource = {
  title: string;
  url: string;
};

function normalizeUrlSource(url: string, title?: string): SearchSource {
  try {
    return { title: title || new URL(url).hostname, url };
  } catch {
    return { title: title || url, url };
  }
}

async function runGoogleSearch(apiKey: string, modelId: string, query: string): Promise<{
  summary: string;
  sources: SearchSource[];
}> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: modelId || 'gemini-3-flash-preview',
    contents: `Search and provide current information about: ${query}`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || '';
  const candidate = response.candidates?.[0];
  const grounding = candidate?.groundingMetadata;
  const sources: SearchSource[] = [];

  if (grounding?.groundingChunks) {
    for (const chunk of grounding.groundingChunks) {
      const web = chunk.web;
      if (!web?.uri) continue;
      sources.push(normalizeUrlSource(web.uri, web.title));
    }
  }

  return { summary: text, sources };
}

async function runGoogleUrlFetch(
  apiKey: string,
  modelId: string,
  url: string,
  prompt?: string,
): Promise<{ content: string; sources: SearchSource[] }> {
  const ai = new GoogleGenAI({ apiKey });
  const userPrompt = prompt?.trim()
    ? `${prompt.trim()}\n\nURL: ${url}`
    : `Fetch this page and summarize its key content with useful details:\n${url}`;

  const response = await ai.models.generateContent({
    model: modelId || 'gemini-3-flash-preview',
    contents: userPrompt,
    config: {
      tools: [{ urlContext: {} }],
    },
  });

  return {
    content: response.text || '',
    sources: [normalizeUrlSource(url)],
  };
}

export function createGroundingTools(
  getGoogleApiKey: () => string | null,
  getProviderApiKey: (provider: 'google') => string | null,
  getSessionModel: () => string,
): ToolHandler[] {
  const resolveGoogleKey = () => getGoogleApiKey() || getProviderApiKey('google');

  const executeSearch = async (args: unknown): Promise<ToolResult> => {
    const { query, model } = args as { query: string; model?: string };
    if (!query?.trim()) {
      return { success: false, error: 'Search query cannot be empty.' };
    }

    const apiKey = resolveGoogleKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Google API key is required for web search.',
      };
    }

    try {
      const modelId = model || getSessionModel() || 'gemini-3-flash-preview';
      const result = await runGoogleSearch(apiKey, modelId, query);
      return {
        success: true,
        data: {
          ...result,
          providerUsed: 'google',
          fallbackUsed: false,
          model: modelId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const executeWebFetch = async (args: unknown): Promise<ToolResult> => {
    const { url, prompt, model } = args as { url: string; prompt?: string; model?: string };
    if (!url?.trim()) {
      return { success: false, error: 'URL cannot be empty.' };
    }

    const apiKey = resolveGoogleKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Google API key is required for web_fetch.',
      };
    }

    try {
      const modelId = model || getSessionModel() || 'gemini-3-flash-preview';
      const result = await runGoogleUrlFetch(apiKey, modelId, url, prompt);
      return {
        success: true,
        data: {
          ...result,
          providerUsed: 'google',
          fallbackUsed: false,
          model: modelId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const webSearchTool: ToolHandler = {
    name: 'web_search',
    description: 'Search the web with Google grounded search.',
    parameters: z.object({
      query: z.string().describe('Search query - be specific for better results'),
      model: z.string().optional().describe('Optional model override'),
    }),
    execute: executeSearch,
  };

  const compatibilityAlias: ToolHandler = {
    name: 'google_grounded_search',
    description: 'Compatibility alias for web_search using Google grounded search.',
    parameters: z.object({
      query: z.string().describe('Search query - be specific for better results'),
      model: z.string().optional().describe('Optional model override'),
    }),
    execute: executeSearch,
  };

  const webFetchTool: ToolHandler = {
    name: 'web_fetch',
    description: 'Fetch and summarize a web page using Google URL context.',
    parameters: z.object({
      url: z.string().describe('The page URL to fetch'),
      prompt: z.string().optional().describe('Optional instruction for what to extract from the page'),
      model: z.string().optional().describe('Optional model override'),
    }),
    execute: executeWebFetch,
  };

  return [webSearchTool, compatibilityAlias, webFetchTool];
}
