// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { PromptProviderId } from './types.js';

export type ProviderTemplateKey =
  | 'providers/google.md';

const PROVIDER_TEMPLATE_MAP: Record<PromptProviderId, ProviderTemplateKey> = {
  google: 'providers/google.md',
};

export function getProviderTemplateKey(provider: PromptProviderId): ProviderTemplateKey {
  return PROVIDER_TEMPLATE_MAP[provider] || 'providers/google.md';
}
