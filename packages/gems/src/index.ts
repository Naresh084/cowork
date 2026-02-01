import { z } from 'zod';

// ============================================================================
// Gem Types
// ============================================================================

export const GemManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  icon: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  entrypoint: z.string(),
});

export type GemManifest = z.infer<typeof GemManifestSchema>;

export interface Gem {
  manifest: GemManifest;
  isEnabled: boolean;
  isInstalled: boolean;
  installPath?: string;
}

export interface GemContext {
  workingDirectory: string;
  sessionId: string;
  apiKey?: string;
}

// ============================================================================
// Gem Registry
// ============================================================================

export interface GemRegistryEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  downloads: number;
  rating?: number;
  icon?: string;
  tags: string[];
}

export class GemRegistry {
  private registryUrl: string;

  constructor(registryUrl = 'https://gems.gemini-cowork.dev/api') {
    this.registryUrl = registryUrl;
  }

  async search(_query: string): Promise<GemRegistryEntry[]> {
    // In production, this would fetch from the registry
    // For now, return empty results
    void this.registryUrl; // Will be used in production
    return [];
  }

  async getGem(_id: string): Promise<GemRegistryEntry | null> {
    // In production, this would fetch from the registry
    return null;
  }

  async getFeatured(): Promise<GemRegistryEntry[]> {
    // Return featured gems
    return [];
  }
}

// ============================================================================
// Gem Manager
// ============================================================================

export class GemManager {
  private gems: Map<string, Gem> = new Map();
  private registry: GemRegistry;

  constructor(registry?: GemRegistry) {
    this.registry = registry || new GemRegistry();
  }

  /**
   * Install a gem by ID.
   */
  async install(gemId: string): Promise<Gem> {
    const entry = await this.registry.getGem(gemId);
    if (!entry) {
      throw new Error(`Gem not found: ${gemId}`);
    }

    // In production, this would download and install the gem
    const gem: Gem = {
      manifest: {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        description: entry.description,
        author: entry.author,
        entrypoint: 'index.js',
      },
      isEnabled: true,
      isInstalled: true,
    };

    this.gems.set(gemId, gem);
    return gem;
  }

  /**
   * Uninstall a gem.
   */
  async uninstall(gemId: string): Promise<void> {
    const gem = this.gems.get(gemId);
    if (!gem) {
      throw new Error(`Gem not installed: ${gemId}`);
    }

    // In production, this would remove gem files
    this.gems.delete(gemId);
  }

  /**
   * Enable a gem.
   */
  enable(gemId: string): void {
    const gem = this.gems.get(gemId);
    if (gem) {
      gem.isEnabled = true;
    }
  }

  /**
   * Disable a gem.
   */
  disable(gemId: string): void {
    const gem = this.gems.get(gemId);
    if (gem) {
      gem.isEnabled = false;
    }
  }

  /**
   * Get all installed gems.
   */
  getInstalled(): Gem[] {
    return Array.from(this.gems.values());
  }

  /**
   * Get enabled gems.
   */
  getEnabled(): Gem[] {
    return this.getInstalled().filter((gem) => gem.isEnabled);
  }

  /**
   * Check if a gem is installed.
   */
  isInstalled(gemId: string): boolean {
    return this.gems.has(gemId);
  }
}

export function createGemManager(registry?: GemRegistry): GemManager {
  return new GemManager(registry);
}
