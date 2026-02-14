// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';

// ============================================================================
// Skill Category Types
// ============================================================================

export const SkillCategorySchema = z.enum([
  'development',
  'devops',
  'productivity',
  'research',
  'creative',
  'automation',
  'custom',
]);

export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const SkillLifecycleSchema = z.enum([
  'draft',
  'verified',
  'published',
  'deprecated',
]);

export type SkillLifecycle = z.infer<typeof SkillLifecycleSchema>;

export const SkillTrustLevelSchema = z.enum([
  'unverified',
  'community',
  'verified',
  'official',
]);

export type SkillTrustLevel = z.infer<typeof SkillTrustLevelSchema>;

// ============================================================================
// Skill Requirements Types
// ============================================================================

export const SkillRequirementsSchema = z.object({
  /** All binaries must exist in PATH */
  bins: z.array(z.string()).optional(),
  /** At least one binary must exist in PATH */
  anyBins: z.array(z.string()).optional(),
  /** Required environment variables */
  env: z.array(z.string()).optional(),
  /** Allowed operating systems */
  os: z.array(z.enum(['darwin', 'linux', 'windows'])).optional(),
});

export type SkillRequirements = z.infer<typeof SkillRequirementsSchema>;

// ============================================================================
// Install Option Types
// ============================================================================

export const InstallOptionKindSchema = z.enum([
  'brew',
  'apt',
  'npm',
  'go',
  'uv',
  'download',
  'manual',
]);

export type InstallOptionKind = z.infer<typeof InstallOptionKindSchema>;

export const InstallOptionSchema = z.object({
  kind: InstallOptionKindSchema,
  /** Homebrew formula name */
  formula: z.string().optional(),
  /** Homebrew tap (e.g., "homebrew/cask") */
  tap: z.string().optional(),
  /** Package name for npm/apt */
  package: z.string().optional(),
  /** Go module path */
  module: z.string().optional(),
  /** Download URL */
  url: z.string().optional(),
  /** Human-readable instructions */
  instructions: z.string().optional(),
  /** Label for display */
  label: z.string().optional(),
  /** Binaries this option installs */
  bins: z.array(z.string()).optional(),
});

export type InstallOption = z.infer<typeof InstallOptionSchema>;

// ============================================================================
// Skill Metadata Types
// ============================================================================

export const SkillMetadataSchema = z.object({
  author: z.string().optional(),
  version: z.string().optional(),
  emoji: z.string().optional(),
  homepage: z.string().optional(),
  category: SkillCategorySchema.optional(),
  lifecycle: SkillLifecycleSchema.optional(),
  trustLevel: SkillTrustLevelSchema.optional(),
  verificationNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  requires: SkillRequirementsSchema.optional(),
  install: z.array(InstallOptionSchema).optional(),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

// ============================================================================
// Skill Frontmatter Types (Agent Skills Standard)
// ============================================================================

export const SkillFrontmatterSchema = z.object({
  /** Skill name (1-64 chars, kebab-case recommended) */
  name: z.string().min(1).max(64),
  /** Skill description (1-1024 chars) */
  description: z.string().min(1).max(1024),
  /** License identifier */
  license: z.string().optional(),
  /** Compatibility information */
  compatibility: z.string().optional(),
  /** Extended metadata */
  metadata: SkillMetadataSchema.optional(),
  /** Allowed tools (space-delimited) */
  'allowed-tools': z.string().optional(),
  /** Homepage URL */
  homepage: z.string().optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

// ============================================================================
// Skill Source Types
// ============================================================================

export const SkillSourceTypeSchema = z.enum([
  'bundled',   // Shipped with app
  'managed',   // Installed from marketplace
  'workspace', // Project-local skills
  'custom',    // User-added directories
  'platform',  // Discovered from .agent/ or .claude/ directories
]);

export type SkillSourceType = z.infer<typeof SkillSourceTypeSchema>;

export const SkillSourceSchema = z.object({
  /** Source type */
  type: SkillSourceTypeSchema,
  /** Path to source directory */
  path: z.string(),
  /** Priority (lower = higher priority) */
  priority: z.number(),
});

export type SkillSource = z.infer<typeof SkillSourceSchema>;

// ============================================================================
// Skill Manifest Types
// ============================================================================

export const SkillManifestSchema = z.object({
  /** Unique identifier (${source.type}:${name}) */
  id: z.string(),
  /** Source information */
  source: SkillSourceSchema,
  /** Parsed frontmatter */
  frontmatter: SkillFrontmatterSchema,
  /** Full path to skill directory */
  skillPath: z.string(),
  /** Has scripts/ subdirectory */
  hasScripts: z.boolean(),
  /** Has references/ subdirectory */
  hasReferences: z.boolean(),
  /** Has assets/ subdirectory */
  hasAssets: z.boolean(),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

// ============================================================================
// Skill Eligibility Types
// ============================================================================

export const SkillEligibilitySchema = z.object({
  /** Overall eligibility status */
  eligible: z.boolean(),
  /** Missing required binaries */
  missingBins: z.array(z.string()),
  /** Missing required environment variables */
  missingEnvVars: z.array(z.string()),
  /** Platform mismatch (skill doesn't support current OS) */
  platformMismatch: z.boolean(),
  /** Human-readable install hints */
  installHints: z.array(z.string()),
  /** Found binaries with their paths */
  foundBins: z.record(z.string(), z.string()).optional(),
});

export type SkillEligibility = z.infer<typeof SkillEligibilitySchema>;

// ============================================================================
// Installed Skill Types
// ============================================================================

export const InstalledSkillSchema = SkillManifestSchema.extend({
  /** Whether skill is enabled for agent use */
  enabled: z.boolean(),
  /** Timestamp when installed */
  installedAt: z.number(),
  /** Current eligibility status */
  eligibility: SkillEligibilitySchema,
});

export type InstalledSkill = z.infer<typeof InstalledSkillSchema>;

// ============================================================================
// Skill Configuration Types (for persistence)
// ============================================================================

export const InstalledSkillConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  installedAt: z.number(),
  source: SkillSourceTypeSchema,
});

export type InstalledSkillConfig = z.infer<typeof InstalledSkillConfigSchema>;

export const SkillsSettingsSchema = z.object({
  /** Directory for managed skills */
  managedDir: z.string(),
  /** Additional custom skill directories */
  customDirs: z.array(z.string()),
  /** Show skills with unmet requirements in marketplace */
  showUnavailable: z.boolean(),
  /** Auto-check eligibility on startup */
  autoCheckEligibility: z.boolean(),
});

export type SkillsSettings = z.infer<typeof SkillsSettingsSchema>;

// ============================================================================
// OpenClaw Format Types (for conversion)
// ============================================================================

export interface OpenClawMetadata {
  openclaw?: {
    emoji?: string;
    requires?: SkillRequirements;
    install?: Array<InstallOption & { id?: string }>;
  };
}

export interface OpenClawFrontmatter {
  name: string;
  description: string;
  homepage?: string;
  license?: string;
  metadata?: OpenClawMetadata;
}
