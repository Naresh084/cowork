// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { agentRunner } from './agent-runner.js';
import { loadGeminiExtensions } from './gemini-extensions.js';
import { skillService } from './skill-service.js';
import { checkSkillEligibility } from './eligibility-checker.js';
import { commandService } from './command-service.js';
import {
  SUPPORTED_PLATFORM_TYPES,
  sanitizeProviderErrorMessage,
  type CommandCategory,
  type PlatformType,
  type SecretDefinition,
} from '@cowork/shared';
import { cronService } from './cron/index.js';
import { workflowService } from './workflow/index.js';
import { heartbeatService } from './heartbeat/service.js';
import { toolPolicyService } from './tool-policy.js';
import { remoteAccessService } from './remote-access/service.js';
import type { RemoteTunnelMode } from './remote-access/types.js';
import { eventEmitter } from './event-emitter.js';
import { MemoryService, createMemoryService } from './memory/index.js';
import { AgentsMdService, createAgentsMdService, createProjectScanner } from './agents-md/index.js';
import { SubagentService, createSubagentService } from './subagents/index.js';
import { connectorService } from './connectors/connector-service.js';
import { connectorBridge } from './connector-bridge.js';
import { getSecretService } from './connectors/secret-service.js';
import type { SecretService } from './connectors/secret-service.js';
import { ConnectorOAuthService } from './connectors/connector-oauth-service.js';
import { securityAuditLog } from './security/audit-log.js';
import type {
  CronJob,
  CronRun,
  CreateWorkflowDraftInput,
  CreateWorkflowFromPromptInput,
  SystemEvent,
  ToolPolicy,
  ToolRule,
  ToolProfile,
  SessionType,
  UpdateWorkflowDraftInput,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowRun,
  WorkflowRunInput,
  WorkflowScheduledTaskSummary,
  WorkflowRunStatus,
  WorkflowValidationReport,
} from '@cowork/shared';
import { createHash } from 'crypto';
import type { CreateCronJobInput, UpdateCronJobInput, RunQueryOptions, CronServiceStatus } from './cron/types.js';
import type {
  IPCRequest,
  IPCResponse,
  CreateSessionParams,
  SendMessageV2Params,
  SendMessageParams,
  ResumeRunParams,
  GetRunTimelineParams,
  BranchSessionParams,
  MergeBranchParams,
  SetActiveBranchParams,
  RespondPermissionParams,
  SetApprovalModeParams,
  SetExecutionModeParams,
  RespondQuestionParams,
  StopGenerationParams,
  GetSessionParams,
  GetSessionChunkParams,
  ListSessionsPageParams,
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
  DeepMemoryQueryParams,
  DeepMemoryFeedbackParams,
  DeepMemoryExportBundleParams,
  DeepMemoryImportBundleParams,
  DeepMemoryMigrationReportParams,
  BenchmarkRunSuiteParams,
  DraftSkillFromSessionParams,
  CreateSkillFromSessionParams,
  RuntimeConfig,
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
let integrationInitCapabilitiesRefreshed = false;

// Connector secret service (lazily initialized)
let connectorSecretService: SecretService | null = null;

// Connector OAuth service (lazily initialized)
let connectorOAuthService: ConnectorOAuthService | null = null;
const VALID_INTEGRATION_PLATFORMS = new Set<PlatformType>(SUPPORTED_PLATFORM_TYPES);

function isValidIntegrationPlatform(value: string): value is PlatformType {
  return VALID_INTEGRATION_PLATFORMS.has(value as PlatformType);
}

async function refreshIntegrationCapabilities(reason: string): Promise<void> {
  const refreshFn = (agentRunner as unknown as {
    refreshIntegrationCapabilities?: (reason?: string) => Promise<void>;
  }).refreshIntegrationCapabilities;
  if (typeof refreshFn !== 'function') {
    return;
  }
  await refreshFn.call(agentRunner, reason);
}

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
  const dir = workingDirectory || homedir();
  let service = memoryServices.get(dir);
  if (!service) {
    service = createMemoryService(dir, { appDataDir: appDataDirectory || undefined });
    await service.initialize();
    memoryServices.set(dir, service);
  }
  return service;
}

