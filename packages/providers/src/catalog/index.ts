// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { CanonicalProviderId, ModelInfo } from '../types.js';

export interface ProviderModelCatalog {
  provider: CanonicalProviderId;
  lastVerifiedAt: string;
  source: string;
  models: ModelInfo[];
}

const GOOGLE_CATALOG: ProviderModelCatalog = {
  provider: 'google',
  lastVerifiedAt: '2026-02-20',
  source: 'https://ai.google.dev/gemini-api/docs/models',
  models: [
    {
      id: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash Preview',
      description: 'Latest fast preview model.',
      provider: 'google',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 1048576,
      maxTokens: 65536,
    },
    {
      id: 'gemini-3-pro-preview',
      name: 'Gemini 3 Pro Preview',
      description: 'Latest reasoning-focused preview model.',
      provider: 'google',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 1048576,
      maxTokens: 65536,
    },
  ],
};

export const PROVIDER_MODEL_CATALOGS: Record<CanonicalProviderId, ProviderModelCatalog> = {
  google: GOOGLE_CATALOG,
};

export function getCuratedCatalog(providerId: CanonicalProviderId): ProviderModelCatalog {
  return PROVIDER_MODEL_CATALOGS[providerId];
}
