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
import type { Message, ToolDefinition, StreamChunk, MessageContentPart } from '@gemini-cowork/shared';
import {
  generateMessageId,
  now,
  ProviderError,
  AuthenticationError,
} from '@gemini-cowork/shared';
import { GEMINI_MODELS, DEFAULT_MODEL, getGeminiModel } from './models.js';

// ============================================================================
// Gemini Provider
// ============================================================================

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
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
          return {
            inlineData: {
              mimeType: part.mimeType,
              data: part.data,
            },
          };
        case 'audio':
          return {
            inlineData: {
              mimeType: part.mimeType,
              data: part.data,
            },
          };
        case 'video':
          return {
            inlineData: {
              mimeType: part.mimeType,
              data: part.data,
            },
          };
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
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('api key') || message.includes('unauthorized')) {
        return AuthenticationError.invalidApiKey();
      }

      if (message.includes('quota') || message.includes('rate limit')) {
        return ProviderError.rateLimit('gemini');
      }

      if (message.includes('model') && message.includes('not found')) {
        // Extract model ID from error or use provided/unknown
        // Stop at colon to avoid capturing ":generateContent" from API URLs
        const modelMatch = error.message.match(/models\/([\w.-]+)/);
        const actualModel = modelMatch?.[1] || modelId || 'unknown';
        return ProviderError.modelNotFound('gemini', actualModel);
      }

      return ProviderError.requestFailed('gemini', 500, error.message);
    }

    return ProviderError.requestFailed('gemini', 500, String(error));
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
