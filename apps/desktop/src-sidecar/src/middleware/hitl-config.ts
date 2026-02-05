/**
 * HITL Config Mapping
 *
 * Maps Deep Agents HITL config to existing toolPolicyService rules
 */

/**
 * HITL configuration
 */
export interface HitlConfig {
  interrupt_on: {
    write_file?: boolean;
    edit_file?: boolean;
    delete_file?: boolean;
    execute?: boolean;
    create_memory?: boolean;
    delete_memory?: boolean;
    web_fetch?: boolean;
    web_search?: boolean;
  };
}

/**
 * Default HITL configuration
 */
export const DEFAULT_HITL_CONFIG: HitlConfig = {
  interrupt_on: {
    write_file: true,
    edit_file: true,
    delete_file: true,
    execute: true,
    create_memory: false, // Allow auto-extraction
    delete_memory: true,
    web_fetch: true,
    web_search: false, // Searches are safe
  },
};

/**
 * Policy rule mapping
 */
interface PolicyRuleMapping {
  tool: string;
  action: 'allow' | 'deny' | 'ask';
  conditions?: {
    pathPatterns?: string[];
    allowedCommands?: string[];
    excludePaths?: string[];
    excludeTools?: string[];
  };
}

/**
 * HITL to Policy Mapping
 */
export const HITL_TO_POLICY_MAPPING: Record<string, PolicyRuleMapping> = {
  write_file: {
    tool: 'group:fs',
    action: 'ask',
    conditions: {
      pathPatterns: ['**/*'],
      excludeTools: ['read_file', 'glob', 'ls'],
    },
  },

  edit_file: {
    tool: 'edit_file',
    action: 'ask',
  },

  delete_file: {
    tool: 'delete_file',
    action: 'ask',
  },

  execute: {
    tool: 'group:shell',
    action: 'ask',
    conditions: {
      allowedCommands: [
        'npm run *',
        'pnpm *',
        'yarn *',
        'git status',
        'git diff',
        'git log',
        'ls *',
        'cat *',
      ],
    },
  },

  create_memory: {
    tool: 'create_memory',
    action: 'allow', // Auto-extraction is allowed
  },

  delete_memory: {
    tool: 'delete_memory',
    action: 'ask', // Always confirm deletion
  },

  web_fetch: {
    tool: 'group:network',
    action: 'ask',
    conditions: {
      excludePaths: [
        'docs.*.com',
        'api.github.com',
        '*.npmjs.com',
        '*.google.com/search',
      ],
    },
  },

  web_search: {
    tool: 'web_search',
    action: 'allow', // Searches are safe
  },
};

/**
 * Apply HITL config to a policy object
 */
export function applyHitlConfig(
  hitlConfig: HitlConfig,
  currentPolicy: { globalAllow: string[]; globalDeny: string[] }
): { globalAllow: string[]; globalDeny: string[] } {
  const updatedPolicy = {
    globalAllow: [...currentPolicy.globalAllow],
    globalDeny: [...currentPolicy.globalDeny],
  };

  for (const [hitlKey, shouldInterrupt] of Object.entries(hitlConfig.interrupt_on)) {
    const mapping = HITL_TO_POLICY_MAPPING[hitlKey];
    if (!mapping) continue;

    if (!shouldInterrupt) {
      // If not interrupting, add to allow list
      if (!updatedPolicy.globalAllow.includes(mapping.tool)) {
        updatedPolicy.globalAllow.push(mapping.tool);
      }
    }
  }

  return updatedPolicy;
}

/**
 * Get tool rules from HITL config
 */
export function getToolRulesFromHitl(hitlConfig: HitlConfig): PolicyRuleMapping[] {
  const rules: PolicyRuleMapping[] = [];

  for (const [hitlKey, shouldInterrupt] of Object.entries(hitlConfig.interrupt_on)) {
    if (!shouldInterrupt) continue;

    const mapping = HITL_TO_POLICY_MAPPING[hitlKey];
    if (mapping) {
      rules.push(mapping);
    }
  }

  return rules;
}

/**
 * Check if a tool call should be interrupted based on HITL config
 */
export function shouldInterrupt(
  hitlConfig: HitlConfig,
  toolName: string,
  args: Record<string, unknown>
): boolean {
  // Check each HITL rule
  for (const [hitlKey, shouldInterruptTool] of Object.entries(hitlConfig.interrupt_on)) {
    if (!shouldInterruptTool) continue;

    const mapping = HITL_TO_POLICY_MAPPING[hitlKey];
    if (!mapping) continue;

    // Check if tool matches
    if (toolMatchesRule(toolName, mapping)) {
      // Check conditions
      if (mapping.conditions) {
        // Check excluded paths
        if (mapping.conditions.excludePaths) {
          const path = (args.path || args.url || '') as string;
          const excluded = mapping.conditions.excludePaths.some(pattern =>
            matchPattern(path, pattern)
          );
          if (excluded) continue;
        }

        // Check allowed commands
        if (mapping.conditions.allowedCommands) {
          const command = (args.command || '') as string;
          const allowed = mapping.conditions.allowedCommands.some(pattern =>
            matchPattern(command, pattern)
          );
          if (allowed) continue;
        }

        // Check excluded tools
        if (mapping.conditions.excludeTools?.includes(toolName)) {
          continue;
        }
      }

      return true;
    }
  }

  return false;
}

/**
 * Check if tool name matches a rule
 */
function toolMatchesRule(toolName: string, rule: PolicyRuleMapping): boolean {
  if (rule.tool.startsWith('group:')) {
    // Group matching - would need tool group mapping
    const groupName = rule.tool.replace('group:', '');
    return toolName.includes(groupName) || isToolInGroup(toolName, groupName);
  }

  return toolName === rule.tool;
}

/**
 * Check if tool is in a group (simplified)
 */
function isToolInGroup(toolName: string, groupName: string): boolean {
  const toolGroups: Record<string, string[]> = {
    fs: ['read_file', 'write_file', 'edit_file', 'delete_file', 'glob', 'ls', 'mkdir'],
    shell: ['execute', 'bash', 'run_command'],
    network: ['web_fetch', 'http_request', 'fetch'],
    memory: ['create_memory', 'read_memory', 'update_memory', 'delete_memory', 'list_memories'],
  };

  const group = toolGroups[groupName];
  return group ? group.includes(toolName) : false;
}

/**
 * Simple pattern matching
 */
function matchPattern(value: string, pattern: string): boolean {
  if (pattern === '*') return true;

  if (pattern.startsWith('*.')) {
    return value.endsWith(pattern.slice(1));
  }

  if (pattern.endsWith('*')) {
    return value.startsWith(pattern.slice(0, -1));
  }

  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(value);
  }

  return value === pattern;
}
