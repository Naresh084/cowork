// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type {
  CanonicalProviderId,
  ProviderCapabilities,
  ProviderDefinition,
} from './types.js';

export const PROVIDER_REGISTRY: Record<CanonicalProviderId, ProviderDefinition> = {
  google: {
    id: 'google',
    name: 'Google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    baseUrlEditable: false,
    modelApiSupported: true,
    nativeWebSearchSupported: true,
    media: {
      imageGeneration: true,
      videoGeneration: true,
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com',
    baseUrlEditable: false,
    modelApiSupported: true,
    nativeWebSearchSupported: true,
    media: {
      imageGeneration: true,
      videoGeneration: true,
    },
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    baseUrlEditable: false,
    modelApiSupported: true,
    nativeWebSearchSupported: true,
    media: {
      imageGeneration: false,
      videoGeneration: false,
    },
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api',
    baseUrlEditable: true,
    modelApiSupported: true,
    nativeWebSearchSupported: false,
    media: {
      imageGeneration: false,
      videoGeneration: false,
    },
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    defaultBaseUrl: 'https://api.moonshot.ai',
    baseUrlEditable: true,
    modelApiSupported: true,
    nativeWebSearchSupported: true,
    media: {
      imageGeneration: false,
      videoGeneration: false,
    },
  },
  glm: {
    id: 'glm',
    name: 'GLM (Zhipu)',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas',
    baseUrlEditable: true,
    modelApiSupported: false,
    nativeWebSearchSupported: true,
    media: {
      imageGeneration: false,
      videoGeneration: false,
    },
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    baseUrlEditable: true,
    modelApiSupported: true,
    nativeWebSearchSupported: false,
    media: {
      imageGeneration: false,
      videoGeneration: false,
    },
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    defaultBaseUrl: 'http://127.0.0.1:1234',
    baseUrlEditable: true,
    modelApiSupported: true,
    nativeWebSearchSupported: false,
    media: {
      imageGeneration: false,
      videoGeneration: false,
    },
  },
};

export const DEFAULT_PROVIDER_ID: CanonicalProviderId = 'google';

export function getProviderDefinition(providerId: CanonicalProviderId): ProviderDefinition {
  return PROVIDER_REGISTRY[providerId];
}

export function getProviderCapabilities(providerId: CanonicalProviderId): ProviderCapabilities {
  const def = PROVIDER_REGISTRY[providerId];
  return {
    supportsChat: true,
    supportsToolCalling: true,
    supportsNativeWebSearch: def.nativeWebSearchSupported,
    supportsVision: true,
    supportsImageGen: def.media.imageGeneration,
    supportsVideoGen: def.media.videoGeneration,
  };
}

export function isBaseUrlEditable(providerId: CanonicalProviderId): boolean {
  return PROVIDER_REGISTRY[providerId].baseUrlEditable;
}

export function getProviderDefaultBaseUrl(providerId: CanonicalProviderId): string | undefined {
  return PROVIDER_REGISTRY[providerId].defaultBaseUrl;
}
