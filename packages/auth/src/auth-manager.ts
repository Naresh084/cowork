import type {
  AuthConfig,
  AuthState,
  AuthStorage,
  AuthEventHandler,
  AuthEvent,
  AuthEventType,
  OAuthConfig,
} from './types.js';
import { STORAGE_KEYS } from './types.js';
import { ApiKeyAuth } from './api-key/api-key-auth.js';
import { OAuthService, runOAuthFlow } from './oauth/oauth-service.js';
import { AuthenticationError, now } from '@gemini-cowork/shared';

// ============================================================================
// Auth Manager
// ============================================================================

export interface AuthManagerOptions {
  storage: AuthStorage;
  config?: AuthConfig;
  openBrowser?: (url: string) => Promise<void>;
}

/**
 * Unified authentication manager supporting both API key and OAuth.
 */
export class AuthManager {
  private storage: AuthStorage;
  private config: AuthConfig;
  private apiKeyAuth: ApiKeyAuth;
  private oauthService: OAuthService | null = null;
  private openBrowser: (url: string) => Promise<void>;
  private eventHandlers: Map<AuthEventType, Set<AuthEventHandler>> = new Map();

  constructor(options: AuthManagerOptions) {
    this.storage = options.storage;
    this.config = options.config || {};
    this.apiKeyAuth = new ApiKeyAuth(this.storage);
    this.openBrowser = options.openBrowser || this.defaultOpenBrowser;

    // Initialize OAuth service if config provided
    if (this.config.oauth) {
      this.oauthService = new OAuthService(this.config.oauth, this.storage);
    }
  }

  /**
   * Initialize the auth manager and restore any saved auth state.
   */
  async initialize(): Promise<AuthState> {
    const state = await this.getState();
    this.emit('auth:initialized', state);
    return state;
  }

  /**
   * Get the current authentication state.
   */
  async getState(): Promise<AuthState> {
    const method = await this.storage.get(STORAGE_KEYS.AUTH_METHOD);

    if (method === 'api_key') {
      const hasKey = await this.apiKeyAuth.hasApiKey();
      if (hasKey) {
        return {
          isAuthenticated: true,
          method: 'api_key',
        };
      }
    }

    if (method === 'oauth' && this.oauthService) {
      const isAuth = await this.oauthService.isAuthenticated();
      if (isAuth) {
        const email = await this.oauthService.getUserEmail();
        const expiryStr = await this.storage.get(STORAGE_KEYS.TOKEN_EXPIRY);
        return {
          isAuthenticated: true,
          method: 'oauth',
          email: email || undefined,
          expiresAt: expiryStr ? parseInt(expiryStr, 10) : undefined,
        };
      }
    }

    return {
      isAuthenticated: false,
    };
  }

  // ============================================================================
  // API Key Authentication
  // ============================================================================

  /**
   * Authenticate using an API key.
   */
  async signInWithApiKey(apiKey: string, validate = true): Promise<AuthState> {
    await this.apiKeyAuth.setApiKey(apiKey);

    if (validate) {
      try {
        await this.apiKeyAuth.validate();
      } catch (error) {
        // Clear invalid key
        await this.apiKeyAuth.clear();
        throw error;
      }
    }

    const state = await this.getState();
    this.emit('auth:authenticated', state);
    return state;
  }

  /**
   * Get the API key for making requests.
   */
  async getApiKey(): Promise<string | null> {
    return this.apiKeyAuth.getApiKey();
  }

  /**
   * Get a masked version of the API key for display.
   */
  async getMaskedApiKey(): Promise<string | null> {
    return this.apiKeyAuth.getMaskedApiKey();
  }

  // ============================================================================
  // OAuth Authentication
  // ============================================================================

  /**
   * Configure OAuth settings.
   * Must be called before signInWithOAuth if not provided in constructor.
   */
  configureOAuth(config: OAuthConfig): void {
    this.config.oauth = config;
    this.oauthService = new OAuthService(config, this.storage);
  }

