import { agentRunner } from './agent-runner.js';
import { loadGeminiExtensions } from './gemini-extensions.js';
import { skillService } from './skill-service.js';
import { checkSkillEligibility } from './eligibility-checker.js';
import { commandService } from './command-service.js';
import type { CommandCategory, SecretDefinition } from '@gemini-cowork/shared';
import { cronService } from './cron/index.js';
import { heartbeatService } from './heartbeat/service.js';
import { toolPolicyService } from './tool-policy.js';
import { MemoryService, createMemoryService } from './memory/index.js';
import { AgentsMdService, createAgentsMdService, createProjectScanner } from './agents-md/index.js';
import { SubagentService, createSubagentService } from './subagents/index.js';
import { connectorService } from './connectors/connector-service.js';
import { connectorBridge } from './connector-bridge.js';
import { getSecretService } from './connectors/secret-service.js';
import type { SecretService } from './connectors/secret-service.js';
import { ConnectorOAuthService } from './connectors/connector-oauth-service.js';
import type { CronJob, CronRun, SystemEvent, ToolPolicy, ToolRule, ToolProfile, SessionType } from '@gemini-cowork/shared';
import type { CreateCronJobInput, UpdateCronJobInput, RunQueryOptions, CronServiceStatus } from './cron/types.js';
import type {
  IPCRequest,
  IPCResponse,
  CreateSessionParams,
  SendMessageParams,
  RespondPermissionParams,
  SetApprovalModeParams,
  RespondQuestionParams,
  StopGenerationParams,
  GetSessionParams,
  DeleteSessionParams,
  LoadMemoryParams,
  SaveMemoryParams,
  MemoryEntry,
  SetModelsParams,
  // New Deep Memory System params
  MemoryCreateParams,
  MemoryReadParams,
  MemoryUpdateParams,
  MemoryDeleteParams,
  MemoryListParams,
  MemorySearchParams,
  MemoryGetRelevantParams,
  MemoryGroupCreateParams,
  MemoryGroupDeleteParams,
  // AGENTS.md params
  AgentsMdLoadParams,
  AgentsMdGenerateParams,
  AgentsMdUpdateSectionParams,
} from './types.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

// ============================================================================
// Service Instances (lazily initialized per working directory)
// ============================================================================

const memoryServices: Map<string, MemoryService> = new Map();
const agentsMdServices: Map<string, AgentsMdService> = new Map();
let subagentService: SubagentService | null = null;
let appDataDirectory: string | null = null;

// Connector secret service (lazily initialized)
let connectorSecretService: SecretService | null = null;

// Connector OAuth service (lazily initialized)
let connectorOAuthService: ConnectorOAuthService | null = null;

/**
 * Get or create the SecretService for connectors.
 */
async function getConnectorSecretService(): Promise<SecretService> {
  if (!connectorSecretService) {
    connectorSecretService = await getSecretService();
  }
  return connectorSecretService;
}

/**
 * Get or create the ConnectorOAuthService.
 */
async function getConnectorOAuthService(): Promise<ConnectorOAuthService> {
  if (!connectorOAuthService) {
    const secretService = await getConnectorSecretService();
    connectorOAuthService = new ConnectorOAuthService(secretService);
  }
  return connectorOAuthService;
}

/**
 * Get or create a MemoryService for the given working directory.
 */
async function getMemoryService(workingDirectory: string): Promise<MemoryService> {
  let service = memoryServices.get(workingDirectory);
  if (!service) {
    service = createMemoryService(workingDirectory);
    await service.initialize();
    memoryServices.set(workingDirectory, service);
  }
  return service;
}

/**
 * Get or create an AgentsMdService for the given working directory.
 */
function getAgentsMdService(workingDirectory: string): AgentsMdService {
  let service = agentsMdServices.get(workingDirectory);
  if (!service) {
    service = createAgentsMdService();
    agentsMdServices.set(workingDirectory, service);
  }
  return service;
}

/**
 * Get or create the SubagentService.
 */
async function getSubagentService(): Promise<SubagentService> {
  if (!subagentService) {
    // Use explicit app data dir if available, otherwise default to ~/.cowork
    const appDataDir = appDataDirectory || join(homedir(), '.cowork');
    subagentService = createSubagentService(appDataDir);
    await subagentService.initialize();
  }
  return subagentService;
}

// ============================================================================
// IPC Handler
// ============================================================================

type CommandHandler = (params: Record<string, unknown>) => Promise<unknown>;

const handlers: Map<string, CommandHandler> = new Map();

/**
 * Register a command handler.
 */
function registerHandler(command: string, handler: CommandHandler): void {
  handlers.set(command, handler);
}

/**
 * Handle an IPC request.
 */
