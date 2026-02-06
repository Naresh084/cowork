/**
 * Connector OAuth Service
 *
 * Handles OAuth flows for connectors:
 * - Authorization Code flow with PKCE (Google, GitHub, Slack, Linear)
 * - Device Code flow (Microsoft)
 *
 * Tokens are stored securely in the file-based secure storage via SecretService.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import crypto from 'crypto';
import {
  getProviderConfig,
  isProviderConfigured,
  validateProviderScopes,
  type OAuthProviderConfig,
} from './oauth-config.js';
import type { SecretService } from './secret-service.js';
import type { OAuthFlowType } from '@gemini-cowork/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of starting an OAuth flow
 */
export interface OAuthFlowResult {
  /** Type of OAuth flow initiated */
  type: 'browser' | 'device_code';
  /** Authorization URL to open in browser (for browser flow) */
  url?: string;
  /** User-facing code to display (for device code flow) */
  userCode?: string;
  /** Verification URL for device code flow */
  verificationUrl?: string;
  /** Time until device code expires (seconds) */
  expiresIn?: number;
  /** Polling interval for device code (seconds) */
  interval?: number;
}

/**
 * Internal state for pending authorization code flows
 */
interface PendingFlow {
  codeVerifier: string;
  provider: string;
  scopes: string[];
  connectorId: string;
}

