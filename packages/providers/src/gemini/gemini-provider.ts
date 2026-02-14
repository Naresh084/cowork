// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerativeModel,
  type Content,
  type Part,
  type FunctionDeclaration,
  type Tool,
  type GenerationConfig as GeminiGenerationConfig,
} from '@google/generative-ai';
import type {
  AIProvider,
  ProviderConfig,
  ModelInfo,
  GenerateRequest,
  GenerateResponse,
  StreamGenerateRequest,
} from '../types.js';
import type { Message, ToolDefinition, StreamChunk, MessageContentPart } from '@cowork/shared';
import {
  generateMessageId,
  now,
  ProviderError,
  AuthenticationError,
  NetworkError,
  sanitizeProviderErrorMessage,
} from '@cowork/shared';
import { GEMINI_MODELS, DEFAULT_MODEL, getGeminiModel, fetchGeminiModels, setModelContextWindows } from './models.js';

type GeminiErrorCategory =
  | 'authentication'
  | 'rate_limit'
  | 'quota_exceeded'
  | 'model_not_found'
  | 'network_timeout'
  | 'network_error'
  | 'service_unavailable'
  | 'bad_request'
  | 'unknown';

interface GeminiErrorTaxonomy {
  category: GeminiErrorCategory;
  reasonCode: string;
  message: string;
  statusCode?: number;
  providerCode?: string;
  retryable: boolean;
  retryAfterMs?: number;
  modelId?: string;
}

// ============================================================================
// Gemini Provider
// ============================================================================

export class GeminiProvider implements AIProvider {
  readonly id = 'google' as const;
  readonly name = 'Google Gemini';

