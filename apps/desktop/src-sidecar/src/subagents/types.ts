/**
 * Subagent System Types
 *
 * Defines types for the subagent marketplace system.
 * Mirrors command types pattern for consistency.
 */

/**
 * Subagent categories for organization
 */
export type SubagentCategory =
  | 'research' // Web search, documentation, fact-finding
  | 'development' // Code writing, testing, API integration
  | 'analysis' // Security, performance, code review
  | 'productivity' // Planning, documentation, task management
  | 'custom'; // User-created subagents

/**
 * Subagent sources
 */
export type SubagentSource =
  | 'built-in' // Bundled with app
  | 'custom' // User-created
  | 'platform'; // Discovered from .agent/ or .claude/ directories

/**
 * Subagent manifest stored in subagent.json
 */
export interface SubagentManifest {
  /** Unique identifier (kebab-case, e.g., "web-researcher") */
  name: string;

  /** Human-readable name */
  displayName: string;

  /** Description for delegation selection */
  description: string;

  /** Semver version */
  version: string;

  /** Author name or email */
  author?: string;

  /** Category for organization */
  category: SubagentCategory;

  /** Lucide icon name for UI */
  icon?: string;

  /** Search tags */
  tags?: string[];

  /** Full system prompt text */
  systemPrompt: string;

  /** Allowed tools (empty array = all tools) */
  tools?: string[];

  /** Optional model override (e.g., "gemini-1.5-pro") */
  model?: string;

  /** Optional skill names or /skills/* paths available to this subagent */
  skills?: string[];

  /** Sort order (higher = first) */
  priority?: number;

  /** Source of the subagent */
  source?: SubagentSource;

  /** Repository URL */
  repository?: string;

  /** Homepage URL */
  homepage?: string;
}

/**
 * Subagent configuration for DeepAgent system
 * Used by middleware to build system prompt
 */
export interface SubagentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  skills?: string[];
}

/**
 * Loaded subagent with metadata
 */
export interface LoadedSubagent {
  /** Subagent manifest */
  manifest: SubagentManifest;

  /** Source information */
  source: SubagentSourceInfo;

  /** Path to subagent directory */
  subagentPath: string;
}

/**
 * Subagent source with priority
 */
export interface SubagentSourceInfo {
  type: SubagentSource;
  path: string;
  priority: number;
}

/**
 * Subagent search options
 */
export interface SubagentSearchOptions {
  query?: string;
  category?: SubagentCategory;
  source?: SubagentSource;
  limit?: number;
}

/**
 * Parameters for creating a custom subagent
 */
export interface CreateSubagentParams {
  name: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  category?: SubagentCategory;
  tags?: string[];
  tools?: string[];
  model?: string;
  skills?: string[];
}

/**
 * Subagent categories with display info
 */
export const SUBAGENT_CATEGORIES: Record<
  SubagentCategory,
  { name: string; icon: string; description: string }
> = {
  research: {
    name: 'Research',
    icon: 'search',
    description: 'Web search, documentation, fact-finding',
  },
  development: {
    name: 'Development',
    icon: 'code',
    description: 'Code writing, testing, API integration',
  },
  analysis: {
    name: 'Analysis',
    icon: 'chart-bar',
    description: 'Security, performance, code review',
  },
  productivity: {
    name: 'Productivity',
    icon: 'clipboard-list',
    description: 'Planning, documentation, task management',
  },
  custom: {
    name: 'Custom',
    icon: 'sparkles',
    description: 'User-created subagents',
  },
};

/**
 * Built-in subagent names
 */
export const BUILT_IN_SUBAGENTS = [
  'web-researcher',
  'code-architect',
  'test-engineer',
  'documentation-writer',
  'security-auditor',
  'performance-optimizer',
  'code-reviewer',
  'task-planner',
  'api-integrator',
  'refactoring-assistant',
] as const;

export type BuiltInSubagentName = (typeof BUILT_IN_SUBAGENTS)[number];
