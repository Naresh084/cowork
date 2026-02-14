// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';

// ============================================================================
// Tool Groups
// ============================================================================

/**
 * Predefined tool groups for easy configuration
 */
export const ToolGroupSchema = z.enum([
  'group:fs',       // read_file, write_file, edit_file, glob, ls
  'group:shell',    // execute, Bash
  'group:network',  // fetch, WebFetch, web_fetch, google_grounded_search
  'group:research', // deep_research
  'group:media',    // generate_image, generate_video
  'group:computer', // computer_use
  'group:mcp',      // All MCP tools
  'group:tasks',    // write_todos, TaskCreate, etc.
  'group:memory',   // read_memory, write_memory
]);

export type ToolGroup = z.infer<typeof ToolGroupSchema>;

/**
 * Tool group definitions - maps group names to tool names
 */
export const TOOL_GROUP_DEFINITIONS: Record<ToolGroup, string[]> = {
  'group:fs': ['read_file', 'write_file', 'edit_file', 'glob', 'ls', 'delete_file', 'move_file', 'copy_file'],
  'group:shell': ['execute', 'Bash', 'run_command', 'shell'],
  'group:network': ['fetch', 'WebFetch', 'web_fetch', 'http_request', 'google_grounded_search', 'web_search'],
  'group:research': ['deep_research', 'research'],
  'group:media': ['generate_image', 'generate_video', 'text_to_speech', 'speech_to_text'],
  'group:computer': ['computer_use', 'screenshot', 'mouse_click', 'keyboard_type'],
  'group:mcp': [], // Dynamic - populated at runtime
  'group:tasks': ['write_todos', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'],
  'group:memory': ['read_memory', 'write_memory', 'memory_search'],
};

// ============================================================================
// Tool Profiles
// ============================================================================

/**
 * Preset tool access profiles
 */
export const ToolProfileSchema = z.enum([
  'minimal',    // Read-only, no shell, no network
  'readonly',   // File reading, search, no writes
  'coding',     // Full coding tools, limited shell
  'messaging',  // Network + limited file access
  'research',   // Research + network + read
  'enterprise_balanced', // Enterprise profile with restricted execution + audit defaults
  'enterprise_strict',   // Enterprise locked-down profile
  'full',       // All tools enabled
  'custom',     // User-defined
]);

export type ToolProfile = z.infer<typeof ToolProfileSchema>;

/**
 * Profile definitions with default allow/deny lists
 */
export const TOOL_PROFILES: Record<ToolProfile, { allow: string[]; deny: string[] }> = {
  minimal: {
    allow: ['read_file', 'glob', 'ls', 'grep'],
    deny: ['group:shell', 'group:network', 'group:media', 'write_file', 'edit_file', 'delete_file'],
  },
  readonly: {
    allow: ['group:fs', 'grep', 'web_search', 'google_grounded_search', 'web_fetch'],
    deny: ['write_file', 'edit_file', 'delete_file', 'execute', 'group:media'],
  },
  coding: {
    allow: ['group:fs', 'group:tasks', 'grep', 'web_search', 'google_grounded_search', 'web_fetch'],
    deny: ['group:media', 'deep_research'],
  },
  messaging: {
    allow: ['group:network', 'read_file', 'glob'],
    deny: ['group:shell', 'group:media', 'write_file', 'edit_file', 'delete_file'],
  },
  research: {
    allow: ['group:network', 'group:fs', 'deep_research', 'web_search', 'google_grounded_search', 'web_fetch'],
    deny: ['group:shell', 'group:media', 'write_file', 'edit_file', 'delete_file'],
  },
  enterprise_balanced: {
    allow: ['group:fs', 'group:network', 'group:tasks', 'group:memory', 'web_search', 'web_fetch'],
    deny: ['group:media', 'group:computer', 'delete_file', 'deep_memory_delete'],
  },
  enterprise_strict: {
    allow: ['read_file', 'glob', 'ls', 'grep', 'web_search'],
    deny: ['group:shell', 'group:media', 'group:computer', 'write_file', 'edit_file', 'delete_file', 'deep_research'],
  },
  full: {
    allow: ['*'],
    deny: [],
  },
  custom: {
    allow: [],
    deny: [],
  },
};

// ============================================================================
// Tool Rules
// ============================================================================

/**
 * Rule action types
 */
export const ToolRuleActionSchema = z.enum(['allow', 'deny', 'ask']);
export type ToolRuleAction = z.infer<typeof ToolRuleActionSchema>;

/**
 * Risk level for tools
 */
export const RiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/**
 * Session type for condition matching
 */
export const SessionTypeSchema = z.enum(['main', 'isolated', 'cron', 'ephemeral', 'integration']);
export type SessionType = z.infer<typeof SessionTypeSchema>;

/**
 * Conditions for rule matching
 */
export const ToolRuleConditionsSchema = z.object({
  pathPatterns: z.array(z.string()).optional().describe('Glob patterns for file paths to match'),
  excludePaths: z.array(z.string()).optional().describe('Glob patterns for file paths to exclude'),
  allowedCommands: z.array(z.string()).optional().describe('Command patterns to allow'),
  deniedCommands: z.array(z.string()).optional().describe('Command patterns to deny'),
  providers: z.array(z.string()).optional().describe('MCP provider names to match'),
  sessionTypes: z.array(SessionTypeSchema).optional().describe('Session types to match'),
  maxRiskLevel: RiskLevelSchema.optional().describe('Maximum allowed risk level'),
});

export type ToolRuleConditions = z.infer<typeof ToolRuleConditionsSchema>;

/**
 * Tool rule definition
 */
export const ToolRuleSchema = z.object({
  tool: z.string().describe('Tool name, group (e.g., group:fs), or pattern (e.g., write_*)'),
  action: ToolRuleActionSchema,
  conditions: ToolRuleConditionsSchema.optional(),
  priority: z.number().int().describe('Higher priority rules are evaluated first'),
});

export type ToolRule = z.infer<typeof ToolRuleSchema>;

// ============================================================================
// Provider Settings
// ============================================================================

/**
 * Settings for MCP providers
 */
export const ProviderSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  allowedTools: z.array(z.string()).optional().describe('If set, only these tools are allowed'),
  deniedTools: z.array(z.string()).optional().describe('These tools are blocked'),
});

