/**
 * Centralized Model Configuration
 *
 * All AI models used by the sidecar tools are configurable via environment variables.
 * See .env.example in the project root for available options.
 */

// Default models - used when environment variables are not set
const DEFAULT_MODELS = {
  // Search and grounding
  SEARCH_MODEL: 'gemini-2.0-flash',

  // Deep research
  DEEP_RESEARCH_AGENT: 'deep-research-pro-preview-12-2025',

  // Image generation and editing
  IMAGE_GENERATION_MODEL: 'imagen-4.0-generate-001',
  IMAGE_EDITING_MODEL: 'imagen-3.0-capability-001',

  // Video generation and analysis
  VIDEO_GENERATION_MODEL: 'veo-3.1-generate-preview',
  VIDEO_ANALYSIS_MODEL: 'gemini-2.5-pro',

  // Computer use / browser automation
  COMPUTER_USE_MODEL: 'gemini-2.5-computer-use-preview-10-2025',

  // Default chat/agent model
  DEFAULT_AGENT_MODEL: 'gemini-3-flash-preview',
} as const;

export interface ModelConfig {
  searchModel: string;
  deepResearchAgent: string;
  imageGenerationModel: string;
  imageEditingModel: string;
  videoGenerationModel: string;
  videoAnalysisModel: string;
  computerUseModel: string;
  defaultAgentModel: string;
}

/**
 * Get model configuration from environment variables with fallback to defaults.
 */
export function getModelConfig(): ModelConfig {
  return {
    searchModel: process.env.GEMINI_SEARCH_MODEL || DEFAULT_MODELS.SEARCH_MODEL,
    deepResearchAgent: process.env.GEMINI_DEEP_RESEARCH_AGENT || DEFAULT_MODELS.DEEP_RESEARCH_AGENT,
    imageGenerationModel:
      process.env.GEMINI_IMAGE_GENERATION_MODEL || DEFAULT_MODELS.IMAGE_GENERATION_MODEL,
    imageEditingModel:
      process.env.GEMINI_IMAGE_EDITING_MODEL || DEFAULT_MODELS.IMAGE_EDITING_MODEL,
    videoGenerationModel:
      process.env.GEMINI_VIDEO_GENERATION_MODEL || DEFAULT_MODELS.VIDEO_GENERATION_MODEL,
    videoAnalysisModel:
      process.env.GEMINI_VIDEO_ANALYSIS_MODEL || DEFAULT_MODELS.VIDEO_ANALYSIS_MODEL,
    computerUseModel: process.env.GEMINI_COMPUTER_USE_MODEL || DEFAULT_MODELS.COMPUTER_USE_MODEL,
    defaultAgentModel:
      process.env.GEMINI_DEFAULT_AGENT_MODEL || DEFAULT_MODELS.DEFAULT_AGENT_MODEL,
  };
}

/**
 * Get a specific model by key.
 */
export function getModel(key: keyof ModelConfig): string {
  const config = getModelConfig();
  return config[key];
}

/**
 * Log the current model configuration (useful for debugging).
 * This is a no-op in production.
 */
export function logModelConfig(): void {
  // Logging disabled in production
}

// Export defaults for reference
export { DEFAULT_MODELS };
