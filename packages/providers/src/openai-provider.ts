// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ProviderConfig } from './types.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super('openai', 'OpenAI', config);
  }
}

export function createOpenAIProvider(config: ProviderConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}

