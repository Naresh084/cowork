// Types
export type {
  ProviderId,
  CanonicalProviderId,
  ProviderCredentials,
  ProviderConfig,
  ProviderDefinition,
  ProviderConnectionSettings,
  MediaRoutingSettings,
  ProviderCapabilities,
  ModelInfo,
  ModelCapability,
  ModelResolutionResult,
  GenerateRequest,
  GenerateResponse,
  StreamGenerateRequest,
  AIProvider,
} from './types.js';

export {
  ProviderIdSchema,
  CanonicalProviderIdSchema,
  PROVIDER_ALIAS_MAP,
  normalizeProviderId,
} from './types.js';
export {
  PROVIDER_REGISTRY,
  DEFAULT_PROVIDER_ID,
  getProviderDefinition,
  getProviderCapabilities,
  isBaseUrlEditable,
  getProviderDefaultBaseUrl,
} from './provider-registry.js';
export {
  PROVIDER_MODEL_CATALOGS,
  getCuratedCatalog,
} from './catalog/index.js';
export {
  listModels as listProviderModels,
  validateCredentials as validateProviderCredentials,
  resolveModelCatalog,
} from './model-service.js';

// Gemini Provider
export {
  GeminiProvider,
  GoogleProvider,
  createGeminiProvider,
  createGoogleProvider,
} from './gemini/gemini-provider.js';
export {
  runDeepResearch,
  type DeepResearchOptions,
  type DeepResearchResult,
} from './gemini/deep-research.js';
export {
  createComputerSession,
  runComputerUseStep,
  type ComputerUseSession,
} from './gemini/computer-use.js';
export {
  GEMINI_MODELS,
  DEFAULT_MODEL,
  getGeminiModel,
  hasCapability,
  getModelContextWindow,
  setModelContextWindows,
  fetchGeminiModels,
  MODEL_CONTEXT_WINDOWS,
  DEFAULT_CONTEXT_WINDOW,
} from './gemini/models.js';
export { OpenAIProvider, createOpenAIProvider } from './openai-provider.js';
export { AnthropicProvider, createAnthropicProvider } from './anthropic-provider.js';
export { OpenAICompatibleProvider } from './openai-compatible-provider.js';

// Re-export common types from shared
export type {
  Message,
  ToolDefinition,
  GenerationConfig,
  StreamChunk,
} from '@gemini-cowork/shared';

// Factory function to create providers
import type { AIProvider, ProviderId, ProviderConfig } from './types.js';
import { normalizeProviderId } from './types.js';
import { GoogleProvider } from './gemini/gemini-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

/**
 * Create an AI provider by ID.
 */
export function createProvider(id: ProviderId, config: ProviderConfig): AIProvider {
  const normalized = normalizeProviderId(id);

  switch (normalized) {
    case 'google':
      return new GoogleProvider({ ...config, providerId: 'google' });
    case 'openai':
      return new OpenAIProvider({ ...config, providerId: 'openai' });
    case 'anthropic':
      return new AnthropicProvider({ ...config, providerId: 'anthropic' });
    case 'openrouter':
      return new OpenAICompatibleProvider('openrouter', 'OpenRouter', { ...config, providerId: 'openrouter' });
    case 'moonshot':
      return new OpenAICompatibleProvider('moonshot', 'Moonshot (Kimi)', { ...config, providerId: 'moonshot' });
    case 'glm':
      return new OpenAICompatibleProvider('glm', 'GLM', { ...config, providerId: 'glm' });
    case 'deepseek':
      return new OpenAICompatibleProvider('deepseek', 'DeepSeek', { ...config, providerId: 'deepseek' });
    case 'lmstudio':
      return new OpenAICompatibleProvider('lmstudio', 'LM Studio', { ...config, providerId: 'lmstudio' });
    default:
      throw new Error(`Unknown provider: ${id}`);
  }
}
