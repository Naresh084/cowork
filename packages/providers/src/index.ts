// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

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

// Re-export common types from shared
export type {
  Message,
  ToolDefinition,
  GenerationConfig,
  StreamChunk,
} from '@cowork/shared';

// Factory function to create providers
import type { AIProvider, ProviderId, ProviderConfig } from './types.js';
import { GoogleProvider } from './gemini/gemini-provider.js';

/**
 * Create an AI provider by ID.
 */
export function createProvider(_id: ProviderId, config: ProviderConfig): AIProvider {
  return new GoogleProvider({ ...config, providerId: 'google' });
}
