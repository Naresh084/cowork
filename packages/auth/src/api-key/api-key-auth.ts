import type { AuthStorage } from '../types.js';
import { STORAGE_KEYS } from '../types.js';
import { AuthenticationError } from '@gemini-cowork/shared';

// ============================================================================
// API Key Authentication
// ============================================================================

export class ApiKeyAuth {
  private storage: AuthStorage;
  private cachedApiKey: string | null = null;

  constructor(storage: AuthStorage) {
    this.storage = storage;
  }

  /**
   * Set the API key for authentication.
   * Validates the format before storing.
   */
  async setApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();

    if (!trimmed) {
      throw AuthenticationError.invalidApiKey();
    }

    // Basic format validation (Gemini API keys start with "AI")
    if (!trimmed.startsWith('AI') || trimmed.length < 30) {
      throw AuthenticationError.invalidApiKey();
    }

    await this.storage.set(STORAGE_KEYS.API_KEY, trimmed);
    await this.storage.set(STORAGE_KEYS.AUTH_METHOD, 'api_key');
    this.cachedApiKey = trimmed;
  }

  /**
   * Get the stored API key.
   */
  async getApiKey(): Promise<string | null> {
    if (this.cachedApiKey) {
      return this.cachedApiKey;
    }

    const apiKey = await this.storage.get(STORAGE_KEYS.API_KEY);
    if (apiKey) {
      this.cachedApiKey = apiKey;
    }
    return apiKey;
  }

  /**
   * Check if an API key is configured.
   */
  async hasApiKey(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    return apiKey !== null && apiKey.length > 0;
  }

  /**
   * Validate the API key by making a test request.
   * Returns true if valid, throws AuthenticationError if invalid.
   */
  async validate(): Promise<boolean> {
    const apiKey = await this.getApiKey();

    if (!apiKey) {
      throw AuthenticationError.notAuthenticated();
    }

    try {
      // Test the API key with a lightweight models list request
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 401 || response.status === 403) {
        throw AuthenticationError.invalidApiKey();
      }

      if (!response.ok) {
        const error = await response.text();
        throw new AuthenticationError(`API validation failed: ${error}`);
      }

      return true;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        `Failed to validate API key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Clear the stored API key.
   */
  async clear(): Promise<void> {
    await this.storage.delete(STORAGE_KEYS.API_KEY);
    this.cachedApiKey = null;
  }

  /**
   * Get a masked version of the API key for display.
   */
  async getMaskedApiKey(): Promise<string | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    // Show first 4 and last 4 characters
    if (apiKey.length <= 12) {
      return '****';
    }

    return `${apiKey.slice(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.slice(-4)}`;
  }
}
