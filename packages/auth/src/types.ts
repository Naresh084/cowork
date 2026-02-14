// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';

// ============================================================================
// Auth Configuration Schema
// ============================================================================

export const ApiKeyConfigSchema = z.object({
  apiKey: z.string().min(1),
});

export type ApiKeyConfig = z.infer<typeof ApiKeyConfigSchema>;

export const OAuthConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;

export const AuthConfigSchema = z.object({
  apiKey: ApiKeyConfigSchema.optional(),
  oauth: OAuthConfigSchema.optional(),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// ============================================================================
// Token Types
// ============================================================================

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

export interface UserInfo {
  email: string;
  name?: string;
  picture?: string;
}

// ============================================================================
// Auth State
// ============================================================================

export type AuthMethod = 'api_key' | 'oauth';

export interface AuthState {
  isAuthenticated: boolean;
  method?: AuthMethod;
  email?: string;
  expiresAt?: number;
}

// ============================================================================
// Auth Events
// ============================================================================

export type AuthEventType =
  | 'auth:initialized'
  | 'auth:authenticated'
  | 'auth:token_refreshed'
  | 'auth:signed_out'
  | 'auth:error';

export interface AuthEvent {
  type: AuthEventType;
  timestamp: number;
  payload?: unknown;
}

export type AuthEventHandler = (event: AuthEvent) => void;

// ============================================================================
// Storage Interface
// ============================================================================

export interface AuthStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// ============================================================================
// OAuth Flow Types
// ============================================================================

export interface PKCEPair {
  verifier: string;
  challenge: string;
}

export interface OAuthAuthorization {
  url: string;
  verifier: string;
  state: string;
}

export interface OAuthCallbackResult {
  code: string;
  state: string;
}

// ============================================================================
// Constants
// ============================================================================

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid',
] as const;

export const OAUTH_REDIRECT_URI = 'http://localhost:51121/oauth-callback';
export const OAUTH_CALLBACK_PORT = 51121;

export const STORAGE_KEYS = {
  API_KEY: 'cowork_api_key',
  ACCESS_TOKEN: 'cowork_access_token',
  REFRESH_TOKEN: 'cowork_refresh_token',
  TOKEN_EXPIRY: 'cowork_token_expiry',
  USER_EMAIL: 'cowork_user_email',
  AUTH_METHOD: 'cowork_auth_method',
} as const;
