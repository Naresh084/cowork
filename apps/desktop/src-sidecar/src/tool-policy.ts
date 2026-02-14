// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * ToolPolicyService - Fine-grained tool access control
 *
 * Features:
 * - Profile-based default policies
 * - Global allow/deny lists
 * - Custom rules with conditions
 * - Path and command pattern matching
 * - MCP provider settings
 */

import micromatch from 'micromatch';
import type {
  ToolPolicy,
  ToolRule,
  ToolProfile,
  ToolEvaluationResult,
  ToolCallContext,
} from '@cowork/shared';
import {
  readJsonFile,
  writeJsonFileAtomic,
  getPolicyPath,
  ensurePoliciesDir,
} from './utils/paths.js';

/**
 * Tool group definitions - maps group names to actual tool names
 */
const TOOL_GROUPS: Record<string, string[]> = {
  'group:fs': [
    'read_file',
    'write_file',
    'edit_file',
    'glob',
    'ls',
    'delete_file',
    'move_file',
    'copy_file',
    'Read',
    'Write',
    'Edit',
    'Glob',
    'LS',
  ],
  'group:shell': ['execute', 'Bash', 'run_command', 'shell'],
  'group:network': [
    'fetch',
    'WebFetch',
    'web_fetch',
    'http_request',
    'google_grounded_search',
    'web_search',
    'WebSearch',
  ],
  'group:research': ['deep_research', 'research'],
  'group:media': ['generate_image', 'generate_video', 'text_to_speech', 'speech_to_text'],
  'group:computer': ['computer_use', 'screenshot', 'mouse_click', 'keyboard_type'],
  'group:mcp': [], // Dynamic - populated at runtime
  'group:tasks': ['write_todos', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite'],
  'group:memory': [
    // Legacy memory tools
    'read_memory',
    'write_memory',
    'memory_search',
    // Deep Agents memory tools
    'deep_memory_create',
    'deep_memory_read',
    'deep_memory_update',
    'deep_memory_delete',
    'deep_memory_list',
    'deep_memory_search',
    'deep_memory_get_relevant',
    'deep_memory_list_groups',
    'deep_memory_create_group',
    'deep_memory_delete_group',
    'deep_memory_build_prompt',
  ],
  // AGENTS.md tools
  'group:agents_md': [
    'agents_md_load',
    'agents_md_generate',
    'agents_md_to_prompt',
    'agents_md_update_section',
    'agents_md_validate',
    'agents_md_scan_project',
  ],
  // Command tools
  'group:commands': [
    'command_list',
    'command_get',
    'command_execute',
    'command_search',
    'command_list_by_category',
  ],
};

/**
 * Profile definitions with default allow/deny lists
 */
const PROFILES: Record<ToolProfile, { allow: string[]; deny: string[] }> = {
  minimal: {
    allow: ['read_file', 'Read', 'glob', 'Glob', 'ls', 'LS', 'grep', 'Grep'],
    deny: [
      'group:shell',
      'group:network',
      'group:media',
      'write_file',
      'Write',
      'edit_file',
      'Edit',
      'delete_file',
    ],
  },
  readonly: {
    allow: ['group:fs', 'grep', 'Grep', 'web_search', 'google_grounded_search', 'web_fetch'],
    deny: ['write_file', 'Write', 'edit_file', 'Edit', 'delete_file', 'execute', 'Bash', 'group:media'],
  },
  coding: {
    allow: ['group:fs', 'group:tasks', 'group:memory', 'group:agents_md', 'group:commands', 'grep', 'Grep', 'web_search', 'google_grounded_search', 'web_fetch', 'Bash'],
    deny: ['group:media', 'deep_research', 'deep_memory_delete'],  // Memory deletion requires confirmation
  },
  messaging: {
    allow: ['group:network', 'read_file', 'Read', 'glob', 'Glob'],
    deny: ['group:shell', 'group:media', 'write_file', 'Write', 'edit_file', 'Edit', 'delete_file'],
  },
  research: {
    allow: ['group:network', 'group:fs', 'group:memory', 'group:agents_md', 'deep_research', 'web_search', 'google_grounded_search', 'web_fetch'],
    deny: ['group:shell', 'group:media', 'write_file', 'Write', 'edit_file', 'Edit', 'delete_file', 'deep_memory_delete', 'deep_memory_create', 'deep_memory_update'],  // Research is read-only for memories
  },
  enterprise_balanced: {
    allow: ['group:fs', 'group:network', 'group:tasks', 'group:memory', 'web_search', 'web_fetch', 'group:agents_md'],
    deny: ['group:media', 'group:computer', 'delete_file', 'deep_memory_delete'],
  },
  enterprise_strict: {
    allow: ['read_file', 'Read', 'glob', 'Glob', 'ls', 'LS', 'grep', 'Grep', 'web_search'],
    deny: ['group:shell', 'group:network', 'group:media', 'group:computer', 'write_file', 'Write', 'edit_file', 'Edit', 'delete_file', 'deep_research'],
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

/**
 * Default policy
 */
const DEFAULT_POLICY: ToolPolicy = {
  id: 'default',
  name: 'Default Policy',
  description: 'Standard coding policy with reasonable restrictions',
  profile: 'coding',
  globalAllow: [],
  globalDeny: [],
  rules: [],
  providerSettings: {},
  isDefault: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/**
 * ToolPolicyService manages tool access control
 */
export class ToolPolicyService {
  private policy: ToolPolicy;
  private mcpTools: Set<string> = new Set();
  private initialized = false;

  constructor() {
    this.policy = { ...DEFAULT_POLICY };
  }

  /**
   * Initialize and load policy from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await ensurePoliciesDir();

    try {
      const savedPolicy = await readJsonFile<ToolPolicy>(getPolicyPath(), DEFAULT_POLICY);
      this.policy = { ...DEFAULT_POLICY, ...savedPolicy };
    } catch {
      this.policy = { ...DEFAULT_POLICY };
    }

    this.initialized = true;
  }

  /**
   * Save current policy to disk
   */
  async save(): Promise<void> {
    await ensurePoliciesDir();
    await writeJsonFileAtomic(getPolicyPath(), this.policy);
  }

  /**
   * Get current policy
   */
  getPolicy(): ToolPolicy {
    return { ...this.policy };
  }

  /**
   * Update policy
   */
  async updatePolicy(
    updates: Partial<Omit<ToolPolicy, 'id' | 'createdAt'>>
  ): Promise<ToolPolicy> {
    this.policy = {
      ...this.policy,
      ...updates,
      updatedAt: Date.now(),
    };
    await this.save();
    return this.getPolicy();
  }

  /**
   * Set profile (resets rules to profile defaults)
   */
  async setProfile(profile: ToolProfile): Promise<ToolPolicy> {
    this.policy.profile = profile;
    if (profile !== 'custom') {
      // Reset to profile defaults
      const profileDefaults = PROFILES[profile];
      this.policy.globalAllow = [...profileDefaults.allow];
      this.policy.globalDeny = [...profileDefaults.deny];
      this.policy.rules = [];
    }
    this.policy.updatedAt = Date.now();
    await this.save();
    return this.getPolicy();
  }

  /**
   * Add custom rule
   */
  async addRule(rule: Omit<ToolRule, 'priority'>): Promise<ToolRule> {
    const fullRule: ToolRule = {
      ...rule,
      priority: this.policy.rules.length + 1,
    };
    this.policy.rules.push(fullRule);
    this.policy.updatedAt = Date.now();
    await this.save();
    return fullRule;
  }

  /**
   * Remove rule by index
   */
  async removeRule(index: number): Promise<void> {
    if (index < 0 || index >= this.policy.rules.length) {
      throw new Error(`Rule index out of range: ${index}`);
    }
    this.policy.rules.splice(index, 1);
    // Recompute priorities
    this.policy.rules.forEach((rule, i) => {
      rule.priority = i + 1;
    });
    this.policy.updatedAt = Date.now();
    await this.save();
  }

  /**
   * Register MCP tools (called when MCP servers connect)
   */
  registerMcpTools(tools: string[]): void {
    tools.forEach(tool => this.mcpTools.add(tool));
    TOOL_GROUPS['group:mcp'] = Array.from(this.mcpTools);
  }

  /**
   * Main evaluation function
   */
  evaluate(context: ToolCallContext): ToolEvaluationResult {
    const { toolName, provider } = context;

    // 1. Check global deny first (highest priority)
    if (this.matchesToolList(toolName, this.policy.globalDeny)) {
      return {
        allowed: false,
        action: 'deny',
        reason: `Tool "${toolName}" is globally denied`,
        reasonCode: 'global_deny',
      };
    }

    // 2. Check global allow
    if (this.matchesToolList(toolName, this.policy.globalAllow)) {
      return {
        allowed: true,
        action: 'allow',
        reason: `Tool "${toolName}" is globally allowed`,
        reasonCode: 'global_allow',
      };
    }

    // 3. Check provider settings (for MCP tools)
    if (provider && this.policy.providerSettings[provider]) {
      const settings = this.policy.providerSettings[provider];
      if (!settings.enabled) {
        return {
          allowed: false,
          action: 'deny',
          reason: `MCP provider "${provider}" is disabled`,
          reasonCode: 'provider_disabled',
        };
      }
      if (settings.deniedTools?.includes(toolName)) {
        return {
          allowed: false,
          action: 'deny',
          reason: `Tool "${toolName}" is denied for provider "${provider}"`,
          reasonCode: 'provider_tool_denied',
        };
      }
      if (settings.allowedTools && !settings.allowedTools.includes(toolName)) {
        return {
          allowed: false,
          action: 'deny',
          reason: `Tool "${toolName}" is not in allowed list for provider "${provider}"`,
          reasonCode: 'provider_allowlist_miss',
        };
      }
    }

    // 4. Check custom rules (sorted by priority, higher first)
    const sortedRules = [...this.policy.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.ruleMatchesTool(rule, toolName)) {
        const conditionResult = this.evaluateConditions(rule, context);
        if (conditionResult.matches) {
          const reasonCode = rule.action === 'allow' ? 'rule_allow' : rule.action === 'deny' ? 'rule_deny' : undefined;
          return {
            allowed: rule.action === 'allow',
            action: rule.action,
            matchedRule: rule,
            reason: conditionResult.reason,
            reasonCode,
          };
        }
      }
    }

    // 5. Check profile defaults
    const profileDefaults = PROFILES[this.policy.profile];
    if (profileDefaults) {
      if (this.matchesToolList(toolName, profileDefaults.deny)) {
        return {
          allowed: false,
          action: 'deny',
          reason: `Tool "${toolName}" denied by profile "${this.policy.profile}"`,
          reasonCode: 'profile_deny',
        };
      }
      if (this.matchesToolList(toolName, profileDefaults.allow)) {
        return {
          allowed: true,
          action: 'allow',
          reason: `Tool "${toolName}" allowed by profile "${this.policy.profile}"`,
          reasonCode: 'profile_allow',
        };
      }
    }

    // 6. Default: ask user
    return {
      allowed: false,
      action: 'ask',
      reason: `No policy rule found for tool "${toolName}"`,
      reasonCode: 'default_ask',
    };
  }

  /**
   * Check if tool matches a list (supports groups and wildcards)
   */
  private matchesToolList(toolName: string, list: string[]): boolean {
    for (const item of list) {
      if (item === '*') return true;
      if (item === toolName) return true;
      if (item.startsWith('group:')) {
        const groupTools = TOOL_GROUPS[item] || [];
        if (groupTools.includes(toolName)) return true;
      }
      // Wildcard pattern matching
      if (item.includes('*') && micromatch.isMatch(toolName, item)) return true;
    }
    return false;
  }

  /**
   * Check if rule matches tool
   */
  private ruleMatchesTool(rule: ToolRule, toolName: string): boolean {
    if (rule.tool === toolName) return true;
    if (rule.tool.startsWith('group:')) {
      const groupTools = TOOL_GROUPS[rule.tool] || [];
      return groupTools.includes(toolName);
    }
    if (rule.tool.includes('*')) {
      return micromatch.isMatch(toolName, rule.tool);
    }
    return false;
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateConditions(
    rule: ToolRule,
    context: ToolCallContext
  ): { matches: boolean; reason: string; reasonCode?: string } {
    const conditions = rule.conditions;
    if (!conditions) {
      return { matches: true, reason: `Rule matches tool "${context.toolName}"` };
    }

    // Check session type
    if (conditions.sessionTypes && conditions.sessionTypes.length > 0) {
      if (!conditions.sessionTypes.includes(context.sessionType)) {
        return {
          matches: false,
          reason: 'Session type mismatch',
          reasonCode: 'condition_session_mismatch',
        };
      }
    }

    // Check path patterns (for file operations)
    const pathArg = this.extractPath(context.arguments);
    if (pathArg) {
      if (conditions.excludePaths) {
        for (const pattern of conditions.excludePaths) {
          if (micromatch.isMatch(pathArg, pattern)) {
            return {
              matches: true,
              reason: `Path "${pathArg}" matches exclude pattern "${pattern}"`,
              reasonCode: 'condition_path_excluded',
            };
          }
        }
      }
      if (conditions.pathPatterns && conditions.pathPatterns.length > 0) {
        const matchesPath = conditions.pathPatterns.some(pattern =>
          micromatch.isMatch(pathArg, pattern)
        );
        if (!matchesPath) {
          return {
            matches: false,
            reason: 'Path does not match allowed patterns',
            reasonCode: 'condition_path_not_allowed',
          };
        }
      }
    }

    // Check command patterns (for shell operations)
    const commandArg = this.extractCommand(context.arguments);
    if (commandArg) {
      if (conditions.deniedCommands) {
        for (const pattern of conditions.deniedCommands) {
          if (this.commandMatches(commandArg, pattern)) {
            return {
              matches: true,
              reason: `Command matches denied pattern "${pattern}"`,
              reasonCode: 'condition_command_denied',
            };
          }
        }
      }
      if (conditions.allowedCommands && conditions.allowedCommands.length > 0) {
        const matchesCommand = conditions.allowedCommands.some(pattern =>
          this.commandMatches(commandArg, pattern)
        );
        if (!matchesCommand) {
          return {
            matches: false,
            reason: 'Command does not match allowed patterns',
            reasonCode: 'condition_command_not_allowed',
          };
        }
      }
    }

    // Check provider
    if (conditions.providers && conditions.providers.length > 0) {
      if (!context.provider || !conditions.providers.includes(context.provider)) {
        return {
          matches: false,
          reason: 'Provider mismatch',
          reasonCode: 'condition_provider_mismatch',
        };
      }
    }

    return { matches: true, reason: 'All conditions satisfied' };
  }

  /**
   * Extract file path from arguments
   */
  private extractPath(args: Record<string, unknown>): string | null {
    // Common argument names for file paths
    const pathKeys = ['path', 'file_path', 'filePath', 'target', 'source', 'destination'];
    for (const key of pathKeys) {
      if (typeof args[key] === 'string') {
        return args[key] as string;
      }
    }
    return null;
  }

  /**
   * Extract command from arguments
   */
  private extractCommand(args: Record<string, unknown>): string | null {
    const commandKeys = ['command', 'cmd', 'script'];
    for (const key of commandKeys) {
      if (typeof args[key] === 'string') {
        return args[key] as string;
      }
    }
    return null;
  }

  /**
   * Check if command matches pattern
   */
  private commandMatches(command: string, pattern: string): boolean {
    // Handle simple prefix patterns like "git *"
    if (pattern.endsWith(' *')) {
      const prefix = pattern.slice(0, -2);
      return command.startsWith(prefix + ' ') || command === prefix;
    }
    // Handle exact match
    if (pattern === command) return true;
    // Handle glob pattern
    return micromatch.isMatch(command, pattern);
  }
}

/**
 * Singleton instance
 */
export const toolPolicyService = new ToolPolicyService();
