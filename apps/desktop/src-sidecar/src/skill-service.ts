/**
 * Skill Service
 *
 * Manages skill discovery, installation, and loading from multiple sources.
 * Sources are prioritized: workspace > managed > bundled
 */

import { readFile, readdir, mkdir, cp, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type {
  SkillManifest,
  SkillSource,
  SkillSourceType,
} from '@gemini-cowork/shared';
import { parseFrontmatter, parseSkillMarkdown } from './skill-parser.js';
import { checkSkillEligibility } from './eligibility-checker.js';

// Debug flag for verbose skill logging
const DEBUG_SKILLS = process.env.DEBUG_SKILLS === 'true';

/**
 * Parameters for creating a custom skill
 */
export interface CreateSkillParams {
  name: string;
  description: string;
  emoji?: string;
  category?: string;
  content: string;
  requirements?: {
    bins?: string[];
    env?: string[];
    os?: string[];
  };
}

// Get the directory of this file for bundled skills path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default paths
const DEFAULT_BUNDLED_DIR = join(__dirname, '..', '..', '..', '..', 'skills'); // Project root skills/

/**
 * Skill Service for managing skills across multiple sources
 */
export class SkillService {
  private bundledSkillsDir: string;
  private managedSkillsDir: string;
  private customDirs: string[] = [];
  private skillCache: Map<string, SkillManifest> = new Map();
  private contentCache: Map<string, string> = new Map();
  private appDataDir: string;

  constructor(appDataDir?: string) {
    this.appDataDir = appDataDir || join(homedir(), '.geminicowork');
    this.bundledSkillsDir = DEFAULT_BUNDLED_DIR;
    this.managedSkillsDir = join(this.appDataDir, 'skills');
  }

  /**
   * Set custom skill directories
   */
  setCustomDirs(dirs: string[]): void {
    this.customDirs = dirs;
  }

  /**
   * Set bundled skills directory (for testing or custom bundles)
   */
  setBundledDir(dir: string): void {
    this.bundledSkillsDir = dir;
  }

  /**
   * Discover all skills from all sources
   * Sources are checked in priority order:
   * 1. Workspace skills (highest priority - allows overrides)
   * 2. Managed skills (installed from marketplace)
   * 3. Custom directories
   * 4. Bundled skills (lowest priority)
   */
  async discoverAll(workingDirectory?: string): Promise<SkillManifest[]> {
    const allSkills: SkillManifest[] = [];
    const seenNames = new Set<string>();

    // Priority 1: Workspace skills
    if (workingDirectory) {
      const workspaceSkillDirs = [
        join(workingDirectory, 'skills'),
        join(workingDirectory, '.skills'),
      ];

      for (const dir of workspaceSkillDirs) {
        if (existsSync(dir)) {
          const skills = await this.discoverFromDirectory(dir, 'workspace', 1);
          for (const skill of skills) {
            if (!seenNames.has(skill.frontmatter.name)) {
              seenNames.add(skill.frontmatter.name);
              allSkills.push(skill);
            }
          }
        }
      }
    }

    // Priority 2: Managed skills (installed from marketplace)
    if (existsSync(this.managedSkillsDir)) {
      const skills = await this.discoverFromDirectory(this.managedSkillsDir, 'managed', 2);
      for (const skill of skills) {
        if (!seenNames.has(skill.frontmatter.name)) {
          seenNames.add(skill.frontmatter.name);
          allSkills.push(skill);
        }
      }
    }

    // Priority 3: Custom directories
    for (let i = 0; i < this.customDirs.length; i++) {
      const dir = this.customDirs[i];
      if (existsSync(dir)) {
        const skills = await this.discoverFromDirectory(dir, 'custom', 3 + i);
        for (const skill of skills) {
          if (!seenNames.has(skill.frontmatter.name)) {
            seenNames.add(skill.frontmatter.name);
            allSkills.push(skill);
          }
        }
      }
    }

    // Priority 4: Bundled skills (lowest priority)
    if (existsSync(this.bundledSkillsDir)) {
      const skills = await this.discoverFromDirectory(this.bundledSkillsDir, 'bundled', 100);
      for (const skill of skills) {
        if (!seenNames.has(skill.frontmatter.name)) {
          seenNames.add(skill.frontmatter.name);
          allSkills.push(skill);
        }
      }
    }

    // Update cache
    for (const skill of allSkills) {
      this.skillCache.set(skill.id, skill);
    }

    return allSkills;
  }

  /**
   * Discover skills from a specific directory
   */
  async discoverFromDirectory(
    dir: string,
    sourceType: SkillSourceType,
    priority: number
  ): Promise<SkillManifest[]> {
    const skills: SkillManifest[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }

        const skillDir = join(dir, entry.name);
        const skillMdPath = join(skillDir, 'SKILL.md');

        if (!existsSync(skillMdPath)) {
          continue;
        }

        try {
          const content = await readFile(skillMdPath, 'utf-8');
          const frontmatter = parseFrontmatter(content);

          if (!frontmatter) {
            console.warn(`[SkillService] Failed to parse ${skillMdPath}`);
            continue;
          }

          const source: SkillSource = {
            type: sourceType,
            path: dir,
            priority,
          };

          const manifest: SkillManifest = {
            id: `${sourceType}:${frontmatter.name}`,
            source,
            frontmatter,
            skillPath: skillDir,
            hasScripts: existsSync(join(skillDir, 'scripts')),
            hasReferences: existsSync(join(skillDir, 'references')),
            hasAssets: existsSync(join(skillDir, 'assets')),
          };

          skills.push(manifest);
        } catch (error) {
          console.error(`[SkillService] Error processing skill at ${skillDir}:`, error);
        }
      }
    } catch (error) {
      console.error(`[SkillService] Error scanning directory ${dir}:`, error);
    }

    return skills;
  }

  /**
   * Get a skill by ID from cache or discover
   */
  async getSkill(skillId: string): Promise<SkillManifest | null> {
    // Check cache first
    if (this.skillCache.has(skillId)) {
      return this.skillCache.get(skillId)!;
    }

    // Try to discover
    await this.discoverAll();
    return this.skillCache.get(skillId) || null;
  }

  /**
   * Install a skill from bundled to managed directory
   */
  async installSkill(skillId: string): Promise<void> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Only install bundled skills
    if (skill.source.type !== 'bundled') {
      throw new Error(`Can only install bundled skills. Skill ${skillId} is ${skill.source.type}`);
    }

    // Check if already installed
    const targetDir = join(this.managedSkillsDir, skill.frontmatter.name);
    if (existsSync(targetDir)) {
      throw new Error(`Skill already installed: ${skill.frontmatter.name}`);
    }

    // Ensure managed directory exists
    await mkdir(this.managedSkillsDir, { recursive: true });

    // Copy skill directory
    await cp(skill.skillPath, targetDir, { recursive: true });

    // Check for setup.sh and run it if exists (with user notification)
    const setupScript = join(targetDir, 'setup.sh');
    if (existsSync(setupScript)) {
      console.error(`[SkillService] Setup script found for ${skill.frontmatter.name}. Manual execution may be required.`);
      // Note: We don't auto-execute setup scripts for security reasons
      // The frontend should notify the user about this
    }

    // Clear cache to force re-discovery
    this.skillCache.clear();
    this.contentCache.clear();

    console.error(`[SkillService] Installed skill: ${skill.frontmatter.name}`);
  }

  /**
   * Uninstall a skill from managed directory
   */
  async uninstallSkill(skillId: string): Promise<void> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Only uninstall managed skills
    if (skill.source.type !== 'managed') {
      throw new Error(`Can only uninstall managed skills. Skill ${skillId} is ${skill.source.type}`);
    }

    // Remove skill directory
    await rm(skill.skillPath, { recursive: true, force: true });

    // Clear cache
    this.skillCache.delete(skillId);
    this.contentCache.delete(skillId);

    console.error(`[SkillService] Uninstalled skill: ${skill.frontmatter.name}`);
  }

  /**
   * Create a custom skill in the managed directory
   */
  async createSkill(params: CreateSkillParams): Promise<string> {
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
    if (!params.description?.trim()) {
      throw new Error('Description is required');
    }
    if (!params.content?.trim()) {
      throw new Error('Skill content is required');
    }

    // Create skill directory in managed location
    const skillDir = join(this.managedSkillsDir, params.name);
    if (existsSync(skillDir)) {
      throw new Error(`Skill "${params.name}" already exists`);
    }

    // Ensure managed directory exists
    await mkdir(this.managedSkillsDir, { recursive: true });
    await mkdir(skillDir, { recursive: true });

    // Build SKILL.md content
    const skillMd = this.buildSkillMarkdown(params);

    // Write SKILL.md
    const skillMdPath = join(skillDir, 'SKILL.md');
    await writeFile(skillMdPath, skillMd, 'utf-8');

    // Clear cache and re-discover
    this.skillCache.clear();
    this.contentCache.clear();

    const skillId = `managed:${params.name}`;
    console.error(`[SkillService] Created custom skill: ${skillId} at ${skillDir}`);

    return skillId;
  }

  /**
   * Build SKILL.md content from parameters
   */
  private buildSkillMarkdown(params: CreateSkillParams): string {
    // Escape description for YAML
    const escapedDescription = params.description.replace(/"/g, '\\"');

    // Build metadata section
    const metadataLines: string[] = [];
    metadataLines.push(`  author: user`);
    metadataLines.push(`  version: "1.0.0"`);
    metadataLines.push(`  emoji: ${params.emoji || '📦'}`);
    metadataLines.push(`  category: ${params.category || 'custom'}`);

    // Add requirements if provided
    if (params.requirements) {
      metadataLines.push(`  requires:`);
      if (params.requirements.bins?.length) {
        metadataLines.push(`    bins:`);
        for (const bin of params.requirements.bins) {
          metadataLines.push(`      - ${bin}`);
        }
      }
      if (params.requirements.env?.length) {
        metadataLines.push(`    env:`);
        for (const env of params.requirements.env) {
          metadataLines.push(`      - ${env}`);
        }
      }
      if (params.requirements.os?.length) {
        metadataLines.push(`    os:`);
        for (const os of params.requirements.os) {
          metadataLines.push(`      - ${os}`);
        }
      }
    }

    return `---
name: ${params.name}
description: "${escapedDescription}"
license: MIT
metadata:
${metadataLines.join('\n')}
---

${params.content}`;
  }

  /**
   * Load skill content (full SKILL.md text)
   */
  async loadSkillContent(skillId: string): Promise<string> {
    // Check cache
    if (this.contentCache.has(skillId)) {
      return this.contentCache.get(skillId)!;
    }

    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const skillMdPath = join(skill.skillPath, 'SKILL.md');
    const content = await readFile(skillMdPath, 'utf-8');

    // Cache content
    this.contentCache.set(skillId, content);

    return content;
  }

  /**
   * Get combined skills prompt for agent
   */
  async getSkillsForAgent(enabledSkillIds: string[]): Promise<string> {
    console.error(`[SkillService] Loading ${enabledSkillIds.length} skills:`, enabledSkillIds);

    const parts: string[] = [];

    for (const skillId of enabledSkillIds) {
      try {
        const skill = await this.getSkill(skillId);
        if (!skill) {
          console.error(`[SkillService] ❌ Skill not found: ${skillId}`);
          console.error(`[SkillService] Available skills:`, [...this.skillCache.keys()]);
          continue;
        }

        // Check eligibility
        const eligibility = await checkSkillEligibility(skill);
        if (!eligibility.eligible) {
          console.warn(`[SkillService] Skill ${skillId} not eligible:`, eligibility.missingBins, eligibility.missingEnvVars);
          continue;
        }

        const content = await this.loadSkillContent(skillId);
        const parsed = parseSkillMarkdown(content);

        if (parsed) {
          // Include the full skill content for the agent
          parts.push(`## ${skill.frontmatter.metadata?.emoji || '📦'} ${skill.frontmatter.name}\n\n${parsed.body}`);
        }
      } catch (error) {
        console.error(`[SkillService] Error loading skill ${skillId}:`, error);
      }
    }

    if (parts.length === 0) {
      console.error('[SkillService] No skills loaded');
      return '';
    }

    const prompt = this.buildSkillsPrompt(parts);
    console.error(`[SkillService] Built prompt for ${parts.length} skills`);
    if (DEBUG_SKILLS) {
      console.error('[SkillService] Skills prompt preview:', prompt.substring(0, 500));
    }
    return prompt;
  }

  /**
   * Build skills prompt section for system message
   */
  private buildSkillsPrompt(skillContents: string[]): string {
    return `
<skills>
The following skills provide specialized capabilities you can use:

${skillContents.join('\n\n---\n\n')}
</skills>`;
  }

  /**
   * Get list of managed (installed) skill IDs
   */
  async getInstalledSkillIds(): Promise<string[]> {
    if (!existsSync(this.managedSkillsDir)) {
      return [];
    }

    const skills = await this.discoverFromDirectory(this.managedSkillsDir, 'managed', 2);
    return skills.map((s) => s.id);
  }

  /**
   * Check if a skill is installed (in managed dir)
   */
  async isInstalled(skillName: string): Promise<boolean> {
    const targetDir = join(this.managedSkillsDir, skillName);
    return existsSync(targetDir);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.skillCache.clear();
    this.contentCache.clear();
  }

  /**
   * Get the managed skills directory path
   */
  getManagedSkillsDir(): string {
    return this.managedSkillsDir;
  }

  /**
   * Get the app data directory path
   */
  getAppDataDir(): string {
    return this.appDataDir;
  }

  /**
   * Sync skills for agent - returns map of virtual paths to content.
   * Used to prepare skills for DeepAgents native loading.
   */
  async syncSkillsForAgent(enabledSkillIds: string[]): Promise<Map<string, string>> {
    console.error(`[SkillService] Syncing ${enabledSkillIds.length} skills for agent`);

    const files = new Map<string, string>();

    for (const skillId of enabledSkillIds) {
      try {
        const skill = await this.getSkill(skillId);
        if (!skill) {
          console.warn(`[SkillService] Skill not found for sync: ${skillId}`);
          continue;
        }

        // Check eligibility before including
        const eligibility = await checkSkillEligibility(skill);
        if (!eligibility.eligible) {
          console.warn(`[SkillService] Skill ${skillId} not eligible, skipping:`, {
            missingBins: eligibility.missingBins,
            missingEnvVars: eligibility.missingEnvVars,
          });
          continue;
        }

        const content = await this.loadSkillContent(skillId);
        const virtualPath = `/skills/${skill.frontmatter.name}/SKILL.md`;
        files.set(virtualPath, content);

        console.error(`[SkillService] ✓ Synced skill: ${skill.frontmatter.name} → ${virtualPath}`);
      } catch (error) {
        console.error(`[SkillService] Error syncing skill ${skillId}:`, error);
      }
    }

    console.error(`[SkillService] Synced ${files.size} skills total`);
    return files;
  }
}

// Singleton instance
export const skillService = new SkillService();
