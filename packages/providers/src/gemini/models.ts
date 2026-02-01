import type { ModelInfo, ModelCapability } from '../types.js';

// ============================================================================
// Gemini Models
// ============================================================================

export const GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash (Experimental)',
    description: 'Latest Gemini 2.0 flash model with multimodal capabilities',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    contextWindow: 1000000,
    maxTokens: 8192,
  },
  {
    id: 'gemini-2.0-flash-thinking-exp',
    name: 'Gemini 2.0 Flash Thinking (Experimental)',
    description: 'Gemini 2.0 with extended thinking capabilities',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming', 'thinking'],
    contextWindow: 1000000,
    maxTokens: 32768,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'Most capable Gemini model with 2M context window',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    contextWindow: 2000000,
    maxTokens: 8192,
    inputPricing: 1.25,
    outputPricing: 5.0,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Fast and efficient model for most tasks',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    contextWindow: 1000000,
    maxTokens: 8192,
    inputPricing: 0.075,
    outputPricing: 0.30,
  },
  {
    id: 'gemini-1.5-flash-8b',
    name: 'Gemini 1.5 Flash 8B',
    description: 'Smallest and fastest Flash model',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming'],
    contextWindow: 1000000,
    maxTokens: 8192,
    inputPricing: 0.0375,
    outputPricing: 0.15,
  },
];

export const DEFAULT_MODEL = 'gemini-2.0-flash-exp';

/**
 * Get a model by ID.
 */
export function getGeminiModel(modelId: string): ModelInfo | undefined {
  return GEMINI_MODELS.find((m) => m.id === modelId);
}

/**
 * Check if a model has a specific capability.
 */
export function hasCapability(modelId: string, capability: ModelCapability): boolean {
  const model = getGeminiModel(modelId);
  return model?.capabilities.includes(capability) ?? false;
}
