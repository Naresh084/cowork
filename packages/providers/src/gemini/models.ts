import type { ModelInfo, ModelCapability } from '../types.js';

// ============================================================================
// Gemini Models - Context Window Reference (from API docs)
// https://ai.google.dev/gemini-api/docs/models
// ============================================================================

/**
 * Model context window limits from Gemini API documentation.
 * These are updated based on official Google AI documentation.
 * Use fetchGeminiModels() to get the latest values from the API.
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, { input: number; output: number }> = {
  // Gemini 3 models (Latest - Preview)
  'gemini-3-pro-preview': { input: 1048576, output: 65536 },
  'gemini-3-flash-preview': { input: 1048576, output: 65536 },

  // Gemini 2.5 models (Stable)
  'gemini-2.5-pro': { input: 1048576, output: 65536 },
  'gemini-2.5-flash': { input: 1048576, output: 65536 },
  'gemini-2.5-flash-lite': { input: 1048576, output: 65536 },

  // Gemini 2.0 models (Deprecated March 2026)
  'gemini-2.0-flash': { input: 1048576, output: 8192 },

  // Gemini 1.5 models
  'gemini-1.5-pro': { input: 2097152, output: 8192 },
  'gemini-1.5-flash': { input: 1048576, output: 8192 },
};

/**
 * Default context window size when model is not found in the map.
 * Conservative default based on most common model limits.
 */
export const DEFAULT_CONTEXT_WINDOW = {
  input: 1048576,  // 1M tokens
  output: 8192,    // 8K tokens
};

/**
 * Get context window for a model by ID.
 * Falls back to default if model is not in the known list.
 */
export function getModelContextWindow(modelId: string): { input: number; output: number } {
  // Try exact match first
  if (MODEL_CONTEXT_WINDOWS[modelId]) {
    return MODEL_CONTEXT_WINDOWS[modelId];
  }

  // Try partial match (for versioned models like gemini-3.0-flash-preview-0125)
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (modelId.startsWith(key) || modelId.includes(key)) {
      return value;
    }
  }

  return DEFAULT_CONTEXT_WINDOW;
}

// Static model definitions (fallback when API is not available)
export const GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    description: 'Latest preview - balanced speed and intelligence',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    contextWindow: MODEL_CONTEXT_WINDOWS['gemini-3-flash-preview'].input,
    maxTokens: MODEL_CONTEXT_WINDOWS['gemini-3-flash-preview'].output,
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    description: 'Latest preview - complex reasoning',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    contextWindow: MODEL_CONTEXT_WINDOWS['gemini-3-pro-preview'].input,
    maxTokens: MODEL_CONTEXT_WINDOWS['gemini-3-pro-preview'].output,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Stable - cost-efficient, low-latency',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    contextWindow: MODEL_CONTEXT_WINDOWS['gemini-2.5-flash'].input,
    maxTokens: MODEL_CONTEXT_WINDOWS['gemini-2.5-flash'].output,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Stable - complex reasoning',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    contextWindow: MODEL_CONTEXT_WINDOWS['gemini-2.5-pro'].input,
    maxTokens: MODEL_CONTEXT_WINDOWS['gemini-2.5-pro'].output,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: '2M context window',
    provider: 'gemini',
    capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    contextWindow: MODEL_CONTEXT_WINDOWS['gemini-1.5-pro'].input,
    maxTokens: MODEL_CONTEXT_WINDOWS['gemini-1.5-pro'].output,
    inputPricing: 1.25,
    outputPricing: 5.0,
  },
];

export const DEFAULT_MODEL = 'gemini-3-flash-preview';

/**
 * Fetch models from Gemini API.
 * Returns model list with accurate context window sizes.
 *
 * API endpoint: GET https://generativelanguage.googleapis.com/v1beta/models
 */
export async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    models: Array<{
      name: string;
      displayName: string;
      description: string;
      inputTokenLimit: number;
      outputTokenLimit: number;
      supportedGenerationMethods: string[];
    }>;
  };

  return data.models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => {
      // Extract model ID from name (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
      const id = m.name.replace('models/', '');

      return {
        id,
        name: m.displayName || id,
        description: m.description || '',
        provider: 'gemini' as const,
        capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming'] as ModelCapability[],
        contextWindow: m.inputTokenLimit,
        maxTokens: m.outputTokenLimit,
      };
    });
}

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
