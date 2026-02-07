import type {
  AIProvider,
  GenerateRequest,
  GenerateResponse,
  ModelInfo,
  ProviderConfig,
  StreamGenerateRequest,
} from './types.js';
import { listModels, validateCredentials } from './model-service.js';
import { AuthenticationError, generateMessageId, now, ProviderError } from '@gemini-cowork/shared';
import type { MessageContentPart, StreamChunk } from '@gemini-cowork/shared';
import { getProviderDefaultBaseUrl } from './provider-registry.js';

function toAnthropicText(content: string | MessageContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is MessageContentPart & { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const;
  readonly name = 'Anthropic';
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  updateCredentials(credentials: ProviderConfig['credentials']): void {
    this.config.credentials = credentials;
  }

  async listModels(): Promise<ModelInfo[]> {
    return listModels('anthropic', this.config.credentials, this.config.baseUrl);
  }

  async getModel(modelId: string): Promise<ModelInfo | null> {
    const models = await this.listModels();
    return models.find((model) => model.id === modelId) || null;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const apiKey = this.config.credentials.type === 'api_key' ? this.config.credentials.apiKey : undefined;
    if (!apiKey) throw AuthenticationError.notAuthenticated();

    const baseUrl = (this.config.baseUrl || getProviderDefaultBaseUrl('anthropic') || '').replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.config?.maxOutputTokens || 4096,
        system: request.systemInstruction,
        messages: request.messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: toAnthropicText(message.content),
          })),
      }),
    });

    if (!response.ok) {
      throw ProviderError.requestFailed('anthropic', response.status, await response.text());
    }

    const body = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
    };
    const text = (body.content || [])
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');

    return {
      message: {
        id: generateMessageId(),
        role: 'assistant',
        content: text,
        createdAt: now(),
      },
      usage: body.usage
        ? {
            promptTokens: body.usage.input_tokens || 0,
            completionTokens: body.usage.output_tokens || 0,
            totalTokens: (body.usage.input_tokens || 0) + (body.usage.output_tokens || 0),
          }
        : undefined,
      finishReason: body.stop_reason === 'max_tokens' ? 'max_tokens' : 'stop',
    };
  }

  async *stream(request: StreamGenerateRequest): AsyncGenerator<StreamChunk, GenerateResponse> {
    const generated = await this.generate(request);
    if (typeof generated.message.content === 'string' && generated.message.content.length > 0) {
      const textChunk: StreamChunk = { type: 'text', text: generated.message.content };
      request.onChunk?.(textChunk);
      yield textChunk;
    }
    const doneChunk: StreamChunk = { type: 'done' };
    request.onChunk?.(doneChunk);
    yield doneChunk;
    return generated;
  }

  async isReady(): Promise<boolean> {
    if (this.config.credentials.type === 'api_key') {
      return Boolean(this.config.credentials.apiKey?.trim());
    }
    return Boolean(this.config.credentials.accessToken?.trim());
  }

  async validateCredentials(): Promise<boolean> {
    return validateCredentials('anthropic', this.config.credentials, this.config.baseUrl);
  }
}

export function createAnthropicProvider(config: ProviderConfig): AnthropicProvider {
  return new AnthropicProvider(config);
}
