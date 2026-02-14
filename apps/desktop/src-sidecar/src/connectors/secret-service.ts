// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Secret Service
 *
 * Connector secrets are encrypted at rest using AES-256-GCM.
 * Key material is sourced from `COWORK_CONNECTOR_SECRET_KEY` (injected by Rust
 * from secure credential storage) with deterministic local fallback.
 *
 * Legacy plaintext secret stores are migrated once, then removed.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { SecretDefinition } from '@cowork/shared';

// ============================================================================
// Types
// ============================================================================

const SECRET_PREFIX = 'connector';
const SECRET_KEY_ENV_VAR = 'COWORK_CONNECTOR_SECRET_KEY';
const ENCRYPTED_VAULT_FILE = 'secrets.vault.json';
const LEGACY_PLAINTEXT_FILE = 'secrets.json';
const VAULT_SCHEMA_VERSION = 1;

/**
 * Status of secrets for a connector.
 */
export interface SecretsStatus {
  configured: boolean;
  missing: string[];
  provided: string[];
}

/**
 * Result of secret encryption key rotation.
 */
export interface SecretRotationResult {
  rotatedEntries: number;
  fromKeyVersion: string;
  toKeyVersion: string;
}

interface SecretStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  findByPrefix(prefix: string): Promise<Array<{ account: string; password: string }>>;
}

interface RotatableSecretStorage extends SecretStorage {
  rotateKey(nextKeyMaterial?: string): Promise<SecretRotationResult>;
}

interface EncryptedSecretRecord {
  payload: string;
  keyVersion: string;
  updatedAt: number;
}

interface EncryptedSecretVault {
  version: number;
  activeKeyVersion: string;
  records: Record<string, EncryptedSecretRecord>;
}

export interface FileStorageOptions {
  configDir?: string;
  keyMaterialResolver?: () => string;
  now?: () => number;
}

// ============================================================================
// Key + Path helpers
// ============================================================================

function getConfigDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'cowork');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'cowork'
    );
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'cowork');
}

function getLegacyConfigDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'cowork');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'cowork'
    );
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'cowork');
}

function defaultFallbackKeyMaterial(): string {
  let username = 'unknown-user';
  try {
    username = os.userInfo().username;
  } catch {
    // Continue with a deterministic fallback payload.
  }

  const digest = createHash('sha256')
    .update('cowork.connector.secrets')
    .update(process.platform)
    .update(os.homedir())
    .update(os.hostname())
    .update(username)
    .digest('hex');
  return digest;
}

function keyVersionFromMaterial(keyMaterial: string): string {
  return createHash('sha256').update(keyMaterial).digest('hex').slice(0, 16);
}

function keyBytesFromMaterial(keyMaterial: string): Buffer {
  return createHash('sha256').update(keyMaterial).digest();
}

function ensureFilePermissions(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort for non-POSIX/locked file systems.
  }
}

function resolveDefaultKeyMaterial(): string {
  const fromEnv = process.env[SECRET_KEY_ENV_VAR]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return defaultFallbackKeyMaterial();
}

function buildDefaultVault(activeKeyVersion: string): EncryptedSecretVault {
  return {
    version: VAULT_SCHEMA_VERSION,
    activeKeyVersion,
    records: {},
  };
}

// ============================================================================
// File-backed encrypted storage
// ============================================================================

export class FileStorage implements SecretStorage, RotatableSecretStorage {
  private readonly vaultPath: string;
  private readonly legacyStorePath: string;
  private readonly legacyStorePathV0: string;
  private readonly now: () => number;
  private readonly keyMaterialResolver: () => string;
  private readonly keyByVersion: Map<string, Buffer> = new Map();
  private activeKeyVersion: string;

  constructor(options: FileStorageOptions = {}) {
    const configDir = options.configDir || getConfigDir();
    const legacyConfigDir = getLegacyConfigDir();
    this.keyMaterialResolver = options.keyMaterialResolver || resolveDefaultKeyMaterial;
    this.now = options.now || (() => Date.now());
    this.vaultPath = path.join(configDir, ENCRYPTED_VAULT_FILE);
    this.legacyStorePath = path.join(configDir, LEGACY_PLAINTEXT_FILE);
    this.legacyStorePathV0 = path.join(legacyConfigDir, LEGACY_PLAINTEXT_FILE);

    fs.mkdirSync(configDir, { recursive: true });
    const activeMaterial = this.keyMaterialResolver();
    this.activeKeyVersion = this.registerKeyMaterial(activeMaterial);
    this.registerKeyMaterial(defaultFallbackKeyMaterial());
    this.migrateLegacyStoresIfNeeded();
    this.tryAutoRotateToActiveKey();
  }

  private registerKeyMaterial(keyMaterial: string): string {
    const normalized = keyMaterial.trim();
    const version = keyVersionFromMaterial(normalized);
    this.keyByVersion.set(version, keyBytesFromMaterial(normalized));
    return version;
  }

  private getKey(version: string): Buffer {
    const key = this.keyByVersion.get(version);
    if (!key) {
      throw new Error('No encryption key available for stored key version');
    }
    return key;
  }