export async function handleRequest(request: IPCRequest): Promise<IPCResponse> {
  const handler = handlers.get(request.command);

  if (!handler) {
    return {
      id: request.id,
      success: false,
      error: `Unknown command: ${request.command}`,
    };
  }

  try {
    const result = await handler(request.params);
    return {
      id: request.id,
      success: true,
      result,
    };
  } catch (error) {
    return {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

// Set API key
registerHandler('set_api_key', async (params) => {
  const { apiKey } = params as { apiKey: string };
  agentRunner.setApiKey(apiKey);
  return { success: true };
});

// Check if ready
registerHandler('is_ready', async () => {
  return { ready: agentRunner.isReady() };
});

// Create session
registerHandler('create_session', async (params) => {
  const p = params as unknown as CreateSessionParams;
  if (!p.workingDirectory) throw new Error('workingDirectory is required');
  const session = await agentRunner.createSession(p.workingDirectory, p.model, p.title, p.type);
  return session;
});

// Send message
registerHandler('send_message', async (params) => {
  const p = params as unknown as SendMessageParams;
  if (!p.sessionId || !p.content) throw new Error('sessionId and content are required');
  await agentRunner.sendMessage(p.sessionId, p.content, p.attachments);
  return { success: true };
});

// Respond to permission
registerHandler('respond_permission', async (params) => {
  const p = params as unknown as RespondPermissionParams;
  if (!p.sessionId || !p.permissionId || !p.decision) {
    throw new Error('sessionId, permissionId, and decision are required');
  }
  agentRunner.respondToPermission(p.sessionId, p.permissionId, p.decision);
  return { success: true };
});

// Set approval mode
registerHandler('set_approval_mode', async (params) => {
  const p = params as unknown as SetApprovalModeParams;
  if (!p.sessionId || !p.mode) {
    throw new Error('sessionId and mode are required');
  }
  agentRunner.setApprovalMode(p.sessionId, p.mode);
  return { success: true };
});

// Update model catalog (context window + ordering)
registerHandler('set_models', async (params) => {
  const p = params as unknown as SetModelsParams;
  if (!p.models || !Array.isArray(p.models)) {
    throw new Error('models are required');
  }
  agentRunner.setModelCatalog(p.models);
  return { success: true };
});

// Stop generation
registerHandler('stop_generation', async (params) => {
  const p = params as unknown as StopGenerationParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  agentRunner.stopGeneration(p.sessionId);
  return { success: true };
});

// Respond to question
registerHandler('respond_question', async (params) => {
  const p = params as unknown as RespondQuestionParams;
  if (!p.sessionId || !p.questionId) {
    throw new Error('sessionId and questionId are required');
  }
  agentRunner.respondToQuestion(p.sessionId, p.questionId, p.answer);
  return { success: true };
});

// Sync skills
registerHandler('set_skills', async (params) => {
  const p = params as { skills: Array<{ id: string; name: string; path: string; description?: string; enabled?: boolean }> };
  if (!p.skills) throw new Error('skills are required');
  await agentRunner.setSkills(p.skills);
  return { success: true };
});

// Set specialized models
registerHandler('set_specialized_models', async (params) => {
  const p = params as {
    models: {
      imageGeneration: string;
      videoGeneration: string;
      computerUse: string;
    };
  };
  if (!p.models) throw new Error('models are required');
  agentRunner.setSpecializedModels(p.models);
  return { success: true };
});

// Load Gemini CLI extensions
registerHandler('load_gemini_extensions', async () => {
  return loadGeminiExtensions();
});

// List sessions
registerHandler('list_sessions', async () => {
  return agentRunner.listSessions();
});

// Get session
registerHandler('get_session', async (params) => {
  const p = params as unknown as GetSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  const session = agentRunner.getSession(p.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${p.sessionId}`);
  }
  return session;
});

// Delete session
registerHandler('delete_session', async (params) => {
  const p = params as unknown as DeleteSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  const success = await agentRunner.deleteSession(p.sessionId);
  return { success };
});

// Update session title
registerHandler('update_session_title', async (params) => {
  const p = params as { sessionId: string; title: string };
  if (!p.sessionId || !p.title) throw new Error('sessionId and title are required');
  await agentRunner.updateSessionTitle(p.sessionId, p.title);
  return { success: true };
});

// Update session working directory
registerHandler('update_session_working_directory', async (params) => {
  const p = params as { sessionId: string; workingDirectory: string };
  if (!p.sessionId || !p.workingDirectory) throw new Error('sessionId and workingDirectory are required');
  await agentRunner.updateSessionWorkingDirectory(p.sessionId, p.workingDirectory);
  return { success: true };
});

// Update session last accessed time
registerHandler('update_session_last_accessed', async (params) => {
  const p = params as { sessionId: string };
  if (!p.sessionId) throw new Error('sessionId is required');
  await agentRunner.updateSessionLastAccessed(p.sessionId);
  return { success: true };
});

// Get tasks
registerHandler('get_tasks', async (params) => {
  const p = params as unknown as GetSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  return agentRunner.getTasks(p.sessionId);
});

// Get artifacts
registerHandler('get_artifacts', async (params) => {
  const p = params as unknown as GetSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  return agentRunner.getArtifacts(p.sessionId);
});

// Get context usage
registerHandler('get_context_usage', async (params) => {
  const p = params as unknown as GetSessionParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  return agentRunner.getContextUsage(p.sessionId);
});

// Load memory from GEMINI.md
registerHandler('load_memory', async (params) => {
  const p = params as unknown as LoadMemoryParams;
  if (!p.workingDirectory) throw new Error('workingDirectory is required');
  const workingDirectory = p.workingDirectory;
  const memoryPath = join(workingDirectory, 'GEMINI.md');

  if (!existsSync(memoryPath)) {
    return { entries: [] };
  }

  try {
    const content = await readFile(memoryPath, 'utf-8');
    const entries = parseGeminiMd(content);
    return { entries };
  } catch (error) {
    throw new Error(`Failed to load memory: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Save memory to GEMINI.md
registerHandler('save_memory', async (params) => {
  const p = params as unknown as SaveMemoryParams;
  if (!p.workingDirectory || !p.entries) {
    throw new Error('workingDirectory and entries are required');
  }
  const memoryPath = join(p.workingDirectory, 'GEMINI.md');
  const entries = p.entries;

  try {
    // Ensure directory exists
    const dir = dirname(memoryPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const content = generateGeminiMd(entries);
    await writeFile(memoryPath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to save memory: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Ping (for health checks)
registerHandler('ping', async () => {
  return { pong: true, timestamp: Date.now() };
});

// Initialize persistence with app data directory
registerHandler('initialize', async (params) => {
  const { appDataDir } = params as { appDataDir: string };
  if (!appDataDir) {
    throw new Error('appDataDir is required');
  }
  // Store app data directory for service initialization
  appDataDirectory = appDataDir;
  const result = await agentRunner.initialize(appDataDir);

  // Initialize integration bridge (messaging platforms) - non-fatal
  try {
    const { integrationBridge } = await import('./integrations/index.js');
    await integrationBridge.initialize(agentRunner);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[init] Integration bridge init warning: ${msg}\n`);
  }

  return { success: true, sessionsRestored: result.sessionsRestored };
});

// Get initialization status for frontend coordination
registerHandler('get_initialization_status', async () => {
  return agentRunner.getInitializationStatus();
});

// Verify persistence health
registerHandler('verify_persistence', async () => {
  return agentRunner.verifyPersistence();
});

// ============================================================================
// Skill Management
// ============================================================================

// Discover all skills from all sources
registerHandler('discover_skills', async (params) => {
  const p = params as { workingDirectory?: string };
  const skills = await skillService.discoverAll(p.workingDirectory);
  return { skills };
});

// Install a skill from bundled to managed directory
registerHandler('install_skill', async (params) => {
  const p = params as { skillId: string };
  if (!p.skillId) throw new Error('skillId is required');
  await skillService.installSkill(p.skillId);
  return { success: true };
});

// Uninstall a skill from managed directory
registerHandler('uninstall_skill', async (params) => {
  const p = params as { skillId: string };
  if (!p.skillId) throw new Error('skillId is required');
  await skillService.uninstallSkill(p.skillId);
  return { success: true };
});

// Check skill eligibility
registerHandler('check_skill_eligibility', async (params) => {
  const p = params as { skillId: string };
  if (!p.skillId) throw new Error('skillId is required');
  const skill = await skillService.getSkill(p.skillId);
  if (!skill) throw new Error(`Skill not found: ${p.skillId}`);
  const eligibility = await checkSkillEligibility(skill);
  return eligibility;
});

// Get skill content
registerHandler('get_skill_content', async (params) => {
  const p = params as { skillId: string };
  if (!p.skillId) throw new Error('skillId is required');
  const content = await skillService.loadSkillContent(p.skillId);
  return { content };
});

// Create a new custom skill
registerHandler('create_skill', async (params) => {
  const p = params as {
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
  };

  // Validate required fields
  if (!p.name) {
    throw new Error('name is required');
  }
  if (!p.description) {
    throw new Error('description is required');
  }
  if (!p.content) {
    throw new Error('content is required');
  }

  const skillId = await skillService.createSkill({
    name: p.name,
    description: p.description,
    emoji: p.emoji,
    category: p.category,
    content: p.content,
    requirements: p.requirements,
  });

  return { skillId };
});

// ============================================================================
// Command Management (Slash Commands Marketplace)
// ============================================================================

// Discover all commands from all sources
registerHandler('discover_commands', async () => {
  const commands = await commandService.discoverAll();
  return { commands };
});

// Install a command from bundled to managed directory
registerHandler('install_command', async (params) => {
  const p = params as { commandId: string };
  if (!p.commandId) throw new Error('commandId is required');
  await commandService.installCommand(p.commandId);
  return { success: true };
});

// Uninstall a command from managed directory
registerHandler('uninstall_command', async (params) => {
  const p = params as { commandId: string };
  if (!p.commandId) throw new Error('commandId is required');
  await commandService.uninstallCommand(p.commandId);
  return { success: true };
});

// Get command content
registerHandler('get_command_content', async (params) => {
  const p = params as { commandId: string };
  if (!p.commandId) throw new Error('commandId is required');
  const content = await commandService.loadCommandContent(p.commandId);
  return { content };
});

// Create a new custom command
registerHandler('create_command', async (params) => {
  const p = params as {
    name: string;
    displayName: string;
    description: string;
    aliases?: string[];
    category: CommandCategory;
    icon?: string;
    priority?: number;
    content: string;
    emoji?: string;
  };

  // Validate required fields
  if (!p.name) {
    throw new Error('name is required');
  }
  if (!p.displayName) {
    throw new Error('displayName is required');
  }
  if (!p.description) {
    throw new Error('description is required');
  }
  if (!p.content) {
    throw new Error('content is required');
  }
  if (!p.category) {
    throw new Error('category is required');
  }

  const commandId = await commandService.createCommand({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    aliases: p.aliases,
    category: p.category,
    icon: p.icon,
    priority: p.priority,
    content: p.content,
    emoji: p.emoji,
  });

  return { commandId };
});

// ============================================================================
// GEMINI.md Parsing
// ============================================================================

const CATEGORY_HEADERS: Record<string, MemoryEntry['category']> = {
  'project context': 'project',
  'preferences': 'preferences',
  'code patterns': 'patterns',
  'additional context': 'context',
  'custom': 'custom',
};

function parseGeminiMd(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = content.split('\n');

  let currentCategory: MemoryEntry['category'] = 'project';
  let entryId = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for category headers
    const headerMatch = line.match(/^##\s+(.+)$/i);
    if (headerMatch) {
      const headerText = headerMatch[1].toLowerCase();
      for (const [key, category] of Object.entries(CATEGORY_HEADERS)) {
        if (headerText.includes(key)) {
          currentCategory = category;
          break;
        }
      }
      continue;
    }

    // Check for list items
    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      entries.push({
        id: `mem_${entryId++}`,
        category: currentCategory,
        content: listMatch[1],
        createdAt: Date.now(),
        source: 'user',
      });
    }
  }

  return entries;
}

function generateGeminiMd(entries: MemoryEntry[]): string {
  const sections: Record<MemoryEntry['category'], string[]> = {
    project: [],
    preferences: [],
    patterns: [],
    context: [],
    custom: [],
  };

  // Group entries by category
  for (const entry of entries) {
    sections[entry.category].push(`- ${entry.content}`);
  }

  // Build markdown
  const lines: string[] = ['# Project Memory', ''];

  if (sections.project.length > 0) {
    lines.push('## Project Context', ...sections.project, '');
  }

  if (sections.preferences.length > 0) {
    lines.push('## Preferences', ...sections.preferences, '');
  }

  if (sections.patterns.length > 0) {
    lines.push('## Code Patterns', ...sections.patterns, '');
  }

  if (sections.context.length > 0) {
    lines.push('## Additional Context', ...sections.context, '');
  }

  if (sections.custom.length > 0) {
    lines.push('## Custom', ...sections.custom, '');
  }

  return lines.join('\n');
}

// ============================================================================
// Cron Command Handlers
// ============================================================================

// List all cron jobs
registerHandler('cron_list_jobs', async (): Promise<CronJob[]> => {
  return cronService.listJobs();
});

// Get single cron job
registerHandler('cron_get_job', async (params): Promise<CronJob | null> => {
  const { jobId } = params as { jobId: string };
  if (!jobId) throw new Error('jobId is required');
  return cronService.getJob(jobId);
});

// Create cron job
registerHandler('cron_create_job', async (params): Promise<CronJob> => {
  const input = params as unknown as CreateCronJobInput;
  if (!input.name || !input.prompt || !input.schedule) {
    throw new Error('name, prompt, and schedule are required');
  }
  return cronService.createJob(input);
});

// Update cron job
registerHandler('cron_update_job', async (params): Promise<CronJob> => {
  const { jobId, updates } = params as { jobId: string; updates: UpdateCronJobInput };
  if (!jobId) throw new Error('jobId is required');
  return cronService.updateJob(jobId, updates);
});

// Delete cron job
registerHandler('cron_delete_job', async (params): Promise<void> => {
  const { jobId } = params as { jobId: string };
  if (!jobId) throw new Error('jobId is required');
  await cronService.deleteJob(jobId);
});

// Pause cron job
registerHandler('cron_pause_job', async (params): Promise<CronJob> => {
  const { jobId } = params as { jobId: string };
  if (!jobId) throw new Error('jobId is required');
  return cronService.pauseJob(jobId);
});

// Resume cron job
registerHandler('cron_resume_job', async (params): Promise<CronJob> => {
  const { jobId } = params as { jobId: string };
  if (!jobId) throw new Error('jobId is required');
  return cronService.resumeJob(jobId);
});

// Trigger cron job immediately
registerHandler('cron_trigger_job', async (params): Promise<CronRun> => {
  const { jobId } = params as { jobId: string };
  if (!jobId) throw new Error('jobId is required');
  return cronService.triggerJob(jobId);
});

// Get run history for job
registerHandler('cron_get_runs', async (params): Promise<CronRun[]> => {
  const { jobId, options } = params as { jobId: string; options?: RunQueryOptions };
  if (!jobId) throw new Error('jobId is required');
  return cronService.getJobRuns(jobId, options);
});

// Get cron service status
registerHandler('cron_get_status', async (): Promise<CronServiceStatus> => {
  return cronService.getStatus();
});

// ============================================================================
// Heartbeat Command Handlers
// ============================================================================

// Get heartbeat status
registerHandler('heartbeat_get_status', async () => {
  return heartbeatService.getStatus();
});

// Start heartbeat service
registerHandler('heartbeat_start', async (): Promise<void> => {
  heartbeatService.start();
});

// Stop heartbeat service
registerHandler('heartbeat_stop', async (): Promise<void> => {
  heartbeatService.stop();
});

// Configure heartbeat
registerHandler('heartbeat_configure', async (params): Promise<void> => {
  const config = params as {
    enabled?: boolean;
    intervalMs?: number;
    systemEventsEnabled?: boolean;
    cronEnabled?: boolean;
  };
  await heartbeatService.configure(config);
});

// Wake heartbeat (trigger immediate processing)
registerHandler('heartbeat_wake', async (params): Promise<void> => {
  const { mode } = params as { mode?: 'now' | 'next-heartbeat' };
  heartbeatService.wake(mode || 'now');
});

// Get queued events
registerHandler('heartbeat_get_events', async (): Promise<SystemEvent[]> => {
  return heartbeatService.getQueuedEvents();
});

// ============================================================================
// Tool Policy Command Handlers
// ============================================================================

// Get current policy
registerHandler('policy_get', async (): Promise<ToolPolicy> => {
  await toolPolicyService.initialize();
  return toolPolicyService.getPolicy();
});

// Update policy
registerHandler('policy_update', async (params): Promise<ToolPolicy> => {
  await toolPolicyService.initialize();
  const updates = params as Partial<ToolPolicy>;
  return toolPolicyService.updatePolicy(updates);
});

// Set profile
registerHandler('policy_set_profile', async (params): Promise<ToolPolicy> => {
  const { profile } = params as { profile: ToolProfile };
  if (!profile) throw new Error('profile is required');
  await toolPolicyService.initialize();
  return toolPolicyService.setProfile(profile);
});

// Add rule
registerHandler('policy_add_rule', async (params): Promise<ToolRule> => {
  await toolPolicyService.initialize();
  const rule = params as Omit<ToolRule, 'priority'>;
  return toolPolicyService.addRule(rule);
});

// Remove rule
registerHandler('policy_remove_rule', async (params): Promise<void> => {
  const { index } = params as { index: number };
  if (index === undefined) throw new Error('index is required');
  await toolPolicyService.initialize();
  await toolPolicyService.removeRule(index);
});

// Evaluate tool (for testing/preview)
registerHandler('policy_evaluate', async (params) => {
  const { toolName, arguments: args, sessionId, sessionType, provider } = params as {
    toolName: string;
    arguments: Record<string, unknown>;
    sessionId: string;
    sessionType: string;
    provider?: string;
  };
  if (!toolName || !sessionId || !sessionType) {
    throw new Error('toolName, sessionId, and sessionType are required');
  }
  await toolPolicyService.initialize();
  return toolPolicyService.evaluate({
    toolName,
    arguments: args || {},
    sessionId,
    sessionType: sessionType as SessionType,
    provider,
  });
});

// Register MCP tools
registerHandler('policy_register_mcp_tools', async (params): Promise<void> => {
  const { tools } = params as { tools: string[] };
  if (!tools) throw new Error('tools array is required');
  await toolPolicyService.initialize();
  toolPolicyService.registerMcpTools(tools);
});

// Reset policy to defaults
registerHandler('policy_reset', async (): Promise<ToolPolicy> => {
  await toolPolicyService.initialize();
  return toolPolicyService.setProfile('coding'); // Reset to default profile
});

// ============================================================================
// Chrome Extension Command Handlers
// ============================================================================

// ============================================================================
// Deep Memory System Command Handlers (New)
// ============================================================================

// Initialize memory service for a working directory
registerHandler('deep_memory_init', async (params) => {
  const p = params as unknown as { workingDirectory: string };
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }
  await getMemoryService(p.workingDirectory);
  return { success: true };
});

// Create a new memory
registerHandler('deep_memory_create', async (params) => {
  const p = params as unknown as MemoryCreateParams;
  if (!p.workingDirectory || !p.title || !p.content || !p.group) {
    throw new Error('workingDirectory, title, content, and group are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const memory = await service.create({
    title: p.title,
    content: p.content,
    group: p.group,
    tags: p.tags || [],
    source: p.source || 'manual',
    confidence: p.confidence,
  });
  return memory;
});

// Read a memory by ID
registerHandler('deep_memory_read', async (params) => {
  const p = params as unknown as MemoryReadParams;
  if (!p.workingDirectory || !p.memoryId) {
    throw new Error('workingDirectory and memoryId are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const memory = await service.read(p.memoryId);
  if (!memory) {
    throw new Error(`Memory not found: ${p.memoryId}`);
  }
  return memory;
});

// Update a memory
registerHandler('deep_memory_update', async (params) => {
  const p = params as unknown as MemoryUpdateParams;
  if (!p.workingDirectory || !p.memoryId) {
    throw new Error('workingDirectory and memoryId are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const memory = await service.update(p.memoryId, {
    title: p.title,
    content: p.content,
    group: p.group,
    tags: p.tags,
  });
  if (!memory) {
    throw new Error(`Memory not found: ${p.memoryId}`);
  }
  return memory;
});

// Delete a memory
registerHandler('deep_memory_delete', async (params) => {
  const p = params as unknown as MemoryDeleteParams;
  if (!p.workingDirectory || !p.memoryId) {
    throw new Error('workingDirectory and memoryId are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const success = await service.delete(p.memoryId);
  return { success };
});

// List all memories or by group
registerHandler('deep_memory_list', async (params) => {
  const p = params as unknown as MemoryListParams;
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }
  const service = await getMemoryService(p.workingDirectory);
  if (p.group) {
    const memories = await service.getMemoriesByGroup(p.group);
    return { memories };
  }
  const memories = await service.getAll();
  return { memories };
});

// Search memories
registerHandler('deep_memory_search', async (params) => {
  const p = params as unknown as MemorySearchParams;
  if (!p.workingDirectory || !p.query) {
    throw new Error('workingDirectory and query are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const memories = await service.search({ query: p.query, limit: p.limit || 20 });
  return { memories };
});

// Get relevant memories for context
registerHandler('deep_memory_get_relevant', async (params) => {
  const p = params as unknown as MemoryGetRelevantParams;
  if (!p.workingDirectory || !p.context) {
    throw new Error('workingDirectory and context are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const memories = await service.getRelevantMemories(p.context, p.limit || 5);
  return { memories };
});

// List memory groups
registerHandler('deep_memory_list_groups', async (params) => {
  const p = params as unknown as { workingDirectory: string };
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const groups = await service.listGroups();
  return { groups };
});

// Create a memory group
registerHandler('deep_memory_create_group', async (params) => {
  const p = params as unknown as MemoryGroupCreateParams;
  if (!p.workingDirectory || !p.groupName) {
    throw new Error('workingDirectory and groupName are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  await service.createGroup(p.groupName);
  return { success: true };
});

// Delete a memory group
registerHandler('deep_memory_delete_group', async (params) => {
  const p = params as unknown as MemoryGroupDeleteParams;
  if (!p.workingDirectory || !p.groupName) {
    throw new Error('workingDirectory and groupName are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  await service.deleteGroup(p.groupName);
  return { success: true };
});

// Build memory prompt section for injection
registerHandler('deep_memory_build_prompt', async (params) => {
  const p = params as unknown as { workingDirectory: string; sessionContext?: string };
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const promptSection = await service.buildMemoryPromptSection(p.sessionContext);
  return { promptSection };
});

// ============================================================================
// AGENTS.md Command Handlers
// ============================================================================

// Load AGENTS.md configuration
registerHandler('agents_md_load', async (params) => {
  const p = params as unknown as AgentsMdLoadParams;
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }
  const service = getAgentsMdService(p.workingDirectory);
  const config = await service.parse(p.workingDirectory);
  if (!config) {
    return { exists: false, config: null };
  }
  return { exists: true, config };
});

// Generate AGENTS.md from project scan
registerHandler('agents_md_generate', async (params) => {
  const p = params as unknown as AgentsMdGenerateParams;
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }

  const agentsMdPath = join(p.workingDirectory, 'AGENTS.md');
  if (existsSync(agentsMdPath) && !p.force) {
    throw new Error('AGENTS.md already exists. Use force: true to overwrite.');
  }

  const service = getAgentsMdService(p.workingDirectory);
  const content = await service.generate(p.workingDirectory);

  await writeFile(agentsMdPath, content, 'utf-8');

  return {
    success: true,
    path: agentsMdPath,
    content,
  };
});

// Convert AGENTS.md to system prompt addition
registerHandler('agents_md_to_prompt', async (params) => {
  const p = params as unknown as AgentsMdLoadParams;
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }
  const service = getAgentsMdService(p.workingDirectory);
  const config = await service.parse(p.workingDirectory);
  if (!config) {
    return { promptAddition: '' };
  }
  const promptAddition = service.toSystemPrompt(config);
  return { promptAddition };
});

// Update a specific section in AGENTS.md
registerHandler('agents_md_update_section', async (params) => {
  const p = params as unknown as AgentsMdUpdateSectionParams;
  if (!p.workingDirectory || !p.section || p.content === undefined) {
    throw new Error('workingDirectory, section, and content are required');
  }
  const service = getAgentsMdService(p.workingDirectory);
  await service.updateSection(p.workingDirectory, p.section, p.content);
  return { success: true };
});

// Validate AGENTS.md content
registerHandler('agents_md_validate', async (params) => {
  const p = params as unknown as { workingDirectory: string; content?: string };
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }

  let content = p.content;
  if (!content) {
    const agentsMdPath = join(p.workingDirectory, 'AGENTS.md');
    if (!existsSync(agentsMdPath)) {
      return { valid: false, errors: ['AGENTS.md does not exist'] };
    }
    content = await readFile(agentsMdPath, 'utf-8');
  }

  const service = getAgentsMdService(p.workingDirectory);
  const result = service.validate(content);
  return result;
});

// Scan project and return info (without generating AGENTS.md)
registerHandler('agents_md_scan_project', async (params) => {
  const p = params as unknown as { workingDirectory: string };
  if (!p.workingDirectory) {
    throw new Error('workingDirectory is required');
  }
  const scanner = createProjectScanner(p.workingDirectory);
  const projectInfo = await scanner.scan();
  return projectInfo;
});

// ============================================================================
// Subagent System Handlers
// ============================================================================

// List available subagents (discovers from all sources)
// workingDirectory is OPTIONAL - only needed for workspace-specific subagents
registerHandler('subagent_list', async (params) => {
  const p = params as unknown as { workingDirectory?: string };
  const service = await getSubagentService();
  const subagents = await service.discoverAll(p.workingDirectory);
  const subagentsWithStatus = subagents.map(sub => ({
    ...sub,
    installed: service.isInstalled(sub.name, p.workingDirectory),
  }));
  return { subagents: subagentsWithStatus };
});

// Install a subagent (copy from bundled to managed)
registerHandler('subagent_install', async (params) => {
  const p = params as unknown as { subagentName: string };
  if (!p.subagentName) {
    throw new Error('subagentName is required');
  }
  const service = await getSubagentService();
  await service.discoverAll();
  await service.installSubagent(p.subagentName);
  return { success: true };
});

// Uninstall a subagent (remove from managed)
registerHandler('subagent_uninstall', async (params) => {
  const p = params as unknown as { subagentName: string };
  if (!p.subagentName) {
    throw new Error('subagentName is required');
  }
  const service = await getSubagentService();
  await service.discoverAll();
  await service.uninstallSubagent(p.subagentName);
  return { success: true };
});

// Check if a subagent is installed
registerHandler('subagent_is_installed', async (params) => {
  const p = params as unknown as { subagentName: string; workingDirectory?: string };
  if (!p.subagentName) {
    throw new Error('subagentName is required');
  }
  const service = await getSubagentService();
  return { installed: service.isInstalled(p.subagentName, p.workingDirectory) };
});

// Get a specific subagent
registerHandler('subagent_get', async (params) => {
  const p = params as unknown as { subagentName: string; workingDirectory?: string };
  if (!p.subagentName) {
    throw new Error('subagentName is required');
  }
  const service = await getSubagentService();
  await service.discoverAll(p.workingDirectory);
  const subagent = service.getSubagent(p.subagentName);
  if (!subagent) {
    throw new Error(`Subagent not found: ${p.subagentName}`);
  }
  return subagent.manifest;
});

// Create a custom subagent
registerHandler('subagent_create', async (params) => {
  const p = params as unknown as {
    name: string;
    displayName: string;
    description: string;
    systemPrompt: string;
    category?: string;
    tags?: string[];
    tools?: string[];
    model?: string;
  };

  if (!p.name || !p.displayName || !p.description || !p.systemPrompt) {
    throw new Error('name, displayName, description, and systemPrompt are required');
  }

  const service = await getSubagentService();
  const subagentName = await service.createSubagent({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    systemPrompt: p.systemPrompt,
    category: (p.category as 'research' | 'development' | 'analysis' | 'productivity' | 'custom') || 'custom',
    tags: p.tags,
    tools: p.tools,
    model: p.model,
  });

  return { subagentName };
});

// Get list of installed subagent names
registerHandler('subagent_list_installed', async () => {
  const service = await getSubagentService();
  const names = await service.getInstalledSubagentNames();
  return { subagents: names };
});

// Get subagent configs for middleware (replaces hardcoded function)
registerHandler('subagent_get_configs', async (params) => {
  const p = params as unknown as { sessionModel?: string; workingDirectory?: string };
  const service = await getSubagentService();
  await service.discoverAll(p.workingDirectory);
  const configs = await service.getSubagentConfigs(p.sessionModel);
  return { configs };
});

// ============================================================================
// Connector System Handlers
// ============================================================================

// Discover all connectors from all sources
registerHandler('discover_connectors', async (params) => {
  const p = params as { workingDirectory?: string };
  const connectors = await connectorService.discoverAll(p.workingDirectory);
  return { connectors };
});

// Install a connector from bundled to managed directory
registerHandler('install_connector', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');
  await connectorService.installConnector(p.connectorId);
  return { success: true };
});

// Uninstall a connector from managed directory
registerHandler('uninstall_connector', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  // Disconnect first if connected
  if (connectorBridge.isConnected(p.connectorId)) {
    await connectorBridge.disconnect(p.connectorId);
  }

  // Delete secrets
  const secretService = await getConnectorSecretService();
  await secretService.deleteAllSecrets(p.connectorId);

  // Uninstall
  await connectorService.uninstallConnector(p.connectorId);
  return { success: true };
});

// Connect to a connector's MCP server
registerHandler('connect_connector', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  const connector = await connectorService.getConnector(p.connectorId);
  if (!connector) throw new Error(`Connector not found: ${p.connectorId}`);

  const result = await connectorBridge.connect(connector);

  return {
    success: true,
    tools: result.tools || [],
    resources: result.resources || [],
    prompts: result.prompts || [],
  };
});

// Disconnect from a connector
registerHandler('disconnect_connector', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  await connectorBridge.disconnect(p.connectorId);
  return { success: true };
});

// Reconnect to a connector
registerHandler('reconnect_connector', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  const connector = await connectorService.getConnector(p.connectorId);
  if (!connector) throw new Error(`Connector not found: ${p.connectorId}`);

  const result = await connectorBridge.reconnect(connector);

  return {
    success: true,
    tools: result.tools || [],
    resources: result.resources || [],
    prompts: result.prompts || [],
  };
});

// Configure connector secrets
registerHandler('configure_connector_secrets', async (params) => {
  const p = params as { connectorId: string; secrets: Record<string, string> };
  if (!p.connectorId) throw new Error('connectorId is required');
  if (!p.secrets) throw new Error('secrets is required');

  const secretService = await getConnectorSecretService();
  await secretService.setSecrets(p.connectorId, p.secrets);

  return { success: true };
});

// Get secrets status for a connector
registerHandler('get_connector_secrets_status', async (params) => {
  const p = params as { connectorId: string; secretDefs?: SecretDefinition[] };
  if (!p.connectorId) throw new Error('connectorId is required');

  const secretService = await getConnectorSecretService();
  const status = await secretService.getSecretsStatus(p.connectorId, p.secretDefs || []);
  return status;
});

// Get connector status
registerHandler('get_connector_status', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  const isConnected = connectorBridge.isConnected(p.connectorId);
  const status = connectorBridge.getStatus(p.connectorId);
  const error = connectorBridge.getError(p.connectorId);

  // Get secrets status for the connector
  const connector = await connectorService.getConnector(p.connectorId);
  let secretsConfigured = true;
  if (connector?.auth.type === 'env') {
    const secretService = await getConnectorSecretService();
    const secretStatus = await secretService.getSecretsStatus(p.connectorId, connector.auth.secrets);
    secretsConfigured = secretStatus.configured;
  }

  return {
    connectorId: p.connectorId,
    isConnected,
    secretsConfigured,
    status,
    error,
  };
});

// Create a custom connector
registerHandler('create_connector', async (params) => {
  const p = params as {
    name: string;
    displayName: string;
    description: string;
    icon?: string;
    category?: string;
    tags?: string[];
    transport: {
      type: 'stdio' | 'http';
      command?: string;
      args?: string[];
      url?: string;
    };
    auth: {
      type: 'none' | 'env';
      secrets?: Array<{
        key: string;
        description: string;
        required: boolean;
      }>;
    };
  };

  if (!p.name) throw new Error('name is required');
  if (!p.displayName) throw new Error('displayName is required');
  if (!p.description) throw new Error('description is required');
  if (!p.transport) throw new Error('transport is required');

  const connectorId = await connectorService.createConnector(p as Parameters<typeof connectorService.createConnector>[0]);
  return { connectorId };
});

// Call a tool on a connector
registerHandler('connector_call_tool', async (params) => {
  const p = params as { connectorId: string; toolName: string; args?: Record<string, unknown> };
  if (!p.connectorId) throw new Error('connectorId is required');
  if (!p.toolName) throw new Error('toolName is required');

  const result = await connectorBridge.callTool(p.connectorId, p.toolName, p.args || {});
  return { result };
});

// Get all tools from all connected connectors
registerHandler('get_all_connector_tools', async () => {
  const tools = connectorBridge.getTools();
  return { tools };
});

// Get all connection states
registerHandler('get_all_connector_states', async () => {
  const manager = await connectorBridge.getManager();
  const connections = manager.getAllConnections();
  const states: Record<string, { status: string; error?: string }> = {};
  for (const [id, state] of connections) {
    states[id] = state;
  }
  return { states };
});

// Connect all enabled connectors
registerHandler('connect_all_connectors', async (params) => {
  const p = params as { connectorIds: string[] };
  if (!p.connectorIds || !Array.isArray(p.connectorIds)) {
    throw new Error('connectorIds array is required');
  }

  const results: Record<string, { success: boolean; error?: string }> = {};

  for (const connectorId of p.connectorIds) {
    try {
      const connector = await connectorService.getConnector(connectorId);
      if (!connector) {
        results[connectorId] = { success: false, error: 'Connector not found' };
        continue;
      }

      await connectorBridge.connect(connector);
      results[connectorId] = { success: true };
    } catch (error) {
      results[connectorId] = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { results };
});

// Disconnect all connectors
registerHandler('disconnect_all_connectors', async () => {
  await connectorBridge.disconnectAll();
  return { success: true };
});

// ============================================================================
// Connector OAuth Handlers
// ============================================================================

/**
 * Start OAuth flow for a connector.
 * Returns either a browser URL to open (authorization_code flow)
 * or device code info (device_code flow).
 */
registerHandler('start_connector_oauth_flow', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  const connector = await connectorService.getConnector(p.connectorId);
  if (!connector) throw new Error(`Connector not found: ${p.connectorId}`);

  if (connector.auth.type !== 'oauth') {
    throw new Error('Connector does not use OAuth authentication');
  }

  const oauthService = await getConnectorOAuthService();
  const result = await oauthService.startOAuthFlow(
    p.connectorId,
    connector.auth.provider,
    connector.auth.flow,
    connector.auth.scopes
  );

  return result;
});

/**
 * Poll for device code completion (Microsoft device_code flow).
 * Returns true if authorized, false if still pending.
 */
registerHandler('poll_oauth_device_code', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  const oauthService = await getConnectorOAuthService();
  const complete = await oauthService.pollDeviceCode(p.connectorId);

  return { complete };
});

/**
 * Get OAuth authentication status for a connector.
 * Returns whether authenticated and token expiration info.
 */
registerHandler('get_oauth_status', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  const oauthService = await getConnectorOAuthService();
  const status = await oauthService.getOAuthStatus(p.connectorId);

  return status;
});

/**
 * Refresh OAuth tokens if needed (when expired or about to expire).
 * Returns true if tokens were refreshed, false if still valid.
 */
registerHandler('refresh_oauth_tokens', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  const connector = await connectorService.getConnector(p.connectorId);
  if (!connector) throw new Error(`Connector not found: ${p.connectorId}`);

  if (connector.auth.type !== 'oauth') {
    throw new Error('Connector does not use OAuth authentication');
  }

  const oauthService = await getConnectorOAuthService();
  const refreshed = await oauthService.refreshTokensIfNeeded(p.connectorId);

  return { refreshed };
});

/**
 * Revoke OAuth tokens and clear stored credentials.
 */
registerHandler('revoke_oauth_tokens', async (params) => {
  const p = params as { connectorId: string };
  if (!p.connectorId) throw new Error('connectorId is required');

  // Clear all OAuth-related secrets for this connector
  const secretService = await getConnectorSecretService();
  await secretService.deleteSecret(p.connectorId, 'ACCESS_TOKEN');
  await secretService.deleteSecret(p.connectorId, 'REFRESH_TOKEN');
  await secretService.deleteSecret(p.connectorId, 'EXPIRES_AT');

  return { success: true };
});

// ============================================================================
// MCP Apps Handlers
// ============================================================================

/**
 * Get all MCP Apps from all connected connectors.
 * Apps are ui:// resources that provide interactive HTML interfaces.
 */
registerHandler('get_connector_apps', async () => {
  const manager = await connectorBridge.getManager();
  const apps = manager.getAllApps();
  return { apps };
});

/**
 * Get the HTML content for an MCP App.
 */
registerHandler('get_connector_app_content', async (params) => {
  const p = params as { connectorId: string; appUri: string };
  if (!p.connectorId) throw new Error('connectorId is required');
  if (!p.appUri) throw new Error('appUri is required');

  const manager = await connectorBridge.getManager();
  const content = await manager.getAppContent(p.connectorId, p.appUri);

  return { content };
});

/**
 * Call a tool from an MCP App iframe.
 * This handler forwards tool calls from the sandboxed iframe to the connector.
 */
registerHandler('call_connector_app_tool', async (params) => {
  const p = params as { connectorId: string; toolName: string; args?: Record<string, unknown> };
  if (!p.connectorId) throw new Error('connectorId is required');
  if (!p.toolName) throw new Error('toolName is required');

  const result = await connectorBridge.callTool(p.connectorId, p.toolName, p.args || {});
  return { result };
});

// ============================================================================
// Integration (Messaging Platform) Handlers
// ============================================================================

registerHandler('integration_list_statuses', async () => {
  const { integrationBridge } = await import('./integrations/index.js');
  return integrationBridge.getStatuses();
});

registerHandler('integration_connect', async (params) => {
  const { platform, config } = params as { platform: string; config: Record<string, string> };
  const validPlatforms = ['whatsapp', 'slack', 'telegram'];
  if (!platform || !validPlatforms.includes(platform)) {
    throw new Error(`Invalid platform: ${platform}. Must be one of: ${validPlatforms.join(', ')}`);
  }
  // Platform-specific config validation
  const safeConfig = config || {};
  if (platform === 'slack' && (!safeConfig.botToken || !safeConfig.appToken)) {
    throw new Error('Slack requires both botToken (xoxb-) and appToken (xapp-)');
  }
  if (platform === 'telegram' && !safeConfig.botToken) {
    throw new Error('Telegram requires a botToken from @BotFather');
  }
  const { integrationBridge } = await import('./integrations/index.js');
  await integrationBridge.connect(platform as any, safeConfig);
  return integrationBridge.getStatuses().find(s => s.platform === platform);
});

registerHandler('integration_disconnect', async (params) => {
  const { platform } = params as { platform: string };
  if (!platform || !['whatsapp', 'slack', 'telegram'].includes(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }
  const { integrationBridge } = await import('./integrations/index.js');
  await integrationBridge.disconnect(platform as any);
  return { success: true };
});

registerHandler('integration_get_status', async (params) => {
  const { platform } = params as { platform: string };
  const { integrationBridge } = await import('./integrations/index.js');
  const statuses = integrationBridge.getStatuses();
  return statuses.find(s => s.platform === platform) || { platform, connected: false };
});

registerHandler('integration_get_qr', async () => {
  const { integrationBridge } = await import('./integrations/index.js');
  return { qrDataUrl: integrationBridge.getWhatsAppQR() };
});

registerHandler('integration_configure', async (params) => {
  const { platform, config } = params as { platform: string; config: Record<string, string> };
  if (!platform || !['whatsapp', 'slack', 'telegram'].includes(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }
  const { integrationBridge } = await import('./integrations/index.js');
  const store = integrationBridge.getStore();
  await store.setConfig(platform as any, { platform: platform as any, enabled: true, config: config || {} });
  return { success: true };
});

registerHandler('integration_get_config', async (params) => {
  const { platform } = params as { platform: string };
  if (!platform) throw new Error('platform is required');
  const { integrationBridge } = await import('./integrations/index.js');
  const store = integrationBridge.getStore();
  return store.getConfig(platform as any);
});

registerHandler('integration_send_test', async (params) => {
  const { platform, message } = params as { platform: string; message?: string };
  if (!platform || !['whatsapp', 'slack', 'telegram'].includes(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }
  const { integrationBridge } = await import('./integrations/index.js');
  await integrationBridge.sendTestMessage(platform as any, message || 'Hello from Cowork!');
  return { success: true };
});

// ============================================================================
// Export
// ============================================================================

export { handlers, registerHandler };
