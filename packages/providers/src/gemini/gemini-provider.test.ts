import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  NetworkError,
  ProviderError,
  type Message,
} from '@gemini-cowork/shared';
import type { ProviderConfig } from '../types.js';
import { GeminiProvider } from './gemini-provider.js';
import * as modelCatalog from './models.js';

interface ProviderInternals {
  classifyProviderError: (error: unknown, modelId?: string) => {
    category: string;
    reasonCode: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    modelId?: string;
    statusCode?: number;
  };
  handleError: (error: unknown, modelId?: string) => Error;
}

const TEST_CONFIG: ProviderConfig = {
  credentials: {
    type: 'api_key',
    apiKey: 'unit-test-key',
  },
};

const BASE_MESSAGE: Message = {
  id: 'msg-user-1',
  role: 'user',
  content: 'hello',
  createdAt: Date.now(),
};

function createProvider(): GeminiProvider {
  return new GeminiProvider(TEST_CONFIG);
}

function getInternals(provider: GeminiProvider): ProviderInternals {
  return provider as unknown as ProviderInternals;
}

describe('GeminiProvider error taxonomy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies provider errors with retry hints and model extraction', () => {
    const provider = createProvider();
    const internals = getInternals(provider);

    type ExpectedTaxonomy = {
      category: string;
      reasonCode: string;
      retryable?: boolean;
      retryAfterMs?: number;
      modelId?: string;
    };
    type TaxonomyCase = {
      name: string;
      error: Record<string, unknown>;
      expected: ExpectedTaxonomy;
    };

    const cases: TaxonomyCase[] = [
      {
        name: 'authentication invalid key',
        error: { status: 401, message: 'Invalid API key supplied' },
        expected: { category: 'authentication', reasonCode: 'AUTH_INVALID_CREDENTIALS', retryable: false },
      },
      {
        name: 'authentication token expired',
        error: { status: 401, message: 'Access token expired' },
        expected: { category: 'authentication', reasonCode: 'AUTH_TOKEN_EXPIRED', retryable: false },
      },
      {
        name: 'model not found with extracted model id',
        error: { status: 404, message: 'models/gemini-2.5-pro not found for this endpoint' },
        expected: {
          category: 'model_not_found',
          reasonCode: 'MODEL_NOT_FOUND',
          retryable: false,
          modelId: 'gemini-2.5-pro',
        },
      },
      {
        name: 'rate limit with retry-after header',
        error: {
          status: 429,
          message: 'Too many requests',
          response: { headers: { 'retry-after': '7' } },
        },
        expected: {
          category: 'rate_limit',
          reasonCode: 'RATE_LIMIT',
          retryable: true,
          retryAfterMs: 7_000,
        },
      },
      {
        name: 'quota exceeded',
        error: {
          status: 429,
          message: 'RESOURCE_EXHAUSTED: quota exceeded for billing account',
        },
        expected: { category: 'quota_exceeded', reasonCode: 'QUOTA_EXCEEDED', retryable: true },
      },
      {
        name: 'network timeout with message retry hint',
        error: { status: 408, message: 'Timed out while calling endpoint, retry after 2s' },
        expected: {
          category: 'network_timeout',
          reasonCode: 'NETWORK_TIMEOUT',
          retryable: true,
          retryAfterMs: 2_000,
        },
      },
      {
        name: 'network transport error',
        error: { message: 'Failed to fetch: ECONNRESET upstream' },
        expected: { category: 'network_error', reasonCode: 'NETWORK_ERROR', retryable: true },
      },
      {
        name: 'service unavailable',
        error: { status: 503, message: 'Service unavailable' },
        expected: { category: 'service_unavailable', reasonCode: 'SERVICE_UNAVAILABLE', retryable: true },
      },
      {
        name: 'bad request',
        error: { status: 400, message: 'Invalid argument: malformed request' },
        expected: { category: 'bad_request', reasonCode: 'BAD_REQUEST', retryable: false },
      },
      {
        name: 'unknown fallback',
        error: { message: 'Unexpected provider failure mode' },
        expected: { category: 'unknown', reasonCode: 'UNKNOWN_PROVIDER_ERROR' },
      },
    ];

    for (const testCase of cases) {
      const taxonomy = internals.classifyProviderError(testCase.error);
      expect(taxonomy.category, testCase.name).toBe(testCase.expected.category);
      expect(taxonomy.reasonCode, testCase.name).toBe(testCase.expected.reasonCode);

      if (typeof testCase.expected.retryable === 'boolean') {
        expect(taxonomy.retryable, testCase.name).toBe(testCase.expected.retryable);
      }
      if (typeof testCase.expected.retryAfterMs === 'number') {
        expect(taxonomy.retryAfterMs, testCase.name).toBe(testCase.expected.retryAfterMs);
      }
      if (typeof testCase.expected.modelId === 'string') {
        expect(taxonomy.modelId, testCase.name).toBe(testCase.expected.modelId);
      }
    }
  });

  it('maps classified taxonomy to typed shared errors', () => {
    const provider = createProvider();
    const internals = getInternals(provider);

    const authError = internals.handleError({ status: 401, message: 'invalid credential' });
    expect(authError).toBeInstanceOf(AuthenticationError);

    const timeoutError = internals.handleError({ status: 408, message: 'deadline exceeded, retry after 1500ms' });
    expect(timeoutError).toBeInstanceOf(NetworkError);
    expect(timeoutError.message.toLowerCase()).toContain('deadline');

    const modelError = internals.handleError({
      status: 404,
      message: 'Model "gemini-missing" not found',
    });
    expect(modelError).toBeInstanceOf(ProviderError);
    expect((modelError as ProviderError).statusCode).toBe(404);
  });
});

describe('GeminiProvider failure behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to curated model catalog when remote model discovery fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(modelCatalog, 'fetchGeminiModels').mockRejectedValueOnce(
      new Error('model endpoint unavailable'),
    );
    const setWindowSpy = vi.spyOn(modelCatalog, 'setModelContextWindows');

    const provider = createProvider();
    const models = await provider.listModels();

    expect(models).toEqual(modelCatalog.GEMINI_MODELS);
    expect(setWindowSpy).not.toHaveBeenCalled();
  });

  it('emits stream error chunk then throws mapped typed error when provider stream fails', async () => {
    const provider = createProvider();
    const providerWithInternals = provider as unknown as {
      getGenerativeModel: () => Promise<{ generateContentStream: () => Promise<never> }>;
    };

    providerWithInternals.getGenerativeModel = vi.fn(async () => ({
      generateContentStream: vi.fn(async () => {
        throw { status: 503, message: 'service unavailable from upstream' };
      }),
    }));

    const chunks: Array<{ type: string; error?: string }> = [];
    let caught: unknown = null;

    try {
      for await (const chunk of provider.stream({
        model: 'gemini-2.5-pro',
        messages: [BASE_MESSAGE],
        onChunk: (chunk) => chunks.push(chunk as { type: string; error?: string }),
      })) {
        chunks.push(chunk as { type: string; error?: string });
      }
    } catch (error) {
      caught = error;
    }

    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(true);
    expect(caught).toBeInstanceOf(ProviderError);
    expect((caught as ProviderError).statusCode).toBe(503);
  });
});
