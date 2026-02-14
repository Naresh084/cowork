// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import type { ToolHandler, ToolResult } from '@cowork/core';
import type { ProviderId } from '../types.js';

type SearchSource = {
  title: string;
  url: string;
};

type ExternalSearchProvider = 'google' | 'exa' | 'tavily';

const NATIVE_WEB_SEARCH_PROVIDERS = new Set<ProviderId>([
  'google',
  'openai',
  'anthropic',
  'moonshot',
  'glm',
]);

class CapabilityError extends Error {
  readonly code = 'capability_unavailable';
}

function ensureOpenAIBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl || 'https://api.openai.com').trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
}

function normalizeUrlSource(url: string, title?: string): SearchSource {
  try {
    return { title: title || new URL(url).hostname, url };
  } catch {
    return { title: title || url, url };
  }
}

function ensureGlmReaderEndpoint(baseUrl?: string): string {
  const trimmed = (baseUrl || 'https://open.bigmodel.cn/api/paas').trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v4')) return `${trimmed}/reader`;
  return `${trimmed}/v4/reader`;
}

async function runGoogleSearch(apiKey: string, modelId: string, query: string): Promise<{
  summary: string;
  sources: SearchSource[];
}> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: modelId || 'gemini-2.0-flash',
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

async function runExaSearch(apiKey: string, query: string): Promise<{
  summary: string;
  sources: SearchSource[];
}> {
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: 8,
      useAutoprompt: true,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Exa search failed (${res.status}): ${bodyText}`);
  }

  const data = JSON.parse(bodyText) as {
    answer?: string;
    summary?: string;
    results?: Array<{ title?: string; url?: string; text?: string }>;
  };
  const sources: SearchSource[] = (data.results || [])
    .filter((row) => Boolean(row?.url))
    .map((row) => normalizeUrlSource(row.url || '', row.title));

  const summary =
    data.answer?.trim() ||
    data.summary?.trim() ||
    (data.results || [])
      .slice(0, 5)
      .map((row) => row?.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();

  return { summary, sources };
}

async function runTavilySearch(apiKey: string, query: string): Promise<{
  summary: string;
  sources: SearchSource[];
}> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      include_answer: true,
      max_results: 8,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Tavily search failed (${res.status}): ${bodyText}`);
  }

  const data = JSON.parse(bodyText) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const sources: SearchSource[] = (data.results || [])
    .filter((row) => Boolean(row?.url))
    .map((row) => normalizeUrlSource(row.url || '', row.title));

  const summary =
    data.answer?.trim() ||
    (data.results || [])
      .slice(0, 5)
      .map((row) => row?.content || '')
      .filter(Boolean)
      .join('\n')
      .trim();

  return { summary, sources };
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
    model: modelId || 'gemini-2.0-flash',
    contents: userPrompt,
    config: {
      tools: [{ urlContext: {} }],
    },
  });

  const text = response.text || '';
  return {
    content: text,
    sources: [normalizeUrlSource(url)],
  };
}

