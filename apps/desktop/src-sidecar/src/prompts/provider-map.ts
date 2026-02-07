import type { PromptProviderId } from './types.js';

export type ProviderTemplateKey =
  | 'providers/google.md'
  | 'providers/openai.md'
  | 'providers/anthropic.md'
  | 'providers/openrouter.md'
  | 'providers/moonshot.md'
  | 'providers/glm.md'
  | 'providers/deepseek.md'
  | 'providers/lmstudio.md';

const PROVIDER_TEMPLATE_MAP: Record<PromptProviderId, ProviderTemplateKey> = {
  google: 'providers/google.md',
  openai: 'providers/openai.md',
  anthropic: 'providers/anthropic.md',
  openrouter: 'providers/openrouter.md',
  moonshot: 'providers/moonshot.md',
  glm: 'providers/glm.md',
  deepseek: 'providers/deepseek.md',
  lmstudio: 'providers/lmstudio.md',
};

export function getProviderTemplateKey(provider: PromptProviderId): ProviderTemplateKey {
  return PROVIDER_TEMPLATE_MAP[provider] || 'providers/google.md';
}
