// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * OAuth Provider Configuration
 *
 * Defines OAuth provider configurations for supported services.
 * Credentials are loaded from environment variables.
 *
 * See docs/oauth-setup/ for registration instructions.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for an OAuth provider
 */
export interface OAuthProviderConfig {
  /** OAuth Client ID (from environment variable) */
  clientId: string;
  /** OAuth Client Secret (not needed for device_code flow) */
  clientSecret?: string;
  /** Authorization URL for authorization_code flow */
  authorizationUrl: string;
  /** Token exchange URL */
  tokenUrl: string;
  /** Device code URL (only for device_code flow) */
  deviceCodeUrl?: string;
  /** Default OAuth scopes for this provider */
  defaultScopes: string[];
  /** Whether this provider uses PKCE (Proof Key for Code Exchange) */
  usesPKCE: boolean;
}

// ============================================================================
// Provider Configurations
// ============================================================================

/**
 * Supported OAuth providers and their configurations
 */
export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  /**
   * Google OAuth
   * Register at: https://console.cloud.google.com/apis/credentials
   * Required APIs: Gmail, Calendar, Drive, Docs, Sheets, etc.
   */
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    defaultScopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/contacts',
    ],
    usesPKCE: true,
  },

  /**
   * Microsoft OAuth (Azure AD)
   * Register at: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps
   * Uses device code flow for better UX on desktop apps
   */
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    // No client secret needed for device code flow
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    deviceCodeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode',
    defaultScopes: [
      'Mail.ReadWrite',
      'Calendars.ReadWrite',
      'Files.ReadWrite',
      'User.Read',
      'offline_access',
    ],
    usesPKCE: false, // Device code flow doesn't use PKCE
  },

  /**
   * GitHub OAuth
   * Register at: https://github.com/settings/developers
   * Create an "OAuth App" (not GitHub App)
   */
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    defaultScopes: ['repo', 'user', 'read:org'],
    usesPKCE: false, // GitHub doesn't support PKCE for OAuth Apps
  },

  /**
   * Slack OAuth
   * Register at: https://api.slack.com/apps
   * Create a Slack App and configure OAuth scopes
   */
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || '',
    clientSecret: process.env.SLACK_CLIENT_SECRET || '',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    defaultScopes: [
      'chat:write',
      'channels:read',
      'channels:history',
      'users:read',
      'files:read',
      'files:write',
    ],
    usesPKCE: false,
  },

  /**
   * Linear OAuth
   * Register at: https://linear.app/settings/api
   * Create an "OAuth Application"
   */
  linear: {
    clientId: process.env.LINEAR_CLIENT_ID || '',
    clientSecret: process.env.LINEAR_CLIENT_SECRET || '',
    authorizationUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    defaultScopes: ['read', 'write', 'issues:create'],
    usesPKCE: true,
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the configuration for an OAuth provider
 */
export function getProviderConfig(provider: string): OAuthProviderConfig | undefined {
  return OAUTH_PROVIDERS[provider.toLowerCase()];
}

/**
 * Check if an OAuth provider is properly configured with credentials
 */
export function isProviderConfigured(provider: string): boolean {
  const config = OAUTH_PROVIDERS[provider.toLowerCase()];
  if (!config) {
    return false;
  }

  // Check if client ID is set
  if (!config.clientId) {
    return false;
  }

  // For providers that require client secret (not device code flow)
  if (!config.deviceCodeUrl && !config.clientSecret) {
    return false;
  }

  return true;
}

/**
 * Get the list of all supported OAuth providers
 */
export function getSupportedProviders(): string[] {
  return Object.keys(OAUTH_PROVIDERS);
}

/**
 * Validate and merge scopes with provider defaults
 * @param provider OAuth provider name
 * @param requestedScopes User-requested scopes
 * @returns Validated scopes (falls back to defaults if empty)
 */
export function validateProviderScopes(
  provider: string,
  requestedScopes: string[]
): string[] {
  const config = OAUTH_PROVIDERS[provider.toLowerCase()];
  if (!config) {
    return requestedScopes;
  }

  // Use requested scopes if provided, otherwise use defaults
  if (requestedScopes.length > 0) {
    return requestedScopes;
  }

  return config.defaultScopes;
}

/**
 * Check if a provider supports device code flow
 */
export function supportsDeviceCodeFlow(provider: string): boolean {
  const config = OAUTH_PROVIDERS[provider.toLowerCase()];
  return !!(config?.deviceCodeUrl);
}

/**
 * Check if a provider uses PKCE
 */
export function providerUsesPKCE(provider: string): boolean {
  const config = OAUTH_PROVIDERS[provider.toLowerCase()];
  return config?.usesPKCE ?? false;
}