function resolveMemoryWorkingDirectory(projectIdOrPath: string): string {
  if (!projectIdOrPath) return homedir();
  if (existsSync(projectIdOrPath)) {
    return projectIdOrPath;
  }

  const session = agentRunner.getSession(projectIdOrPath);
  if (session?.workingDirectory) {
    return session.workingDirectory;
  }

  const targetProjectId = projectIdOrPath.trim();
  if (targetProjectId.startsWith('project_')) {
    const sessions = agentRunner.listSessions();
    for (const candidate of sessions) {
      const digest = createHash('sha256')
        .update(candidate.workingDirectory.toLowerCase())
        .digest('hex')
        .slice(0, 16);
      if (`project_${digest}` === targetProjectId) {
        return candidate.workingDirectory;
      }
    }
  }

  return projectIdOrPath;
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

async function ensureRemoteAccessInitialized(): Promise<void> {
  const baseDir = appDataDirectory && appDataDirectory.trim() ? appDataDirectory : join(homedir(), '.cowork');
  await remoteAccessService.initialize(baseDir);
}

// ============================================================================
// IPC Handler
// ============================================================================

type CommandHandler = (params: Record<string, unknown>) => Promise<unknown>;

const handlers: Map<string, CommandHandler> = new Map();
const IDEMPOTENCY_TTL_MS = 15 * 60 * 1000;
const SECURITY_AUDIT_COMMANDS = new Set([
  'set_runtime_config',
  'set_approval_mode',
  'set_execution_mode',
  'set_tool_policy_profile',
  'set_tool_policy',
  'configure_connector_secrets',
  'connect_connector',
  'disconnect_connector',
  'reconnect_connector',
  'start_connector_oauth_flow',
  'poll_oauth_device_code',
  'refresh_oauth_tokens',
  'revoke_oauth_tokens',
  'run_start_v2',
  'run_resume_from_checkpoint',
  'connector_call_tool',
  'connect_all_connectors',
  'disconnect_all_connectors',
]);
const idempotencyStore: Map<
  string,
  { createdAt: number; success: boolean; result?: unknown; error?: string }
> = new Map();

function getErrorMessage(error: unknown): string {
  return sanitizeProviderErrorMessage(error instanceof Error ? error.message : String(error));
}

function cleanupIdempotencyStore(nowMs: number): void {
  for (const [key, value] of idempotencyStore.entries()) {
    if (nowMs - value.createdAt > IDEMPOTENCY_TTL_MS) {
      idempotencyStore.delete(key);
    }
  }
}

function shouldAuditCommand(command: string): boolean {
  return SECURITY_AUDIT_COMMANDS.has(command);
}

function auditContextFromParams(params: Record<string, unknown>): {
  sessionId?: string;
  connectorId?: string;
  runId?: string;
  provider?: string;
  metadata: Record<string, unknown>;
} {
  return {
    sessionId: typeof params.sessionId === 'string' ? params.sessionId : undefined,
    connectorId: typeof params.connectorId === 'string' ? params.connectorId : undefined,
    runId: typeof params.runId === 'string' ? params.runId : undefined,
    provider:
      typeof params.provider === 'string'
        ? params.provider
        : typeof params.platform === 'string'
          ? params.platform
          : undefined,
    metadata: {
      hasIdempotencyKey: typeof params._idempotencyKey === 'string',
      retryAttempt: typeof params._retryAttempt === 'number' ? params._retryAttempt : null,
      commandArgs: {
        sessionId: typeof params.sessionId === 'string' ? params.sessionId : null,
        connectorId: typeof params.connectorId === 'string' ? params.connectorId : null,
        runId: typeof params.runId === 'string' ? params.runId : null,
        provider: typeof params.provider === 'string' ? params.provider : null,
      },
    },
  };
}

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
  const nowMs = Date.now();
  cleanupIdempotencyStore(nowMs);

  if (!handler) {
    if (shouldAuditCommand(request.command)) {
      void securityAuditLog.log({
        category: 'ipc_command',
        command: request.command,
        outcome: 'failed',
        metadata: { reason: 'unknown_command' },
        error: `Unknown command: ${request.command}`,
      });
    }
    return {
      id: request.id,
      success: false,
      error: `Unknown command: ${request.command}`,
    };
  }

  const rawParams = request.params || {};
  const idempotencyKey =
    typeof rawParams._idempotencyKey === 'string' ? rawParams._idempotencyKey : undefined;
  const normalizedParams = { ...rawParams } as Record<string, unknown>;
  delete normalizedParams._idempotencyKey;
  delete normalizedParams._retryAttempt;
  const idempotencyStoreKey = idempotencyKey ? `${request.command}:${idempotencyKey}` : null;

  if (idempotencyStoreKey) {
    const cached = idempotencyStore.get(idempotencyStoreKey);
    if (cached) {
      if (shouldAuditCommand(request.command)) {
        const ctx = auditContextFromParams(rawParams as Record<string, unknown>);
        void securityAuditLog.log({
          category: 'ipc_command',
          command: request.command,
          outcome: 'cached',
          sessionId: ctx.sessionId,
          connectorId: ctx.connectorId,
          runId: ctx.runId,
          provider: ctx.provider,
          metadata: ctx.metadata,
          error: cached.success ? undefined : cached.error,
        });
      }
      return {
        id: request.id,
        success: cached.success,
        result: cached.result,
        error: cached.error,
      };
    }
  }

  try {
    const result = await handler(normalizedParams);
    if (shouldAuditCommand(request.command)) {
      const ctx = auditContextFromParams(rawParams as Record<string, unknown>);
      void securityAuditLog.log({
        category: 'ipc_command',
        command: request.command,
        outcome: 'success',
        sessionId: ctx.sessionId,
        connectorId: ctx.connectorId,
        runId: ctx.runId,
        provider: ctx.provider,
        metadata: ctx.metadata,
      });
    }
    const response: IPCResponse = {
      id: request.id,
      success: true,
      result,
    };
    if (idempotencyStoreKey) {
      idempotencyStore.set(idempotencyStoreKey, {
        createdAt: nowMs,
        success: true,
        result,
      });
    }
    return response;
  } catch (error) {
    if (shouldAuditCommand(request.command)) {
      const ctx = auditContextFromParams(rawParams as Record<string, unknown>);
      void securityAuditLog.log({
        category: 'ipc_command',
        command: request.command,
        outcome: 'failed',
        sessionId: ctx.sessionId,
        connectorId: ctx.connectorId,
        runId: ctx.runId,
        provider: ctx.provider,
        metadata: ctx.metadata,
        error: getErrorMessage(error),
      });
    }
    const response: IPCResponse = {
      id: request.id,
      success: false,
      error: getErrorMessage(error),
    };
    if (idempotencyStoreKey) {
      idempotencyStore.set(idempotencyStoreKey, {
        createdAt: nowMs,
        success: false,
        error: response.error,
      });
    }
    return response;
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
  const session = await agentRunner.createSession(
    p.workingDirectory,
    p.model,
    p.title,
    p.type,
    p.provider,
    p.executionMode,
  );
  return session;
});

registerHandler('set_runtime_config', async (params) => {
  const config = (params as { config?: RuntimeConfig }).config || (params as unknown as RuntimeConfig);
  return agentRunner.setRuntimeConfig(config);
});

registerHandler('get_capability_snapshot', async (params) => {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
  return agentRunner.getCapabilitySnapshot(sessionId);
});

registerHandler('get_external_cli_availability', async (params) => {
  const forceRefresh = Boolean((params as { forceRefresh?: boolean } | undefined)?.forceRefresh);
  return agentRunner.getExternalCliAvailability(forceRefresh);
});

registerHandler('debug_preview_system_prompt', async (params) => {
  const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : undefined;
  return agentRunner.previewSystemPrompt(sessionId);
});

registerHandler('souls_list', async () => {
  return agentRunner.listSoulProfiles();
});

registerHandler('souls_save_custom', async (params) => {
  const payload = params as { title?: string; content?: string; id?: string };
  if (!payload.title || !payload.content) {
    throw new Error('title and content are required');
  }
  return agentRunner.saveCustomSoul(payload.title, payload.content, payload.id);
});

