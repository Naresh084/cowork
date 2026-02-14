// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Subagent Service - Works exactly like CommandService
 *
 * Manages subagent discovery, installation, and loading from multiple sources.
 * Sources are prioritized: workspace > managed > bundled
 *
 * - Bundled subagents: Available for installation (like a marketplace)
 * - Managed subagents: Installed in ~/.cowork/subagents/
 * - Workspace subagents: Project-specific in .cowork/subagents/
 */

import { readdir, mkdir, cp, rm, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type {
  SubagentManifest,
  SubagentCategory,
  SubagentSource,
  SubagentConfig,
  LoadedSubagent,
  SubagentSourceInfo,
  SubagentSearchOptions,
  CreateSubagentParams,
} from './types.js';

// Get the directory of this file for bundled subagents path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default path to project root subagents/ directory (same level as skills/)
const DEFAULT_BUNDLED_DIR = join(__dirname, '..', '..', '..', '..', '..', 'subagents');

/**
 * Subagent Service for managing subagents across multiple sources
 */
export class SubagentService {
  private bundledSubagentsDir: string;
  private managedSubagentsDir: string;
  private subagentCache: Map<string, LoadedSubagent> = new Map();
  private appDataDir: string;

  constructor(appDataDir?: string) {
    this.appDataDir = appDataDir || join(homedir(), '.cowork');
    this.bundledSubagentsDir = DEFAULT_BUNDLED_DIR;
    this.managedSubagentsDir = join(this.appDataDir, 'subagents');
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    // Ensure managed directory exists
    if (!existsSync(this.managedSubagentsDir)) {
      await mkdir(this.managedSubagentsDir, { recursive: true });
    }
  }

  /**
   * Discover all subagents from all sources
   */
  async discoverAll(workingDirectory?: string): Promise<SubagentManifest[]> {
    const allSubagents: SubagentManifest[] = [];
    const seenNames = new Set<string>();

    // Track managed subagents for override (installed versions)
    const managedSubagents: Map<string, LoadedSubagent> = new Map();

    // Step 1: Load managed subagents (installed) for reference
    if (existsSync(this.managedSubagentsDir)) {
      const subagents = await this.discoverFromDirectory(
        this.managedSubagentsDir,
        'built-in',
        2
      );
      for (const sub of subagents) {
        managedSubagents.set(sub.manifest.name, sub);
      }
    }

    // Step 2: Discover bundled subagents (always source='built-in')
    if (existsSync(this.bundledSubagentsDir)) {
      const subagents = await this.discoverFromDirectory(
        this.bundledSubagentsDir,
        'built-in',
        100
      );
      for (const sub of subagents) {
        seenNames.add(sub.manifest.name);

        // If installed, use manifest from managed but keep source='built-in'
        const managedSub = managedSubagents.get(sub.manifest.name);
        if (managedSub) {
          sub.subagentPath = managedSub.subagentPath;
        }

        allSubagents.push(sub.manifest);
        this.subagentCache.set(sub.manifest.name, sub);
      }
    }

    // Step 3: Add custom subagents from managed dir (user-created)
    for (const [name, sub] of managedSubagents) {
      if (!seenNames.has(name)) {
        sub.manifest.source = 'custom';
        seenNames.add(name);
        allSubagents.push(sub.manifest);
        this.subagentCache.set(name, sub);
      }
    }

    // Step 4: Workspace subagents (project-specific)
    if (workingDirectory) {
      const workspaceSubagentDir = join(
        workingDirectory,
        '.cowork',
        'subagents'
      );
      if (existsSync(workspaceSubagentDir)) {
        const subagents = await this.discoverFromDirectory(
          workspaceSubagentDir,
          'custom',
          1
        );
        for (const sub of subagents) {
          if (!seenNames.has(sub.manifest.name)) {
            seenNames.add(sub.manifest.name);
            allSubagents.push(sub.manifest);
            this.subagentCache.set(sub.manifest.name, sub);
          } else {
            // Override for workspace subagent (higher priority)
            const existing = this.subagentCache.get(sub.manifest.name);
            if (existing) {
              existing.subagentPath = sub.subagentPath;
              existing.manifest.systemPrompt = sub.manifest.systemPrompt;
            }
          }
        }
      }
    }

    // Step 5: Platform directories (.agent/ and .claude/)
    const platformAgentDirs: Array<{ dir: string; type: 'agent' | 'claude' }> = [];
    if (workingDirectory) {
      platformAgentDirs.push(
        { dir: join(workingDirectory, '.agent', 'agents'), type: 'agent' },
        { dir: join(workingDirectory, '.claude', 'agents'), type: 'claude' },
      );
    }
    platformAgentDirs.push(
      { dir: join(homedir(), '.agent', 'agents'), type: 'agent' },
      { dir: join(homedir(), '.claude', 'agents'), type: 'claude' },
    );

    for (const { dir, type } of platformAgentDirs) {
      if (existsSync(dir)) {
        let discovered: LoadedSubagent[];
        if (type === 'claude') {
          discovered = await this.discoverClaudeAgents(dir, 1);
        } else {
          discovered = await this.discoverFromDirectory(dir, 'platform', 1);
        }
        for (const sub of discovered) {
          if (!seenNames.has(sub.manifest.name)) {
            seenNames.add(sub.manifest.name);
            allSubagents.push(sub.manifest);
            this.subagentCache.set(sub.manifest.name, sub);
          }
        }
      }
    }

    return allSubagents;
  }

  /**
   * Discover agents from .claude/ format directories.
   * Supports standard subagent.json+prompt.md format AND simple .md files.
   */
  private async discoverClaudeAgents(
    dir: string,
    priority: number
  ): Promise<LoadedSubagent[]> {
    const subagents: LoadedSubagent[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          // Standard format: dir/agent-name/subagent.json + prompt.md
          const manifestPath = join(dir, entry.name, 'subagent.json');
          if (existsSync(manifestPath)) {
            try {
              const manifestContent = readFileSync(manifestPath, 'utf-8');
              const manifest: SubagentManifest = JSON.parse(manifestContent);
              manifest.source = 'platform';

              const promptPath = join(dir, entry.name, 'prompt.md');
              if (existsSync(promptPath) && !manifest.systemPrompt) {
                manifest.systemPrompt = readFileSync(promptPath, 'utf-8');
              }

              const source: SubagentSourceInfo = {
                type: 'platform',
                path: dir,
                priority,
              };
              subagents.push({
                manifest,
                source,
                subagentPath: join(dir, entry.name),
              });
            } catch {
              // Skip subagents that fail to parse
            }
          }
        } else if (entry.name.endsWith('.md')) {
          // Claude simple format: dir/my-agent.md
          // Optional YAML frontmatter with name, description, model, tools
          // Body = system prompt
          try {
            const content = readFileSync(join(dir, entry.name), 'utf-8');
            const name = entry.name.replace(/\.md$/, '');
            const displayName = name
              .split('-')
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');

            let description = `Platform agent: ${displayName}`;
            let systemPrompt = content;
            let model: string | undefined;
            let tools: string[] | undefined;

            // Try to extract YAML frontmatter
            const fmMatch = content.match(
              /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
            );
            if (fmMatch) {
              const yamlStr = fmMatch[1];
              systemPrompt = fmMatch[2].trim();

              // Simple YAML parsing for key: value pairs
              for (const line of yamlStr.split('\n')) {
                const match = line.match(/^(\w+):\s*(.+)$/);
                if (match) {
                  const [, key, value] = match;
                  const cleanVal = value
                    .replace(/^["']|["']$/g, '')
                    .trim();
                  if (key === 'description') description = cleanVal;
                  if (key === 'model') model = cleanVal;
                }
              }
            }

            const manifest: SubagentManifest = {
              name,
              displayName,
              description,
              version: '1.0.0',
              category: 'custom',
              systemPrompt,
              tools,
              model,
              priority: 0,
              source: 'platform',
            };

            const source: SubagentSourceInfo = {
              type: 'platform',
              path: dir,
              priority,
            };
            subagents.push({ manifest, source, subagentPath: dir });
          } catch {
            // Skip agents that fail to parse
          }
        }
      }
    } catch {
      // Directory scanning error - return empty array
    }

    return subagents;
  }

  /**
   * Discover subagents from a specific directory
   */
  private async discoverFromDirectory(
    dir: string,
    sourceType: SubagentSource,
    priority: number
  ): Promise<LoadedSubagent[]> {
    const subagents: LoadedSubagent[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }

        const subagentDir = join(dir, entry.name);
        const manifestPath = join(subagentDir, 'subagent.json');

        if (!existsSync(manifestPath)) {
          continue;
        }

        try {
          const manifestContent = readFileSync(manifestPath, 'utf-8');
          const manifest: SubagentManifest = JSON.parse(manifestContent);
          manifest.source = sourceType;

          // Load system prompt from prompt.md if it exists and systemPrompt is not set
          const promptPath = join(subagentDir, 'prompt.md');
          if (existsSync(promptPath) && !manifest.systemPrompt) {
            manifest.systemPrompt = readFileSync(promptPath, 'utf-8');
          }

          const source: SubagentSourceInfo = {
            type: sourceType,
            path: dir,
            priority,
          };

          subagents.push({
            manifest,
            source,
            subagentPath: subagentDir,
          });
        } catch {
          // Skip subagents that fail to parse
        }
      }
    } catch {
      // Directory scanning error - return empty array
    }

    return subagents;
  }

  /**
   * Get all subagents
   */
  getAllSubagents(): SubagentManifest[] {
    return [...this.subagentCache.values()].map((s) => s.manifest);
  }

  /**
   * Get a specific subagent
   */
  getSubagent(name: string): LoadedSubagent | undefined {
    return this.subagentCache.get(name);
  }

  /**
   * Install a bundled subagent to managed directory
   */
  async installSubagent(subagentName: string): Promise<void> {
    if (this.isInstalled(subagentName)) {
      throw new Error(`Subagent already installed: ${subagentName}`);
    }

    // Try bundled path first, then check platform cache
    let sourcePath = join(this.bundledSubagentsDir, subagentName);
    if (!existsSync(sourcePath)) {
      // Check platform subagents from cache
      const cached = this.subagentCache.get(subagentName);
      if (cached && cached.source.type === 'platform' && cached.subagentPath) {
        sourcePath = cached.subagentPath;
      } else {
        throw new Error(`Subagent not found: ${subagentName}`);
      }
    }

    await mkdir(this.managedSubagentsDir, { recursive: true });

    const targetDir = join(this.managedSubagentsDir, subagentName);
    await cp(sourcePath, targetDir, { recursive: true });

    this.subagentCache.clear();
  }

  /**
   * Uninstall a subagent from managed directory
   */
  async uninstallSubagent(subagentName: string): Promise<void> {
    // Platform subagents cannot be uninstalled - they are managed externally
    const cached = this.subagentCache.get(subagentName);
    if (cached && cached.source.type === 'platform') {
      throw new Error(
        'Cannot uninstall platform subagents. They are managed externally.'
      );
    }

    const targetDir = join(this.managedSubagentsDir, subagentName);
    if (!existsSync(targetDir)) {
      throw new Error(`Subagent is not installed: ${subagentName}`);
    }

    await rm(targetDir, { recursive: true, force: true });

    this.subagentCache.delete(subagentName);
  }

  /**
   * Check if a subagent is installed
   */
  isInstalled(subagentName: string, workingDirectory?: string): boolean {
    const managedDir = join(this.managedSubagentsDir, subagentName);
    if (existsSync(managedDir)) {
      return true;
    }

    if (workingDirectory) {
      const workspaceDir = join(
        workingDirectory,
        '.cowork',
        'subagents',
        subagentName
      );
      if (existsSync(workspaceDir)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get list of installed subagent names
   */
  async getInstalledSubagentNames(): Promise<string[]> {
    if (!existsSync(this.managedSubagentsDir)) {
      return [];
    }

    try {
      const entries = await readdir(this.managedSubagentsDir, {
        withFileTypes: true,
      });
      return entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Create a custom subagent
   */
  async createSubagent(params: CreateSubagentParams): Promise<string> {
    const nameRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!nameRegex.test(params.name)) {
      throw new Error(
        'Name must be kebab-case (lowercase letters, numbers, hyphens only)'
      );
    }

    const subagentDir = join(this.managedSubagentsDir, params.name);
    if (existsSync(subagentDir)) {
      throw new Error(`Subagent "${params.name}" already exists`);
    }

    await mkdir(this.managedSubagentsDir, { recursive: true });
    await mkdir(subagentDir, { recursive: true });

    const manifest: SubagentManifest = {
      name: params.name,
      displayName: params.displayName,
      description: params.description,
      version: '1.0.0',
      category: params.category || 'custom',
      tags: params.tags || [],
      systemPrompt: params.systemPrompt,
      tools: params.tools,
      model: params.model,
      skills: params.skills,
      priority: 0,
      source: 'custom',
    };

    await writeFile(
      join(subagentDir, 'subagent.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    // Also save system prompt as prompt.md for easier editing
    await writeFile(join(subagentDir, 'prompt.md'), params.systemPrompt, 'utf-8');

    this.subagentCache.clear();

    return params.name;
  }

  /**
   * Get subagent configs for DeepAgent system (replaces hardcoded getSubagentConfigs)
   */
  async getSubagentConfigs(
    sessionModel?: string,
    workingDirectory?: string,
  ): Promise<SubagentConfig[]> {
    await this.discoverAll(workingDirectory);

    // Only return INSTALLED subagents
    const installed = await this.getInstalledSubagentNames();
    const configs: SubagentConfig[] = [];

    for (const name of installed) {
      const subagent = this.subagentCache.get(name);
      if (subagent) {
        const normalizedSkills = Array.isArray(subagent.manifest.skills)
          ? subagent.manifest.skills
              .map((skill) => (typeof skill === 'string' ? skill.trim() : ''))
              .filter((skill) => skill.length > 0)
          : [];
        configs.push({
          name: subagent.manifest.name,
          description: subagent.manifest.description,
          systemPrompt: subagent.manifest.systemPrompt,
          model: subagent.manifest.model || sessionModel,
          ...(normalizedSkills.length > 0 ? { skills: normalizedSkills } : {}),
        });
      }
    }

    return configs;
  }

  /**
   * Build subagent section for system prompt
   */
  buildSubagentPromptSection(configs: SubagentConfig[]): string {
    if (configs.length === 0) {
      return '';
    }

    const lines: string[] = [
      '',
      '## Available Subagents',
      '',
      'You can delegate tasks to specialized subagents. Each operates in an isolated context.',
      '',
    ];

    for (const config of configs) {
      lines.push(`### ${config.name}`);
      lines.push(config.description);
      lines.push('');
    }

    lines.push('### When to Use Subagents');
    for (const config of configs) {
      lines.push(`- **${config.name}**: ${config.description.split('.')[0]}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Search subagents
   */
  search(options?: SubagentSearchOptions): SubagentManifest[] {
    let subagents = this.getAllSubagents();

    if (options?.category) {
      subagents = subagents.filter((s) => s.category === options.category);
    }

    if (options?.source) {
      subagents = subagents.filter((s) => s.source === options.source);
    }

    if (options?.query) {
      const query = options.query.toLowerCase();
      subagents = subagents.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.displayName.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          (s.tags || []).some((t) => t.toLowerCase().includes(query))
      );
    }

    if (options?.limit) {
      subagents = subagents.slice(0, options.limit);
    }

    return subagents;
  }

  /**
   * Get subagents by category
   */
  getByCategory(category: SubagentCategory): SubagentManifest[] {
    return this.getAllSubagents().filter((s) => s.category === category);
  }

  /**
   * Get managed subagents directory path
   */
  getManagedSubagentsDir(): string {
    return this.managedSubagentsDir;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.subagentCache.clear();
  }
}

/**
 * Create a SubagentService instance
 */
export function createSubagentService(appDataDir?: string): SubagentService {
  return new SubagentService(appDataDir);
}

// Singleton instance
export const subagentService = new SubagentService();