async function runOpenAICompatibleSearch(
  provider: ProviderId,
  apiKey: string,
  baseUrl: string | undefined,
  modelId: string,
  query: string,
): Promise<{ summary: string; sources: SearchSource[] }> {
  const endpoint = ensureOpenAIBaseUrl(baseUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://cowork.local';
    headers['X-Title'] = 'Gemini Cowork';
  }

  // OpenAI first: responses API web_search_preview.
  if (provider === 'openai') {
    const responsesRes = await fetch(`${endpoint}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        input: query,
        tools: [{ type: 'web_search_preview' }],
      }),
    });

    if (responsesRes.ok) {
      const data = (await responsesRes.json()) as {
        output_text?: string;
        output?: Array<{
          content?: Array<{ type?: string; text?: string; url?: string; title?: string }>;
        }>;
      };
      const summary = data.output_text || '';
      const sources: SearchSource[] = [];
      for (const block of data.output || []) {
        for (const part of block.content || []) {
          if (part.type === 'url_citation' && part.url) {
            sources.push(normalizeUrlSource(part.url, part.title));
          }
        }
      }
      return { summary, sources };
    }

    const responseText = await responsesRes.text();
    const capabilityFailure =
      responsesRes.status === 404 ||
      responsesRes.status === 422 ||
      /web_search|tool|responses|unsupported|not supported|invalid/i.test(responseText);
    if (!capabilityFailure && responsesRes.status !== 400) {
      throw new Error(`Provider search failed (${responsesRes.status}): ${responseText}`);
    }
  }

  const chatBody: Record<string, unknown> = {
    model: modelId,
    messages: [{ role: 'user', content: `Search the web and summarize: ${query}` }],
  };

  if (provider === 'openrouter') {
    // OpenRouter native search plugin.
    chatBody.plugins = [{ id: 'web' }];
  } else if (provider === 'glm') {
    // GLM native web search tool.
    chatBody.tools = [{ type: 'web_search', web_search: { enable: true, search_result: true } }];
    chatBody.tool_choice = 'auto';
  } else {
    // OpenAI-compatible web search tool shape.
    chatBody.tools = [{ type: 'web_search' }];
    chatBody.tool_choice = 'auto';
  }

  const chatRes = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(chatBody),
  });

  const chatText = await chatRes.text();
  if (!chatRes.ok) {
    const capabilityFailure =
      chatRes.status === 404 ||
      chatRes.status === 422 ||
      /web_search|plugin|tool|unsupported|not supported|invalid/i.test(chatText);
    if (capabilityFailure) {
      throw new CapabilityError(`Native web search not available for provider ${provider}`);
    }
    throw new Error(`Provider search failed (${chatRes.status}): ${chatText}`);
  }

  const chatData = JSON.parse(chatText) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const summary = chatData.choices?.[0]?.message?.content || '';
  return { summary, sources: [] };
}

async function runAnthropicSearch(
  apiKey: string,
  modelId: string,
  query: string,
): Promise<{ summary: string; sources: SearchSource[] }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1200,
      messages: [{ role: 'user', content: query }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    const capabilityFailure =
      res.status === 404 ||
      res.status === 422 ||
      /web_search|tool|unsupported|not supported|invalid/i.test(bodyText);
    if (capabilityFailure) {
      throw new CapabilityError('Anthropic web search not available for this account/model.');
    }
    throw new Error(`Anthropic search failed (${res.status}): ${bodyText}`);
  }

  const data = JSON.parse(bodyText) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const summary = (data.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('\n')
    .trim();

  return { summary, sources: [] };
}

async function runAnthropicWebFetch(
  apiKey: string,
  modelId: string,
  url: string,
  prompt?: string,
): Promise<{ content: string; sources: SearchSource[] }> {
  const userPrompt = prompt?.trim()
    ? `${prompt.trim()}\n\nURL: ${url}`
    : `Fetch this URL and summarize its most important content:\n${url}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-fetch-2025-09-10',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1400,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: userPrompt }],
        },
      ],
      tools: [{ type: 'web_fetch_20250910', name: 'web_fetch' }],
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    const capabilityFailure =
      res.status === 404 ||
      res.status === 422 ||
      /web_fetch|tool|unsupported|not supported|invalid/i.test(bodyText);
    if (capabilityFailure) {
      throw new CapabilityError('Anthropic web_fetch not available for this account/model.');
    }
    throw new Error(`Anthropic web_fetch failed (${res.status}): ${bodyText}`);
  }

  const data = JSON.parse(bodyText) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const content = (data.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('\n')
    .trim();

  return {
    content,
    sources: [normalizeUrlSource(url)],
  };
}

async function runGlmWebFetch(
  apiKey: string,
  baseUrl: string | undefined,
  url: string,
  prompt?: string,
): Promise<{ content: string; sources: SearchSource[] }> {
  const endpoint = ensureGlmReaderEndpoint(baseUrl);
  const requestBody: Record<string, unknown> = { url };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    const capabilityFailure =
      res.status === 404 ||
      res.status === 422 ||
      /web_reader|reader|tool|unsupported|not supported|invalid/i.test(bodyText);
    if (capabilityFailure) {
      throw new CapabilityError('GLM web_reader is not available for this account/base URL.');
    }
    throw new Error(`GLM web_fetch failed (${res.status}): ${bodyText}`);
  }

  try {
    const data = JSON.parse(bodyText) as {
      reader_result?: {
        content?: string;
        description?: string;
        title?: string;
        url?: string;
      };
    };
    const result = data.reader_result || {};
    const content = [
      result.title ? `# ${result.title}` : '',
      prompt?.trim() ? `Focus requested: ${prompt.trim()}` : '',
      result.description || '',
      result.content || '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();
    return {
      content: content || bodyText,
      sources: [normalizeUrlSource(result.url || url, result.title)],
    };
  } catch {
    return {
      content: bodyText,
      sources: [normalizeUrlSource(url)],
    };
  }
}

