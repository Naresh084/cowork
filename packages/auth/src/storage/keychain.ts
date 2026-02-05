import type { AuthStorage } from '../types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ============================================================================
// macOS Keychain Storage
// ============================================================================

const SERVICE_NAME = 'gemini-cowork';

/**
 * Secure storage using macOS Keychain.
 * Credentials are encrypted and protected by the system.
 *
 * Note: This is a Node.js implementation. For Tauri apps,
 * use the Rust keychain commands instead.
 */
export class KeychainStorage implements AuthStorage {
  private serviceName: string;

  constructor(serviceName = SERVICE_NAME) {
    this.serviceName = serviceName;
  }

  /**
   * Get a value from the keychain.
   */
  async get(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'security',
        ['find-generic-password', '-s', this.serviceName, '-a', key, '-w'],
        { encoding: 'utf8' }
      );
      return stdout.trim();
    } catch {
      // Item not found or other error
      return null;
    }
  }

  /**
   * Set a value in the keychain.
   */
  async set(key: string, value: string): Promise<void> {
    // First try to delete existing entry
    try {
      await execFileAsync(
        'security',
        ['delete-generic-password', '-s', this.serviceName, '-a', key]
      );
    } catch {
      // Ignore error if item doesn't exist
    }

    // Add new entry
    // Use -U flag to allow updates if it already exists
    await execFileAsync(
      'security',
      ['add-generic-password', '-s', this.serviceName, '-a', key, '-w', value, '-U']
    );
  }

  /**
   * Delete a value from the keychain.
   */
  async delete(key: string): Promise<void> {
    try {
      await execFileAsync(
        'security',
        ['delete-generic-password', '-s', this.serviceName, '-a', key]
      );
    } catch {
      // Ignore error if item doesn't exist
    }
  }

  /**
   * Clear all values for this service from the keychain.
   */
  async clear(): Promise<void> {
    // List all keys for this service and delete them
    // This is a simplified implementation - in production you'd want
    // to track keys separately
    const keysToDelete = [
      'gemini_cowork_api_key',
      'gemini_cowork_access_token',
      'gemini_cowork_refresh_token',
      'gemini_cowork_token_expiry',
      'gemini_cowork_user_email',
      'gemini_cowork_auth_method',
    ];

    await Promise.all(keysToDelete.map((key) => this.delete(key)));
  }

  /**
   * Check if keychain access is available.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('security', ['help']);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create the appropriate storage based on platform.
 * Returns KeychainStorage on macOS, MemoryStorage elsewhere.
 */
export async function createSecureStorage(): Promise<AuthStorage> {
  if (process.platform === 'darwin') {
    const available = await KeychainStorage.isAvailable();
    if (available) {
      return new KeychainStorage();
    }
  }

  // Fallback to memory storage
  const { MemoryStorage } = await import('./memory.js');
  console.warn('Keychain not available, using in-memory storage');
  return new MemoryStorage();
}
