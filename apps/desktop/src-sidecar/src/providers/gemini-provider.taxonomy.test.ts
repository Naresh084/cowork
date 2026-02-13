import { describe, expect, it } from 'vitest';
import { GeminiProvider } from '../../../../../packages/providers/src/gemini/gemini-provider.js';
import type { ProviderConfig } from '../../../../../packages/providers/src/types.js';
import { AuthenticationError, NetworkError, ProviderError } from '@gemini-cowork/shared';

type FixtureExpectation = {
  reasonCode: string;
  errorCode: string;
  statusCode?: number;
};

type Fixture = {
  name: string;
  error: unknown;
  modelId?: string;
  expect: FixtureExpectation;
};

function createProvider(): GeminiProvider {
  const config: ProviderConfig = {
    providerId: 'google',
    credentials: {
      type: 'api_key',
      apiKey: 'test-key',
    },
  };
  return new GeminiProvider(config);
}

function classifyWithHandleError(provider: GeminiProvider, fixture: Fixture): Error {
  return (provider as unknown as { handleError: (error: unknown, modelId?: string) => Error }).handleError(
    fixture.error,
    fixture.modelId,
  );
}

function taxonomyReasonCode(error: Error): string | undefined {
  const withContext = error as Error & { context?: { taxonomy?: { reasonCode?: string } } };
  return withContext.context?.taxonomy?.reasonCode;
}

describe('GeminiProvider error taxonomy', () => {
  it('maps fixture set with >= 98% reason-code accuracy', () => {
    const provider = createProvider();

    const authFixtures: Fixture[] = Array.from({ length: 10 }, (_, index) => ({
      name: `auth-${index}`,
      error: new Error(`Unauthorized: invalid API key variant ${index}`),
      expect: {
        reasonCode: 'AUTH_INVALID_CREDENTIALS',
        errorCode: 'AUTH_ERROR',
      },
    }));

    const rateLimitFixtures: Fixture[] = Array.from({ length: 10 }, (_, index) => ({
      name: `rate-limit-${index}`,
      error: {
        message: `Rate limit exceeded. Retry after ${index + 1} seconds`,
        status: 429,
      },
      expect: {
        reasonCode: 'RATE_LIMIT',
        errorCode: 'PROVIDER_ERROR',
        statusCode: 429,
      },
    }));

    const quotaFixtures: Fixture[] = Array.from({ length: 5 }, (_, index) => ({
      name: `quota-${index}`,
      error: {
        message: `Resource exhausted: quota exceeded bucket ${index}`,
        statusCode: 429,
      },
      expect: {
        reasonCode: 'QUOTA_EXCEEDED',
        errorCode: 'PROVIDER_ERROR',
        statusCode: 429,
      },
    }));

    const modelFixtures: Fixture[] = Array.from({ length: 5 }, (_, index) => ({
      name: `model-not-found-${index}`,
      error: new Error(`Model not found: models/gemini-3-pro-${index}:generateContent`),
      modelId: `gemini-3-pro-${index}`,
      expect: {
        reasonCode: 'MODEL_NOT_FOUND',
        errorCode: 'PROVIDER_ERROR',
        statusCode: 404,
      },
    }));

    const timeoutFixtures: Fixture[] = Array.from({ length: 5 }, (_, index) => ({
      name: `timeout-${index}`,
      error: new Error(`Request timeout after ${index + 1}s`),
      expect: {
        reasonCode: 'NETWORK_TIMEOUT',
        errorCode: 'NETWORK_ERROR',
      },
    }));

    const networkFixtures: Fixture[] = Array.from({ length: 5 }, (_, index) => ({
      name: `network-${index}`,
      error: new Error(`ECONNRESET network failure variant ${index}`),
      expect: {
        reasonCode: 'NETWORK_ERROR',
        errorCode: 'NETWORK_ERROR',
      },
    }));

    const serviceFixtures: Fixture[] = Array.from({ length: 5 }, (_, index) => ({
      name: `service-${index}`,
      error: {
        message: `Service unavailable temporary overload ${index}`,
        status: 503,
      },
      expect: {
        reasonCode: 'SERVICE_UNAVAILABLE',
        errorCode: 'PROVIDER_ERROR',
        statusCode: 503,
      },
    }));

    const badRequestFixtures: Fixture[] = Array.from({ length: 5 }, (_, index) => ({
      name: `bad-request-${index}`,
      error: {
        message: `Invalid argument in request payload index ${index}`,
        statusCode: 400,
      },
      expect: {
        reasonCode: 'BAD_REQUEST',
        errorCode: 'PROVIDER_ERROR',
        statusCode: 400,
      },
    }));

    const fixtures: Fixture[] = [
      ...authFixtures,
      ...rateLimitFixtures,
      ...quotaFixtures,
      ...modelFixtures,
      ...timeoutFixtures,
      ...networkFixtures,
      ...serviceFixtures,
      ...badRequestFixtures,
    ];

    let correct = 0;
    for (const fixture of fixtures) {
      const mapped = classifyWithHandleError(provider, fixture);
      const reason = taxonomyReasonCode(mapped);
      const statusCode = mapped instanceof ProviderError ? mapped.statusCode : undefined;

      if (
        reason === fixture.expect.reasonCode &&
        (mapped as Error & { code?: string }).code === fixture.expect.errorCode &&
        (fixture.expect.statusCode === undefined || fixture.expect.statusCode === statusCode)
      ) {
        correct += 1;
      }
    }

    const accuracy = correct / fixtures.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.98);
  });

  it('returns typed errors with retry metadata in context', () => {
    const provider = createProvider();
    const mapped = classifyWithHandleError(provider, {
      name: 'retry-context',
      error: { message: 'Rate limit exceeded. Retry after 7 seconds', status: 429 },
      expect: {
        reasonCode: 'RATE_LIMIT',
        errorCode: 'PROVIDER_ERROR',
      },
    });

    expect(mapped).toBeInstanceOf(ProviderError);
    const context = (mapped as ProviderError & { context?: { taxonomy?: { retryable?: boolean; retryAfterMs?: number } } }).context;
    expect(context?.taxonomy?.retryable).toBe(true);
    expect(context?.taxonomy?.retryAfterMs).toBeGreaterThanOrEqual(7000);
  });

  it('maps auth/network classes correctly for downstream policy handling', () => {
    const provider = createProvider();

    const authError = classifyWithHandleError(provider, {
      name: 'auth-check',
      error: new Error('Unauthorized API key'),
      expect: {
        reasonCode: 'AUTH_INVALID_CREDENTIALS',
        errorCode: 'AUTH_ERROR',
      },
    });
    expect(authError).toBeInstanceOf(AuthenticationError);

    const networkError = classifyWithHandleError(provider, {
      name: 'network-check',
      error: new Error('Network request failed: ECONNREFUSED'),
      expect: {
        reasonCode: 'NETWORK_ERROR',
        errorCode: 'NETWORK_ERROR',
      },
    });
    expect(networkError).toBeInstanceOf(NetworkError);
  });
});
