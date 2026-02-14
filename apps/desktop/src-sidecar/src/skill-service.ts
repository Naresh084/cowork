/**
 * Skill Service
 *
 * Manages skill discovery, installation, and loading from multiple sources.
 * Sources are prioritized: workspace > managed > bundled
 */

import { readFile, readdir, mkdir, cp, rm, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import type {
  SkillManifest,
  SkillSource,
  SkillSourceType,
} from '@gemini-cowork/shared';
import { parseFrontmatter, parseSkillMarkdown } from './skill-parser.js';
import { checkSkillEligibility } from './eligibility-checker.js';

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
const PACK_SIGNATURE_FILE = 'SIGNATURE.json';
const SKILL_MARKDOWN_FILE = 'SKILL.md';
const PACK_SIGNATURE_VERSION = 1;
const ALLOW_UNSIGNED_MANAGED_PACKS = process.env.COWORK_ALLOW_UNSIGNED_MANAGED_PACKS === 'true';
const MAX_SKILL_MD_BYTES = 10 * 1024 * 1024;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getDiscoveryCacheTtlMs(): number {
  return parsePositiveInt(process.env.COWORK_SKILL_DISCOVERY_CACHE_TTL_MS, 15_000);
}

function getDiscoveryPerDirTimeoutMs(): number {
  return parsePositiveInt(process.env.COWORK_SKILL_DISCOVERY_PER_DIR_TIMEOUT_MS, 3_000);
}

interface PackSignature {
  version: number;
  algorithm: 'sha256';
  digest: string;
  subject: string;
  signer: string;
  signedAt: number;
}

/**
 * Skill Service for managing skills across multiple sources
 */
export class SkillService {
  private bundledSkillsDir: string;
  private managedSkillsDir: string;
  private customDirs: string[] = [];
  private skillCache: Map<string, SkillManifest> = new Map();
  private contentCache: Map<string, string> = new Map();
  private discoveryCache: { key: string; discoveredAt: number; skills: SkillManifest[] } | null = null;
  private appDataDir: string;

  constructor(appDataDir?: string) {
    this.appDataDir = appDataDir || join(homedir(), '.cowork');
    this.bundledSkillsDir = DEFAULT_BUNDLED_DIR;
    this.managedSkillsDir = join(this.appDataDir, 'skills');
  }

  /**
   * Set custom skill directories
   */
  setCustomDirs(dirs: string[]): void {
    this.customDirs = dirs;
    this.discoveryCache = null;
  }

  /**
   * Set bundled skills directory (for testing or custom bundles)
   */
  setBundledDir(dir: string): void {
    this.bundledSkillsDir = dir;
    this.discoveryCache = null;
  }

  private buildDiscoveryCacheKey(workingDirectory?: string): string {
    return JSON.stringify({
      workingDirectory: workingDirectory?.trim() || '',
      managedSkillsDir: this.managedSkillsDir,
      bundledSkillsDir: this.bundledSkillsDir,
      customDirs: [...this.customDirs].sort(),
    });
  }

  private async withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async isDirectoryAccessible(dir: string): Promise<boolean> {
    try {
      const info = await this.withTimeout(stat(dir), getDiscoveryPerDirTimeoutMs());
      return info.isDirectory();
    } catch {
      return false;
    }
  }

  private async discoverDirectorySafe(
    dir: string,
    sourceType: SkillSourceType,
    priority: number,
  ): Promise<SkillManifest[]> {
    if (!(await this.isDirectoryAccessible(dir))) {
      return [];
    }

    try {
      return await this.withTimeout(
        this.discoverFromDirectory(dir, sourceType, priority),
        getDiscoveryPerDirTimeoutMs(),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[skills] Skipping slow or invalid skill directory ${dir}: ${reason}`);
      return [];
    }
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
    const cacheKey = this.buildDiscoveryCacheKey(workingDirectory);
    const nowMs = Date.now();
    const ttlMs = getDiscoveryCacheTtlMs();
    if (this.discoveryCache
      && this.discoveryCache.key === cacheKey
      && nowMs - this.discoveryCache.discoveredAt < ttlMs
    ) {
      for (const skill of this.discoveryCache.skills) {
        this.skillCache.set(skill.id, skill);
      }
      return [...this.discoveryCache.skills];
    }

    const allSkills: SkillManifest[] = [];
    const seenNames = new Set<string>();
    const pushUniqueSkills = (skills: SkillManifest[]) => {
      for (const skill of skills) {
        if (!seenNames.has(skill.frontmatter.name)) {
          seenNames.add(skill.frontmatter.name);
          allSkills.push(skill);
        }
      }
    };

    // Priority 1: Workspace skills
    if (workingDirectory) {
      const workspaceSkillDirs = [
        join(workingDirectory, 'skills'),
        join(workingDirectory, '.skills'),
      ];

      for (const dir of workspaceSkillDirs) {
        const skills = await this.discoverDirectorySafe(dir, 'workspace', 1);
        pushUniqueSkills(skills);
      }
    }

    // Priority 1.5: Platform directories (.agent/ and .claude/)
    const platformSkillDirs: string[] = [];
    if (workingDirectory) {
      platformSkillDirs.push(
        join(workingDirectory, '.agent', 'skills'),
        join(workingDirectory, '.claude', 'skills'),
      );
    }
    platformSkillDirs.push(
      join(homedir(), '.agent', 'skills'),
      join(homedir(), '.claude', 'skills'),
    );

    for (const dir of platformSkillDirs) {
      const skills = await this.discoverDirectorySafe(dir, 'platform', 1);
      pushUniqueSkills(skills);
    }

    // Priority 2: Managed skills (installed from marketplace)
    pushUniqueSkills(await this.discoverDirectorySafe(this.managedSkillsDir, 'managed', 2));

    // Priority 3: Custom directories
    for (let i = 0; i < this.customDirs.length; i++) {
      const dir = this.customDirs[i];
      const skills = await this.discoverDirectorySafe(dir, 'custom', 3 + i);
      pushUniqueSkills(skills);
    }

    // Priority 4: Bundled skills (lowest priority)
    pushUniqueSkills(await this.discoverDirectorySafe(this.bundledSkillsDir, 'bundled', 100));

    // Update cache
    for (const skill of allSkills) {
      this.skillCache.set(skill.id, skill);
    }
    this.discoveryCache = {
      key: cacheKey,
      discoveredAt: Date.now(),
      skills: [...allSkills],
    };

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
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.isSymbolicLink()) {
          continue;
        }

        const skillDir = join(dir, entry.name);
        const skillMdPath = join(skillDir, 'SKILL.md');

        if (!existsSync(skillMdPath)) {
          continue;
        }

        try {
          const stats = await stat(skillMdPath);
          if (!stats.isFile() || stats.size > MAX_SKILL_MD_BYTES) {
            continue;
          }
          const content = await readFile(skillMdPath, 'utf-8');
          const frontmatter = parseFrontmatter(content);

          if (!frontmatter) {
            continue;
          }

          if (this.shouldEnforcePackSignature(sourceType)) {
            const subject =
              typeof frontmatter.name === 'string' && frontmatter.name.trim()
                ? frontmatter.name
                : entry.name;
            const isSignatureValid = await this.validatePackSignature(skillDir, subject);
            if (!isSignatureValid) {
              continue;
            }
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
        } catch {
          // Skip skills that fail to parse
        }
      }
    } catch {
      // Directory scanning error - return empty array
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

    // Only install bundled skills (platform skills use enable/disable)
    if (skill.source.type !== 'bundled') {
      throw new Error(`Can only install bundled skills. Skill ${skillId} is ${skill.source.type}`);
    }

    // Check if already installed
    const targetDir = join(this.managedSkillsDir, skill.frontmatter.name);
    if (existsSync(targetDir)) {
      const existingStatus = await this.reconcileExistingManagedInstall(
        targetDir,
        skill.frontmatter.name,
      );
      if (existingStatus === 'valid' || existingStatus === 'repaired') {
        // Idempotent install: skill is already installed, or was healed from a legacy
        // unsigned state created by older app versions.
        this.clearCache();
        return;
      }

      throw new Error(
        `Existing managed skill "${skill.frontmatter.name}" is invalid or tampered. ` +
        'Remove it from ~/.cowork/skills and retry installation.',
      );
    }

    // Ensure managed directory exists
    await mkdir(this.managedSkillsDir, { recursive: true });

    // Copy skill directory
    await cp(skill.skillPath, targetDir, { recursive: true });
    await this.writePackSignature(targetDir, skill.frontmatter.name);

    // Check for setup.sh and run it if exists (with user notification)
    // Note: We don't auto-execute setup scripts for security reasons
    // The frontend should notify the user about this

    // Clear cache to force re-discovery
    this.clearCache();
  }

  /**
   * Ensure a bundled default skill is present in managed storage.
   * This is used for platform bootstrap skills (for example: skill-creator).
   */
  async ensureDefaultManagedSkillInstalled(skillName: string): Promise<{
    skillId: string;
    installed: boolean;
  }> {
    const normalized = skillName.trim();
    if (!normalized) {
      throw new Error('skillName is required');
    }

    const managedSkillId = `managed:${normalized}`;
    const targetDir = join(this.managedSkillsDir, normalized);

    if (existsSync(targetDir)) {
      const existingStatus = await this.reconcileExistingManagedInstall(targetDir, normalized);
      if (existingStatus === 'valid' || existingStatus === 'repaired') {
        this.clearCache();
        return {
          skillId: managedSkillId,
          installed: false,
        };
      }

      throw new Error(
        `Existing managed skill "${normalized}" is invalid or tampered. ` +
        'Remove it from ~/.cowork/skills and retry bootstrap installation.',
      );
    }

    const discovered = await this.discoverAll();
    const bundled = discovered.find(
      (candidate) => (
        candidate.source.type === 'bundled'
        && candidate.frontmatter.name === normalized
      ),
    );

    if (!bundled) {
      throw new Error(`Bundled default skill "${normalized}" not found`);
    }

    await this.installSkill(bundled.id);
    return {
      skillId: managedSkillId,
      installed: true,
    };
  }

  /**
   * Uninstall a skill from managed directory
   */
  async uninstallSkill(skillId: string): Promise<void> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Only uninstall managed skills (platform skills are managed externally)
    if (skill.source.type !== 'managed') {
      throw new Error(`Can only uninstall managed skills. Skill ${skillId} is ${skill.source.type}`);
    }

    // Remove skill directory
    await rm(skill.skillPath, { recursive: true, force: true });

    // Clear cache
    this.skillCache.delete(skillId);
    this.contentCache.delete(skillId);
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
    await this.writePackSignature(skillDir, params.name);

    // Clear cache and re-discover
    this.skillCache.clear();
    this.contentCache.clear();

    const skillId = `managed:${params.name}`;

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
    metadataLines.push(`  lifecycle: draft`);
    metadataLines.push(`  trustLevel: unverified`);
    metadataLines.push(`  verificationNotes: "User-created draft skill. Validate before team-wide use."`);

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
    const parts: string[] = [];

    for (const skillId of enabledSkillIds) {
      try {
        const skill = await this.getSkill(skillId);
        if (!skill) {
          continue;
        }

        // Check eligibility
        const eligibility = await checkSkillEligibility(skill);
        if (!eligibility.eligible) {
          continue;
        }

        const content = await this.loadSkillContent(skillId);
        const parsed = parseSkillMarkdown(content);

        if (parsed) {
          // Include the full skill content for the agent
          parts.push(`## ${skill.frontmatter.metadata?.emoji || '📦'} ${skill.frontmatter.name}\n\n${parsed.body}`);
        }
      } catch {
        // Skip skills that fail to load
      }
    }

    if (parts.length === 0) {
      return '';
    }

    const prompt = this.buildSkillsPrompt(parts);
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
    this.discoveryCache = null;
  }

  private shouldEnforcePackSignature(sourceType: SkillSourceType): boolean {
    if (ALLOW_UNSIGNED_MANAGED_PACKS) {
      return false;
    }
    return sourceType === 'managed';
  }

  private async reconcileExistingManagedInstall(
    skillDir: string,
    expectedName: string,
  ): Promise<'valid' | 'repaired' | 'invalid'> {
    const skillMdPath = join(skillDir, SKILL_MARKDOWN_FILE);
    if (!existsSync(skillMdPath)) {
      return 'invalid';
    }

    try {
      const content = await readFile(skillMdPath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      if (!frontmatter || frontmatter.name !== expectedName) {
        return 'invalid';
      }
    } catch {
      return 'invalid';
    }

    const signaturePath = join(skillDir, PACK_SIGNATURE_FILE);
    if (existsSync(signaturePath)) {
      const valid = await this.validatePackSignature(skillDir, expectedName);
      return valid ? 'valid' : 'invalid';
    }

    // Legacy install path: older versions created managed skills without signature.
    await this.writePackSignature(skillDir, expectedName);
    return 'repaired';
  }

  private async computePackDigest(skillDir: string): Promise<string> {
    const content = await readFile(join(skillDir, SKILL_MARKDOWN_FILE), 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  }

  private async writePackSignature(skillDir: string, subject: string): Promise<void> {
    const digest = await this.computePackDigest(skillDir);
    const signature: PackSignature = {
      version: PACK_SIGNATURE_VERSION,
      algorithm: 'sha256',
      digest,
      subject,
      signer: 'local-managed-installer',
      signedAt: Date.now(),
    };
    await writeFile(join(skillDir, PACK_SIGNATURE_FILE), JSON.stringify(signature, null, 2), 'utf-8');
  }

  private async validatePackSignature(skillDir: string, expectedSubject: string): Promise<boolean> {
    const signaturePath = join(skillDir, PACK_SIGNATURE_FILE);
    if (!existsSync(signaturePath)) {
      return false;
    }

    try {
      const raw = await readFile(signaturePath, 'utf-8');
      const signature = JSON.parse(raw) as Partial<PackSignature>;
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

      const computedDigest = await this.computePackDigest(skillDir);
      return computedDigest === signature.digest;
    } catch {
      return false;
    }
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
    const files = new Map<string, string>();

    for (const skillId of enabledSkillIds) {
      try {
        const skill = await this.getSkill(skillId);
        if (!skill) {
          continue;
        }

        // Check eligibility before including
        const eligibility = await checkSkillEligibility(skill);
        if (!eligibility.eligible) {
          continue;
        }

        const content = await this.loadSkillContent(skillId);
        const virtualPath = `/skills/${skill.frontmatter.name}/SKILL.md`;
        files.set(virtualPath, content);
      } catch {
        // Skip skills that fail to sync
      }
    }

    return files;
  }
}

// Singleton instance
export const skillService = new SkillService();