  /**
   * Check if OAuth is configured.
   */
  isOAuthConfigured(): boolean {
    return this.oauthService !== null;
  }

  /**
   * Start the OAuth sign-in flow.
   * Opens the browser for user authentication.
   */
  async signInWithOAuth(): Promise<AuthState> {
    if (!this.oauthService || !this.config.oauth) {
      throw new AuthenticationError(
        'OAuth not configured. Please configure OAuth credentials first.'
      );
    }

    try {
      await runOAuthFlow(this.config.oauth, this.storage, this.openBrowser);
      const state = await this.getState();
      this.emit('auth:authenticated', state);
      return state;
    } catch (error) {
      this.emit('auth:error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the OAuth access token for making requests.
   * Automatically refreshes if needed.
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.oauthService) {
      return null;
    }

    const token = await this.oauthService.getAccessToken();

    // Emit refresh event if token was refreshed
    if (token) {
      const expiryStr = await this.storage.get(STORAGE_KEYS.TOKEN_EXPIRY);
      const expiry = expiryStr ? parseInt(expiryStr, 10) : 0;
      // Check if recently refreshed (within last 10 seconds)
      if (expiry > now() && expiry - now() > 50 * 60 * 1000) {
        this.emit('auth:token_refreshed', { expiresAt: expiry });
      }
    }

    return token;
  }

  // ============================================================================
  // Common Methods
  // ============================================================================

  /**
   * Get the appropriate credential for API requests.
   * Returns API key or access token based on auth method.
   */
  async getCredential(): Promise<{ type: 'api_key'; apiKey: string } | { type: 'oauth'; accessToken: string } | null> {
    const state = await this.getState();

    if (!state.isAuthenticated) {
      return null;
    }

    if (state.method === 'api_key') {
      const apiKey = await this.getApiKey();
      if (apiKey) {
        return { type: 'api_key', apiKey };
      }
    }

    if (state.method === 'oauth') {
      const accessToken = await this.getAccessToken();
      if (accessToken) {
        return { type: 'oauth', accessToken };
      }
    }

    return null;
  }

  /**
   * Sign out and clear all stored credentials.
   */
  async signOut(): Promise<void> {
    await this.apiKeyAuth.clear();

    if (this.oauthService) {
      await this.oauthService.signOut();
    }

    await this.storage.delete(STORAGE_KEYS.AUTH_METHOD);

    this.emit('auth:signed_out', {});
  }

  /**
   * Check if authenticated.
   */
  async isAuthenticated(): Promise<boolean> {
    const state = await this.getState();
    return state.isAuthenticated;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Subscribe to auth events.
   */
  on(type: AuthEventType, handler: AuthEventHandler): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler);

    return () => this.off(type, handler);
  }

  /**
   * Unsubscribe from auth events.
   */
  off(type: AuthEventType, handler: AuthEventHandler): void {
    this.eventHandlers.get(type)?.delete(handler);
  }

  /**
   * Emit an auth event.
   */
  private emit(type: AuthEventType, payload: unknown): void {
    const event: AuthEvent = {
      type,
      timestamp: now(),
      payload,
    };

    this.eventHandlers.get(type)?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in auth event handler for ${type}:`, error);
      }
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Default browser opener using system command.
   */
  private async defaultOpenBrowser(url: string): Promise<void> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const platform = process.platform;

    if (platform === 'darwin') {
      await execFileAsync('open', [url]);
    } else if (platform === 'win32') {
      await execFileAsync('cmd', ['/c', 'start', '', url]);
    } else {
      await execFileAsync('xdg-open', [url]);
    }
  }
}

/**
 * Create an auth manager with secure storage.
 */
export async function createAuthManager(
  options: Omit<AuthManagerOptions, 'storage'> & { storage?: AuthStorage } = {}
): Promise<AuthManager> {
  let storage = options.storage;

  if (!storage) {
    const { createSecureStorage } = await import('./storage/keychain.js');
    storage = await createSecureStorage();
  }

  return new AuthManager({
    ...options,
    storage,
  });
}