/**
 * Token response from OAuth provider
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

// ============================================================================
// Connector OAuth Service
// ============================================================================

export class ConnectorOAuthService {
  private secretService: SecretService;
  private callbackServer: Server | null = null;
  private callbackPort: number = 0;
  private pendingFlows: Map<string, PendingFlow> = new Map();
  private flowCompletionCallbacks: Map<string, {
    resolve: (success: boolean) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(secretService: SecretService) {
    this.secretService = secretService;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Start OAuth flow for a connector
   */
  async startOAuthFlow(
    connectorId: string,
    provider: string,
    flow: OAuthFlowType,
    scopes: string[]
  ): Promise<OAuthFlowResult> {
    const config = getProviderConfig(provider);
    if (!config) {
      throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    if (!isProviderConfigured(provider)) {
      throw new Error(
        `OAuth not configured for ${provider}. Set ${provider.toUpperCase()}_CLIENT_ID in .env`
      );
    }

    // Validate and normalize scopes
    const validatedScopes = validateProviderScopes(provider, scopes);

    if (flow === 'device_code') {
      return this.startDeviceCodeFlow(connectorId, provider, config, validatedScopes);
    }
    return this.startAuthorizationCodeFlow(connectorId, provider, config, validatedScopes);
  }

  /**
   * Poll for device code completion
   * @returns true if authentication completed, false if still pending
   */
  async pollDeviceCode(connectorId: string): Promise<boolean> {
    const deviceCode = await this.secretService.getSecret(connectorId, '_DEVICE_CODE');
    const provider = await this.secretService.getSecret(connectorId, '_PROVIDER');

    if (!deviceCode || !provider) {
      throw new Error('No pending device code flow');
    }

    const config = getProviderConfig(provider);
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = (await response.json()) as {
      error?: string;
      error_description?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    // Handle pending state (user hasn't completed authorization yet)
    if (data.error === 'authorization_pending') {
      return false;
    }

    // Handle slow down request
    if (data.error === 'slow_down') {
      return false;
    }

    // Handle other errors
    if (data.error) {
      if (data.error === 'expired_token') {
        await this.cleanupPendingFlow(connectorId);
        throw new Error('Device code expired. Please start again.');
      }
      if (data.error === 'access_denied') {
        await this.cleanupPendingFlow(connectorId);
        throw new Error('Access denied by user.');
      }
      throw new Error(data.error_description || data.error);
    }

    // Success! Store tokens
    await this.storeTokens(connectorId, data as TokenResponse);
    await this.cleanupPendingFlow(connectorId);

    return true;
  }

  /**
   * Get OAuth authentication status for a connector
   */
  async getOAuthStatus(connectorId: string): Promise<{
    authenticated: boolean;
    expiresAt?: number;
  }> {
    const accessToken = await this.secretService.getSecret(connectorId, 'ACCESS_TOKEN');
    const expiresAtStr = await this.secretService.getSecret(connectorId, 'EXPIRES_AT');

    return {
      authenticated: !!accessToken,
      expiresAt: expiresAtStr ? parseInt(expiresAtStr, 10) : undefined,
    };
  }

  /**
   * Refresh OAuth tokens if expired
   */
  async refreshTokensIfNeeded(connectorId: string): Promise<boolean> {
    const expiresAtStr = await this.secretService.getSecret(connectorId, 'EXPIRES_AT');
    const refreshToken = await this.secretService.getSecret(connectorId, 'REFRESH_TOKEN');
    const provider = await this.secretService.getSecret(connectorId, '_OAUTH_PROVIDER');

    if (!refreshToken || !provider) {
      return false;
    }

    // Check if token is about to expire (5 minute buffer)
    if (expiresAtStr) {
      const expiresAt = parseInt(expiresAtStr, 10);
      const now = Date.now();
      if (now < expiresAt - 5 * 60 * 1000) {
        return true; // Token still valid
      }
    }

    const config = getProviderConfig(provider);
    if (!config) {
      return false;
    }

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret || '',
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      await this.storeTokens(connectorId, data as TokenResponse);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear OAuth tokens for a connector
   */
  async clearTokens(connectorId: string): Promise<void> {
    await this.secretService.deleteSecret(connectorId, 'ACCESS_TOKEN');
    await this.secretService.deleteSecret(connectorId, 'REFRESH_TOKEN');
    await this.secretService.deleteSecret(connectorId, 'EXPIRES_AT');
    await this.secretService.deleteSecret(connectorId, 'TOKEN_TYPE');
    await this.secretService.deleteSecret(connectorId, '_OAUTH_PROVIDER');
  }

  // ==========================================================================
  // Private: Authorization Code Flow with PKCE
  // ==========================================================================

  private async startAuthorizationCodeFlow(
    connectorId: string,
    provider: string,
    config: OAuthProviderConfig,
    scopes: string[]
  ): Promise<OAuthFlowResult> {
    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    // Store pending flow state
    this.pendingFlows.set(connectorId, {
      codeVerifier,
      provider,
      scopes,
      connectorId,
    });

    // Start callback server to receive authorization code
    this.callbackPort = await this.startCallbackServer(connectorId);
    const redirectUri = `http://localhost:${this.callbackPort}/oauth/callback`;

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state: connectorId,
      access_type: 'offline', // Request refresh token
      prompt: 'consent', // Force consent screen to get refresh token
    });

    // Add PKCE parameters if provider supports it
    if (config.usesPKCE) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    const authUrl = `${config.authorizationUrl}?${params.toString()}`;

    // Store provider for later token refresh
    await this.secretService.setSecret(connectorId, '_OAUTH_PROVIDER', provider);

    return { type: 'browser', url: authUrl };
  }

  /**
   * Complete authorization code flow (called from callback)
   */
  private async completeAuthorizationCode(
    connectorId: string,
    code: string
  ): Promise<void> {
    const flow = this.pendingFlows.get(connectorId);
    if (!flow) {
      throw new Error('No pending OAuth flow');
    }

    const config = getProviderConfig(flow.provider);
    if (!config) {
      throw new Error(`Unknown provider: ${flow.provider}`);
    }

    const redirectUri = `http://localhost:${this.callbackPort}/oauth/callback`;

    // Build token request body
    const body = new URLSearchParams({
      client_id: config.clientId,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    // Add client secret if required
    if (config.clientSecret) {
      body.set('client_secret', config.clientSecret);
    }

    // Add PKCE verifier if used
    if (config.usesPKCE) {
      body.set('code_verifier', flow.codeVerifier);
    }

    // Exchange code for tokens
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    // Store tokens
    await this.storeTokens(connectorId, data as TokenResponse);

    // Cleanup
    this.pendingFlows.delete(connectorId);
    this.stopCallbackServer();

    // Notify completion
    const callback = this.flowCompletionCallbacks.get(connectorId);
    if (callback) {
      callback.resolve(true);
      this.flowCompletionCallbacks.delete(connectorId);
    }
  }

  // ==========================================================================
  // Private: Device Code Flow
  // ==========================================================================

  private async startDeviceCodeFlow(
    connectorId: string,
    provider: string,
    config: OAuthProviderConfig,
    scopes: string[]
  ): Promise<OAuthFlowResult> {
    if (!config.deviceCodeUrl) {
      throw new Error(`Provider ${provider} does not support device code flow`);
    }

    // Request device code
    const response = await fetch(config.deviceCodeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        scope: scopes.join(' '),
      }),
    });

    if (!response.ok) {
      throw new Error(`Device code request failed: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      device_code: string;
      user_code: string;
      verification_uri?: string;
      verification_url?: string;
      expires_in: number;
      interval?: number;
    };

    // Store device code for polling
    await this.secretService.setSecret(connectorId, '_DEVICE_CODE', data.device_code);
    await this.secretService.setSecret(connectorId, '_PROVIDER', provider);
    await this.secretService.setSecret(connectorId, '_OAUTH_PROVIDER', provider);

    return {
      type: 'device_code',
      userCode: data.user_code,
      verificationUrl: data.verification_uri || data.verification_url,
      expiresIn: data.expires_in,
      interval: data.interval || 5,
    };
  }

  // ==========================================================================
  // Private: Token Storage
  // ==========================================================================

  private async storeTokens(
    connectorId: string,
    tokens: TokenResponse
  ): Promise<void> {
    if (tokens.access_token) {
      await this.secretService.setSecret(connectorId, 'ACCESS_TOKEN', tokens.access_token);
    }

    if (tokens.refresh_token) {
      await this.secretService.setSecret(connectorId, 'REFRESH_TOKEN', tokens.refresh_token);
    }

    if (tokens.expires_in) {
      const expiresAt = Date.now() + tokens.expires_in * 1000;
      await this.secretService.setSecret(connectorId, 'EXPIRES_AT', String(expiresAt));
    }

    if (tokens.token_type) {
      await this.secretService.setSecret(connectorId, 'TOKEN_TYPE', tokens.token_type);
    }
  }

  private async cleanupPendingFlow(connectorId: string): Promise<void> {
    await this.secretService.deleteSecret(connectorId, '_DEVICE_CODE');
    await this.secretService.deleteSecret(connectorId, '_PROVIDER');
    this.pendingFlows.delete(connectorId);
  }

  // ==========================================================================
  // Private: Callback Server
  // ==========================================================================

  private startCallbackServer(connectorId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.callbackServer = createServer(
        (req: IncomingMessage, res: ServerResponse) => {
          const url = new URL(req.url || '', 'http://localhost');

          if (url.pathname === '/oauth/callback') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');
            const errorDescription = url.searchParams.get('error_description');

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Authorization Failed</title>
                  <style>
                    body { font-family: system-ui; padding: 40px; text-align: center; background: #1a1a1a; color: #fff; }
                    h1 { color: #ef4444; }
                    p { color: #9ca3af; }
                  </style>
                </head>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>${errorDescription || error}</p>
                  <p>You can close this window and try again.</p>
                  <script>setTimeout(() => window.close(), 5000);</script>
                </body>
                </html>
              `);

              // Notify failure
              const callback = this.flowCompletionCallbacks.get(state || connectorId);
              if (callback) {
                callback.reject(new Error(errorDescription || error));
                this.flowCompletionCallbacks.delete(state || connectorId);
              }
              return;
            }

            if (code && state === connectorId) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Authorization Successful</title>
                  <style>
                    body { font-family: system-ui; padding: 40px; text-align: center; background: #1a1a1a; color: #fff; }
                    h1 { color: #22c55e; }
                    p { color: #9ca3af; }
                  </style>
                </head>
                <body>
                  <h1>Authorization Successful!</h1>
                  <p>You can close this window and return to Cowork.</p>
                  <script>setTimeout(() => window.close(), 3000);</script>
                </body>
                </html>
              `);

              // Complete the flow asynchronously
              this.completeAuthorizationCode(connectorId, code).catch((err) => {
                console.error('Failed to complete OAuth flow:', err);
                const callback = this.flowCompletionCallbacks.get(connectorId);
                if (callback) {
                  callback.reject(err);
                  this.flowCompletionCallbacks.delete(connectorId);
                }
              });
            } else {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Invalid callback parameters');
            }
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
          }
        }
      );

      // Listen on random available port
      this.callbackServer.listen(0, '127.0.0.1', () => {
        const addr = this.callbackServer!.address();
        if (addr && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          reject(new Error('Failed to get callback server port'));
        }
      });

      this.callbackServer.on('error', reject);

      // Auto-close after 10 minutes
      setTimeout(() => {
        this.stopCallbackServer();
      }, 10 * 60 * 1000);
    });
  }

  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
      this.callbackPort = 0;
    }
  }

  // ==========================================================================
  // Private: PKCE
  // ==========================================================================

  /**
   * Generate a cryptographically random code verifier for PKCE
   * Length: 43-128 characters, URL-safe base64
   */
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate code challenge from verifier using S256 method
   * SHA256 hash of verifier, URL-safe base64 encoded
   */
  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }
}
