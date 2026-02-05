import { agentRunner } from './agent-runner.js';
import { mcpBridge } from './mcp-bridge.js';
import { loadGeminiExtensions } from './gemini-extensions.js';
import { skillService } from './skill-service.js';
import { checkSkillEligibility } from './eligibility-checker.js';
import { cronService } from './cron/index.js';
import { heartbeatService } from './heartbeat/service.js';
import { toolPolicyService } from './tool-policy.js';
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
} from './types.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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

// Sync MCP servers
registerHandler('set_mcp_servers', async (params) => {
  const p = params as { servers: Array<{ id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean; prompt?: string; contextFileName?: string }> };
  if (!p.servers) throw new Error('servers are required');
  await agentRunner.setMcpServers(p.servers);
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

// Call MCP tool
registerHandler('mcp_call_tool', async (params) => {
  const p = params as { serverId: string; toolName: string; args?: Record<string, unknown> };
  if (!p.serverId || !p.toolName) throw new Error('serverId and toolName are required');
  const result = await mcpBridge.callTool(p.serverId, p.toolName, p.args || {});
  return result;
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
  const result = await agentRunner.initialize(appDataDir);
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

import {
  openChromeExtensionsPage,
  openExtensionFolder,
  openExtensionInstallHelper,
  getExtensionPath
} from './tools/chrome-launcher.js';
import { chromeBridge } from './chrome-bridge.js';

// Check if Chrome extension is connected
registerHandler('chrome_extension_status', async () => {
  await chromeBridge.start();
  // Wait a bit for extension to connect if it's trying
  await new Promise(resolve => setTimeout(resolve, 500));
  return {
    connected: chromeBridge.isConnected(),
    port: chromeBridge.getPort(),
  };
});

// Open Chrome extensions page
registerHandler('chrome_open_extensions_page', async () => {
  return openChromeExtensionsPage();
});

// Open extension folder in file browser
registerHandler('chrome_open_extension_folder', async () => {
  return openExtensionFolder();
});

// Open both Chrome extensions page and extension folder (for easy install)
registerHandler('chrome_install_extension_helper', async () => {
  return openExtensionInstallHelper();
});

// Get extension folder path
registerHandler('chrome_get_extension_path', async () => {
  return { path: getExtensionPath() };
});

// ============================================================================
// Export
// ============================================================================

export { handlers, registerHandler };