export function createGroundingTools(
  getActiveProvider: () => ProviderId,
  getProviderApiKey: (provider: ProviderId) => string | null,
  getProviderBaseUrl: (provider: ProviderId) => string | undefined,
  getGoogleApiKey: () => string | null,
  getExternalSearchProvider: () => ExternalSearchProvider,
  getExaApiKey: () => string | null,
  getTavilyApiKey: () => string | null,
  getSessionModel: () => string,
): ToolHandler[] {
  const runConfiguredExternalSearch = async (
    provider: ExternalSearchProvider,
    query: string,
  ): Promise<{ summary: string; sources: SearchSource[]; providerUsed: 'exa' | 'tavily' }> => {
    if (provider === 'exa') {
      const key = getExaApiKey();
      if (!key) {
        throw new CapabilityError('Exa API key is not configured.');
      }
      const result = await runExaSearch(key, query);
      return { ...result, providerUsed: 'exa' };
    }

    if (provider === 'tavily') {
      const key = getTavilyApiKey();
      if (!key) {
        throw new CapabilityError('Tavily API key is not configured.');
      }
      const result = await runTavilySearch(key, query);
      return { ...result, providerUsed: 'tavily' };
    }

    throw new CapabilityError('External search provider is not configured.');
  };

  const executeSearch = async (args: unknown): Promise<ToolResult> => {
    const { query, model } = args as { query: string; model?: string };
    if (!query?.trim()) {
      return { success: false, error: 'Search query cannot be empty.' };
    }

    const provider = getActiveProvider();
    const modelId = model || getSessionModel() || 'gemini-2.0-flash';

    let nativeError: string | null = null;
    try {
      if (provider === 'google') {
        const apiKey = getProviderApiKey('google') || getGoogleApiKey();
        if (!apiKey) {
          nativeError = 'Google API key is required for web search.';
        } else {
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
        }
      } else if (NATIVE_WEB_SEARCH_PROVIDERS.has(provider)) {
        const apiKey = getProviderApiKey(provider);
        if (!apiKey) {
          nativeError = `API key not configured for provider ${provider}`;
        } else {
          const nativeResult =
            provider === 'anthropic'
              ? await runAnthropicSearch(apiKey, modelId, query)
              : await runOpenAICompatibleSearch(
                  provider,
                  apiKey,
                  getProviderBaseUrl(provider),
                  modelId,
                  query,
                );

          return {
            success: true,
            data: {
              ...nativeResult,
              providerUsed: provider,
              fallbackUsed: false,
              model: modelId,
            },
          };
        }
      } else {
        nativeError = `Native web search is not supported for provider ${provider}`;
      }
    } catch (error) {
      nativeError = error instanceof Error ? error.message : String(error);
    }

    const externalProvider = getExternalSearchProvider();
    if (externalProvider !== 'google') {
      try {
        const externalResult = await runConfiguredExternalSearch(externalProvider, query);
        return {
          success: true,
          data: {
            summary: externalResult.summary,
            sources: externalResult.sources,
            providerUsed: externalResult.providerUsed,
            fallbackUsed: true,
            model: 'n/a',
          },
        };
      } catch (externalError) {
        const externalMessage = externalError instanceof Error ? externalError.message : String(externalError);
        nativeError = nativeError ? `${nativeError}; ${externalMessage}` : externalMessage;
      }
    }

    try {
      const googleKey = getGoogleApiKey() || getProviderApiKey('google');
      if (!googleKey) {
        return {
          success: false,
          error: `Search failed and no fallback key is available${nativeError ? `: ${nativeError}` : '.'}`,
        };
      }
      const fallbackResult = await runGoogleSearch(googleKey, 'gemini-2.0-flash', query);
      return {
        success: true,
        data: {
          ...fallbackResult,
          providerUsed: 'google',
          fallbackUsed: true,
          model: 'gemini-2.0-flash',
        },
      };
    } catch (googleError) {
      const googleMessage = googleError instanceof Error ? googleError.message : String(googleError);
      const combined = nativeError ? `${nativeError}; ${googleMessage}` : googleMessage;
      return { success: false, error: `Search failed: ${combined}` };
    }
  };

  const executeWebFetch = async (args: unknown): Promise<ToolResult> => {
    const { url, prompt, model } = args as { url: string; prompt?: string; model?: string };
    if (!url?.trim()) {
      return { success: false, error: 'URL cannot be empty.' };
    }

    const provider = getActiveProvider();
    const modelId = model || getSessionModel() || 'gemini-2.0-flash';

    try {
      if (provider === 'anthropic') {
        const anthropicKey = getProviderApiKey('anthropic');
        if (!anthropicKey) {
          return { success: false, error: 'Anthropic API key is required for web_fetch on Anthropic.' };
        }

        const result = await runAnthropicWebFetch(anthropicKey, modelId, url, prompt);
        return {
          success: true,
          data: {
            ...result,
            providerUsed: 'anthropic',
            fallbackUsed: false,
            model: modelId,
          },
        };
      }

      if (provider === 'glm') {
        const glmKey = getProviderApiKey('glm');
        if (!glmKey) {
          return { success: false, error: 'GLM API key is required for web_fetch on GLM.' };
        }

        const result = await runGlmWebFetch(glmKey, getProviderBaseUrl('glm'), url, prompt);
        return {
          success: true,
          data: {
            ...result,
            providerUsed: 'glm',
            fallbackUsed: false,
            model: modelId,
          },
        };
      }

      const googleKey = getGoogleApiKey() || getProviderApiKey('google');
      if (!googleKey) {
        return {
          success: false,
          error:
            provider === 'google'
              ? 'Google API key is required for web_fetch on Google.'
              : 'Google API key is required for web_fetch fallback on this provider.',
        };
      }

      const result = await runGoogleUrlFetch(googleKey, 'gemini-2.0-flash', url, prompt);
      return {
        success: true,
        data: {
          ...result,
          providerUsed: 'google',
          fallbackUsed: provider !== 'google',
          model: 'gemini-2.0-flash',
        },
      };
    } catch (error) {
      if (provider === 'glm') {
        const googleKey = getGoogleApiKey() || getProviderApiKey('google');
        if (googleKey && error instanceof CapabilityError) {
          const fallbackResult = await runGoogleUrlFetch(googleKey, 'gemini-2.0-flash', url, prompt);
          return {
            success: true,
            data: {
              ...fallbackResult,
              providerUsed: 'google',
              fallbackUsed: true,
              model: 'gemini-2.0-flash',
            },
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const webSearchTool: ToolHandler = {
    name: 'web_search',
    description:
      'Search the web using provider-native search. Falls back to configured external search (Exa/Tavily) or Google.',
    parameters: z.object({
      query: z.string().describe('Search query - be specific for better results'),
      model: z.string().optional().describe('Optional model override'),
    }),
    execute: executeSearch,
  };

  const compatibilityAlias: ToolHandler = {
    name: 'google_grounded_search',
    description:
      'Compatibility alias for web_search. Uses provider-native search first, then external/Google fallback.',
    parameters: z.object({
      query: z.string().describe('Search query - be specific for better results'),
      model: z.string().optional().describe('Optional model override'),
    }),
    execute: executeSearch,
  };

  const webFetchTool: ToolHandler = {
    name: 'web_fetch',
    description:
      'Fetch and summarize a web page. Uses Anthropic web_fetch on Anthropic, GLM web_reader on GLM, Google URL Context on Google, and Google fallback for other providers.',
    parameters: z.object({
      url: z.string().describe('The page URL to fetch'),
      prompt: z.string().optional().describe('Optional instruction for what to extract from the page'),
      model: z.string().optional().describe('Optional model override'),
    }),
    execute: executeWebFetch,
  };

  return [webSearchTool, compatibilityAlias, webFetchTool];
}
