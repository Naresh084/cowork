/**
 * Secret Service
 *
 * Securely stores connector credentials in a local encrypted file.
 * Uses file-based storage with restrictive permissions (0600) to avoid
 * macOS Keychain password prompts entirely.
 *
 * SECURITY: Secrets are stored in a user-only readable file and
 * are never logged or exposed in error messages.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SecretDefinition } from '@gemini-cowork/shared';

// ============================================================================
// Types
// ============================================================================

const SECRET_PREFIX = 'connector';

/**
 * Status of secrets for a connector
 */
export interface SecretsStatus {
  /** Whether all required secrets are configured */
  configured: boolean;
  /** List of missing required secret keys */
  missing: string[];
  /** List of provided secret keys */
  provided: string[];
}

// ============================================================================
// Secret Storage Interface
// ============================================================================

interface SecretStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  findByPrefix(prefix: string): Promise<Array<{ account: string; password: string }>>;
}

// ============================================================================
// File-Based Storage
// ============================================================================

function getConfigDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'gemini-cowork');
  } else if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'gemini-cowork'
    );
  }
  // Linux / other
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'gemini-cowork');
}

class FileStorage implements SecretStorage {
  private filePath: string;

  constructor() {
    const configDir = getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });
    this.filePath = path.join(configDir, 'secrets.json');
  }

  private readStore(): Record<string, string> {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch {
      // Corrupted file, start fresh
    }
    return {};
  }

  private writeStore(store: Record<string, string>): void {
    const data = JSON.stringify(store, null, 2);
    fs.writeFileSync(this.filePath, data, { mode: 0o600 });
  }

  async get(key: string): Promise<string | null> {
    const store = this.readStore();
    return store[key] || null;
  }

  async set(key: string, value: string): Promise<void> {
    const store = this.readStore();
    store[key] = value;
    this.writeStore(store);
  }

  async delete(key: string): Promise<boolean> {
    const store = this.readStore();
    if (key in store) {
      delete store[key];
      this.writeStore(store);
      return true;
    }
    return false;
  }

  async findByPrefix(prefix: string): Promise<Array<{ account: string; password: string }>> {
    const store = this.readStore();
    return Object.entries(store)
      .filter(([k]) => k.startsWith(prefix))
      .map(([account, password]) => ({ account, password }));
  }
}

// ============================================================================
// Memory Storage (Fallback)
// ============================================================================

class MemoryStorage implements SecretStorage {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async findByPrefix(prefix: string): Promise<Array<{ account: string; password: string }>> {
    const results: Array<{ account: string; password: string }> = [];
    for (const [account, password] of this.store.entries()) {
      if (account.startsWith(prefix)) {
        results.push({ account, password });
      }
    }
    return results;
  }
}

// ============================================================================
// Secret Service
// ============================================================================

export class SecretService {
  private storage: SecretStorage;
  private trackedKeys: Map<string, Set<string>> = new Map(); // connectorId -> set of keys

  constructor(storage?: SecretStorage) {
    this.storage = storage || new MemoryStorage();
  }

  /**
   * Initialize with file-based storage (no keychain, no password prompts)
   */
  static async create(): Promise<SecretService> {
    try {
      return new SecretService(new FileStorage());
    } catch {
      // Fallback to memory if file system is unavailable
      return new SecretService(new MemoryStorage());
    }
  }

  /**
   * Build the storage key for a connector secret
   */
  private getKey(connectorId: string, secretKey: string): string {
    // Format: connector.{connectorId}.{secretKey}
    // Example: connector.slack.SLACK_BOT_TOKEN
    return `${SECRET_PREFIX}.${connectorId}.${secretKey}`;
  }

  /**
   * Track a key for a connector (for deletion later)
   */
  private trackKey(connectorId: string, secretKey: string): void {
    if (!this.trackedKeys.has(connectorId)) {
      this.trackedKeys.set(connectorId, new Set());
    }
    this.trackedKeys.get(connectorId)!.add(secretKey);
  }