export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;

// ============================================================================
// Tool Policy
// ============================================================================

/**
 * Full tool policy definition
 */
export const ToolPolicySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  profile: ToolProfileSchema,
  globalAllow: z.array(z.string()).describe('Tools always allowed'),
  globalDeny: z.array(z.string()).describe('Tools always denied (highest priority)'),
  rules: z.array(ToolRuleSchema).describe('Custom rules evaluated by priority'),
  providerSettings: z.record(ProviderSettingsSchema).describe('Per-provider settings'),
  isDefault: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ToolPolicy = z.infer<typeof ToolPolicySchema>;

// ============================================================================
// Evaluation Types
// ============================================================================

/**
 * Result of evaluating a tool against the policy
 */
export const ToolEvaluationResultSchema = z.object({
  allowed: z.boolean(),
  action: ToolRuleActionSchema,
  matchedRule: ToolRuleSchema.optional(),
  reason: z.string().optional(),
  reasonCode: z.string().optional(),
  explainability: z.record(z.string()).optional(),
});

export type ToolEvaluationResult = z.infer<typeof ToolEvaluationResultSchema>;

/**
 * Policy reason codes for explainability and auditing.
 */
export const PolicyReasonCodeSchema = z.enum([
  'global_allow',
  'global_deny',
  'provider_disabled',
  'provider_tool_denied',
  'provider_allowlist_miss',
  'rule_allow',
  'rule_deny',
  'profile_allow',
  'profile_deny',
  'default_ask',
  'condition_session_mismatch',
  'condition_path_excluded',
  'condition_path_not_allowed',
  'condition_command_denied',
  'condition_command_not_allowed',
  'condition_provider_mismatch',
]);

export type PolicyReasonCode = z.infer<typeof PolicyReasonCodeSchema>;

export const PolicyDenyReasonCodeSchema = z.enum([
  'global_deny',
  'provider_disabled',
  'provider_tool_denied',
  'provider_allowlist_miss',
  'rule_deny',
  'profile_deny',
  'condition_path_excluded',
  'condition_path_not_allowed',
  'condition_command_denied',
  'condition_command_not_allowed',
  'condition_provider_mismatch',
]);

export type PolicyDenyReasonCode = z.infer<typeof PolicyDenyReasonCodeSchema>;

/**
 * Context for tool evaluation
 */
export const ToolCallContextSchema = z.object({
  toolName: z.string(),
  arguments: z.record(z.unknown()),
  sessionId: z.string(),
  sessionType: SessionTypeSchema,
  provider: z.string().optional(),
});

export type ToolCallContext = z.infer<typeof ToolCallContextSchema>;

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input for updating policy
 */
export const UpdateToolPolicyInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  globalAllow: z.array(z.string()).optional(),
  globalDeny: z.array(z.string()).optional(),
  rules: z.array(ToolRuleSchema).optional(),
  providerSettings: z.record(ProviderSettingsSchema).optional(),
});

export type UpdateToolPolicyInput = z.infer<typeof UpdateToolPolicyInputSchema>;

/**
 * Input for adding a rule (without priority - auto-assigned)
 */
export const AddToolRuleInputSchema = z.object({
  tool: z.string(),
  action: ToolRuleActionSchema,
  conditions: ToolRuleConditionsSchema.optional(),
});

export type AddToolRuleInput = z.infer<typeof AddToolRuleInputSchema>;
