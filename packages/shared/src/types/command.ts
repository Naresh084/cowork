import { z } from 'zod';

// ============================================================================
// Command Category Types
// ============================================================================

export const CommandCategorySchema = z.enum([
  'setup',
  'memory',
  'utility',
  'workflow',
  'custom',
]);

export type CommandCategory = z.infer<typeof CommandCategorySchema>;

// ============================================================================
// Command Metadata Types
// ============================================================================

export const CommandMetadataSchema = z.object({
  author: z.string().optional(),
  version: z.string().optional(),
  emoji: z.string().optional(),
});

export type CommandMetadata = z.infer<typeof CommandMetadataSchema>;

// ============================================================================
// Command Frontmatter Types
// ============================================================================

export const CommandFrontmatterSchema = z.object({
  /** Command name (1-64 chars, kebab-case recommended) */
  name: z.string().min(1).max(64),
  /** Display name for UI */
  displayName: z.string().min(1).max(128),
  /** Command description (1-256 chars) */
  description: z.string().min(1).max(256),
  /** Alternative names to invoke command */
  aliases: z.array(z.string()).optional(),
  /** Command category */
  category: CommandCategorySchema,
  /** Lucide icon name */
  icon: z.string().optional(),
  /** Sort order (higher = first) */
  priority: z.number().optional(),
  /** Frontend-only action (e.g., 'clear_chat') - if set, no prompt sent */
  action: z.enum(['clear_chat']).optional(),
  /** Extended metadata */
  metadata: CommandMetadataSchema.optional(),
});

export type CommandFrontmatter = z.infer<typeof CommandFrontmatterSchema>;

// ============================================================================
// Command Source Types
// ============================================================================

export const CommandSourceTypeSchema = z.enum([
  'bundled',   // Shipped with app
  'managed',   // Installed from marketplace / custom
]);

export type CommandSourceType = z.infer<typeof CommandSourceTypeSchema>;

export const CommandSourceSchema = z.object({
  /** Source type */
  type: CommandSourceTypeSchema,
  /** Path to source directory */
  path: z.string(),
  /** Priority (lower = higher priority) */
  priority: z.number(),
});

export type CommandSource = z.infer<typeof CommandSourceSchema>;

// ============================================================================
// Command Manifest Types
// ============================================================================

export const CommandManifestSchema = z.object({
  /** Unique identifier (${source.type}:${name}) */
  id: z.string(),
  /** Source information */
  source: CommandSourceSchema,
  /** Parsed frontmatter */
  frontmatter: CommandFrontmatterSchema,
  /** Full path to command directory */
  commandPath: z.string(),
  /** The prompt content (body of COMMAND.md) - null for action-only commands */
  prompt: z.string().nullable(),
});

export type CommandManifest = z.infer<typeof CommandManifestSchema>;

// ============================================================================
// Installed Command Types
// ============================================================================

export const InstalledCommandConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  installedAt: z.number(),
  source: CommandSourceTypeSchema,
});

export type InstalledCommandConfig = z.infer<typeof InstalledCommandConfigSchema>;

// ============================================================================
// Commands Settings Types
// ============================================================================

export const CommandsSettingsSchema = z.object({
  /** Directory for managed commands */
  managedDir: z.string(),
});

export type CommandsSettings = z.infer<typeof CommandsSettingsSchema>;