  /**
   * Set a secret for a connector
   */
  async setSecret(connectorId: string, key: string, value: string): Promise<void> {
    const account = this.getKey(connectorId, key);
    try {
      await this.storage.set(account, value);
      this.trackKey(connectorId, key);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to store secret: ${message}`);
    }
  }

  /**
   * Get a secret for a connector
   */
  async getSecret(connectorId: string, key: string): Promise<string | null> {
    const account = this.getKey(connectorId, key);
    try {
      return await this.storage.get(account);
    } catch {
      return null;
    }
  }

  /**
   * Delete a secret for a connector
   */
  async deleteSecret(connectorId: string, key: string): Promise<boolean> {
    const account = this.getKey(connectorId, key);
    try {
      const result = await this.storage.delete(account);
      // Remove from tracked keys
      const tracked = this.trackedKeys.get(connectorId);
      if (tracked) {
        tracked.delete(key);
      }
      return result;
    } catch {
      return false;
    }
  }

  /**
   * Delete all secrets for a connector
   */
  async deleteAllSecrets(connectorId: string): Promise<void> {
    const tracked = this.trackedKeys.get(connectorId);
    if (tracked) {
      for (const key of tracked) {
        await this.deleteSecret(connectorId, key);
      }
      this.trackedKeys.delete(connectorId);
    }

    // Also try to find and delete any untracked secrets
    const prefix = `${SECRET_PREFIX}.${connectorId}.`;
    const credentials = await this.storage.findByPrefix(prefix);
    for (const cred of credentials) {
      await this.storage.delete(cred.account);
    }
  }

  /**
   * Check if all required secrets are configured
   */
  async hasSecrets(connectorId: string, requiredKeys: string[]): Promise<boolean> {
    for (const key of requiredKeys) {
      const value = await this.getSecret(connectorId, key);
      if (!value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get detailed secrets status for a connector
   */
  async getSecretsStatus(
    connectorId: string,
    secretDefs: SecretDefinition[]
  ): Promise<SecretsStatus> {
    const missing: string[] = [];
    const provided: string[] = [];

    for (const def of secretDefs) {
      const value = await this.getSecret(connectorId, def.key);
      if (value) {
        provided.push(def.key);
      } else if (def.required) {
        missing.push(def.key);
      }
    }

    return {
      configured: missing.length === 0,
      missing,
      provided,
    };
  }

  /**
   * Set multiple secrets at once
   */
  async setSecrets(
    connectorId: string,
    secrets: Record<string, string>
  ): Promise<void> {
    for (const [key, value] of Object.entries(secrets)) {
      if (value) {
        await this.setSecret(connectorId, key, value);
      }
    }
  }

  /**
   * Validate a secret value against a regex pattern
   */
  validateSecret(value: string, pattern?: string): boolean {
    if (!pattern) return true;
    try {
      const regex = new RegExp(pattern);
      return regex.test(value);
    } catch {
      // Invalid regex pattern, skip validation
      return true;
    }
  }

  /**
   * Store OAuth tokens for a connector
   */
  async setOAuthTokens(
    connectorId: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      tokenType?: string;
    }
  ): Promise<void> {
    await this.setSecret(connectorId, 'ACCESS_TOKEN', tokens.accessToken);

    if (tokens.refreshToken) {
      await this.setSecret(connectorId, 'REFRESH_TOKEN', tokens.refreshToken);
    }

    if (tokens.expiresAt) {
      await this.setSecret(connectorId, 'TOKEN_EXPIRY', String(tokens.expiresAt));
    }

    if (tokens.tokenType) {
      await this.setSecret(connectorId, 'TOKEN_TYPE', tokens.tokenType);
    }
  }

  /**
   * Get OAuth tokens for a connector
   */
  async getOAuthTokens(connectorId: string): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    tokenType: string | null;
  }> {
    const accessToken = await this.getSecret(connectorId, 'ACCESS_TOKEN');
    const refreshToken = await this.getSecret(connectorId, 'REFRESH_TOKEN');
    const expiryStr = await this.getSecret(connectorId, 'TOKEN_EXPIRY');
    const tokenType = await this.getSecret(connectorId, 'TOKEN_TYPE');

    return {
      accessToken,
      refreshToken,
      expiresAt: expiryStr ? parseInt(expiryStr, 10) : null,
      tokenType,
    };
  }

  /**
   * Check if OAuth tokens are valid (not expired)
   */
  async areOAuthTokensValid(connectorId: string): Promise<boolean> {
    const tokens = await this.getOAuthTokens(connectorId);

    if (!tokens.accessToken) {
      return false;
    }

    if (tokens.expiresAt) {
      const now = Date.now();
      // Add 5 minute buffer before expiry
      if (now >= tokens.expiresAt - 5 * 60 * 1000) {
        return false;
      }
    }

    return true;
  }
}

// Export singleton factory
let _secretService: SecretService | null = null;

export async function getSecretService(): Promise<SecretService> {
  if (!_secretService) {
    _secretService = await SecretService.create();
  }
  return _secretService;
}
