// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type {
  AIProvider,
  CanonicalProviderId,
  GenerateRequest,
  GenerateResponse,
  ModelInfo,
  ProviderConfig,
  StreamGenerateRequest,
} from './types.js';
import { AuthenticationError, generateMessageId, now, ProviderError } from '@cowork/shared';
import type { Message, MessageContentPart, StreamChunk, ToolDefinition, ToolParameter } from '@cowork/shared';
import { listModels, validateCredentials } from './model-service.js';
import { getProviderDefaultBaseUrl } from './provider-registry.js';

function extractTextContent(content: Message['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is MessageContentPart & { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function toolParamToJsonSchema(param: ToolParameter): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: param.type,
    description: param.description,
  };

  if (param.enum) schema.enum = param.enum;

  if (param.type === 'array' && param.items) {
    schema.items = toolParamToJsonSchema(param.items);
  }

  if (param.type === 'object' && param.properties) {
    schema.properties = Object.fromEntries(
      param.properties.map((child) => [child.name, toolParamToJsonSchema(child)]),
    );
    schema.required = param.properties.filter((child) => child.required).map((child) => child.name);
  }

  return schema;
}

function toolsToOpenAITools(tools?: ToolDefinition[]): Array<Record<string, unknown>> | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          tool.parameters.map((param) => [param.name, toolParamToJsonSchema(param)]),
        ),
        required: tool.parameters.filter((param) => param.required).map((param) => param.name),
      },
    },
  }));
}

function mapFinishReason(reason?: string): GenerateResponse['finishReason'] {
  if (!reason) return 'stop';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'tool_calls') return 'tool_calls';
  if (reason === 'stop') return 'stop';
  return 'stop';
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: CanonicalProviderId;
  readonly name: string;
  private config: ProviderConfig;

  constructor(id: CanonicalProviderId, name: string, config: ProviderConfig) {
    this.id = id;
    this.name = name;
    this.config = config;
  }

  updateCredentials(credentials: ProviderConfig['credentials']): void {
    this.config.credentials = credentials;
  }

  async listModels(): Promise<ModelInfo[]> {
    return listModels(this.id, this.config.credentials, this.config.baseUrl);
  }

  async getModel(modelId: string): Promise<ModelInfo | null> {
    const models = await this.listModels();
    return models.find((model) => model.id === modelId) || null;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const apiKey = this.config.credentials.type === 'api_key' ? this.config.credentials.apiKey : undefined;
    if (!apiKey) {
      throw AuthenticationError.notAuthenticated();
    }

    const baseUrl = (this.config.baseUrl || getProviderDefaultBaseUrl(this.id) || '').replace(/\/+$/, '');
    const url = `${baseUrl}/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
          content: extractTextContent(message.content),
        })),
        tools: toolsToOpenAITools(request.tools),
        temperature: request.config?.temperature,
        max_tokens: request.config?.maxOutputTokens,
      }),
    });

    if (!response.ok) {
      throw ProviderError.requestFailed(this.id, response.status, await response.text());
    }

    const body = await response.json() as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const choice = body.choices?.[0];
    const toolCalls = choice?.message?.tool_calls || [];
    const content: string | MessageContentPart[] =
      toolCalls.length > 0
        ? toolCalls.map((call) => ({
            type: 'tool_call',
            toolCallId: call.id || generateMessageId(),
            toolName: call.function?.name || 'unknown_tool',
            args: (() => {
              if (!call.function?.arguments) return {};
              try {
                return JSON.parse(call.function.arguments) as Record<string, unknown>;
              } catch {
                return { raw: call.function.arguments };
              }
            })(),
          }))
        : (choice?.message?.content || '');

    return {
      message: {
        id: generateMessageId(),
        role: 'assistant',
        content,
        createdAt: now(),
      },
      usage: body.usage
        ? {
            promptTokens: body.usage.prompt_tokens || 0,
            completionTokens: body.usage.completion_tokens || 0,
            totalTokens: body.usage.total_tokens || 0,
          }
        : undefined,
      finishReason: mapFinishReason(choice?.finish_reason),
    };
  }

  async *stream(request: StreamGenerateRequest): AsyncGenerator<StreamChunk, GenerateResponse> {
    const generated = await this.generate(request);
    if (typeof generated.message.content === 'string' && generated.message.content.length > 0) {
      const textChunk: StreamChunk = { type: 'text', text: generated.message.content };
      request.onChunk?.(textChunk);
      yield textChunk;
    } else if (Array.isArray(generated.message.content)) {
      for (const part of generated.message.content) {
        if (part.type !== 'tool_call') continue;
        const toolCallChunk: StreamChunk = {
          type: 'tool_call',
          toolCall: {
            id: part.toolCallId,
            name: part.toolName,
            args: part.args,
          },
        };
        request.onChunk?.(toolCallChunk);
        yield toolCallChunk;
      }
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
    return validateCredentials(this.id, this.config.credentials, this.config.baseUrl);
  }
}
