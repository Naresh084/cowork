import type {
  OAuthConfig,
  OAuthTokens,
  UserInfo,
  OAuthAuthorization,
  OAuthCallbackResult,
  AuthStorage,
} from '../types.js';
import { OAUTH_SCOPES, OAUTH_REDIRECT_URI, STORAGE_KEYS } from '../types.js';
import { generatePKCE, encodeStateData, decodeStateData, generateState } from './pkce.js';
import { startOAuthCallbackServer } from './server.js';
import { AuthenticationError, isExpired } from '@gemini-cowork/shared';

// ============================================================================
// OAuth Service
// ============================================================================

export class OAuthService {
  private config: OAuthConfig;
  private storage: AuthStorage;
  private pendingVerifier: string | null = null;

  constructor(config: OAuthConfig, storage: AuthStorage) {
    this.config = config;
    this.storage = storage;
  }

  /**
   * Build the OAuth authorization URL and start the callback server.
   * Returns the URL to open in the browser.
   */
  async startAuthFlow(): Promise<OAuthAuthorization> {
    const pkce = generatePKCE();
    const nonce = generateState();

    // Store verifier for later token exchange
    this.pendingVerifier = pkce.verifier;

    // Encode state with nonce for CSRF protection
    const stateData = { nonce };
    const state = encodeStateData(stateData as Record<string, unknown>);

    // Build authorization URL
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
    url.searchParams.set('scope', OAUTH_SCOPES.join(' '));
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');

    return {
      url: url.toString(),
      verifier: pkce.verifier,
      state,
    };
  }

  /**
   * Complete the OAuth flow by exchanging the authorization code for tokens.
   */
  async handleCallback(callback: OAuthCallbackResult): Promise<{ tokens: OAuthTokens; user: UserInfo }> {
    // Validate state parameter (decoding verifies it was not tampered with)
    try {
      decodeStateData(callback.state);
    } catch {
      throw new AuthenticationError('Invalid OAuth state parameter');
    }

    // Verify we have a pending verifier from startAuthFlow
    const verifier = this.pendingVerifier;
    if (!verifier) {
      throw new AuthenticationError('No pending OAuth flow - possible replay attack');
    }

    // Exchange code for tokens
    const startTime = Date.now();
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: callback.code,
        grant_type: 'authorization_code',
        redirect_uri: OAUTH_REDIRECT_URI,
        code_verifier: verifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new AuthenticationError(`Token exchange failed: ${error}`);
    }

    const tokenData = await tokenResponse.json();

    const tokens: OAuthTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: startTime + tokenData.expires_in * 1000,
      tokenType: tokenData.token_type || 'Bearer',
      scope: tokenData.scope,
    };

    // Get user info
    const user = await this.getUserInfo(tokens.accessToken);

    // Store tokens
    await this.storeTokens(tokens, user);

    // Clear pending verifier
    this.pendingVerifier = null;

    return { tokens, user };
  }

  /**
   * Refresh the access token using the refresh token.
   */
  async refreshAccessToken(): Promise<OAuthTokens> {
    const refreshToken = await this.storage.get(STORAGE_KEYS.REFRESH_TOKEN);

    if (!refreshToken) {
      throw AuthenticationError.tokenExpired();
    }

    const startTime = Date.now();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw AuthenticationError.refreshFailed(error);
    }

    const tokenData = await response.json();

    const tokens: OAuthTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken, // Keep old refresh token if not returned
      expiresAt: startTime + tokenData.expires_in * 1000,
      tokenType: tokenData.token_type || 'Bearer',
      scope: tokenData.scope,
    };

    // Update stored tokens
    await this.storage.set(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    await this.storage.set(STORAGE_KEYS.TOKEN_EXPIRY, tokens.expiresAt.toString());
    if (tokenData.refresh_token) {
      await this.storage.set(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    }

    return tokens;
  }

  /**
   * Get the current access token, refreshing if needed.
   */
  async getAccessToken(): Promise<string | null> {
    const accessToken = await this.storage.get(STORAGE_KEYS.ACCESS_TOKEN);
    const expiryStr = await this.storage.get(STORAGE_KEYS.TOKEN_EXPIRY);

    if (!accessToken || !expiryStr) {
      return null;
    }

    const expiresAt = parseInt(expiryStr, 10);

    // Refresh if token expires within 5 minutes
    if (isExpired(expiresAt, 5 * 60 * 1000)) {
      try {
        const tokens = await this.refreshAccessToken();
        return tokens.accessToken;
      } catch {
        // If refresh fails, return null to indicate re-auth needed
        return null;
      }
    }

    return accessToken;
  }

  /**
   * Get user info from the Google userinfo endpoint.
   */
  private async getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new AuthenticationError('Failed to fetch user info');
    }

    const data = await response.json();

    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  }

  /**
   * Store tokens and user info.
   */
  private async storeTokens(tokens: OAuthTokens, user: UserInfo): Promise<void> {
    await this.storage.set(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    await this.storage.set(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    await this.storage.set(STORAGE_KEYS.TOKEN_EXPIRY, tokens.expiresAt.toString());
    await this.storage.set(STORAGE_KEYS.USER_EMAIL, user.email);
    await this.storage.set(STORAGE_KEYS.AUTH_METHOD, 'oauth');
  }

  /**
   * Check if OAuth is configured and authenticated.
   */
  async isAuthenticated(): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    return accessToken !== null;
  }

  /**
   * Clear all OAuth tokens.
   */
  async signOut(): Promise<void> {
    await this.storage.delete(STORAGE_KEYS.ACCESS_TOKEN);
    await this.storage.delete(STORAGE_KEYS.REFRESH_TOKEN);
    await this.storage.delete(STORAGE_KEYS.TOKEN_EXPIRY);
    await this.storage.delete(STORAGE_KEYS.USER_EMAIL);
    this.pendingVerifier = null;
  }

  /**
   * Get the stored user email.
   */
  async getUserEmail(): Promise<string | null> {
    return this.storage.get(STORAGE_KEYS.USER_EMAIL);
  }
}

/**
 * Run the complete OAuth flow including callback server.
 */
export async function runOAuthFlow(
  config: OAuthConfig,
  storage: AuthStorage,
  openBrowser: (url: string) => Promise<void>
): Promise<{ tokens: OAuthTokens; user: UserInfo }> {
  const service = new OAuthService(config, storage);

  // Start callback server
  const server = await startOAuthCallbackServer();

  try {
    // Get authorization URL
    const auth = await service.startAuthFlow();

    // Open browser
    await openBrowser(auth.url);

    // Wait for callback
    const callback = await server.waitForCallback();

    // Exchange code for tokens
    return await service.handleCallback(callback);
  } finally {
    await server.close();
  }
}
