/**
 * Connector Service
 *
 * Manages connector discovery, installation, and configuration from multiple sources.
 * Sources are prioritized: workspace > managed > bundled
 */

import { readFile, readdir, mkdir, cp, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import {
  ConnectorManifestSchema,
  type ConnectorManifest,
  type ConnectorSource,
  type ConnectorSourceType,
  type ConnectorCategory,
} from '@gemini-cowork/shared';

// Debug flag for verbose connector logging
const DEBUG_CONNECTORS = process.env.DEBUG_CONNECTORS === 'true';

/**
 * Parameters for creating a custom connector
 */
export interface CreateConnectorParams {
  name: string;
  displayName: string;
  description: string;
  icon?: string;
  category?: ConnectorCategory;
  tags?: string[];
  transport: {
    type: 'stdio' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
  };
  auth: {
    type: 'none' | 'env';
    secrets?: Array<{
      key: string;
      description: string;
      required: boolean;
      placeholder?: string;
      link?: string;
    }>;
  };
}

// Get the directory of this file for bundled connectors path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default paths - connectors at project root level (same level as skills)
const DEFAULT_BUNDLED_DIR = join(__dirname, '..', '..', '..', '..', '..', 'connectors'); // Project root connectors/
const PACK_SIGNATURE_FILE = 'SIGNATURE.json';
const MANIFEST_FILE = 'connector.json';
const PACK_SIGNATURE_VERSION = 1;
const ALLOW_UNSIGNED_MANAGED_PACKS = process.env.COWORK_ALLOW_UNSIGNED_MANAGED_PACKS === 'true';

interface PackSignature {
  version: number;
  algorithm: 'sha256';
  digest: string;
  subject: string;
  signer: string;
  signedAt: number;
}

/**
 * Connector Service for managing connectors across multiple sources
 */
export class ConnectorService {
  private bundledConnectorsDir: string;
  private managedConnectorsDir: string;
  private customDirs: string[] = [];
  private connectorCache: Map<string, ConnectorManifest> = new Map();
  private appDataDir: string;

  constructor(appDataDir?: string) {
    this.appDataDir = appDataDir || join(homedir(), '.cowork');
    this.bundledConnectorsDir = DEFAULT_BUNDLED_DIR;
    this.managedConnectorsDir = join(this.appDataDir, 'connectors');
  }

  /**
   * Set custom connector directories
   */
  setCustomDirs(dirs: string[]): void {
    this.customDirs = dirs;
  }

  /**
   * Set bundled connectors directory (for testing or custom bundles)
   */
  setBundledDir(dir: string): void {
    this.bundledConnectorsDir = dir;
  }

  /**
   * Discover all connectors from all sources
   * Sources are checked in priority order:
   * 1. Workspace connectors (highest priority - allows overrides)
   * 2. Managed connectors (installed from marketplace)
   * 3. Custom directories
   * 4. Bundled connectors (lowest priority)
   */
  async discoverAll(workingDirectory?: string): Promise<ConnectorManifest[]> {
    const allConnectors: ConnectorManifest[] = [];
    const seenNames = new Set<string>();

    if (DEBUG_CONNECTORS) {
      console.error('[ConnectorService] Starting discovery...');
      console.error('[ConnectorService] Bundled dir:', this.bundledConnectorsDir);
      console.error('[ConnectorService] Managed dir:', this.managedConnectorsDir);
    }

    // Priority 1: Workspace connectors
    if (workingDirectory) {
      const workspaceConnectorDirs = [
        join(workingDirectory, 'connectors'),
        join(workingDirectory, '.connectors'),
      ];

      for (const dir of workspaceConnectorDirs) {
        if (existsSync(dir)) {
          const connectors = await this.discoverFromDirectory(dir, 'workspace', 10);
          for (const connector of connectors) {
            if (!seenNames.has(connector.name)) {
              seenNames.add(connector.name);
              allConnectors.push(connector);
            }
          }
        }
      }
    }

    // Priority 2: Managed connectors (installed from marketplace)
    if (existsSync(this.managedConnectorsDir)) {
      const connectors = await this.discoverFromDirectory(this.managedConnectorsDir, 'managed', 50);
      for (const connector of connectors) {
        if (!seenNames.has(connector.name)) {
          seenNames.add(connector.name);
          allConnectors.push(connector);
        }
      }
    }

    // Priority 3: Custom directories
    for (let i = 0; i < this.customDirs.length; i++) {
      const dir = this.customDirs[i];
      if (existsSync(dir)) {
        const connectors = await this.discoverFromDirectory(dir, 'workspace', 30 + i);
        for (const connector of connectors) {
          if (!seenNames.has(connector.name)) {
            seenNames.add(connector.name);
            allConnectors.push(connector);
          }
        }
      }
    }

    // Priority 4: Bundled connectors (lowest priority)
    if (existsSync(this.bundledConnectorsDir)) {
      const connectors = await this.discoverFromDirectory(this.bundledConnectorsDir, 'bundled', 100);
      for (const connector of connectors) {
        if (!seenNames.has(connector.name)) {
          seenNames.add(connector.name);
          allConnectors.push(connector);
        }
      }
    }

    // Update cache
    for (const connector of allConnectors) {
      this.connectorCache.set(connector.id, connector);
    }

    if (DEBUG_CONNECTORS) {
      console.error(`[ConnectorService] Discovered ${allConnectors.length} connectors`);
    }

    // Sort by displayName for consistent UI ordering
    return allConnectors.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * Discover connectors from a specific directory
   */
  async discoverFromDirectory(
    dir: string,
    sourceType: ConnectorSourceType,
    priority: number
  ): Promise<ConnectorManifest[]> {
    const connectors: ConnectorManifest[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }

        const connectorDir = join(dir, entry.name);
        const connectorJsonPath = join(connectorDir, 'connector.json');

        if (!existsSync(connectorJsonPath)) {
          continue;
        }

        try {
          const content = await readFile(connectorJsonPath, 'utf-8');
          const rawManifest = JSON.parse(content);

          if (this.shouldEnforcePackSignature(sourceType)) {
            const subject =
              typeof rawManifest?.name === 'string' && rawManifest.name.trim()
                ? rawManifest.name
                : entry.name;
            const isSignatureValid = await this.validatePackSignature(connectorDir, subject);
            if (!isSignatureValid) {
              continue;
            }
          }

          // Add source information
          const source: ConnectorSource = {
            type: sourceType,
            path: connectorDir,
            priority,
          };

          // Merge source into manifest
          const manifestWithSource = {
            ...rawManifest,
            source,
            // Ensure ID follows convention
            id: `${sourceType}:${rawManifest.name}`,
          };

          // Validate against schema
          const parseResult = ConnectorManifestSchema.safeParse(manifestWithSource);
          if (!parseResult.success) {
            continue;
          }

          connectors.push(parseResult.data);
        } catch {
          // Skip connectors that fail to parse
        }
      }
    } catch {
      // Directory scanning error - return empty array
    }

    return connectors;
  }

  /**
   * Get a connector by ID from cache or discover
   */
  async getConnector(connectorId: string): Promise<ConnectorManifest | null> {
    // Check cache first
    if (this.connectorCache.has(connectorId)) {
      return this.connectorCache.get(connectorId)!;
    }

    // Try to discover
    await this.discoverAll();
    return this.connectorCache.get(connectorId) || null;
  }

  /**
   * Get a connector by name (without source prefix)
   */
  async getConnectorByName(name: string): Promise<ConnectorManifest | null> {
    // Ensure cache is populated
    if (this.connectorCache.size === 0) {
      await this.discoverAll();
    }

    // Search through cache for matching name
    for (const connector of this.connectorCache.values()) {
      if (connector.name === name) {
        return connector;
      }
    }

    return null;
  }

  /**
   * Install a connector from bundled to managed directory
   */
  async installConnector(connectorId: string): Promise<void> {
    const connector = await this.getConnector(connectorId);
    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    // Only install bundled connectors
    if (connector.source.type !== 'bundled') {
      throw new Error(`Can only install bundled connectors. Connector ${connectorId} is ${connector.source.type}`);
    }

    // Check if already installed
    const targetDir = join(this.managedConnectorsDir, connector.name);
    if (existsSync(targetDir)) {
      throw new Error(`Connector already installed: ${connector.name}`);
    }

    // Ensure managed directory exists
    await mkdir(this.managedConnectorsDir, { recursive: true });

    // Copy connector directory
    await cp(connector.source.path, targetDir, { recursive: true });
    await this.writePackSignature(targetDir, connector.name);

    // Clear cache to force re-discovery
    this.connectorCache.clear();
  }

  /**
   * Uninstall a connector from managed directory
   */
  async uninstallConnector(connectorId: string): Promise<void> {
    const connector = await this.getConnector(connectorId);
    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    // Only uninstall managed connectors
    if (connector.source.type !== 'managed') {
      throw new Error(`Can only uninstall managed connectors. Connector ${connectorId} is ${connector.source.type}`);
    }

    // Remove connector directory
    await rm(connector.source.path, { recursive: true, force: true });

    // Clear cache
    this.connectorCache.delete(connectorId);
  }

  /**
   * Create a custom connector in the managed directory
   */
  async createConnector(params: CreateConnectorParams): Promise<string> {
    // Validate name (kebab-case, 1-64 chars)
    const nameRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!nameRegex.test(params.name)) {
      throw new Error('Name must be kebab-case (lowercase letters, numbers, hyphens only)');
    }
    if (params.name.length > 64) {
      throw new Error('Name must be 64 characters or less');
    }
    if (params.name.length < 1) {
      throw new Error('Name is required');
    }

    // Validate required fields
    if (!params.displayName?.trim()) {
      throw new Error('Display name is required');
    }
    if (!params.description?.trim()) {
      throw new Error('Description is required');
    }

    // Validate transport
    if (!params.transport) {
      throw new Error('Transport configuration is required');
    }
    if (params.transport.type === 'stdio' && !params.transport.command) {
      throw new Error('Command is required for stdio transport');
    }
    if (params.transport.type === 'http' && !params.transport.url) {
      throw new Error('URL is required for http transport');
    }

    // Create connector directory in managed location
    const connectorDir = join(this.managedConnectorsDir, params.name);
    if (existsSync(connectorDir)) {
      throw new Error(`Connector "${params.name}" already exists`);
    }

    // Ensure managed directory exists
    await mkdir(this.managedConnectorsDir, { recursive: true });
    await mkdir(connectorDir, { recursive: true });

    // Build connector.json content
    const connectorJson = this.buildConnectorJson(params);

    // Write connector.json
    const connectorJsonPath = join(connectorDir, 'connector.json');
    await writeFile(connectorJsonPath, JSON.stringify(connectorJson, null, 2), 'utf-8');
    await this.writePackSignature(connectorDir, params.name);

    // Clear cache and re-discover
    this.connectorCache.clear();

    const connectorId = `managed:${params.name}`;

    return connectorId;
  }

  /**
   * Build connector.json content from parameters
   */
  private buildConnectorJson(params: CreateConnectorParams): Record<string, unknown> {
    // Build transport
    const transport: Record<string, unknown> = {
      type: params.transport.type,
    };
    if (params.transport.type === 'stdio') {
      transport.command = params.transport.command;
      transport.args = params.transport.args || [];
    } else {
      transport.url = params.transport.url;
      if (params.transport.headers) {
        transport.headers = params.transport.headers;
      }
    }

    // Build auth
    const auth: Record<string, unknown> = {
      type: params.auth.type,
    };
    if (params.auth.type === 'env' && params.auth.secrets) {
      auth.secrets = params.auth.secrets.map((s) => ({
        key: s.key,
        description: s.description,
        required: s.required,
        ...(s.placeholder && { placeholder: s.placeholder }),
        ...(s.link && { link: s.link }),
      }));
    }

    return {
      id: params.name,
      name: params.name,
      displayName: params.displayName,
      description: params.description,
      version: '1.0.0',
      icon: params.icon || 'Plug',
      category: params.category || 'custom',
      tags: params.tags || ['custom'],
      transport,
      auth,
      requirements: {
        runtime: 'node',
        bins: ['npx'],
      },
    };
  }

  /**
   * Get list of managed (installed) connector IDs
   */
  async getInstalledConnectorIds(): Promise<string[]> {
    if (!existsSync(this.managedConnectorsDir)) {
      return [];
    }

    const connectors = await this.discoverFromDirectory(this.managedConnectorsDir, 'managed', 50);
    return connectors.map((c) => c.id);
  }

  /**
   * Check if a connector is installed (in managed dir)
   */
  async isInstalled(connectorName: string): Promise<boolean> {
    const targetDir = join(this.managedConnectorsDir, connectorName);
    return existsSync(targetDir);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.connectorCache.clear();
  }

  private shouldEnforcePackSignature(sourceType: ConnectorSourceType): boolean {
    if (ALLOW_UNSIGNED_MANAGED_PACKS) {
      return false;
    }
    return sourceType === 'managed';
  }

  private async computePackDigest(connectorDir: string): Promise<string> {
    const manifestPath = join(connectorDir, MANIFEST_FILE);
    const manifestContent = await readFile(manifestPath, 'utf-8');
    return createHash('sha256').update(manifestContent).digest('hex');
  }

  private async writePackSignature(connectorDir: string, subject: string): Promise<void> {
    const digest = await this.computePackDigest(connectorDir);
    const signature: PackSignature = {
      version: PACK_SIGNATURE_VERSION,
      algorithm: 'sha256',
      digest,
      subject,
      signer: 'local-managed-installer',
      signedAt: Date.now(),
    };
    await writeFile(
      join(connectorDir, PACK_SIGNATURE_FILE),
      JSON.stringify(signature, null, 2),
      'utf-8',
    );
  }

  private async validatePackSignature(connectorDir: string, expectedSubject: string): Promise<boolean> {
    const signaturePath = join(connectorDir, PACK_SIGNATURE_FILE);
    if (!existsSync(signaturePath)) {
      return false;
    }

    try {
      const signatureRaw = await readFile(signaturePath, 'utf-8');
      const signature = JSON.parse(signatureRaw) as Partial<PackSignature>;
      if (
        signature.version !== PACK_SIGNATURE_VERSION ||
        signature.algorithm !== 'sha256' ||
        typeof signature.digest !== 'string' ||
        typeof signature.subject !== 'string'
      ) {
        return false;
      }
      if (signature.subject !== expectedSubject) {
        return false;
      }

      const computedDigest = await this.computePackDigest(connectorDir);
      return computedDigest === signature.digest;
    } catch {
      return false;
    }
  }

  /**
   * Get the managed connectors directory path
   */
  getManagedConnectorsDir(): string {
    return this.managedConnectorsDir;
  }

  /**
   * Get the app data directory path
   */
  getAppDataDir(): string {
    return this.appDataDir;
  }

  /**
   * Get the bundled connectors directory path
   */
  getBundledConnectorsDir(): string {
    return this.bundledConnectorsDir;
  }
}

// Singleton instance
export const connectorService = new ConnectorService();