  private encrypt(plainText: string, keyVersion: string): EncryptedSecretRecord {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(keyVersion), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64');
    return {
      payload,
      keyVersion,
      updatedAt: this.now(),
    };
  }

  private decrypt(record: EncryptedSecretRecord): string {
    const payload = Buffer.from(record.payload, 'base64');
    if (payload.length <= 28) {
      throw new Error('Malformed encrypted payload');
    }
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);

    const candidateVersions = new Set<string>();
    if (record.keyVersion) {
      candidateVersions.add(record.keyVersion);
    }
    candidateVersions.add(this.activeKeyVersion);
    for (const version of this.keyByVersion.keys()) {
      candidateVersions.add(version);
    }

    let lastError: unknown;
    for (const version of candidateVersions) {
      const key = this.keyByVersion.get(version);
      if (!key) {
        continue;
      }
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        return plain;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to decrypt secret');
  }

  private readVault(): EncryptedSecretVault {
    try {
      if (!fs.existsSync(this.vaultPath)) {
        return buildDefaultVault(this.activeKeyVersion);
      }
      const parsed = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8')) as Partial<EncryptedSecretVault>;
      return {
        version: typeof parsed.version === 'number' ? parsed.version : VAULT_SCHEMA_VERSION,
        activeKeyVersion:
          typeof parsed.activeKeyVersion === 'string' && parsed.activeKeyVersion
            ? parsed.activeKeyVersion
            : this.activeKeyVersion,
        records: parsed.records && typeof parsed.records === 'object' ? parsed.records : {},
      };
    } catch {
      return buildDefaultVault(this.activeKeyVersion);
    }
  }

  private writeVault(vault: EncryptedSecretVault): void {
    const payload = JSON.stringify(vault, null, 2);
    fs.writeFileSync(this.vaultPath, payload, { mode: 0o600 });
    ensureFilePermissions(this.vaultPath);
  }

  private parseLegacyPlaintextStore(raw: string): Record<string, string> {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      const direct = parsed as Record<string, unknown>;
      const nestedCredentials =
        direct.credentials && typeof direct.credentials === 'object' && !Array.isArray(direct.credentials)
          ? (direct.credentials as Record<string, unknown>)
          : null;
      const source = nestedCredentials || direct;

      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'string') {
          result[key] = value;
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  private migrateLegacyStoreFile(vault: EncryptedSecretVault, filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const legacyData = this.parseLegacyPlaintextStore(fs.readFileSync(filePath, 'utf8'));
    let migrated = false;
    for (const [account, password] of Object.entries(legacyData)) {
      if (!vault.records[account]) {
        vault.records[account] = this.encrypt(password, this.activeKeyVersion);
        migrated = true;
      }
    }

    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // Best effort cleanup after migration.
    }
    return migrated;
  }

  private migrateLegacyStoresIfNeeded(): void {
    const vault = this.readVault();
    const migratedCurrent = this.migrateLegacyStoreFile(vault, this.legacyStorePath);
    const migratedLegacy = this.migrateLegacyStoreFile(vault, this.legacyStorePathV0);

    if (!fs.existsSync(this.vaultPath) || migratedCurrent || migratedLegacy) {
      vault.activeKeyVersion = this.activeKeyVersion;
      this.writeVault(vault);
    }
  }

  private tryAutoRotateToActiveKey(): void {
    const vault = this.readVault();
    if (vault.activeKeyVersion === this.activeKeyVersion) {
      return;
    }

    const canDecryptAll = Object.values(vault.records).every((record) => {
      try {
        this.decrypt(record);
        return true;
      } catch {
        return false;
      }
    });

    if (!canDecryptAll) {
      // Keep current key for future writes; skip auto-rotation for unreadable records.
      return;
    }

    for (const account of Object.keys(vault.records)) {
      const plain = this.decrypt(vault.records[account]);
      vault.records[account] = this.encrypt(plain, this.activeKeyVersion);
    }
    vault.activeKeyVersion = this.activeKeyVersion;
    this.writeVault(vault);
  }

  async rotateKey(nextKeyMaterial?: string): Promise<SecretRotationResult> {
    const material = (nextKeyMaterial || this.keyMaterialResolver()).trim();
    const toKeyVersion = this.registerKeyMaterial(material);
    const fromKeyVersion = this.activeKeyVersion;

    if (toKeyVersion === fromKeyVersion) {
      return {
        rotatedEntries: 0,
        fromKeyVersion,
        toKeyVersion,
      };
    }

    const vault = this.readVault();
    let rotatedEntries = 0;
    for (const account of Object.keys(vault.records)) {
      const plain = this.decrypt(vault.records[account]);
      vault.records[account] = this.encrypt(plain, toKeyVersion);
      rotatedEntries += 1;
    }

    this.activeKeyVersion = toKeyVersion;
    vault.activeKeyVersion = toKeyVersion;
    this.writeVault(vault);

    return {
      rotatedEntries,
      fromKeyVersion,
      toKeyVersion,
    };
  }

