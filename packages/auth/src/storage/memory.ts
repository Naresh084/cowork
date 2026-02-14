// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { AuthStorage } from '../types.js';

// ============================================================================
// In-Memory Storage
// ============================================================================

/**
 * Simple in-memory storage for development and testing.
 * Data is lost when the process exits.
 */
export class MemoryStorage implements AuthStorage {
  private data: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  /**
   * Get all keys (for debugging).
   */
  keys(): string[] {
    return Array.from(this.data.keys());
  }

  /**
   * Check if a key exists.
   */
  has(key: string): boolean {
    return this.data.has(key);
  }
}
