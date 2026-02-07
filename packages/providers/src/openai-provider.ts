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