  async get(key: string): Promise<string | null> {
    const vault = this.readVault();
    const record = vault.records[key];
    if (!record) {
      return null;
    }
    try {
      return this.decrypt(record);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const vault = this.readVault();
    vault.records[key] = this.encrypt(value, this.activeKeyVersion);
    vault.activeKeyVersion = this.activeKeyVersion;
    this.writeVault(vault);
  }

  async delete(key: string): Promise<boolean> {
    const vault = this.readVault();
    if (!(key in vault.records)) {
      return false;
    }
    delete vault.records[key];
    this.writeVault(vault);
    return true;
  }

  async findByPrefix(prefix: string): Promise<Array<{ account: string; password: string }>> {
    const vault = this.readVault();
    const results: Array<{ account: string; password: string }> = [];
    for (const [account, record] of Object.entries(vault.records)) {
      if (!account.startsWith(prefix)) {
        continue;
      }
      try {
        results.push({
          account,
          password: this.decrypt(record),
        });
      } catch {
        // Skip undecryptable entries.
      }
    }
    return results;
  }
}

// ============================================================================
// Memory Storage fallback
// ============================================================================

class MemoryStorage implements SecretStorage {
  private readonly store = new Map<string, string>();

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
// Secret service API
// ============================================================================

function supportsRotation(storage: SecretStorage): storage is RotatableSecretStorage {
  return typeof (storage as RotatableSecretStorage).rotateKey === 'function';
}

export class SecretService {
  private readonly storage: SecretStorage;
  private readonly trackedKeys: Map<string, Set<string>> = new Map();

  constructor(storage?: SecretStorage) {
    this.storage = storage || new MemoryStorage();
  }

  static async create(): Promise<SecretService> {
    try {
      return new SecretService(new FileStorage());
    } catch {
      return new SecretService(new MemoryStorage());
    }
  }

  private getKey(connectorId: string, secretKey: string): string {
    return `${SECRET_PREFIX}.${connectorId}.${secretKey}`;
  }

  private trackKey(connectorId: string, secretKey: string): void {
    if (!this.trackedKeys.has(connectorId)) {
      this.trackedKeys.set(connectorId, new Set());
    }
    this.trackedKeys.get(connectorId)?.add(secretKey);
  }

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

  async getSecret(connectorId: string, key: string): Promise<string | null> {
    const account = this.getKey(connectorId, key);
    try {
      return await this.storage.get(account);
    } catch {
      return null;
    }
  }

  async deleteSecret(connectorId: string, key: string): Promise<boolean> {
    const account = this.getKey(connectorId, key);
    try {
      const result = await this.storage.delete(account);
      const tracked = this.trackedKeys.get(connectorId);
      if (tracked) {
        tracked.delete(key);
      }
      return result;
    } catch {
      return false;
    }
  }

  async deleteAllSecrets(connectorId: string): Promise<void> {
    const tracked = this.trackedKeys.get(connectorId);
    if (tracked) {
      for (const key of tracked) {
        await this.deleteSecret(connectorId, key);
      }
      this.trackedKeys.delete(connectorId);
    }

    const prefix = `${SECRET_PREFIX}.${connectorId}.`;
    const credentials = await this.storage.findByPrefix(prefix);
    for (const cred of credentials) {
      await this.storage.delete(cred.account);
    }
  }

  async hasSecrets(connectorId: string, requiredKeys: string[]): Promise<boolean> {
    for (const key of requiredKeys) {
      const value = await this.getSecret(connectorId, key);
      if (!value) {
        return false;
      }
    }
    return true;
  }

  async getSecretsStatus(connectorId: string, secretDefs: SecretDefinition[]): Promise<SecretsStatus> {
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

  async setSecrets(connectorId: string, secrets: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(secrets)) {
      if (value) {
        await this.setSecret(connectorId, key, value);
      }
    }
  }

  async rotateEncryptionKey(nextKeyMaterial?: string): Promise<SecretRotationResult> {
    if (!supportsRotation(this.storage)) {
      return {
        rotatedEntries: 0,
        fromKeyVersion: 'memory',
        toKeyVersion: 'memory',
      };
    }
    return this.storage.rotateKey(nextKeyMaterial);
  }

  validateSecret(value: string, pattern?: string): boolean {
    if (!pattern) {
      return true;
    }
    try {
      const regex = new RegExp(pattern);
      return regex.test(value);
    } catch {
      return true;
    }
  }

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

  async areOAuthTokensValid(connectorId: string): Promise<boolean> {
    const tokens = await this.getOAuthTokens(connectorId);
    if (!tokens.accessToken) {
      return false;
    }
    if (tokens.expiresAt) {
      const now = Date.now();
      if (now >= tokens.expiresAt - 5 * 60 * 1000) {
        return false;
      }
    }
    return true;
  }
}

let _secretService: SecretService | null = null;

export async function getSecretService(): Promise<SecretService> {
  if (!_secretService) {
    _secretService = await SecretService.create();
  }
  return _secretService;
}