registerHandler('souls_delete_custom', async (params) => {
  const payload = params as { id?: string };
  if (!payload.id) {
    throw new Error('id is required');
  }
  return agentRunner.deleteCustomSoul(payload.id);
});

// Send message
registerHandler('send_message', async (params) => {
  const p = params as unknown as SendMessageParams;
  console.error('[MULTIMEDIA] send_message IPC:', p.sessionId, 'content:', JSON.stringify(p.content?.slice(0, 50)), 'attachments:', p.attachments?.length ?? 0, p.attachments?.map((a: any) => `${a.type}:${a.name}:hasData=${!!a.data}`) ?? []);
  if (!p.sessionId || (p.content == null && (!p.attachments || p.attachments.length === 0))) throw new Error('sessionId and content or attachments are required');
  const content = p.content || '';
  await agentRunner.sendMessage(p.sessionId, content, p.attachments);
  return { success: true };
});

registerHandler('run_start_v2', async (params) => {
  const p = params as unknown as SendMessageV2Params;
  if (!p.sessionId || !p.message) {
    throw new Error('sessionId and message are required');
  }
  return agentRunner.runStartV2(p.sessionId, p.message, p.runOptions, p.attachments);
});

registerHandler('run_resume_from_checkpoint', async (params) => {
  const p = params as unknown as ResumeRunParams;
  if (!p.sessionId || !p.runId) {
    throw new Error('sessionId and runId are required');
  }
  return agentRunner.resumeRunFromCheckpoint(p.sessionId, p.runId);
});

registerHandler('run_get_timeline', async (params) => {
  const p = params as unknown as GetRunTimelineParams;
  if (!p.runId) {
    throw new Error('runId is required');
  }
  return agentRunner.getRunTimeline(p.runId);
});

registerHandler('session_branch_create', async (params) => {
  const p = params as unknown as BranchSessionParams;
  if (!p.sessionId || !p.branchName) {
    throw new Error('sessionId and branchName are required');
  }
  return agentRunner.createSessionBranch(p.sessionId, p.branchName, p.fromTurnId);
});

registerHandler('session_branch_merge', async (params) => {
  const p = params as unknown as MergeBranchParams;
  if (!p.sessionId || !p.sourceBranchId || !p.targetBranchId) {
    throw new Error('sessionId, sourceBranchId, and targetBranchId are required');
  }
  return agentRunner.mergeSessionBranch(
    p.sessionId,
    p.sourceBranchId,
    p.targetBranchId,
    p.strategy || 'auto',
  );
});

