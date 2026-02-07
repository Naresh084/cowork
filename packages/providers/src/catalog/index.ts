import type { CanonicalProviderId, ModelInfo } from '../types.js';

export interface ProviderModelCatalog {
  provider: CanonicalProviderId;
  lastVerifiedAt: string;
  source: string;
  models: ModelInfo[];
}

const GOOGLE_CATALOG: ProviderModelCatalog = {
  provider: 'google',
  lastVerifiedAt: '2026-02-06',
  source: 'https://ai.google.dev/gemini-api/docs/models',
  models: [
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'Fast general-purpose model.',
      provider: 'google',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 1048576,
      maxTokens: 65536,
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      description: 'Reasoning-heavy flagship model.',
      provider: 'google',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 1048576,
      maxTokens: 65536,
    },
  ],
};

const OPENAI_CATALOG: ProviderModelCatalog = {
  provider: 'openai',
  lastVerifiedAt: '2026-02-06',
  source: 'https://platform.openai.com/docs/models',
  models: [
    {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      description: 'General-purpose flagship model.',
      provider: 'openai',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 1000000,
      maxTokens: 32768,
    },
    {
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 mini',
      description: 'Lower latency and cost.',
      provider: 'openai',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 1000000,
      maxTokens: 32768,
    },
  ],
};

const ANTHROPIC_CATALOG: ProviderModelCatalog = {
  provider: 'anthropic',
  lastVerifiedAt: '2026-02-06',
  source: 'https://docs.anthropic.com/en/docs/about-claude/models',
  models: [
    {
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5',
      description: 'Balanced reasoning and speed.',
      provider: 'anthropic',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 8192,
    },
    {
      id: 'claude-opus-4-1',
      name: 'Claude Opus 4.1',
      description: 'Highest-quality reasoning model.',
      provider: 'anthropic',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 8192,
    },
  ],
};

const OPENROUTER_CATALOG: ProviderModelCatalog = {
  provider: 'openrouter',
  lastVerifiedAt: '2026-02-06',
  source: 'https://openrouter.ai/models',
  models: [
    {
      id: 'openai/gpt-4.1',
      name: 'OpenAI GPT-4.1 (OpenRouter)',
      provider: 'openrouter',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    },
    {
      id: 'anthropic/claude-sonnet-4.5',
      name: 'Claude Sonnet 4.5 (OpenRouter)',
      provider: 'openrouter',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
    },
  ],
};

const MOONSHOT_CATALOG: ProviderModelCatalog = {
  provider: 'moonshot',
  lastVerifiedAt: '2026-02-07',
  source: 'https://platform.moonshot.ai/docs',
  models: [
    {
      id: 'kimi-k2.5',
      name: 'Kimi K2.5',
      provider: 'moonshot',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 262144,
    },
    {
      id: 'kimi-k2-0905-preview',
      name: 'Kimi K2 0905 Preview',
      provider: 'moonshot',
      capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 262144,
    },
    {
      id: 'kimi-k2-0711-preview',
      name: 'Kimi K2 0711 Preview',
      provider: 'moonshot',
      capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 131072,
    },
    {
      id: 'kimi-k2-turbo-preview',
      name: 'Kimi K2 Turbo Preview',
      provider: 'moonshot',
      capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming', 'web_search'],
      contextWindow: 262144,
    },
    {
      id: 'kimi-k2-thinking',
      name: 'Kimi K2 Thinking',
      provider: 'moonshot',
      capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming', 'web_search', 'thinking'],
      contextWindow: 262144,
    },
    {
      id: 'kimi-k2-thinking-turbo',
      name: 'Kimi K2 Thinking Turbo',
      provider: 'moonshot',
      capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming', 'web_search', 'thinking'],
      contextWindow: 262144,
    },
  ],
};

const GLM_CATALOG: ProviderModelCatalog = {
  provider: 'glm',
  lastVerifiedAt: '2026-02-07',
  source: 'https://docs.z.ai',
  models: [
    {
      id: 'glm-4.7',
      name: 'GLM-4.7',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.7-flashx',
      name: 'GLM-4.7-FlashX',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.6',
      name: 'GLM-4.6',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.5',
      name: 'GLM-4.5',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.5-x',
      name: 'GLM-4.5-X',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.5-air',
      name: 'GLM-4.5-Air',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.5-airx',
      name: 'GLM-4.5-AirX',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4-32b-0414-128k',
      name: 'GLM-4-32B-0414-128K',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming'],
      contextWindow: 131072,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.7-flash',
      name: 'GLM-4.7-Flash',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.5-flash',
      name: 'GLM-4.5-Flash',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.6v',
      name: 'GLM-4.6V',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-ocr',
      name: 'GLM-OCR',
      provider: 'glm',
      capabilities: ['text_generation', 'vision', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.6v-flashx',
      name: 'GLM-4.6V-FlashX',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.5v',
      name: 'GLM-4.5V',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
    {
      id: 'glm-4.6v-flash',
      name: 'GLM-4.6V-Flash',
      provider: 'glm',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 200000,
      maxTokens: 131072,
    },
  ],
};

const DEEPSEEK_CATALOG: ProviderModelCatalog = {
  provider: 'deepseek',
  lastVerifiedAt: '2026-02-07',
  source: 'https://api-docs.deepseek.com',
  models: [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      provider: 'deepseek',
      capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming'],
      contextWindow: 131072,
      maxTokens: 8192,
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek Reasoner',
      provider: 'deepseek',
      capabilities: ['text_generation', 'code_generation', 'function_calling', 'streaming', 'thinking'],
      contextWindow: 131072,
      maxTokens: 65536,
    },
  ],
};

const LMSTUDIO_CATALOG: ProviderModelCatalog = {
  provider: 'lmstudio',
  lastVerifiedAt: '2026-02-07',
  source: 'https://lmstudio.ai/docs/app/api/endpoints/openai',
  models: [
    {
      id: 'local-model',
      name: 'Local Model (LM Studio)',
      description: 'Fallback placeholder for LM Studio local models.',
      provider: 'lmstudio',
      capabilities: ['text_generation', 'code_generation', 'vision', 'function_calling', 'streaming'],
      contextWindow: 128000,
      maxTokens: 8192,
    },
  ],
};

export const PROVIDER_MODEL_CATALOGS: Record<CanonicalProviderId, ProviderModelCatalog> = {
  google: GOOGLE_CATALOG,
  openai: OPENAI_CATALOG,
  anthropic: ANTHROPIC_CATALOG,
  openrouter: OPENROUTER_CATALOG,
  moonshot: MOONSHOT_CATALOG,
  glm: GLM_CATALOG,
  deepseek: DEEPSEEK_CATALOG,
  lmstudio: LMSTUDIO_CATALOG,
};

export function getCuratedCatalog(providerId: CanonicalProviderId): ProviderModelCatalog {
  return PROVIDER_MODEL_CATALOGS[providerId];
}
