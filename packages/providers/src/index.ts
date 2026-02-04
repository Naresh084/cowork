// Types
export type {
  ProviderId,
  ProviderCredentials,
  ProviderConfig,
  ModelInfo,
  ModelCapability,
  GenerateRequest,
  GenerateResponse,
  StreamGenerateRequest,
  AIProvider,
} from './types.js';

export { ProviderIdSchema } from './types.js';

// Gemini Provider
export { GeminiProvider, createGeminiProvider } from './gemini/gemini-provider.js';
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
} from '@gemini-cowork/shared';

// Factory function to create providers
import type { AIProvider, ProviderId, ProviderConfig } from './types.js';
import { GeminiProvider } from './gemini/gemini-provider.js';

/**
 * Create an AI provider by ID.
 */
export function createProvider(id: ProviderId, config: ProviderConfig): AIProvider {
  switch (id) {
    case 'gemini':
      return new GeminiProvider(config);
    default:
      throw new Error(`Unknown provider: ${id}`);
  }
}