registerHandler('session_branch_set_active', async (params) => {
  const p = params as unknown as SetActiveBranchParams;
  if (!p.sessionId || !p.branchId) {
    throw new Error('sessionId and branchId are required');
  }
  return agentRunner.setActiveSessionBranch(p.sessionId, p.branchId);
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

registerHandler('set_execution_mode', async (params) => {
  const p = params as unknown as SetExecutionModeParams;
  if (!p.sessionId || !p.mode) {
    throw new Error('sessionId and mode are required');
  }
  await agentRunner.setExecutionMode(p.sessionId, p.mode);
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

// Message Queue management
registerHandler('get_queue', async (params) => {
  const sessionId = params.sessionId as string;
  if (!sessionId) throw new Error('sessionId is required');
  return agentRunner.getMessageQueue(sessionId);
});

registerHandler('remove_from_queue', async (params) => {
  const sessionId = params.sessionId as string;
  const messageId = params.messageId as string;
  if (!sessionId || !messageId) throw new Error('sessionId and messageId are required');
  return agentRunner.removeFromQueue(sessionId, messageId);
});

registerHandler('reorder_queue', async (params) => {
  const sessionId = params.sessionId as string;
  const messageIds = params.messageIds as string[];
  if (!sessionId || !messageIds) throw new Error('sessionId and messageIds are required');
  return agentRunner.reorderQueue(sessionId, messageIds);
});

registerHandler('send_queued_immediately', async (params) => {
  const sessionId = params.sessionId as string;
  const messageId = params.messageId as string;
  if (!sessionId || !messageId) throw new Error('sessionId and messageId are required');
  return agentRunner.sendQueuedImmediately(sessionId, messageId);
});

registerHandler('edit_queued_message', async (params) => {
  const sessionId = params.sessionId as string;
  const messageId = params.messageId as string;
  const content = params.content as string;
  if (!sessionId || !messageId || !content) throw new Error('sessionId, messageId, and content are required');
  return agentRunner.editQueuedMessage(sessionId, messageId, content);
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
      deepResearchAgent?: string;
    };
  };
  if (!p.models) throw new Error('models are required');
  agentRunner.setSpecializedModels(p.models);
  return { success: true };
});

registerHandler('set_stitch_api_key', async (params) => {
  const { apiKey } = params as { apiKey?: string | null };
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  await agentRunner.setStitchApiKey(normalized || null);
  return { success: true };
});

registerHandler('set_mcp_servers', async (params) => {
  const { servers } = params as { servers?: Array<Record<string, unknown>> };
  if (!Array.isArray(servers)) throw new Error('servers array is required');
  await agentRunner.setMcpServers(servers as Array<{
    id: string;
    name: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    enabled?: boolean;
    prompt?: string;
    contextFileName?: string;
    transport?: 'stdio' | 'http';
    url?: string;
    headers?: Record<string, string>;
  }>);
  return { success: true };
});

registerHandler('mcp_call_tool', async (params) => {
  const { serverId, toolName, args } = params as {
    serverId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
  };
  if (!serverId || !toolName) throw new Error('serverId and toolName are required');
  return agentRunner.callMcpTool(serverId, toolName, args || {});
});

registerHandler('benchmark_run_suite', async (params) => {
  const p = params as unknown as BenchmarkRunSuiteParams;
  if (!p.suiteId) throw new Error('suiteId is required');
  return agentRunner.runBenchmarkSuite(p.suiteId, p.profile || 'default');
});

registerHandler('release_gate_evaluate', async () => {
  return agentRunner.getReleaseGateStatus();
});

registerHandler('release_gate_assert', async () => {
  return agentRunner.assertReleaseGateForLaunch();
});

// Load Gemini CLI extensions
registerHandler('load_gemini_extensions', async () => {
  return loadGeminiExtensions();
});

// List sessions
registerHandler('list_sessions', async () => {
  return agentRunner.listSessions();
});

registerHandler('list_sessions_page', async (params) => {
  const p = params as unknown as ListSessionsPageParams;
  return agentRunner.listSessionsPage({
    limit: typeof p.limit === 'number' ? p.limit : undefined,
    offset: typeof p.offset === 'number' ? p.offset : undefined,
    query: typeof p.query === 'string' ? p.query : undefined,
  });
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

registerHandler('get_session_chunk', async (params) => {
  const p = params as unknown as GetSessionChunkParams;
  if (!p.sessionId) throw new Error('sessionId is required');
  const session = agentRunner.getSessionChunk(p.sessionId, {
    chatItemLimit: typeof p.chatItemLimit === 'number' ? p.chatItemLimit : undefined,
    beforeSequence: typeof p.beforeSequence === 'number' ? p.beforeSequence : undefined,
  });
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

registerHandler('daemon_health', async () => {
  const init = agentRunner.getInitializationStatus();
  return {
    status: init.initialized ? 'healthy' : 'starting',
    initialized: init.initialized,
    sessionCount: init.sessionCount,
    timestamp: Date.now(),
  };
});

registerHandler('daemon_ready', async () => {
  const init = agentRunner.getInitializationStatus();
  return {
    ready: init.initialized,
    sessionCount: init.sessionCount,
    eventCursor: eventEmitter.getCurrentSequence(),
    timestamp: Date.now(),
  };
});

registerHandler('agent_get_bootstrap_state', async () => {
  return agentRunner.getBootstrapState(eventEmitter.getCurrentSequence());
});

registerHandler('agent_get_events_since', async (params) => {
  const afterSeq =
    typeof params.afterSeq === 'number'
      ? params.afterSeq
      : typeof params.cursor === 'number'
        ? params.cursor
        : 0;
  const limit = typeof params.limit === 'number' ? params.limit : 2000;
  const replayStart = eventEmitter.getReplayStartSequence();
  const currentCursor = eventEmitter.getCurrentSequence();

  return {
    events: eventEmitter.getEventsSince(afterSeq, limit),
    eventCursor: currentCursor,
    replayStart,
    hasGap: afterSeq > 0 && afterSeq < replayStart,
  };
});

registerHandler('agent_subscribe_events', async () => {
  return {
    ok: true,
    eventCursor: eventEmitter.getCurrentSequence(),
  };
});

// ============================================================================
// Remote Access (Mobile Gateway)
// ============================================================================

registerHandler('remote_access_get_status', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.getStatus();
});

registerHandler('remote_access_enable', async (params) => {
  await ensureRemoteAccessInitialized();
  const p = params as {
    publicBaseUrl?: string | null;
    tunnelMode?: RemoteTunnelMode;
    tunnelName?: string | null;
    tunnelDomain?: string | null;
    tunnelVisibility?: 'public' | 'private';
    bindPort?: number;
  };
  return remoteAccessService.enable({
    publicBaseUrl: p.publicBaseUrl ?? null,
    tunnelMode: p.tunnelMode,
    tunnelName: p.tunnelName ?? null,
    tunnelDomain: p.tunnelDomain ?? null,
    tunnelVisibility: p.tunnelVisibility,
    bindPort: p.bindPort,
  });
});

registerHandler('remote_access_disable', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.disable();
});

registerHandler('remote_access_generate_qr', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.generatePairingQr();
});

registerHandler('remote_access_list_devices', async () => {
  await ensureRemoteAccessInitialized();
  return { devices: remoteAccessService.listDevices() };
});

registerHandler('remote_access_revoke_device', async (params) => {
  await ensureRemoteAccessInitialized();
  const p = params as { deviceId?: string };
  if (!p.deviceId) {
    throw new Error('deviceId is required');
  }
  const revoked = await remoteAccessService.revokeDevice(p.deviceId);
  return { revoked };
});

registerHandler('remote_access_set_public_base_url', async (params) => {
  await ensureRemoteAccessInitialized();
  const p = params as { publicBaseUrl?: string | null };
  return remoteAccessService.updatePublicBaseUrl(p.publicBaseUrl ?? null);
});

registerHandler('remote_access_set_tunnel_mode', async (params) => {
  await ensureRemoteAccessInitialized();
  const p = params as { tunnelMode?: RemoteTunnelMode };
  if (!p.tunnelMode) {
    throw new Error('tunnelMode is required');
  }
  return remoteAccessService.updateTunnelMode(p.tunnelMode);
});

registerHandler('remote_access_set_tunnel_options', async (params) => {
  await ensureRemoteAccessInitialized();
  const p = params as {
    tunnelName?: string | null;
    tunnelDomain?: string | null;
    tunnelVisibility?: 'public' | 'private';
    publicBaseUrl?: string | null;
  };
  return remoteAccessService.updateTunnelOptions({
    tunnelName: p.tunnelName ?? null,
    tunnelDomain: p.tunnelDomain ?? null,
    tunnelVisibility: p.tunnelVisibility,
    publicBaseUrl: p.publicBaseUrl ?? null,
  });
});

registerHandler('remote_access_refresh_tunnel', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.refreshTunnelStatus();
});

registerHandler('remote_access_install_tunnel_binary', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.installTunnelBinary();
});

registerHandler('remote_access_authenticate_tunnel', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.authenticateTunnel();
});

registerHandler('remote_access_start_tunnel', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.startTunnel();
});

registerHandler('remote_access_stop_tunnel', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.stopTunnel();
});

registerHandler('remote_access_delete_all', async () => {
  await ensureRemoteAccessInitialized();
  return remoteAccessService.deleteAll();
});

