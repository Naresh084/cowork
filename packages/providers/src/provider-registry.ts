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
