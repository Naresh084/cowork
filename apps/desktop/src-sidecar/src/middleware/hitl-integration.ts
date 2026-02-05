/**
 * HITL Integration
 *
 * Integrates with existing permission system (toolPolicyService, requestPermission)
 */

import type { ToolPolicyService } from '../tool-policy.js';

/**
 * Permission parameters for HITL
 */
export interface PermissionParams {
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  context?: {
    reason?: string;
    matchedRule?: string;
  };
}

/**
 * Permission decision
 */
export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
  scope?: 'exact' | 'pattern';
  remember?: boolean;
}

/**
 * Session permission state
 */
export interface SessionPermissionState {
  permissionCache: Map<string, PermissionDecision>;
  permissionScopes: Map<string, Set<string>>;
}

/**
 * Memory permission scopes
 */
export const MEMORY_PERMISSION_SCOPES = {
  // Auto-allow patterns (no prompt needed)
  autoAllow: [
    'create_memory:preferences/*',
    'create_memory:learnings/*',
    'read_memory:*',
  ],

  // Always ask patterns
  alwaysAsk: [
    'delete_memory:*',
    'create_memory:instructions/*',
  ],
};

/**
 * Initialize memory permission defaults in session
 */
export function initializeMemoryPermissions(
  sessionState: SessionPermissionState
): void {
  // Add auto-allow scopes for memory operations
  for (const scope of MEMORY_PERMISSION_SCOPES.autoAllow) {
    const [tool, pattern] = scope.split(':');
    if (!sessionState.permissionScopes.has(tool)) {
      sessionState.permissionScopes.set(tool, new Set());
    }
    sessionState.permissionScopes.get(tool)!.add(pattern);
  }
}

/**
 * Configure HITL rules in the toolPolicyService
 */
export async function configureHitlRules(
  _toolPolicyService: ToolPolicyService,
  _sessionId: string
): Promise<void> {
  // Memory operations - mostly allow (moderate aggressiveness)
  // The existing toolPolicyService already has 'group:memory' defined

  // These rules are applied via the existing tool policy system
  // We just ensure the memory group is configured correctly

  // Note: The actual rule application happens through toolPolicyService.evaluate()
  // which is already integrated in agent-runner.ts createToolMiddleware()
}

/**
 * Wrap a tool call with HITL permission check
 *
 * This integrates with the existing permission system in agent-runner.ts
 */
export async function wrapWithHitl(
  sessionState: SessionPermissionState,
  toolName: string,
  args: Record<string, unknown>,
  executeTool: () => Promise<unknown>,
  requestPermission: (params: PermissionParams) => Promise<PermissionDecision>,
  policyEvaluate: (toolName: string, args: Record<string, unknown>) => { action: 'allow' | 'deny' | 'ask'; reason?: string }
): Promise<unknown> {
  // Step 1: Check tool policy
  const policyResult = policyEvaluate(toolName, args);

  // Step 2: Handle policy decision
  if (policyResult.action === 'allow') {
    return executeTool();
  }

  if (policyResult.action === 'deny') {
    throw new Error(`Tool "${toolName}" denied: ${policyResult.reason}`);
  }

  // Step 3: Check cache
  const cacheKey = buildCacheKey(toolName, args);
  const cached = sessionState.permissionCache.get(cacheKey);
  if (cached) {
    if (cached.allowed) {
      return executeTool();
    }
    throw new Error(`Permission denied for "${toolName}": ${cached.reason || 'Previously rejected'}`);
  }

  // Step 4: Check scopes
  const scopeMatch = checkPermissionScopes(sessionState.permissionScopes, toolName, args);
  if (scopeMatch !== null) {
    if (scopeMatch) {
      return executeTool();
    }
    throw new Error(`Permission denied for "${toolName}": Blocked by scope pattern`);
  }

  // Step 5: Ask for permission
  const decision = await requestPermission({
    toolName,
    toolInput: args,
    sessionId: '', // Filled by caller
    context: {
      reason: policyResult.reason,
    },
  });

  // Step 6: Cache decision if requested
  if (decision.remember) {
    if (decision.scope === 'exact') {
      sessionState.permissionCache.set(cacheKey, decision);
    } else if (decision.scope === 'pattern') {
      // Add to scopes for pattern matching
      const pattern = buildPatternFromArgs(toolName, args);
      if (!sessionState.permissionScopes.has(toolName)) {
        sessionState.permissionScopes.set(toolName, new Set());
      }
      sessionState.permissionScopes.get(toolName)!.add(pattern);
    }
  }

  // Step 7: Execute or block
  if (decision.allowed) {
    return executeTool();
  }

  throw new Error(`Permission denied for "${toolName}": ${decision.reason || 'User rejected'}`);
}

/**
 * Build cache key for permission
 */
function buildCacheKey(toolName: string, args: Record<string, unknown>): string {
  // Create deterministic key from tool name and relevant args
  const relevantArgs: Record<string, unknown> = {};

  // Include path-like arguments
  for (const [key, value] of Object.entries(args)) {
    if (key === 'path' || key === 'file' || key === 'directory' || key === 'command') {
      relevantArgs[key] = value;
    }
  }

  return `${toolName}:${JSON.stringify(relevantArgs)}`;
}

/**
 * Check permission scopes for a match
 */
function checkPermissionScopes(
  scopes: Map<string, Set<string>>,
  toolName: string,
  args: Record<string, unknown>
): boolean | null {
  const toolScopes = scopes.get(toolName);
  if (!toolScopes || toolScopes.size === 0) {
    return null; // No scope defined, need to ask
  }

  const pathArg = (args.path || args.file || args.directory || '') as string;

  for (const pattern of toolScopes) {
    if (pattern === '*') {
      return true;
    }

    if (matchPattern(pathArg, pattern)) {
      return true;
    }
  }

  return null; // No matching scope
}

/**
 * Match path against pattern
 */
function matchPattern(path: string, pattern: string): boolean {
  // Simple glob matching
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return path.startsWith(prefix);
  }

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path.startsWith(prefix);
  }

  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1);
    return path.endsWith(ext);
  }

  return path === pattern;
}

/**
 * Build pattern from args for scope caching
 */
function buildPatternFromArgs(_toolName: string, args: Record<string, unknown>): string {
  const pathArg = (args.path || args.file || args.directory || '') as string;

  // For file operations, use directory pattern
  if (pathArg.includes('/')) {
    const dir = pathArg.substring(0, pathArg.lastIndexOf('/'));
    return `${dir}/*`;
  }

  return '*';
}

/**
 * Check if tool is a memory operation
 */
export function isMemoryTool(toolName: string): boolean {
  return toolName.includes('memory') ||
         toolName === 'create_memory' ||
         toolName === 'read_memory' ||
         toolName === 'update_memory' ||
         toolName === 'delete_memory';
}

/**
 * Get permission requirements for memory operation
 */
export function getMemoryPermissionRequirement(
  toolName: string,
  args: Record<string, unknown>
): 'allow' | 'ask' {
  const group = (args.group || '') as string;

  // Read operations always allowed
  if (toolName === 'read_memory' || toolName.includes('list') || toolName.includes('search')) {
    return 'allow';
  }

  // Delete always needs confirmation
  if (toolName === 'delete_memory') {
    return 'ask';
  }

  // Create in instructions group needs confirmation
  if (toolName === 'create_memory' && group === 'instructions') {
    return 'ask';
  }

  // Other creates are allowed (auto-extraction)
  return 'allow';
}
