// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import type { Message, ToolDefinition, GenerationConfig, StreamChunk } from '@cowork/shared';

// ============================================================================
// Provider Types
// ============================================================================

export const ProviderIdSchema = z.enum([
  'google',
  'openai',
  'anthropic',
  'openrouter',
  'moonshot',
  'glm',
  'deepseek',
  'lmstudio',
  // Backward-compat alias; normalized to `google`.
  'gemini',
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const CanonicalProviderIdSchema = z.enum([
  'google',
  'openai',
  'anthropic',
  'openrouter',
  'moonshot',
  'glm',
  'deepseek',
  'lmstudio',
]);
export type CanonicalProviderId = z.infer<typeof CanonicalProviderIdSchema>;

export const PROVIDER_ALIAS_MAP: Record<string, CanonicalProviderId> = {
  gemini: 'google',
};

export function normalizeProviderId(providerId: ProviderId | string): CanonicalProviderId {
  const normalized = String(providerId).toLowerCase();
  if (normalized in PROVIDER_ALIAS_MAP) {
    return PROVIDER_ALIAS_MAP[normalized]!;
  }
  if (CanonicalProviderIdSchema.safeParse(normalized).success) {
    return normalized as CanonicalProviderId;
  }
  throw new Error(`Unknown provider: ${providerId}`);
}

export interface ProviderCredentials {
  type: 'api_key' | 'oauth';
  apiKey?: string;
  accessToken?: string;
}

export interface ProviderConfig {
  providerId?: ProviderId;
  credentials: ProviderCredentials;
  baseUrl?: string;
  timeout?: number;
}

export interface ProviderDefinition {
  id: CanonicalProviderId;
  name: string;
  defaultBaseUrl?: string;
  baseUrlEditable: boolean;
  modelApiSupported: boolean;
  nativeWebSearchSupported: boolean;
  media: {
    imageGeneration: boolean;
    videoGeneration: boolean;
  };
}

export interface ProviderConnectionSettings {
  providerId: CanonicalProviderId;
  baseUrl?: string;
  selectedModel: string;
}

export interface MediaRoutingSettings {
  imageBackend: 'google' | 'openai';
  videoBackend: 'google' | 'openai';
}

// ============================================================================
// Model Types
// ============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  provider: CanonicalProviderId;
  capabilities: ModelCapability[];
  maxTokens?: number;
  contextWindow?: number;
  inputPricing?: number; // per 1M tokens
  outputPricing?: number; // per 1M tokens
  metadata?: Record<string, unknown>;
}

export type ModelCapability =
  | 'text_generation'
  | 'code_generation'
  | 'vision'
  | 'function_calling'
  | 'streaming'
  | 'thinking'
  | 'grounding'
  | 'web_search'
  | 'image_generation'
  | 'video_generation';

export interface ProviderCapabilities {
  supportsChat: boolean;
  supportsToolCalling: boolean;
  supportsNativeWebSearch: boolean;
  supportsVision: boolean;
  supportsImageGen: boolean;
  supportsVideoGen: boolean;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface GenerateRequest {
  providerId?: CanonicalProviderId;
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  config?: GenerationConfig;
  systemInstruction?: string;
}

export interface GenerateResponse {
  message: Message;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'max_tokens' | 'tool_calls' | 'error';
}

export interface StreamGenerateRequest extends GenerateRequest {
  onChunk?: (chunk: StreamChunk) => void;
}

export interface ModelResolutionResult {
  models: ModelInfo[];
  source: 'api' | 'curated';
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface AIProvider {
  readonly id: CanonicalProviderId;
  readonly name: string;

  /**
   * List available models.
   */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Get a specific model by ID.
   */
  getModel(modelId: string): Promise<ModelInfo | null>;

  /**
   * Generate a response (non-streaming).
   */
  generate(request: GenerateRequest): Promise<GenerateResponse>;

  /**
   * Generate a response with streaming.
   */
  stream(request: StreamGenerateRequest): AsyncGenerator<StreamChunk, GenerateResponse>;

  /**
   * Check if the provider is configured and ready.
   */
  isReady(): Promise<boolean>;

  /**
   * Validate credentials.
   */
  validateCredentials(): Promise<boolean>;
}
