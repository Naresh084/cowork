import { z } from 'zod';
import type { Message, ToolDefinition, GenerationConfig, StreamChunk } from '@gemini-cowork/shared';

// ============================================================================
// Provider Types
// ============================================================================

export const ProviderIdSchema = z.enum(['gemini']);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export interface ProviderCredentials {
  type: 'api_key' | 'oauth';
  apiKey?: string;
  accessToken?: string;
}

export interface ProviderConfig {
  credentials: ProviderCredentials;
  baseUrl?: string;
  timeout?: number;
}

// ============================================================================
// Model Types
// ============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  provider: ProviderId;
  capabilities: ModelCapability[];
  maxTokens?: number;
  contextWindow?: number;
  inputPricing?: number; // per 1M tokens
  outputPricing?: number; // per 1M tokens
}

export type ModelCapability =
  | 'text_generation'
  | 'code_generation'
  | 'vision'
  | 'function_calling'
  | 'streaming'
  | 'thinking'
  | 'grounding';

// ============================================================================
// Request/Response Types
// ============================================================================

export interface GenerateRequest {
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

// ============================================================================
// Provider Interface
// ============================================================================

export interface AIProvider {
  readonly id: ProviderId;
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