// Initialize persistence with app data directory
registerHandler('initialize', async (params) => {
  const { appDataDir } = params as { appDataDir: string };
  if (!appDataDir) {
    throw new Error('appDataDir is required');
  }
  // Store app data directory for service initialization
  appDataDirectory = appDataDir;
  securityAuditLog.setBaseDir(appDataDir);
  const result = await agentRunner.initialize(appDataDir);
  await remoteAccessService.initialize(appDataDir);

  // Initialize integration bridge (messaging platforms) - non-fatal
  try {
    const { integrationBridge } = await import('./integrations/index.js');
    await integrationBridge.initialize(agentRunner);
    if (!integrationInitCapabilitiesRefreshed) {
      await refreshIntegrationCapabilities('integration-bridge-initialize');
      integrationInitCapabilitiesRefreshed = true;
    }
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

registerHandler('draft_skill_from_session', async (params) => {
  const p = params as unknown as DraftSkillFromSessionParams;
  if (!p.sessionId) {
    throw new Error('sessionId is required');
  }

  return agentRunner.draftSkillFromSession({
    sessionId: p.sessionId,
    goal: p.goal,
    purpose: p.purpose,
    workingDirectory: p.workingDirectory,
    maxSkills: p.maxSkills,
  });
});

registerHandler('create_skill_from_session', async (params) => {
  const p = params as unknown as CreateSkillFromSessionParams;
  if (!p.sessionId) {
    throw new Error('sessionId is required');
  }

  return agentRunner.createSkillFromSession({
    sessionId: p.sessionId,
    goal: p.goal,
    purpose: p.purpose,
    workingDirectory: p.workingDirectory,
    maxSkills: p.maxSkills,
  });
});

registerHandler('ensure_default_skill_creator_installed', async () => {
  return agentRunner.ensureDefaultSkillCreatorInstalled();
});

// ============================================================================
// Command Management (Slash Commands Marketplace)
// ============================================================================

// Discover all commands from all sources
registerHandler('discover_commands', async (params) => {
  const p = params as { workingDirectory?: string };
  const commands = await commandService.discoverAll(p.workingDirectory);
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
  const payload = params as unknown as {
    jobId: string;
    updates?: UpdateCronJobInput;
    input?: UpdateCronJobInput;
  } & UpdateCronJobInput;
  const { jobId } = payload;
  const updates = payload.updates || payload.input || payload;
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
  const payload = params as {
    jobId: string;
    options?: RunQueryOptions;
    limit?: number;
    offset?: number;
    result?: 'success' | 'error' | 'timeout' | 'cancelled';
  };
  const { jobId } = payload;
  const options =
    payload.options || {
      limit: payload.limit,
      offset: payload.offset,
      result: payload.result,
    };
  if (!jobId) throw new Error('jobId is required');
  return cronService.getJobRuns(jobId, options);
});

// Get cron service status
registerHandler('cron_get_status', async (): Promise<CronServiceStatus> => {
  return cronService.getStatus();
});

// ============================================================================
// Workflow Command Handlers
// ============================================================================

registerHandler('workflow_list', async (params): Promise<WorkflowDefinition[]> => {
  const { limit, offset } = params as { limit?: number; offset?: number };
  return workflowService.list(limit, offset);
});

registerHandler('workflow_get', async (params): Promise<WorkflowDefinition | null> => {
  const { workflowId, version } = params as { workflowId: string; version?: number };
  if (!workflowId) throw new Error('workflowId is required');
  return workflowService.get(workflowId, version);
});

registerHandler('workflow_evaluate_triggers', async (params) => {
  const payload = params as {
    message?: string;
    workflowIds?: string[];
    minConfidence?: number;
    activationThreshold?: number;
    maxResults?: number;
    autoRun?: boolean;
    input?: Record<string, unknown>;
  };

  if (!payload.message?.trim()) {
    throw new Error('message is required');
  }

  const matches = workflowService.evaluateChatTriggers({
    message: payload.message,
    workflowIds: payload.workflowIds,
    minConfidence: payload.minConfidence,
    activationThreshold: payload.activationThreshold,
    maxResults: payload.maxResults,
  });

  if (!payload.autoRun) {
    return {
      matches,
      activatedRun: null,
    };
  }

  const best = matches.find((match) => match.shouldActivate);
  if (!best) {
    return {
      matches,
      activatedRun: null,
    };
  }

  eventEmitter.emit('workflow:activated', undefined, {
    workflowId: best.workflowId,
    triggerType: 'chat',
    triggerId: best.triggerId,
    confidence: best.confidence,
    reasonCodes: best.reasonCodes,
  });

  const activatedRun = await workflowService.run({
    workflowId: best.workflowId,
    version: best.workflowVersion,
    triggerType: 'chat',
    triggerContext: {
      triggerType: 'chat',
      triggerId: best.triggerId,
      confidence: best.confidence,
      reasonCodes: best.reasonCodes,
      messagePreview: payload.message.slice(0, 200),
    },
    input: payload.input || {},
  });

  return {
    matches,
    activatedRun,
  };
});

registerHandler('workflow_create_draft', async (params): Promise<WorkflowDefinition> => {
  const input = params as unknown as CreateWorkflowDraftInput;
  if (!input.name) throw new Error('name is required');
  return workflowService.createDraft(input);
});

registerHandler('workflow_create_from_prompt', async (params): Promise<WorkflowDefinition> => {
  const input = params as unknown as CreateWorkflowFromPromptInput;
  if (!input.prompt?.trim()) throw new Error('prompt is required');
  return workflowService.createFromPrompt(input);
});

registerHandler('workflow_update_draft', async (params): Promise<WorkflowDefinition> => {
  const { workflowId, updates } = params as {
    workflowId: string;
    updates: UpdateWorkflowDraftInput;
  };
  if (!workflowId) throw new Error('workflowId is required');
  if (!updates) throw new Error('updates is required');
  return workflowService.updateDraft(workflowId, updates);
});

registerHandler('workflow_validate', async (params): Promise<WorkflowValidationReport> => {
  const definition = params as WorkflowDefinition;
  if (!definition?.id) throw new Error('workflow definition is required');
  return workflowService.validateDraft(definition);
});

registerHandler('workflow_publish', async (params): Promise<WorkflowDefinition> => {
  const { workflowId } = params as { workflowId: string };
  if (!workflowId) throw new Error('workflowId is required');
  return workflowService.publish(workflowId);
});

registerHandler('workflow_archive', async (params): Promise<WorkflowDefinition> => {
  const { workflowId } = params as { workflowId: string };
  if (!workflowId) throw new Error('workflowId is required');
  return workflowService.archive(workflowId);
});

registerHandler('workflow_run', async (params): Promise<WorkflowRun> => {
  const input = params as WorkflowRunInput;
  if (!input.workflowId) throw new Error('workflowId is required');
  return workflowService.run(input);
});

registerHandler('workflow_list_runs', async (params): Promise<WorkflowRun[]> => {
  const {
    workflowId,
    status,
    limit,
    offset,
  } = params as {
    workflowId?: string;
    status?: WorkflowRunStatus;
    limit?: number;
    offset?: number;
  };
  return workflowService.listRuns({ workflowId, status, limit, offset });
});

registerHandler('workflow_get_run', async (params) => {
  const { runId } = params as { runId: string };
  if (!runId) throw new Error('runId is required');
  return workflowService.getRun(runId);
});

registerHandler('workflow_get_run_events', async (params): Promise<WorkflowEvent[]> => {
  const { runId, sinceTs } = params as { runId: string; sinceTs?: number };
  if (!runId) throw new Error('runId is required');
  return workflowService.getRunEvents(runId, sinceTs);
});

registerHandler('workflow_cancel_run', async (params): Promise<WorkflowRun> => {
  const { runId } = params as { runId: string };
  if (!runId) throw new Error('runId is required');
  return workflowService.cancelRun(runId);
});

registerHandler('workflow_pause_run', async (params): Promise<WorkflowRun> => {
  const { runId } = params as { runId: string };
  if (!runId) throw new Error('runId is required');
  return workflowService.pauseRun(runId);
});

registerHandler('workflow_resume_run', async (params): Promise<WorkflowRun> => {
  const { runId } = params as { runId: string };
  if (!runId) throw new Error('runId is required');
  return workflowService.resumeRun(runId);
});

registerHandler('workflow_backfill_schedule', async (params): Promise<{ queued: number }> => {
  const { workflowId, from, to } = params as { workflowId: string; from: number; to: number };
  if (!workflowId) throw new Error('workflowId is required');
  if (typeof from !== 'number' || typeof to !== 'number') {
    throw new Error('from and to are required numbers');
  }
  return workflowService.backfillSchedule(workflowId, from, to);
});

registerHandler('workflow_list_scheduled', async (params): Promise<WorkflowScheduledTaskSummary[]> => {
  const { limit, offset } = params as { limit?: number; offset?: number };
  return workflowService.listScheduledTasks(limit, offset);
});

registerHandler('workflow_pause_scheduled', async (params) => {
  const { workflowId } = params as { workflowId: string };
  if (!workflowId) throw new Error('workflowId is required');
  return workflowService.pauseScheduledWorkflow(workflowId);
});

registerHandler('workflow_resume_scheduled', async (params) => {
  const { workflowId } = params as { workflowId: string };
  if (!workflowId) throw new Error('workflowId is required');
  return workflowService.resumeScheduledWorkflow(workflowId);
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

registerHandler('deep_memory_get_migration_report', async (params) => {
  const p = params as unknown as DeepMemoryMigrationReportParams;
  const workingDirectory = p.workingDirectory || resolveMemoryWorkingDirectory(p.projectId || '');
  if (!workingDirectory) {
    throw new Error('workingDirectory or projectId is required');
  }
  const service = await getMemoryService(workingDirectory);
  return {
    report: service.getMigrationReport(),
  };
});

// Create a new memory
registerHandler('deep_memory_create', async (params) => {
  const p = params as unknown as MemoryCreateParams;
  const input = ((params as { input?: Partial<MemoryCreateParams> }).input || p) as Partial<MemoryCreateParams>;
  if (!p.workingDirectory || !input.title || !input.content || !input.group) {
    throw new Error('workingDirectory, title, content, and group are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const memory = await service.create({
    title: input.title,
    content: input.content,
    group: input.group,
    tags: input.tags || [],
    source: input.source || 'manual',
    confidence: input.confidence,
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
  const payload = params as { id?: string; memoryId?: string; updates?: Partial<MemoryUpdateParams>; workingDirectory?: string };
  const memoryId = p.memoryId || payload.id;
  const updates = payload.updates || p;
  if (!p.workingDirectory || !memoryId) {
    throw new Error('workingDirectory and memoryId are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  const memory = await service.update(memoryId, {
    title: updates.title,
    content: updates.content,
    group: updates.group,
    tags: updates.tags,
  });
  if (!memory) {
    throw new Error(`Memory not found: ${memoryId}`);
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

registerHandler('deep_memory_query', async (params) => {
  const p = params as unknown as DeepMemoryQueryParams;
  if (!p.sessionId || !p.query) {
    throw new Error('sessionId and query are required');
  }
  const session = agentRunner.getSession(p.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${p.sessionId}`);
  }

  const workingDirectory = session.workingDirectory || homedir();
  const service = await getMemoryService(workingDirectory);
  const result = await service.deepQuery(p.sessionId, p.query, p.options || {});

  eventEmitter.emit('memory:retrieved', p.sessionId, {
    queryId: result.queryId,
    query: p.query,
    count: result.atoms.length,
    limit: result.options.limit,
  });

  return result;
});

registerHandler('deep_memory_feedback', async (params) => {
  const p = params as unknown as DeepMemoryFeedbackParams;
  if (!p.sessionId || !p.queryId || !p.atomId || !p.feedback) {
    throw new Error('sessionId, queryId, atomId, and feedback are required');
  }
  const session = agentRunner.getSession(p.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${p.sessionId}`);
  }

  const service = await getMemoryService(session.workingDirectory || homedir());
  const entry = await service.applyFeedback({
    sessionId: p.sessionId,
    queryId: p.queryId,
    atomId: p.atomId,
    feedback: p.feedback,
    note: p.note,
  });

  eventEmitter.emit('memory:consolidated', p.sessionId, {
    queryId: p.queryId,
    atomId: p.atomId,
    feedback: p.feedback,
  });

  return { success: true, entry };
});

registerHandler('deep_memory_export_bundle', async (params) => {
  const p = params as unknown as DeepMemoryExportBundleParams;
  if (!p.projectId || !p.path) {
    throw new Error('projectId and path are required');
  }

  const workingDirectory = resolveMemoryWorkingDirectory(p.projectId);
  const service = await getMemoryService(workingDirectory);
  const memories = await service.getAll();
  const bundle = {
    version: 1,
    projectId: p.projectId,
    encrypted: Boolean(p.encrypted),
    exportedAt: Date.now(),
    memories,
  };

  await writeFile(p.path, JSON.stringify(bundle, null, 2), 'utf-8');
  return {
    success: true,
    path: p.path,
    count: memories.length,
    encrypted: false,
    note: p.encrypted ? 'Encrypted export will be added in a follow-up hardening task.' : undefined,
  };
});

registerHandler('deep_memory_import_bundle', async (params) => {
  const p = params as unknown as DeepMemoryImportBundleParams;
  if (!p.projectId || !p.path) {
    throw new Error('projectId and path are required');
  }

  const mergeMode = p.mergeMode || 'merge';
  const workingDirectory = resolveMemoryWorkingDirectory(p.projectId);
  const service = await getMemoryService(workingDirectory);
  const raw = await readFile(p.path, 'utf-8');
  const parsed = JSON.parse(raw) as {
    memories?: Array<{
      title?: string;
      content?: string;
      group?: string;
      tags?: string[];
      source?: 'manual' | 'auto';
      confidence?: number;
    }>;
  };
  const memories = Array.isArray(parsed.memories) ? parsed.memories : [];
  let imported = 0;

  if (mergeMode === 'replace') {
    const existing = await service.getAll();
    for (const memory of existing) {
      await service.delete(memory.id);
    }
  }

  for (const memory of memories) {
    if (!memory.title || !memory.content || !memory.group) {
      continue;
    }
    await service.create({
      title: memory.title,
      content: memory.content,
      group: memory.group,
      tags: memory.tags || [],
      source: memory.source || 'manual',
      confidence: memory.confidence,
    });
    imported += 1;
  }

  return {
    success: true,
    mergeMode,
    imported,
    skipped: memories.length - imported,
  };
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
  const payload = params as { workingDirectory?: string; groupName?: string; name?: string };
  const groupName = payload.groupName || payload.name;
  if (!p.workingDirectory || !groupName) {
    throw new Error('workingDirectory and groupName are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  await service.createGroup(groupName);
  return { success: true };
});

// Delete a memory group
registerHandler('deep_memory_delete_group', async (params) => {
  const p = params as unknown as MemoryGroupDeleteParams;
  const payload = params as { workingDirectory?: string; groupName?: string; name?: string };
  const groupName = payload.groupName || payload.name;
  if (!p.workingDirectory || !groupName) {
    throw new Error('workingDirectory and groupName are required');
  }
  const service = await getMemoryService(p.workingDirectory);
  await service.deleteGroup(groupName);
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

registerHandler('memory_retrieve_pack', async (params) => {
  const payload = params as { sessionId?: string; query?: string; options?: Record<string, unknown> };
  if (!payload.sessionId || !payload.query) {
    throw new Error('sessionId and query are required');
  }
  const session = agentRunner.getSession(payload.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${payload.sessionId}`);
  }
  const service = await getMemoryService(session.workingDirectory || homedir());
  return service.deepQuery(payload.sessionId, payload.query, payload.options || {});
});

registerHandler('memory_write_atoms', async (params) => {
  const payload = params as {
    workingDirectory?: string;
    atoms?: Array<{ title?: string; content?: string; group?: string; tags?: string[]; source?: 'manual' | 'auto' }>;
  };
  if (!payload.workingDirectory || !Array.isArray(payload.atoms)) {
    throw new Error('workingDirectory and atoms array are required');
  }
  const service = await getMemoryService(payload.workingDirectory);
  let written = 0;
  for (const atom of payload.atoms) {
    if (!atom.title || !atom.content || !atom.group) continue;
    await service.create({
      title: atom.title,
      content: atom.content,
      group: atom.group,
      tags: atom.tags || [],
      source: atom.source || 'manual',
    });
    written += 1;
  }
  return { success: true, written, skipped: payload.atoms.length - written };
});

registerHandler('memory_consolidate', async (params) => {
  const payload = params as {
    sessionId?: string;
    strategy?: 'balanced' | 'aggressive' | 'conservative';
    force?: boolean;
    redundancyThreshold?: number;
    decayFactor?: number;
    minConfidence?: number;
    staleAfterHours?: number;
    intervalMinutes?: number;
  };

  const session = payload.sessionId ? agentRunner.getSession(payload.sessionId) : null;
  const workingDirectory = session?.workingDirectory || homedir();
  const service = await getMemoryService(workingDirectory);
  const result = await service.maybeRunPeriodicConsolidation({
    enabled: true,
    strategy: payload.strategy,
    force: payload.force,
    redundancyThreshold: payload.redundancyThreshold,
    decayFactor: payload.decayFactor,
    minConfidence: payload.minConfidence,
    staleAfterHours: payload.staleAfterHours,
    intervalMinutes: payload.intervalMinutes,
  });

  const effective = result || {
    strategy: payload.strategy || 'balanced',
    completedAt: Date.now(),
    skipped: true,
  };

  eventEmitter.emit('memory:consolidated', payload.sessionId, {
    strategy: effective.strategy,
    timestamp: effective.completedAt,
    stats: result
      ? {
          beforeCount: result.beforeCount,
          afterCount: result.afterCount,
          removedCount: result.removedCount,
          mergedCount: result.mergedCount,
          decayedCount: result.decayedCount,
          redundancyReduction: result.redundancyReduction,
          recallRetention: result.recallRetention,
        }
      : undefined,
  });

  return {
    success: true,
    ...effective,
  };
});

registerHandler('workflow_pack_execute', async (params) => {
  const payload = params as {
    workflowId?: string;
    input?: Record<string, unknown>;
    triggerType?: string;
    triggerContext?: Record<string, unknown>;
  };
  if (!payload.workflowId) {
    throw new Error('workflowId is required');
  }
  eventEmitter.emit('workflow:activated', undefined, {
    workflowId: payload.workflowId,
    triggerType: payload.triggerType || 'manual',
  });
  const triggerType =
    payload.triggerType === 'schedule' ||
    payload.triggerType === 'webhook' ||
    payload.triggerType === 'integration' ||
    payload.triggerType === 'manual'
      ? payload.triggerType
      : 'manual';
  return workflowService.run({
    workflowId: payload.workflowId,
    triggerType,
    triggerContext: payload.triggerContext || {},
    input: payload.input || {},
  });
});

registerHandler('research_wide_run', async (params) => {
  const payload = params as { sessionId?: string; query?: string; fanout?: number };
  if (!payload.query) {
    throw new Error('query is required');
  }
  const fanout = typeof payload.fanout === 'number' ? Math.max(1, Math.min(100, payload.fanout)) : 4;
  eventEmitter.researchProgress(payload.sessionId || 'global', 'wide_research_started', 0);
  eventEmitter.researchProgress(payload.sessionId || 'global', 'wide_research_completed', 100);
  return {
    success: true,
    query: payload.query,
    fanout,
    summary: `Wide research scaffold executed with ${fanout} sub-agents.`,
    evidence: [],
  };
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
        error: getErrorMessage(error),
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
  return integrationBridge.getStatusesWithHealth();
});

registerHandler('integration_connect', async (params) => {
  const { platform, config } = params as { platform: string; config: Record<string, unknown> };
  const startedAt = Date.now();
  if (!platform || !isValidIntegrationPlatform(platform)) {
    throw new Error(
      `Invalid platform: ${platform}. Must be one of: ${SUPPORTED_PLATFORM_TYPES.join(', ')}`,
    );
  }
  const safeConfig = config || {};
  process.stderr.write(
    `[integration-ipc] connect:start platform=${platform} configKeys=${Object.keys(safeConfig).sort().join(',') || '(none)'}\n`,
  );
  if (platform === 'imessage' && process.platform !== 'darwin') {
    throw new Error('iMessage integration is only supported on macOS');
  }
  const { integrationBridge } = await import('./integrations/index.js');
  try {
    await integrationBridge.connect(platform, safeConfig);
    await refreshIntegrationCapabilities(`integration-connect:${platform}`);
    const status = await integrationBridge.getStatusWithHealth(platform);
    process.stderr.write(
      `[integration-ipc] connect:done platform=${platform} connected=${status.connected} health=${status.health ?? '-'} elapsedMs=${Date.now() - startedAt}\n`,
    );
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[integration-ipc] connect:error platform=${platform} elapsedMs=${Date.now() - startedAt} error=${message}\n`,
    );
    throw error;
  }
});

registerHandler('integration_recover_whatsapp', async (params) => {
  const startedAt = Date.now();
  const payload = (params || {}) as { mode?: string };
  const requestedMode = String(payload.mode || 'soft').toLowerCase();
  const mode = requestedMode === 'hard' ? 'hard' : 'soft';
  process.stderr.write(`[integration-ipc] recover-whatsapp:start mode=${mode}\n`);

  const { integrationBridge } = await import('./integrations/index.js');
  try {
    const status = await integrationBridge.recoverWhatsApp(mode);
    await refreshIntegrationCapabilities(`integration-recover-whatsapp:${mode}`);
    process.stderr.write(
      `[integration-ipc] recover-whatsapp:done mode=${mode} connected=${status.connected} health=${status.health ?? '-'} elapsedMs=${Date.now() - startedAt}\n`,
    );
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[integration-ipc] recover-whatsapp:error mode=${mode} elapsedMs=${Date.now() - startedAt} error=${message}\n`,
    );
    throw error;
  }
});

registerHandler('integration_disconnect', async (params) => {
  const { platform } = params as { platform: string };
  if (!platform || !isValidIntegrationPlatform(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }
  const { integrationBridge } = await import('./integrations/index.js');
  await integrationBridge.disconnect(platform);
  await refreshIntegrationCapabilities(`integration-disconnect:${platform}`);
  return { success: true };
});

registerHandler('integration_get_status', async (params) => {
  const { platform } = params as { platform: string };
  const { integrationBridge } = await import('./integrations/index.js');
  if (!platform || !isValidIntegrationPlatform(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }
  return integrationBridge.getStatusWithHealth(platform);
});

registerHandler('integration_get_qr', async () => {
  const { integrationBridge } = await import('./integrations/index.js');
  return { qrDataUrl: integrationBridge.getWhatsAppQR() };
});

registerHandler('integration_configure', async (params) => {
  const { platform, config } = params as { platform: string; config: Record<string, unknown> };
  if (!platform || !isValidIntegrationPlatform(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }
  if (platform === 'imessage' && process.platform !== 'darwin') {
    throw new Error('iMessage integration is only supported on macOS');
  }
  const { integrationBridge } = await import('./integrations/index.js');
  await integrationBridge.configure(platform, config || {});
  await refreshIntegrationCapabilities(`integration-configure:${platform}`);
  return { success: true };
});

registerHandler('integration_get_config', async (params) => {
  const { platform } = params as { platform: string };
  if (!platform) throw new Error('platform is required');
  if (!isValidIntegrationPlatform(platform)) throw new Error(`Invalid platform: ${platform}`);
  const { integrationBridge } = await import('./integrations/index.js');
  const store = integrationBridge.getStore();
  return store.getConfig(platform);
});

registerHandler('integration_get_settings', async () => {
  const { integrationBridge } = await import('./integrations/index.js');
  return integrationBridge.getSettings();
});

registerHandler('integration_update_settings', async (params) => {
  const { settings } = params as { settings?: Record<string, unknown> };
  const { integrationBridge } = await import('./integrations/index.js');
  const safeSettings =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings
      : {};
  await integrationBridge.updateSettings({
    sharedSessionWorkingDirectory:
      typeof safeSettings.sharedSessionWorkingDirectory === 'string'
        ? safeSettings.sharedSessionWorkingDirectory
        : undefined,
  });
  return { success: true };
});

registerHandler('integration_send_test', async (params) => {
  const { platform, message } = params as { platform: string; message?: string };
  if (!platform || !isValidIntegrationPlatform(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }
  const { integrationBridge } = await import('./integrations/index.js');
  await integrationBridge.sendTestMessage(platform, message || 'Hello from Cowork!');
  return { success: true };
});

// ============================================================================
// Export
// ============================================================================

export { handlers, registerHandler };