  private client: GoogleGenerativeAI | null = null;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.initializeClient();
  }

  private initializeClient(): void {
    if (this.config.credentials.type === 'api_key' && this.config.credentials.apiKey) {
      this.client = new GoogleGenerativeAI(this.config.credentials.apiKey);
    }
    // OAuth tokens are handled differently - we'll use fetch directly
  }

  /**
   * Update credentials (e.g., after token refresh).
   */
  updateCredentials(credentials: ProviderConfig['credentials']): void {
    this.config.credentials = credentials;
    this.initializeClient();
  }

  async listModels(): Promise<ModelInfo[]> {
    const apiKey = this.config.credentials.type === 'api_key' ? this.config.credentials.apiKey : undefined;
    if (apiKey) {
      try {
        const models = await fetchGeminiModels(apiKey);
        setModelContextWindows(models.map((model) => ({
          id: model.id,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        })));
        return models;
      } catch (error) {
        console.warn('[GeminiProvider] Failed to fetch models, falling back to defaults:', error);
      }
    }
    return GEMINI_MODELS;
  }

  async getModel(modelId: string): Promise<ModelInfo | null> {
    return getGeminiModel(modelId) || null;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const model = await this.getGenerativeModel(request.model);
    const contents = this.messagesToContents(request.messages);
    const tools = request.tools
      ? (this.toolsToGeminiTools(request.tools) as unknown as Tool[])
      : undefined;

    const generationConfig = this.buildGenerationConfig(request.config);

    try {
      const result = await model.generateContent({
        contents,
        tools,
        generationConfig,
        systemInstruction: request.systemInstruction,
      });

      const response = result.response;
      const text = response.text();

      // Check for function calls
      const functionCalls = response.functionCalls();

      let content: string | MessageContentPart[];

      if (functionCalls && functionCalls.length > 0) {
        content = functionCalls.map((fc) => ({
          type: 'tool_call' as const,
          toolCallId: generateMessageId(),
          toolName: fc.name,
          args: fc.args as Record<string, unknown>,
        }));
      } else {
        content = text;
      }

      const message: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content,
        createdAt: now(),
      };

      const groundingMetadata = this.extractGroundingMetadata(response);
      if (groundingMetadata) {
        message.metadata = groundingMetadata;
      }

      return {
        message,
        usage: response.usageMetadata
          ? {
              promptTokens: response.usageMetadata.promptTokenCount || 0,
              completionTokens: response.usageMetadata.candidatesTokenCount || 0,
              totalTokens: response.usageMetadata.totalTokenCount || 0,
            }
          : undefined,
        finishReason: functionCalls?.length ? 'tool_calls' : 'stop',
      };
    } catch (error) {
      throw this.handleError(error, request.model);
    }
  }

  async *stream(request: StreamGenerateRequest): AsyncGenerator<StreamChunk, GenerateResponse> {
    const model = await this.getGenerativeModel(request.model);
    const contents = this.messagesToContents(request.messages);
    const tools = request.tools
      ? (this.toolsToGeminiTools(request.tools) as unknown as Tool[])
      : undefined;

    const generationConfig = this.buildGenerationConfig(request.config);

    try {
      const result = await model.generateContentStream({
        contents,
        tools,
        generationConfig,
        systemInstruction: request.systemInstruction,
      });

      let fullText = '';
      const toolCalls: MessageContentPart[] = [];

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullText += text;
          const streamChunk: StreamChunk = { type: 'text', text };
          request.onChunk?.(streamChunk);
          yield streamChunk;
        }

        // Check for function calls in chunk
        const functionCalls = chunk.functionCalls();
        if (functionCalls) {
          for (const fc of functionCalls) {
            const toolCall: MessageContentPart = {
              type: 'tool_call',
              toolCallId: generateMessageId(),
              toolName: fc.name,
              args: fc.args as Record<string, unknown>,
            };
            toolCalls.push(toolCall);

            const streamChunk: StreamChunk = {
              type: 'tool_call',
              toolCall: {
                id: toolCall.toolCallId,
                name: fc.name,
                args: fc.args as Record<string, unknown>,
              },
            };
            request.onChunk?.(streamChunk);
            yield streamChunk;
          }
        }
      }

      // Get final response for usage metadata
      const response = await result.response;

      const content: string | MessageContentPart[] =
        toolCalls.length > 0 ? toolCalls : fullText;

      const message: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content,
        createdAt: now(),
      };

      const groundingMetadata = this.extractGroundingMetadata(response);
      if (groundingMetadata) {
        message.metadata = groundingMetadata;
      }

      const doneChunk: StreamChunk = { type: 'done' };
      request.onChunk?.(doneChunk);
      yield doneChunk;

      return {
        message,
        usage: response.usageMetadata
          ? {
              promptTokens: response.usageMetadata.promptTokenCount || 0,
              completionTokens: response.usageMetadata.candidatesTokenCount || 0,
              totalTokens: response.usageMetadata.totalTokenCount || 0,
            }
          : undefined,
        finishReason: toolCalls.length ? 'tool_calls' : 'stop',
      };
    } catch (error) {
      const errorChunk: StreamChunk = {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      request.onChunk?.(errorChunk);
      yield errorChunk;
      throw this.handleError(error, request.model);
    }
  }

  async isReady(): Promise<boolean> {
    const { credentials } = this.config;

    if (credentials.type === 'api_key') {
      return !!credentials.apiKey;
    }

    if (credentials.type === 'oauth') {
      return !!credentials.accessToken;
    }

    return false;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // Try to list models as a validation check
      if (this.config.credentials.type === 'api_key') {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.credentials.apiKey}`
        );
        return response.ok;
      }

      if (this.config.credentials.type === 'oauth') {
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models',
          {
            headers: {
              Authorization: `Bearer ${this.config.credentials.accessToken}`,
            },
          }
        );
        return response.ok;
      }

      return false;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async getGenerativeModel(modelId: string): Promise<GenerativeModel> {
    if (!this.client) {
      if (this.config.credentials.type === 'api_key') {
        throw AuthenticationError.notAuthenticated();
      }
      // For OAuth, we'd need to implement a custom client
      throw new Error('OAuth authentication not yet supported for streaming');
    }

    const model = modelId || DEFAULT_MODEL;
    return this.client.getGenerativeModel({ model });
  }

  private messagesToContents(messages: Message[]): Content[] {
    return messages
      .filter((m) => m.role !== 'system') // System instructions handled separately
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: this.messageContentToParts(message.content),
      }));
  }

  private messageContentToParts(content: string | MessageContentPart[]): Part[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    return content.map((part) => {
      switch (part.type) {
        case 'text':
          return { text: part.text };
        case 'image':
          return part.data
            ? { inlineData: { mimeType: part.mimeType, data: part.data } }
            : { text: '[image]' };
        case 'audio':
          return part.data
            ? { inlineData: { mimeType: part.mimeType, data: part.data } }
            : { text: '[audio]' };
        case 'video':
          return part.data
            ? { inlineData: { mimeType: part.mimeType, data: part.data } }
            : { text: '[video]' };
        case 'file':
          return part.data
            ? {
                inlineData: {
                  mimeType: part.mimeType || 'application/octet-stream',
                  data: part.data,
                },
              }
            : { text: part.name };
        case 'tool_call':
          return {
            functionCall: {
              name: part.toolName,
              args: part.args,
            },
          };
        case 'tool_result':
          return {
            functionResponse: {
              name: part.toolName || '', // Gemini SDK requires this but we don't always have it
              response: part.result as object,
            },
          };
        default:
          return { text: '' };
      }
    });
  }

  private toolsToGeminiTools(tools: ToolDefinition[]): Array<
    Tool | { googleSearch: Record<string, never> } | { urlContext: Record<string, never> } | { codeExecution: Record<string, never> }
  > {
    const typeMap: Record<string, SchemaType> = {
      string: SchemaType.STRING,
      number: SchemaType.NUMBER,
      boolean: SchemaType.BOOLEAN,
      array: SchemaType.ARRAY,
      object: SchemaType.OBJECT,
    };

    const toGeminiSchema = (param: ToolDefinition['parameters'][number]): Record<string, unknown> => {
      const schema: Record<string, unknown> = {
        type: typeMap[param.type] || SchemaType.STRING,
        description: param.description,
      };

      if (param.enum && param.enum.length > 0) {
        schema.enum = param.enum;
      }

      if (param.type === 'array') {
        schema.items = param.items ? toGeminiSchema(param.items) : { type: SchemaType.STRING };
      }

      if (param.type === 'object') {
        const properties = param.properties ?? [];
        schema.properties = Object.fromEntries(
          properties.map((child) => [child.name, toGeminiSchema(child)])
        );
        schema.required = properties.filter((child) => child.required).map((child) => child.name);
      }

      return schema;
    };

    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          tool.parameters.map((param) => [
            param.name,
            toGeminiSchema(param),
          ])
        ),
        required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    }));

    return [
      { functionDeclarations },
      { googleSearch: {} },
      { urlContext: {} },
      { codeExecution: {} },
    ];
  }

  private buildGenerationConfig(
    config?: GenerateRequest['config']
  ): GeminiGenerationConfig | undefined {
    if (!config) return undefined;

    return {
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      maxOutputTokens: config.maxOutputTokens,
      stopSequences: config.stopSequences,
    };
  }

  private handleError(error: unknown, modelId?: string): Error {
    const taxonomy = this.classifyProviderError(error, modelId);

    switch (taxonomy.category) {
      case 'authentication':
        return new AuthenticationError(
          taxonomy.reasonCode === 'AUTH_TOKEN_EXPIRED'
            ? 'Authentication token expired. Please sign in again.'
            : 'Invalid API key. Please check your API key and try again.',
          { provider: 'google', taxonomy },
        );
      case 'model_not_found': {
        const actualModel = taxonomy.modelId || modelId || 'unknown';
        return new ProviderError(
          'google',
          `Model "${actualModel}" not found or not available.`,
          taxonomy.statusCode ?? 404,
          { model: actualModel, taxonomy },
        );
      }
      case 'rate_limit':
        return new ProviderError(
          'google',
          'Rate limit exceeded. Please try again later.',
          taxonomy.statusCode ?? 429,
          { taxonomy },
        );
      case 'quota_exceeded':
        return new ProviderError(
          'google',
          'API quota exceeded. Please check your usage limits.',
          taxonomy.statusCode ?? 429,
          { taxonomy },
        );
      case 'network_timeout':
        return new NetworkError(
          taxonomy.message,
          undefined,
          { timeoutMs: taxonomy.retryAfterMs, provider: 'google', taxonomy },
        );
      case 'network_error':
        return new NetworkError(
          taxonomy.message,
          undefined,
          { provider: 'google', taxonomy },
        );
      default:
        return new ProviderError(
          'google',
          taxonomy.message,
          taxonomy.statusCode ?? 500,
          { taxonomy },
        );
    }
  }

  private classifyProviderError(error: unknown, modelId?: string): GeminiErrorTaxonomy {
    const normalizedMessage = sanitizeProviderErrorMessage(this.extractErrorMessage(error));
    const message = normalizedMessage || 'Request failed with unknown provider error';
    const lower = message.toLowerCase();
    const statusCode = this.extractStatusCode(error);
    const providerCode = this.extractProviderCode(error);
    const retryAfterMs = this.extractRetryAfterMs(error, lower);
    const extractedModelId = this.extractModelId(lower, message, modelId);

    if (
      statusCode === 401 ||
      statusCode === 403 ||
      lower.includes('api key') ||
      lower.includes('unauthorized') ||
      lower.includes('invalid credential') ||
      lower.includes('authentication failed') ||
      lower.includes('forbidden')
    ) {
      return {
        category: 'authentication',
        reasonCode: lower.includes('expired') ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_CREDENTIALS',
        message,
        statusCode,
        providerCode,
        retryable: false,
      };
    }

    if (
      (statusCode === 404 && lower.includes('model')) ||
      (lower.includes('model') && lower.includes('not found'))
    ) {
      return {
        category: 'model_not_found',
        reasonCode: 'MODEL_NOT_FOUND',
        message,
        statusCode: statusCode ?? 404,
        providerCode,
        retryable: false,
        modelId: extractedModelId,
      };
    }

    if (
      statusCode === 429 ||
      lower.includes('rate limit') ||
      lower.includes('too many requests')
    ) {
      const isQuota = lower.includes('quota') || lower.includes('billing') || lower.includes('resource exhausted');
      return {
        category: isQuota ? 'quota_exceeded' : 'rate_limit',
        reasonCode: isQuota ? 'QUOTA_EXCEEDED' : 'RATE_LIMIT',
        message,
        statusCode: statusCode ?? 429,
        providerCode,
        retryable: true,
        retryAfterMs,
      };
    }

    if (
      statusCode === 408 ||
      lower.includes('timeout') ||
      lower.includes('timed out') ||
      lower.includes('deadline exceeded') ||
      lower.includes('etimedout')
    ) {
      return {
        category: 'network_timeout',
        reasonCode: 'NETWORK_TIMEOUT',
        message,
        statusCode: statusCode ?? 408,
        providerCode,
        retryable: true,
        retryAfterMs,
      };
    }

    if (
      lower.includes('network') ||
      lower.includes('failed to fetch') ||
      lower.includes('connection reset') ||
      lower.includes('econnreset') ||
      lower.includes('econnrefused') ||
      lower.includes('enotfound') ||
      lower.includes('eai_again')
    ) {
      return {
        category: 'network_error',
        reasonCode: 'NETWORK_ERROR',
        message,
        statusCode,
        providerCode,
        retryable: true,
        retryAfterMs,
      };
    }

    if (
      (typeof statusCode === 'number' && statusCode >= 500) ||
      lower.includes('service unavailable') ||
      lower.includes('temporarily unavailable') ||
      lower.includes('internal server error') ||
      lower.includes('gateway')
    ) {
      return {
        category: 'service_unavailable',
        reasonCode: 'SERVICE_UNAVAILABLE',
        message,
        statusCode: statusCode ?? 503,
        providerCode,
        retryable: true,
        retryAfterMs,
      };
    }

    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return {
        category: 'bad_request',
        reasonCode: 'BAD_REQUEST',
        message,
        statusCode,
        providerCode,
        retryable: false,
      };
    }

    return {
      category: 'unknown',
      reasonCode: 'UNKNOWN_PROVIDER_ERROR',
      message,
      statusCode,
      providerCode,
      retryable: typeof statusCode === 'number' ? statusCode >= 500 : false,
      retryAfterMs,
      modelId: extractedModelId,
    };
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const candidate = error as {
        message?: unknown;
        error?: { message?: unknown };
      };
      if (typeof candidate.message === 'string') return candidate.message;
      if (typeof candidate.error?.message === 'string') return candidate.error.message;
    }
    return String(error);
  }

  private extractStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      response?: { status?: unknown };
      error?: { code?: unknown; status?: unknown };
    };

    const statusLike = [
      candidate.status,
      candidate.statusCode,
      candidate.response?.status,
      candidate.error?.status,
      candidate.error?.code,
    ];

    for (const value of statusLike) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return undefined;
  }

  private extractProviderCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as {
      code?: unknown;
      error?: { code?: unknown; status?: unknown };
      status?: unknown;
    };
    const values = [candidate.code, candidate.error?.status, candidate.error?.code, candidate.status];
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
  }

  private extractRetryAfterMs(error: unknown, normalizedLowerMessage: string): number | undefined {
    const retryAfterFromMessage = normalizedLowerMessage.match(
      /retry(?:ing)? after\s+(\d+)\s*(ms|millisecond|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes)?/,
    );
    if (retryAfterFromMessage) {
      const value = Number.parseInt(retryAfterFromMessage[1] || '0', 10);
      const unit = retryAfterFromMessage[2] || 's';
      if (Number.isFinite(value) && value > 0) {
        if (unit.startsWith('m')) return value * 60_000;
        if (unit.startsWith('ms')) return value;
        return value * 1_000;
      }
    }

    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as {
      retryAfterMs?: unknown;
      retryAfter?: unknown;
      response?: { headers?: Record<string, unknown> | Headers };
    };

    if (typeof candidate.retryAfterMs === 'number' && Number.isFinite(candidate.retryAfterMs)) {
      return candidate.retryAfterMs;
    }

    if (typeof candidate.retryAfter === 'number' && Number.isFinite(candidate.retryAfter)) {
      return candidate.retryAfter * 1_000;
    }

    const headers = candidate.response?.headers;
    if (headers instanceof Headers) {
      const headerValue = headers.get('retry-after');
      if (!headerValue) return undefined;
      const seconds = Number.parseInt(headerValue, 10);
      return Number.isFinite(seconds) ? seconds * 1_000 : undefined;
    }

    if (headers && typeof headers === 'object') {
      const raw = headers['retry-after'];
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw * 1_000;
      if (typeof raw === 'string') {
        const seconds = Number.parseInt(raw, 10);
        return Number.isFinite(seconds) ? seconds * 1_000 : undefined;
      }
    }

    return undefined;
  }

  private extractModelId(lowerMessage: string, rawMessage: string, fallbackModelId?: string): string | undefined {
    if (!(lowerMessage.includes('model') && lowerMessage.includes('not found'))) {
      return fallbackModelId;
    }

    const fromPath = rawMessage.match(/models\/([\w.-]+)/i)?.[1];
    if (fromPath) return fromPath;

    const fromQuoted = rawMessage.match(/model\s+["']?([\w.-]+)["']?/i)?.[1];
    if (fromQuoted) return fromQuoted;

    return fallbackModelId;
  }

  private extractGroundingMetadata(response: unknown): {
    sources: Array<{ title: string; url: string }>;
    searchQueries?: string[];
  } | undefined {
    const responseWithCandidates = response as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{
            web?: { title?: string; uri?: string };
          }>;
          webSearchQueries?: string[];
        };
      }>;
    };

    const groundingMetadata = responseWithCandidates.candidates?.[0]?.groundingMetadata;
    if (!groundingMetadata) return undefined;

    const sources = (groundingMetadata.groundingChunks ?? [])
      .map((chunk) => {
        const web = chunk.web;
        if (!web?.uri) return null;
        return {
          title: web.title || web.uri,
          url: web.uri,
        };
      })
      .filter((source): source is { title: string; url: string } => source !== null);

    const searchQueries = groundingMetadata.webSearchQueries ?? [];

    if (sources.length === 0 && searchQueries.length === 0) {
      return undefined;
    }

    return {
      sources,
      searchQueries: searchQueries.length > 0 ? searchQueries : undefined,
    };
  }
}

/**
 * Create a Gemini provider instance.
 */
export function createGeminiProvider(config: ProviderConfig): GeminiProvider {
  return new GeminiProvider(config);
}

export class GoogleProvider extends GeminiProvider {}

export function createGoogleProvider(config: ProviderConfig): GoogleProvider {
  return new GoogleProvider(config);
}
