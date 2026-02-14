// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { getCuratedCatalog } from './catalog/index.js';
import { getProviderDefinition, getProviderDefaultBaseUrl } from './provider-registry.js';
import type {
  CanonicalProviderId,
  ModelInfo,
  ModelResolutionResult,
  ProviderCredentials,
} from './types.js';

function buildBaseUrl(providerId: CanonicalProviderId, baseUrl?: string): string {
  const fallback = getProviderDefaultBaseUrl(providerId) || '';
  return (baseUrl || fallback).replace(/\/+$/, '');
}

function normalizeModelEntries(
  providerId: CanonicalProviderId,
  payload: unknown,
): ModelInfo[] {
  const body = payload as {
    models?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
  };
  const rows = body.models || body.data || [];

  const normalized: ModelInfo[] = [];
  for (const row of rows) {
    const nameRaw = String(row.name || row.id || '').trim();
    const id = nameRaw.startsWith('models/') ? nameRaw.replace('models/', '') : nameRaw;
    if (!id) continue;

    const displayName = String(row.displayName || row.display_name || row.name || id);
    const descriptionRaw = String(row.description || '').trim();
    const inputTokenLimit = Number(
      row.inputTokenLimit || row.input_token_limit || row.contextWindow || row.context_window || 0,
    );
    const outputTokenLimit = Number(
      row.outputTokenLimit || row.output_token_limit || row.maxTokens || row.max_tokens || 0,
    );

    normalized.push({
      id,
      name: displayName,
      description: descriptionRaw || undefined,
      provider: providerId,
      capabilities: ['text_generation', 'code_generation', 'streaming', 'function_calling'],
      contextWindow: Number.isFinite(inputTokenLimit) && inputTokenLimit > 0 ? inputTokenLimit : undefined,
      maxTokens: Number.isFinite(outputTokenLimit) && outputTokenLimit > 0 ? outputTokenLimit : undefined,
    });
  }

  return normalized;
}

function requestForProvider(
  providerId: CanonicalProviderId,
  apiKey: string | undefined,
  baseUrl?: string,
): { url: string; init: RequestInit } | null {
  const resolvedBase = buildBaseUrl(providerId, baseUrl);
  const key = apiKey || '';

  switch (providerId) {
    case 'google': {
      const url = `${resolvedBase}/v1beta/models?key=${encodeURIComponent(key)}`;
      return { url, init: { method: 'GET' } };
    }
    case 'openai': {
      const url = `${resolvedBase}/v1/models`;
      return {
        url,
        init: {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        },
      };
    }
    case 'anthropic': {
      const url = `${resolvedBase}/v1/models`;
      return {
        url,
        init: {
          method: 'GET',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
        },
      };
    }
    case 'openrouter': {
      const url = `${resolvedBase}/v1/models`;
      return {
        url,
        init: {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        },
      };
    }
    case 'moonshot': {
      const url = `${resolvedBase}/v1/models`;
      return {
        url,
        init: {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        },
      };
    }
    case 'deepseek': {
      const url = `${resolvedBase}/models`;
      return {
        url,
        init: {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        },
      };
    }
    case 'lmstudio': {
      const url = `${resolvedBase}/v1/models`;
      const headers: Record<string, string> = {};
      if (apiKey?.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
      }
      return {
        url,
        init: {
          method: 'GET',
          headers,
        },
      };
    }
    case 'glm':
      return null;
    default:
      return null;
  }
}

export async function listModels(
  providerId: CanonicalProviderId,
  credentials: ProviderCredentials,
  baseUrl?: string,
): Promise<ModelInfo[]> {
  const provider = getProviderDefinition(providerId);
  const apiKey = credentials.type === 'api_key' ? credentials.apiKey?.trim() : '';
  const keyRequiredForModelApi = providerId !== 'lmstudio';
  if ((keyRequiredForModelApi && !apiKey) || !provider.modelApiSupported) {
    return getCuratedCatalog(providerId).models;
  }

  const request = requestForProvider(providerId, apiKey, baseUrl);
  if (!request) {
    return getCuratedCatalog(providerId).models;
  }

  const response = await fetch(request.url, request.init);
  if (!response.ok) {
    throw new Error(`Failed to fetch models (${providerId}): ${response.status}`);
  }

  const body = await response.json();
  const models = normalizeModelEntries(providerId, body);
  return models.length > 0 ? models : getCuratedCatalog(providerId).models;
}

export async function validateCredentials(
  providerId: CanonicalProviderId,
  credentials: ProviderCredentials,
  baseUrl?: string,
): Promise<boolean> {
  const provider = getProviderDefinition(providerId);
  const apiKey = credentials.type === 'api_key' ? credentials.apiKey?.trim() : '';
  if (!apiKey && providerId !== 'lmstudio') return false;

  if (!provider.modelApiSupported) {
    // For providers without a stable model endpoint, treat non-empty key as syntactically valid.
    return true;
  }

  const request = requestForProvider(providerId, apiKey, baseUrl);
  if (!request) return true;

  try {
    const response = await fetch(request.url, request.init);
    if ((providerId === 'moonshot' || providerId === 'deepseek') && !response.ok) {
      // For these providers, model endpoint reliability can vary; only treat
      // explicit auth failures as invalid credentials.
      return response.status !== 401 && response.status !== 403;
    }
    return response.ok;
  } catch {
    if (providerId === 'moonshot' || providerId === 'deepseek') {
      return true;
    }
    return false;
  }
}

export async function resolveModelCatalog(
  providerId: CanonicalProviderId,
  credentials: ProviderCredentials,
  baseUrl?: string,
): Promise<ModelResolutionResult> {
  const provider = getProviderDefinition(providerId);
  const apiKey = credentials.type === 'api_key' ? credentials.apiKey?.trim() : '';
  try {
    const models = await listModels(providerId, credentials, baseUrl);
    const source = provider.modelApiSupported && Boolean(apiKey) ? 'api' : 'curated';

    return { models, source };
  } catch {
    return {
      models: getCuratedCatalog(providerId).models,
      source: 'curated',
    };
  }
}
