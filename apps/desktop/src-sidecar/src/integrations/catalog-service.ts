import { existsSync } from 'fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type {
  IntegrationAction,
  IntegrationChannelManifest,
  IntegrationPluginManifest,
  PlatformType,
} from '@gemini-cowork/shared';
import {
  INTEGRATION_PLATFORM_METADATA,
  buildCapabilityMatrix,
  ALL_INTEGRATION_ACTIONS,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_BUNDLED_DIR = join(__dirname, '..', '..', '..', '..', '..', 'integrations');
const DEFAULT_MANAGED_DIR = join(homedir(), '.cowork', 'integrations', 'plugins');

type ManifestSource = 'builtin' | 'bundled-plugin' | 'managed-plugin' | 'workspace-plugin';

interface LoadedPluginManifest {
  manifest: IntegrationPluginManifest;
  source: ManifestSource;
}

const BUILTIN_CAPABILITIES: Record<PlatformType, IntegrationAction[]> = {
  whatsapp: ['send', 'read'],
  slack: [
    'send',
    'search',
    'read',
    'edit',
    'delete',
    'react',
    'pin',
    'unpin',
    'list_pins',
    'thread_reply',
    'thread_list',
  ],
  telegram: ['send', 'read', 'search', 'edit', 'delete', 'thread_reply'],
  discord: [
    'send',
    'read',
    'edit',
    'delete',
    'react',
    'list_reactions',
    'pin',
    'unpin',
    'list_pins',
    'thread_create',
    'thread_reply',
    'thread_list',
    'moderation_timeout',
    'moderation_kick',
    'moderation_ban',
  ],
  imessage: ['send', 'read'],
  teams: ['send', 'read', 'edit', 'delete', 'thread_reply', 'thread_list'],
  matrix: ['send', 'read', 'search', 'thread_reply'],
  line: ['send', 'read'],
};

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function normalizePluginManifest(input: unknown): IntegrationPluginManifest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : id;
  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim()
      ? raw.displayName.trim()
      : name || id;
  const description =
    typeof raw.description === 'string' ? raw.description.trim() : '';
  const version = typeof raw.version === 'string' ? raw.version.trim() : '1.0.0';
  const channelType =
    typeof raw.channelType === 'string' ? raw.channelType.trim() : 'custom';
  if (!id || !displayName) {
    return null;
  }

  const setupGuide = toStringList(raw.setupGuide);
  const capabilitiesRaw =
    raw.capabilities && typeof raw.capabilities === 'object' && !Array.isArray(raw.capabilities)
      ? (raw.capabilities as Record<string, unknown>)
      : {};
  const capabilities: Partial<Record<IntegrationAction, boolean>> = {};
  for (const action of ALL_INTEGRATION_ACTIONS) {
    if (typeof capabilitiesRaw[action] === 'boolean') {
      capabilities[action] = Boolean(capabilitiesRaw[action]);
    }
  }

  return {
    id,
    name,
    displayName,
    description,
    version,
    channelType: channelType as IntegrationPluginManifest['channelType'],
    setupGuide,
    capabilities,
    configSchema:
      raw.configSchema && typeof raw.configSchema === 'object' && !Array.isArray(raw.configSchema)
        ? (raw.configSchema as Record<string, unknown>)
        : undefined,
  };
}

export class IntegrationCatalogService {
  private bundledDir = DEFAULT_BUNDLED_DIR;
  private managedDir = DEFAULT_MANAGED_DIR;

  async listCatalog(workingDirectory?: string): Promise<IntegrationChannelManifest[]> {
    const manifests: IntegrationChannelManifest[] = [];

    for (const [platform, metadata] of Object.entries(
      INTEGRATION_PLATFORM_METADATA,
    ) as Array<[PlatformType, (typeof INTEGRATION_PLATFORM_METADATA)[PlatformType]]>) {
      manifests.push({
        id: platform,
        channelType: platform,
        displayName: metadata.displayName,
        description: `${metadata.displayName} integration channel`,
        source: 'builtin',
        setupGuide: [
          `Configure credentials for ${metadata.displayName} in Integration Settings.`,
          'Connect channel and validate status before enabling automation rules.',
        ],
        capabilities: buildCapabilityMatrix(BUILTIN_CAPABILITIES[platform]),
      });
    }

    const plugins = await this.listPluginsWithSource(workingDirectory);
    for (const plugin of plugins) {
      manifests.push({
        id: plugin.manifest.id,
        channelType: plugin.manifest.channelType,
        displayName: plugin.manifest.displayName,
        description: plugin.manifest.description,
        source: 'plugin',
        setupGuide:
          plugin.manifest.setupGuide && plugin.manifest.setupGuide.length > 0
            ? plugin.manifest.setupGuide
            : ['Follow plugin-specific integration setup instructions.'],
        capabilities:
          plugin.manifest.capabilities && Object.keys(plugin.manifest.capabilities).length > 0
            ? plugin.manifest.capabilities
            : buildCapabilityMatrix(['send']),
        pluginId: plugin.manifest.id,
      });
    }

    return manifests.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async listPlugins(workingDirectory?: string): Promise<IntegrationPluginManifest[]> {
    const plugins = await this.listPluginsWithSource(workingDirectory);
    return plugins.map((entry) => entry.manifest);
  }

  async installPlugin(plugin: IntegrationPluginManifest): Promise<void> {
    const normalized = normalizePluginManifest(plugin);
    if (!normalized) {
      throw new Error('Invalid integration plugin manifest');
    }

    const pluginDir = join(this.managedDir, normalized.id);
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, 'integration.json'),
      JSON.stringify(normalized, null, 2),
      'utf-8',
    );
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    const id = pluginId.trim();
    if (!id) {
      throw new Error('pluginId is required');
    }
    const pluginDir = join(this.managedDir, id);
    if (!existsSync(pluginDir)) return;
    await rm(pluginDir, { recursive: true, force: true });
  }

  private async listPluginsWithSource(
    workingDirectory?: string,
  ): Promise<LoadedPluginManifest[]> {
    const loaded: LoadedPluginManifest[] = [];
    const seen = new Set<string>();

    const candidateDirs: Array<{ path: string; source: ManifestSource }> = [];
    if (workingDirectory) {
      candidateDirs.push({
        path: join(workingDirectory, 'integrations'),
        source: 'workspace-plugin',
      });
    }
    candidateDirs.push({ path: this.managedDir, source: 'managed-plugin' });
    candidateDirs.push({ path: this.bundledDir, source: 'bundled-plugin' });

    for (const candidate of candidateDirs) {
      const manifests = await this.loadFromDirectory(candidate.path, candidate.source);
      for (const item of manifests) {
        if (seen.has(item.manifest.id)) continue;
        seen.add(item.manifest.id);
        loaded.push(item);
      }
    }

    return loaded;
  }

  private async loadFromDirectory(
    dir: string,
    source: ManifestSource,
  ): Promise<LoadedPluginManifest[]> {
    if (!existsSync(dir)) return [];

    const entries = await readdir(dir, { withFileTypes: true });
    const loaded: LoadedPluginManifest[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const manifestPath = join(dir, entry.name, 'integration.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const content = await readFile(manifestPath, 'utf-8');
        const parsed = JSON.parse(content);
        const normalized = normalizePluginManifest(parsed);
        if (!normalized) continue;
        loaded.push({ manifest: normalized, source });
      } catch {
        // Skip malformed plugin manifest.
      }
    }

    return loaded;
  }
}

export const integrationCatalogService = new IntegrationCatalogService();

