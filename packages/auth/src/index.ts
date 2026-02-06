// Types
export type {
  AuthConfig,
  ApiKeyConfig,
  OAuthConfig,
  OAuthTokens,
  UserInfo,
  AuthMethod,
  AuthState,
  AuthEventType,
  AuthEvent,
  AuthEventHandler,
  AuthStorage,
  PKCEPair,
  OAuthAuthorization,
  OAuthCallbackResult,
} from './types.js';

export {
  AuthConfigSchema,
  ApiKeyConfigSchema,
  OAuthConfigSchema,
  OAUTH_SCOPES,
  OAUTH_REDIRECT_URI,
  OAUTH_CALLBACK_PORT,
  STORAGE_KEYS,
} from './types.js';

// Auth Manager
export { AuthManager, createAuthManager, type AuthManagerOptions } from './auth-manager.js';

// API Key Auth
export { ApiKeyAuth } from './api-key/api-key-auth.js';

// OAuth
export { OAuthService, runOAuthFlow } from './oauth/oauth-service.js';
export { generatePKCE, generateState, encodeStateData, decodeStateData } from './oauth/pkce.js';
export { startOAuthCallbackServer, type OAuthCallbackServer } from './oauth/server.js';

// Storage
export { MemoryStorage } from './storage/memory.js';
export { FileSecureStorage, createSecureStorage } from './storage/secure-storage.js';
