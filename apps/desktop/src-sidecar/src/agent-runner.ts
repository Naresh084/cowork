import type { ToolHandler, ToolContext } from '@gemini-cowork/core';
import { GeminiProvider, getModelContextWindow, setModelContextWindows } from '@gemini-cowork/providers';
import type { Message, PermissionRequest, PermissionDecision, MessageContentPart, SessionType } from '@gemini-cowork/shared';
import { generateId, generateMessageId, now, generateChatItemId } from '@gemini-cowork/shared';
import type {
  ChatItem,
  UserMessageItem,
  AssistantMessageItem,
  ThinkingItem,
  ToolStartItem,
  ToolResultItem,
  PermissionItem,
  QuestionItem,
  ErrorItem,
} from '@gemini-cowork/shared';
import { createDeepAgent } from 'deepagents';
import { createMiddleware } from 'langchain';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ToolMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import { mkdir, readFile, writeFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, isAbsolute, resolve, sep } from 'path';
import { homedir } from 'os';
import { eventEmitter } from './event-emitter.js';
import { createResearchTools, createComputerUseTools, createMediaTools, createGroundingTools } from './tools/index.js';
import { mcpBridge } from './mcp-bridge.js';
import { CoworkBackend } from './deepagents-backend.js';
import { skillService } from './skill-service.js';
import { toolPolicyService } from './tool-policy.js';
import { cronService } from './cron/index.js';
// Deep Agents middleware integration
import { createMiddlewareStack, buildFullSystemPrompt } from './middleware/middleware-stack.js';
import { createMemoryService, type MemoryService } from './memory/memory-service.js';
import { createMemoryExtractor, type MemoryExtractor } from './memory/memory-extractor.js';
import { createAgentsMdService, type AgentsMdService } from './agents-md/agents-md-service.js';
import type { AgentsMdConfig } from './agents-md/types.js';
import { MEMORY_SYSTEM_PROMPT } from './memory/memory-middleware.js';
import { buildSubagentPromptSection, getSubagentConfigs } from './middleware/subagent-prompts.js';
import type { ToolCallContext } from '@gemini-cowork/shared';
import type {
  SessionInfo,
  SessionDetails,
  Attachment,
  Task,
  Artifact,
  ToolExecution,
  ExtendedPermissionRequest,
  QuestionRequest,
  SkillConfig,
  PersistedMessage,
  PersistedToolExecution,
} from './types.js';
import { SessionPersistence, type PersistedSessionDataV2 } from './persistence.js';

const RECURSION_LIMIT = Number.MAX_SAFE_INTEGER;

// ============================================================================
// Session Manager
// ============================================================================

type DeepAgentInstance = {
  invoke: (input: unknown, options?: unknown) => Promise<unknown>;
  streamEvents?: (input: unknown, options?: unknown) => AsyncIterable<unknown>;
  stop?: () => void;
  abort?: () => void;
  cancel?: () => void;
};

type ApprovalMode = 'auto' | 'read_only' | 'full';

interface ActiveSession {
  id: string;
  type: SessionType;
  workingDirectory: string;
  model: string;
  title: string | null;
  approvalMode: ApprovalMode;
  agent: DeepAgentInstance;
  abortController?: AbortController;
  stopRequested?: boolean;
  messages: Message[];
  /** Unified chat items array (V2 architecture) */
  chatItems: ChatItem[];
  /** Current turn ID for associating items with user message */
  currentTurnId?: string;
  tasks: Task[];
  lastTodosSignature?: string;
  artifacts: Artifact[];
  toolExecutions: ToolExecution[];
  permissionCache: Map<string, PermissionDecision>;
  permissionScopes: Map<string, Set<string>>;
  toolStartTimes: Map<string, number>;
  pendingPermissions: Map<string, {
    request: ExtendedPermissionRequest;
    resolve: (decision: PermissionDecision) => void;
  }>;
  pendingQuestions: Map<string, {
    request: QuestionRequest;
    resolve: (answer: string | string[]) => void;
  }>;
  /** Currently executing parent task tool ID - sub-tools will inherit this */
  activeParentToolId?: string;
  /** In-flight permission requests by cache key - for deduplication */
  inFlightPermissions: Map<string, {
    permissionId: string;
    promise: Promise<PermissionDecision>;
    resolvers: Array<(decision: PermissionDecision) => void>;
  }>;
  /** Pending multimodal content to inject into next message */
  pendingMultimodalContent?: Array<{
    type: 'image' | 'video' | 'audio' | 'file';
    mimeType: string;
    data: string;
    path?: string;
  }>;
  /** Last known prompt tokens from API response (for accurate context tracking) */
  lastKnownPromptTokens: number;
  createdAt: number;
  updatedAt: number;
  /** Last time the session was accessed/selected by the user */
  lastAccessedAt: number;
}

// Specialized models configuration
interface SpecializedModels {
  imageGeneration: string;
  videoGeneration: string;
  computerUse: string;
}

const DEFAULT_SPECIALIZED_MODELS: SpecializedModels = {
  imageGeneration: 'imagen-4.0-generate-001',
  videoGeneration: 'veo-2.0-generate-001',
  computerUse: 'gemini-2.5-computer-use-preview-10-2025',
};

export class AgentRunner {
  private sessions: Map<string, ActiveSession> = new Map();
  private provider: GeminiProvider | null = null;
  private apiKey: string | null = null;
  private modelCatalog: Array<{ id: string; inputTokenLimit?: number; outputTokenLimit?: number }> = [];
  private mcpServers: Array<{ id: string; name: string; prompt?: string; contextFileName?: string; enabled?: boolean }> = [];
  private skills: SkillConfig[] = [];
  private enabledSkillIds: Set<string> = new Set();
  private persistence: SessionPersistence | null = null;
  private currentTurnInfo: Map<string, { turnMessageId: string; toolIds: string[] }> = new Map();
  private isInitialized = false;
  private specializedModels: SpecializedModels = { ...DEFAULT_SPECIALIZED_MODELS };
  private appDataDir: string | null = null;
  // Deep Agents services (per-session instances stored in map)
  private memoryServices: Map<string, MemoryService> = new Map();
  private memoryExtractors: Map<string, MemoryExtractor> = new Map();
  private agentsMdServices: Map<string, AgentsMdService> = new Map();
  private agentsMdConfigs: Map<string, AgentsMdConfig | null> = new Map();

  constructor() {
    // Session-based Chrome instances are created on-demand by ChromeCDPDriver.forSession()
  }

  /**
   * Initialize persistence with app data directory.
   * Called after sidecar starts with path from Rust backend.
   */
  async initialize(appDataDir: string): Promise<{ sessionsRestored: number }> {
    console.error('[AgentRunner] Initializing persistence with:', appDataDir);
    this.appDataDir = appDataDir;
    this.persistence = new SessionPersistence(appDataDir);
    await this.persistence.initialize();

    // Initialize tool policy service
    await toolPolicyService.initialize();
    console.error('[AgentRunner] Tool policy service initialized');

    // Initialize and start cron service
    cronService.initialize(this);
    await cronService.start();
    console.error('[AgentRunner] Cron service initialized and started');

    const count = await this.restoreSessionsFromDisk();
    this.isInitialized = true;
    console.error('[AgentRunner] Persistence initialized, restored', count, 'sessions');
    return { sessionsRestored: count };
  }

  /**
   * Get initialization status for frontend coordination.
   */
  getInitializationStatus(): { initialized: boolean; sessionCount: number } {
    return {
      initialized: this.isInitialized,
      sessionCount: this.sessions.size,
    };
  }

  // ============================================================================
  // Deep Agents Service Management
  // ============================================================================

  /**
   * Get or create MemoryService for a session's working directory.
   */
  private async getMemoryService(workingDirectory: string): Promise<MemoryService> {
    let service = this.memoryServices.get(workingDirectory);
    if (!service) {
      service = createMemoryService(workingDirectory);
      await service.initialize();
      this.memoryServices.set(workingDirectory, service);
    }
    return service;
  }

  /**
   * Get or create MemoryExtractor for a session.
   */
  private getMemoryExtractor(sessionId: string): MemoryExtractor {
    let extractor = this.memoryExtractors.get(sessionId);
    if (!extractor) {
      extractor = createMemoryExtractor({
        enabled: true,
        confidenceThreshold: 0.7,
        maxPerConversation: 5,
      });
      this.memoryExtractors.set(sessionId, extractor);
    }
    return extractor;
  }

  /**
   * Get or create AgentsMdService for a session's working directory.
   */
  private getAgentsMdService(workingDirectory: string): AgentsMdService {
    let service = this.agentsMdServices.get(workingDirectory);
    if (!service) {
      service = createAgentsMdService();
      this.agentsMdServices.set(workingDirectory, service);
    }
    return service;
  }

  /**
   * Load AGENTS.md config for a session, caching the result.
   */
  private async loadAgentsMdConfig(workingDirectory: string): Promise<AgentsMdConfig | null> {
    if (this.agentsMdConfigs.has(workingDirectory)) {
      return this.agentsMdConfigs.get(workingDirectory) || null;
    }
    const service = this.getAgentsMdService(workingDirectory);
    const config = await service.parse(workingDirectory);
    this.agentsMdConfigs.set(workingDirectory, config);
    return config;
  }

  /**
   * Clear Deep Agents services for a session (on session delete).
   */
  private clearSessionServices(sessionId: string, workingDirectory: string): void {
    this.memoryExtractors.delete(sessionId);
    // Note: memory service and agents.md service are shared per working directory
    // Only clean them up if no other session uses this working directory
    const otherSessionsWithSameDir = Array.from(this.sessions.values())
      .filter(s => s.id !== sessionId && s.workingDirectory === workingDirectory);
    if (otherSessionsWithSameDir.length === 0) {
      this.memoryServices.delete(workingDirectory);
      this.agentsMdServices.delete(workingDirectory);
      this.agentsMdConfigs.delete(workingDirectory);
    }
  }

  /**
   * Verify persistence health by checking each session can be read from disk.
   */
  async verifyPersistence(): Promise<{
    healthy: boolean;
    initialized: boolean;
    sessionCount: number;
    persistedCount: number;
    issues: string[];
  }> {
    if (!this.persistence) {
      return {
        healthy: false,
        initialized: false,
        sessionCount: 0,
        persistedCount: 0,
        issues: ['Persistence not initialized'],
      };
    }

    const status = this.getInitializationStatus();
    const sessions = this.listSessions();
    const issues: string[] = [];

    // Verify each session can be read from disk
    for (const session of sessions) {
      try {
        const persisted = await this.persistence.loadSession(session.id);
        if (!persisted) {
          issues.push(`Session ${session.id} not found on disk`);
        }
      } catch (error) {
        issues.push(`Session ${session.id} read error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      healthy: issues.length === 0,
      initialized: status.initialized,
      sessionCount: status.sessionCount,
      persistedCount: sessions.length,
      issues,
    };
  }

  /**
   * Restore sessions from disk on startup.
   * Returns the count of successfully restored sessions.
   */
  private async restoreSessionsFromDisk(): Promise<number> {
    if (!this.persistence) {
      console.error('[AgentRunner] No persistence, skipping restore');
      return 0;
    }

    console.error('[AgentRunner] Restoring sessions from disk...');
    const persistedSessions = await this.persistence.loadAllSessions();
    console.error('[AgentRunner] Found', persistedSessions.size, 'persisted sessions');

    let restoredCount = 0;
    for (const [sessionId, data] of persistedSessions) {
      try {
        console.error('[AgentRunner] Recreating session:', sessionId, 'chatItems:', data.chatItems.length);
        const session = await this.recreateSession(data);
        this.sessions.set(sessionId, session);

        // Subscribe to agent events for restored sessions (same as in createSession)
        this.subscribeToAgentEvents(session);

        restoredCount++;
        console.error('[AgentRunner] Restored session:', sessionId);
      } catch (error) {
        console.error(`[AgentRunner] Failed to recreate session ${sessionId}:`, error);
      }
    }

    console.error('[AgentRunner] Restoration complete. Total restored:', restoredCount);
    console.error('[AgentRunner] Sessions in memory:', this.sessions.size);
    return restoredCount;
  }

  /**
   * Recreate an ActiveSession from persisted V2 data.
   * Agent will be recreated lazily on first message.
   */
  private async recreateSession(data: PersistedSessionDataV2): Promise<ActiveSession> {
    // Convert chatItems back to legacy messages for backwards compatibility
    const messages = this.chatItemsToMessages(data.chatItems);
    const toolExecutions = this.chatItemsToToolExecutions(data.chatItems);

    const session: ActiveSession = {
      id: data.metadata.id,
      type: (data.metadata as { type?: SessionType }).type || 'main',
      workingDirectory: data.metadata.workingDirectory,
      model: data.metadata.model,
      title: data.metadata.title,
      approvalMode: data.metadata.approvalMode,
      agent: {} as DeepAgentInstance, // Will be recreated on first message
      messages,
      chatItems: data.chatItems,
      currentTurnId: undefined,
      tasks: data.tasks,
      lastTodosSignature: undefined,
      artifacts: data.artifacts,
      toolExecutions,
      permissionCache: new Map(),
      permissionScopes: new Map(),
      toolStartTimes: new Map(),
      pendingPermissions: new Map(),
      pendingQuestions: new Map(),
      activeParentToolId: undefined,
      inFlightPermissions: new Map(),
      lastKnownPromptTokens: 0,
      createdAt: data.metadata.createdAt,
      updatedAt: data.metadata.updatedAt,
      lastAccessedAt: data.metadata.lastAccessedAt,
    };

    return session;
  }

  /**
   * Convert ChatItems to legacy Message format for backwards compatibility.
   */
  private chatItemsToMessages(chatItems: ChatItem[]): Message[] {
    const messages: Message[] = [];
    for (const item of chatItems) {
      if (item.kind === 'user_message') {
        messages.push({
          id: item.id.replace('ci-', ''),
          role: 'user',
          content: item.content as Message['content'],
          createdAt: item.timestamp,
        });
      } else if (item.kind === 'assistant_message') {
        messages.push({
          id: item.id.replace('ci-', ''),
          role: 'assistant',
          content: item.content as Message['content'],
          createdAt: item.timestamp,
          metadata: item.metadata,
        });
      } else if (item.kind === 'system_message') {
        messages.push({
          id: item.id.replace('ci-', ''),
          role: 'system',
          content: item.content,
          createdAt: item.timestamp,
          metadata: item.metadata,
        });
      }
    }
    return messages;
  }

  /**
   * Convert ChatItems to legacy ToolExecution format for backwards compatibility.
   */
  private chatItemsToToolExecutions(chatItems: ChatItem[]): ToolExecution[] {
    const toolMap = new Map<string, ToolExecution>();

    for (const item of chatItems) {
      if (item.kind === 'tool_start') {
        toolMap.set(item.toolId, {
          id: item.toolId,
          name: item.name,
          args: item.args,
          status: item.status === 'running' ? 'running' : item.status === 'error' ? 'error' : 'success',
          startedAt: item.timestamp,
          parentToolId: item.parentToolId,
        });
      } else if (item.kind === 'tool_result') {
        const existing = toolMap.get(item.toolId);
        if (existing) {
          existing.status = item.status === 'error' ? 'error' : 'success';
          existing.result = item.result;
          existing.error = item.error;
          existing.completedAt = item.timestamp;
        }
      }
    }

    return Array.from(toolMap.values());
  }

  /**
   * Initialize the provider with API key.
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.provider = new GeminiProvider({
      credentials: {
        type: 'api_key',
        apiKey,
      },
    });
  }

  setModelCatalog(models: Array<{ id: string; inputTokenLimit?: number; outputTokenLimit?: number }>): void {
    setModelContextWindows(models);
    this.modelCatalog = models;

    for (const session of this.sessions.values()) {
      this.emitContextUsage(session);
    }
  }

  /**
   * Set specialized models for image/video generation and computer use.
   */
  setSpecializedModels(models: Partial<SpecializedModels>): void {
    this.specializedModels = { ...this.specializedModels, ...models };
    console.error('[AgentRunner] Specialized models updated:', this.specializedModels);
  }

  /**
   * Get the image generation model.
   */
  getImageGenerationModel(): string {
    return this.specializedModels.imageGeneration;
  }

  /**
   * Get the video generation model.
   */
  getVideoGenerationModel(): string {
    return this.specializedModels.videoGeneration;
  }

  /**
   * Get the computer use model.
   */
  getComputerUseModel(): string {
    return this.specializedModels.computerUse;
  }

  /**
   * Check if provider is ready.
   */
  isReady(): boolean {
    // Provider is ready if it's initialized (has API key set)
    return this.provider !== null;
  }

  /**
   * Update MCP servers and refresh tools for all sessions.
   */
  async setMcpServers(servers: Array<{ id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean; prompt?: string; contextFileName?: string }>): Promise<void> {
    await mcpBridge.setServers(servers.map((server) => ({
      ...server,
      enabled: server.enabled ?? true,
    })));
    this.mcpServers = servers.map((server) => ({
      id: server.id,
      name: server.name,
      prompt: server.prompt,
      contextFileName: server.contextFileName,
      enabled: server.enabled ?? true,
    }));

    for (const session of this.sessions.values()) {
      const toolHandlers = this.buildToolHandlers(session);
      session.agent = await this.createDeepAgent(session, toolHandlers);
    }
  }

  /**
   * Update skills and refresh tools for all sessions.
   * Supports both legacy SkillConfig format and new skill IDs.
   */
  async setSkills(skills: SkillConfig[]): Promise<void> {
    this.skills = skills.map((skill) => ({
      ...skill,
      enabled: skill.enabled ?? true,
    }));

    // Also update enabledSkillIds for new skill service integration
    this.enabledSkillIds = new Set(
      skills.filter((s) => s.enabled !== false).map((s) => s.id)
    );

    for (const session of this.sessions.values()) {
      const toolHandlers = this.buildToolHandlers(session);
      session.agent = await this.createDeepAgent(session, toolHandlers);
    }
  }

  /**
   * Set enabled skill IDs directly (for new marketplace skills)
   */
  async setEnabledSkillIds(skillIds: string[]): Promise<void> {
    this.enabledSkillIds = new Set(skillIds);

    for (const session of this.sessions.values()) {
      const toolHandlers = this.buildToolHandlers(session);
      session.agent = await this.createDeepAgent(session, toolHandlers);
    }
  }

  /**
   * Update approval mode for a session.
   */
  setApprovalMode(sessionId: string, mode: ApprovalMode): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.approvalMode = mode;
  }

  /**
   * Create a new session.
   */
  async createSession(
    workingDirectory: string,
    model?: string | null,
    title?: string,
    type: SessionType = 'main'
  ): Promise<SessionInfo> {
    if (!this.provider) {
      throw new Error('Provider not initialized. Set API key first.');
    }

    // Use provided model or fall back to default
    // This handles both undefined and null cases (null comes from Rust's Option::None)
    const actualModel = model || this.modelCatalog[0]?.id;
    if (!actualModel) {
      throw new Error('No models available. Configure the API key and fetch models first.');
    }

    const sessionId = generateId('sess');
    const now = Date.now();

    // Create session
    const session: ActiveSession = {
      id: sessionId,
      type,
      workingDirectory,
      model: actualModel,
      title: title || null,
      approvalMode: 'auto',
      agent: {} as DeepAgentInstance,
      messages: [],
      chatItems: [],
      currentTurnId: undefined,
      tasks: [],
      lastTodosSignature: undefined,
      artifacts: [],
      toolExecutions: [],
      permissionCache: new Map(),
      permissionScopes: new Map(),
      toolStartTimes: new Map(),
      pendingPermissions: new Map(),
      pendingQuestions: new Map(),
      activeParentToolId: undefined,
      inFlightPermissions: new Map(),
      lastKnownPromptTokens: 0,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };

    const toolHandlers = this.buildToolHandlers(session);
    session.agent = await this.createDeepAgent(session, toolHandlers);

    this.sessions.set(sessionId, session);

    // Subscribe to agent events
    this.subscribeToAgentEvents(session);

    const sessionInfo: SessionInfo = {
      id: sessionId,
      type,
      title: session.title,
      firstMessage: null,
      workingDirectory,
      model: actualModel,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      messageCount: 0,
    };

    eventEmitter.sessionUpdated(sessionInfo);

    return sessionInfo;
  }

  /**
   * Send a message to a session.
   */
  async sendMessage(
    sessionId: string,
    content: string,
    attachments?: Attachment[]
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Reset/replace any in-flight abort controller
    if (session.abortController && !session.abortController.signal.aborted) {
      session.abortController.abort();
    }
    const abortController = new AbortController();
    session.abortController = abortController;
    session.stopRequested = false;

    // Build message content
    let messageContent: string | Message['content'] = content;

    if (attachments && attachments.length > 0) {
      const parts: MessageContentPart[] = [];

      if (content.trim()) {
        parts.push({ type: 'text' as const, text: content });
      }

      for (const attachment of attachments) {
        if (attachment.type === 'image' && attachment.data) {
          parts.push({
            type: 'image' as const,
            mimeType: attachment.mimeType,
            data: attachment.data,
          });
        } else if (attachment.type === 'audio' && attachment.data) {
          parts.push({
            type: 'audio' as const,
            mimeType: attachment.mimeType || 'audio/mpeg',
            data: attachment.data,
          });
        } else if (attachment.type === 'video' && attachment.data) {
          parts.push({
            type: 'video' as const,
            mimeType: attachment.mimeType || 'video/mp4',
            data: attachment.data,
          });
        } else if ((attachment.type === 'file' || attachment.type === 'pdf') && attachment.data) {
          parts.push({
            type: 'file' as const,
            name: attachment.name,
            mimeType: attachment.mimeType,
            data: attachment.data,
          });
        } else if (attachment.type === 'text' && attachment.data) {
          parts.push({
            type: 'text' as const,
            text: `File: ${attachment.name}\n${attachment.data}`,
          });
        } else if (attachment.type === 'file' || attachment.type === 'pdf') {
          parts.push({
            type: 'text' as const,
            text: `File: ${attachment.name}`,
          });
        }
      }

      if (parts.length > 0) {
        messageContent = parts;
      }
    }

    // Persist user message
    const userMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content: messageContent,
      createdAt: now(),
    };
    session.messages.push(userMessage);
    session.updatedAt = Date.now();

    // Track turn info for tool association
    this.currentTurnInfo.set(sessionId, {
      turnMessageId: userMessage.id,
      toolIds: [],
    });

    // V2: Create and emit UserMessageItem
    // Filter attachments to only include supported types (exclude 'other')
    const chatItemAttachments = attachments?.filter(
      (a): a is typeof a & { type: 'file' | 'image' | 'text' | 'audio' | 'video' | 'pdf' } =>
        a.type !== 'other'
    );
    const userChatItem: UserMessageItem = {
      id: generateChatItemId(),
      kind: 'user_message',
      timestamp: userMessage.createdAt,
      turnId: userMessage.id,
      content: messageContent,
      attachments: chatItemAttachments,
    };
    session.chatItems.push(userChatItem);
    session.currentTurnId = userMessage.id;
    eventEmitter.chatItem(sessionId, userChatItem);
    // V2: Immediate persistence for crash recovery
    await this.persistence?.appendChatItem(sessionId, userChatItem);

    // Ensure agent is initialized (may be restored from disk without agent)
    if (!session.agent.invoke) {
      const toolHandlers = this.buildToolHandlers(session);
      session.agent = await this.createDeepAgent(session, toolHandlers);
      this.subscribeToAgentEvents(session);
    }

    // Emit stream start
    eventEmitter.streamStart(sessionId);

    const lcMessages = this.toLangChainMessages(session.messages, session);
    const agentAny = session.agent as DeepAgentInstance;
    let assistantMessage: Message | null = null;
    let streamedText = '';

    try {

      if (agentAny.streamEvents) {
        try {
          const streamOptions = {
            version: 'v2',
            recursionLimit: RECURSION_LIMIT,
            signal: abortController.signal,
            abortSignal: abortController.signal,
          };
          const stream = agentAny.streamEvents(
            { messages: lcMessages },
            streamOptions
          );
          let finalState: unknown = null;

          let thinkingStarted = false;
          let streamingStarted = false;
          let thinkingItemId: string | null = null;
          let accumulatedThinking = '';

          for await (const event of stream) {
            if (session.stopRequested) {
              break;
            }

            // Extract thinking content (agent's internal reasoning)
            const thinkingText = this.extractThinkingContent(event);
            if (thinkingText) {
              console.error(`[stream] Thinking content received: ${thinkingText.substring(0, 100)}...`);
              if (!thinkingStarted) {
                eventEmitter.thinkingStart(sessionId);
                thinkingStarted = true;

                // V2: Create ThinkingItem
                thinkingItemId = generateChatItemId();
                const thinkingItem: ThinkingItem = {
                  id: thinkingItemId,
                  kind: 'thinking',
                  timestamp: Date.now(),
                  turnId: session.currentTurnId,
                  content: '',
                  status: 'active',
                };
                session.chatItems.push(thinkingItem);
                eventEmitter.chatItem(sessionId, thinkingItem);
                // V2: Immediate persistence for crash recovery
                this.persistence?.appendChatItem(sessionId, thinkingItem).catch(() => {});
              }
              accumulatedThinking += thinkingText;
              eventEmitter.thinkingChunk(sessionId, thinkingText);
            }

            // Extract regular stream content
            const chunkText = this.extractStreamChunkText(event);
            if (chunkText) {
              // If we were thinking, mark thinking as done when regular content starts
              if (thinkingStarted && !streamingStarted) {
                eventEmitter.thinkingDone(sessionId);
                streamingStarted = true;

                // V2: Update ThinkingItem to done with full content
                if (thinkingItemId) {
                  const thinkingItem = session.chatItems.find(i => i.id === thinkingItemId) as ThinkingItem | undefined;
                  if (thinkingItem) {
                    thinkingItem.content = accumulatedThinking;
                    thinkingItem.status = 'done';
                    eventEmitter.chatItemUpdate(sessionId, thinkingItemId, { content: accumulatedThinking, status: 'done' });
                    // V2: Immediate persistence for crash recovery
                    this.persistence?.updateChatItem(sessionId, thinkingItemId, { content: accumulatedThinking, status: 'done' }).catch(() => {});
                  }
                }
              }
              streamedText += chunkText;
              eventEmitter.streamChunk(sessionId, chunkText);
            }

            const output = this.extractStateFromStreamEvent(event);
            if (output) {
              finalState = output;
            }

            // Try to extract usage metadata from stream events
            this.extractUsageFromStreamEvent(session, event);

            this.syncTasksFromStreamEvent(session, event);
          }

          // Ensure thinking is marked done if it was started
          if (thinkingStarted && !streamingStarted) {
            eventEmitter.thinkingDone(sessionId);

            // V2: Update ThinkingItem to done
            if (thinkingItemId) {
              const thinkingItem = session.chatItems.find(i => i.id === thinkingItemId) as ThinkingItem | undefined;
              if (thinkingItem) {
                thinkingItem.content = accumulatedThinking;
                thinkingItem.status = 'done';
                eventEmitter.chatItemUpdate(sessionId, thinkingItemId, { content: accumulatedThinking, status: 'done' });
                // V2: Immediate persistence for crash recovery
                this.persistence?.updateChatItem(sessionId, thinkingItemId, { content: accumulatedThinking, status: 'done' }).catch(() => {});
              }
            }
          }

          if (session.stopRequested) {
            if (streamedText) {
              assistantMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: streamedText,
                createdAt: now(),
              };
            }
          } else {
            assistantMessage = this.extractAssistantMessage(finalState);
            if (finalState) {
              this.syncTasksFromState(session, finalState);
              this.updateUsageFromState(session, finalState);
            }
            if (!assistantMessage && streamedText) {
              assistantMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: streamedText,
                createdAt: now(),
              };
            }
          }
        } catch (streamError) {
          if (this.isAbortError(streamError) || session.stopRequested) {
            if (streamedText) {
              assistantMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: streamedText,
                createdAt: now(),
              };
            }
          } else if (!streamedText) {
            const invokeOptions = {
              recursionLimit: RECURSION_LIMIT,
              signal: abortController.signal,
              abortSignal: abortController.signal,
            };
            const result = await session.agent.invoke(
              { messages: lcMessages },
              invokeOptions
            );
            assistantMessage = this.extractAssistantMessage(result);
            this.syncTasksFromState(session, result);
            this.updateUsageFromState(session, result);
            if (assistantMessage) {
              const textContent = this.extractTextContent(assistantMessage);
              if (textContent) {
                eventEmitter.streamChunk(sessionId, textContent);
              }
            }
          } else {
            throw streamError;
          }
        }
      } else {
        const invokeOptions = {
          recursionLimit: RECURSION_LIMIT,
          signal: abortController.signal,
          abortSignal: abortController.signal,
        };
        const result = await session.agent.invoke(
          { messages: lcMessages },
          invokeOptions
        );
        assistantMessage = this.extractAssistantMessage(result);
        this.syncTasksFromState(session, result);
        this.updateUsageFromState(session, result);
        if (assistantMessage) {
          const textContent = this.extractTextContent(assistantMessage);
          if (textContent) {
            eventEmitter.streamChunk(sessionId, textContent);
          }
        }
      }

      if (assistantMessage) {
        session.messages.push(assistantMessage);
        session.updatedAt = Date.now();
        eventEmitter.streamDone(sessionId, assistantMessage);

        // V2: Create and emit AssistantMessageItem
        const assistantChatItem: AssistantMessageItem = {
          id: generateChatItemId(),
          kind: 'assistant_message',
          timestamp: assistantMessage.createdAt,
          turnId: session.currentTurnId,
          content: assistantMessage.content,
          metadata: assistantMessage.metadata,
        };
        session.chatItems.push(assistantChatItem);
        eventEmitter.chatItem(sessionId, assistantChatItem);
        // V2: Immediate persistence for crash recovery
        this.persistence?.appendChatItem(sessionId, assistantChatItem).catch(() => {});
      } else {
        eventEmitter.streamDone(sessionId, {
          id: generateMessageId(),
          role: 'assistant',
          content: '',
          createdAt: now(),
        });
      }

      // Update context usage and compact if needed
      this.emitContextUsage(session);
      await this.maybeCompactContext(session);
    } catch (error) {
      if (this.isAbortError(error) || session.stopRequested) {
        if (streamedText) {
          const assistantMessage: Message = {
            id: generateMessageId(),
            role: 'assistant',
            content: streamedText,
            createdAt: now(),
          };
          session.messages.push(assistantMessage);
          session.updatedAt = Date.now();
          eventEmitter.streamDone(sessionId, assistantMessage);

          // V2: Create and emit AssistantMessageItem for abort case
          const assistantChatItem: AssistantMessageItem = {
            id: generateChatItemId(),
            kind: 'assistant_message',
            timestamp: assistantMessage.createdAt,
            turnId: session.currentTurnId,
            content: assistantMessage.content,
          };
          session.chatItems.push(assistantChatItem);
          eventEmitter.chatItem(sessionId, assistantChatItem);
          // V2: Immediate persistence for crash recovery
          this.persistence?.appendChatItem(sessionId, assistantChatItem).catch(() => {});
        } else {
          eventEmitter.streamDone(sessionId, {
            id: generateMessageId(),
            role: 'assistant',
            content: '',
            createdAt: now(),
          });
        }
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Determine error code based on error message
      let errorCode = 'AGENT_ERROR';
      if (
        errorMessage.includes('401') ||
        errorMessage.toLowerCase().includes('api key') ||
        errorMessage.toLowerCase().includes('authentication') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('invalid key')
      ) {
        errorCode = 'INVALID_API_KEY';
      } else if (
        errorMessage.includes('429') ||
        errorMessage.toLowerCase().includes('rate limit')
      ) {
        errorCode = 'RATE_LIMIT';
      } else if (
        errorMessage.includes('500') ||
        errorMessage.includes('503') ||
        errorMessage.toLowerCase().includes('service unavailable')
      ) {
        errorCode = 'SERVICE_ERROR';
      }

      const rateLimitDetails = errorCode === 'RATE_LIMIT' ? this.parseRateLimitDetails(errorMessage) : null;

      // V2: Create and persist ErrorItem
      const errorItem: ErrorItem = {
        id: generateChatItemId(),
        kind: 'error',
        timestamp: Date.now(),
        turnId: session.currentTurnId,
        message: errorMessage,
        code: errorCode,
        recoverable: errorCode !== 'INVALID_API_KEY',
        details: rateLimitDetails ? { ...rateLimitDetails } : undefined,
      };
      session.chatItems.push(errorItem);
      eventEmitter.chatItem(sessionId, errorItem);
      this.persistence?.appendChatItem(sessionId, errorItem).catch(() => {});

      eventEmitter.error(sessionId, errorMessage, errorCode, rateLimitDetails ?? undefined);
      // Don't re-throw - error has been emitted to UI, re-throwing causes unhandled rejection
    } finally {
      session.stopRequested = false;
      session.abortController = undefined;
      eventEmitter.flushSync();

      // Finalize turn and persist to disk
      await this.finalizeAndPersistTurn(session);
    }
  }

  /**
   * Respond to a permission request.
   */
  respondToPermission(
    sessionId: string,
    permissionId: string,
    decision: PermissionDecision
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const pending = session.pendingPermissions.get(permissionId);
    if (!pending) {
      throw new Error(`Permission request not found: ${permissionId}`);
    }

    // Resolve the promise
    pending.resolve(decision);
    session.pendingPermissions.delete(permissionId);

    if (decision === 'allow_session') {
      const paths = this.resolveRequestPaths(session, pending.request);
      if (paths.length > 0) {
        const scopeSet = session.permissionScopes.get(pending.request.type) ?? new Set<string>();
        for (const path of paths) {
          scopeSet.add(path);
        }
        session.permissionScopes.set(pending.request.type, scopeSet);
      } else {
        const cacheKey = `${pending.request.type}:${pending.request.resource}`;
        session.permissionCache.set(cacheKey, decision);
      }
    }

    // Emit resolved event
    eventEmitter.permissionResolved(sessionId, permissionId, decision);
  }

  /**
   * Stop generation for a session.
   */
  stopGeneration(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.stopRequested = true;
    if (session.abortController && !session.abortController.signal.aborted) {
      session.abortController.abort();
    }
    // Resolve any pending permission requests to unblock the agent.
    for (const [permissionId, pending] of session.pendingPermissions.entries()) {
      pending.resolve('deny');
      session.pendingPermissions.delete(permissionId);
      eventEmitter.permissionResolved(sessionId, permissionId, 'deny');
    }

    // Clear in-flight permissions to prevent stale state
    session.inFlightPermissions.clear();

    const agentAny = session.agent as { abort?: () => void; stop?: () => void; cancel?: () => void };
    if (agentAny.abort) {
      agentAny.abort();
    } else if (agentAny.cancel) {
      agentAny.cancel();
    } else if (agentAny.stop) {
      agentAny.stop();
    }
  }

  /**
   * Ask a question to the user and wait for response.
   * This is used by tools that need user input.
   */
  async askQuestion(
    sessionId: string,
    question: string,
    options?: { label: string; description?: string }[],
    multiSelect?: boolean,
    header?: string
  ): Promise<string | string[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const questionId = generateId('q');

    const questionRequest: QuestionRequest = {
      id: questionId,
      question,
      options,
      multiSelect,
      header,
      timestamp: Date.now(),
    };

    // V2: Create and persist QuestionItem
    const questionItem: QuestionItem = {
      id: generateChatItemId(),
      kind: 'question',
      timestamp: Date.now(),
      turnId: session.currentTurnId,
      questionId: questionId,
      question: question,
      header: header,
      options: options?.map(o => ({ label: o.label, description: o.description })),
      multiSelect: multiSelect,
      status: 'pending',
    };
    session.chatItems.push(questionItem);
    eventEmitter.chatItem(sessionId, questionItem);
    this.persistence?.appendChatItem(sessionId, questionItem).catch(() => {});

    return new Promise((resolve) => {
      // Store pending question
      session.pendingQuestions.set(questionId, {
        request: questionRequest,
        resolve,
      });

      // Emit question event
      eventEmitter.questionAsk(sessionId, questionRequest);
    });
  }

  /**
   * Respond to a question from the agent.
   */
  respondToQuestion(
    sessionId: string,
    questionId: string,
    answer: string | string[]
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const pending = session.pendingQuestions.get(questionId);
    if (!pending) {
      throw new Error(`Question not found: ${questionId}`);
    }

    // Resolve the promise with the answer
    pending.resolve(answer);
    session.pendingQuestions.delete(questionId);

    // Emit answered event
    eventEmitter.questionAnswered(sessionId, questionId, answer);
  }

  /**
   * Get all sessions, sorted by lastAccessedAt (most recent first).
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values())
      .map(session => {
        const firstMessage = this.getFirstMessagePreview(session);

        return {
          id: session.id,
          type: session.type,
          title: session.title,
          firstMessage,
          workingDirectory: session.workingDirectory,
          model: session.model,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          lastAccessedAt: session.lastAccessedAt,
          messageCount: session.messages.length,
        };
      })
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): SessionDetails | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const firstMessage = this.getFirstMessagePreview(session);

    return {
      id: session.id,
      type: session.type,
      title: session.title,
      firstMessage,
      workingDirectory: session.workingDirectory,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastAccessedAt: session.updatedAt,
      messageCount: session.messages.length,
      messages: session.messages,
      chatItems: session.chatItems,
      tasks: session.tasks,
      artifacts: session.artifacts,
      toolExecutions: session.toolExecutions,
    };
  }

  /**
   * Delete a session.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Stop agent if running
    session.agent.stop?.();

    // Clear pending permissions
    for (const pending of session.pendingPermissions.values()) {
      pending.resolve('deny');
    }
    session.pendingPermissions.clear();

    // Clear in-flight permissions
    session.inFlightPermissions.clear();

    // Delete from disk FIRST (before memory)
    if (this.persistence) {
      try {
        await this.persistence.deleteSession(sessionId);
      } catch (error) {
        console.error(`[AgentRunner] Failed to delete session from disk:`, error);
        throw error;
      }
    }

    // Clean up Deep Agents services for this session
    this.clearSessionServices(sessionId, session.workingDirectory);
    this.middlewareHooks.delete(sessionId);

    // Only delete from memory after successful disk deletion
    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Finalize turn and persist session to disk.
   * Associates tool executions with the user message that initiated them.
   * Now uses V2 unified chatItems format.
   */
  private async finalizeAndPersistTurn(session: ActiveSession): Promise<void> {
    const turnInfo = this.currentTurnInfo.get(session.id);
    if (!turnInfo) return;

    // Find the user message for this turn (for legacy compatibility)
    const userMessage = session.messages.find(m => m.id === turnInfo.turnMessageId) as PersistedMessage | undefined;
    if (userMessage) {
      userMessage.toolExecutionIds = [...turnInfo.toolIds];
    }

    // Update tool executions with turn info (for legacy compatibility)
    let turnOrder = 0;
    for (const toolId of turnInfo.toolIds) {
      const execution = session.toolExecutions.find(t => t.id === toolId) as PersistedToolExecution | undefined;
      if (execution) {
        execution.turnMessageId = turnInfo.turnMessageId;
        execution.turnOrder = turnOrder++;
      }
    }

    // Update session timestamp
    session.updatedAt = Date.now();

    // Clear current turn ID
    session.currentTurnId = undefined;

    // Persist to disk using V2 format
    if (this.persistence) {
      try {
        // Use new V2 save method that stores chatItems
        await this.persistence.saveSessionV2({
          metadata: {
            version: 2,
            id: session.id,
            type: session.type,
            title: session.title,
            workingDirectory: session.workingDirectory,
            model: session.model,
            approvalMode: session.approvalMode,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            lastAccessedAt: session.lastAccessedAt,
          },
          chatItems: session.chatItems,
          tasks: session.tasks,
          artifacts: session.artifacts,
        });
      } catch (error) {
        console.error(`Failed to persist session ${session.id}:`, error);
      }
    }

    // Clear turn tracking
    this.currentTurnInfo.delete(session.id);
  }

  /**
   * Update session title.
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    console.error('[AgentRunner] updateSessionTitle called:', sessionId, 'title:', title);

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error('[AgentRunner] Session not found for title update:', sessionId);
      console.error('[AgentRunner] Available sessions:', Array.from(this.sessions.keys()));
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.title = title;
    session.updatedAt = Date.now();
    console.error('[AgentRunner] Title updated in memory, persisting...');

    // CRITICAL: Persist to disk using V2 format
    if (this.persistence) {
      try {
        await this.persistence.saveSessionV2({
          metadata: {
            version: 2,
            id: session.id,
            type: session.type,
            title: session.title,
            workingDirectory: session.workingDirectory,
            model: session.model,
            approvalMode: session.approvalMode,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            lastAccessedAt: session.lastAccessedAt,
          },
          chatItems: session.chatItems,
          tasks: session.tasks,
          artifacts: session.artifacts,
        });
        console.error('[AgentRunner] Title persisted to disk successfully');
      } catch (error) {
        console.error(`Failed to persist session title update for ${session.id}:`, error);
      }
    }

    // Emit session updated event
    const firstMessage = this.getFirstMessagePreview(session);

    const sessionInfo: SessionInfo = {
      id: session.id,
      type: session.type,
      title: session.title,
      firstMessage,
      workingDirectory: session.workingDirectory,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastAccessedAt: session.lastAccessedAt,
      messageCount: session.messages.length,
    };
    eventEmitter.sessionUpdated(sessionInfo);
  }

  /**
   * Update session last accessed time.
   */
  async updateSessionLastAccessed(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = Date.now();
    session.lastAccessedAt = now;

    // Persist to disk using V2 format
    if (this.persistence) {
      try {
        await this.persistence.saveSessionV2({
          metadata: {
            version: 2,
            id: session.id,
            type: session.type,
            title: session.title,
            workingDirectory: session.workingDirectory,
            model: session.model,
            approvalMode: session.approvalMode,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            lastAccessedAt: session.lastAccessedAt,
          },
          chatItems: session.chatItems,
          tasks: session.tasks,
          artifacts: session.artifacts,
        });
      } catch (error) {
        console.error(`Failed to persist lastAccessedAt update for ${session.id}:`, error);
      }
    }
  }

  /**
   * Update session working directory.
   */
  async updateSessionWorkingDirectory(sessionId: string, workingDirectory: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const oldWorkingDirectory = session.workingDirectory;
    session.workingDirectory = workingDirectory;
    session.updatedAt = Date.now();

    // Refresh agent with updated working directory
    const toolHandlers = this.buildToolHandlers(session);
    session.agent = await this.createDeepAgent(session, toolHandlers);

    // CRITICAL: Persist to disk and update workspace indices using V2 format
    if (this.persistence) {
      try {
        // Remove from old workspace index
        await this.persistence.removeSessionFromWorkspace(sessionId, oldWorkingDirectory);

        // Save session with new working directory (also adds to new workspace index)
        await this.persistence.saveSessionV2({
          metadata: {
            version: 2,
            id: session.id,
            type: session.type,
            title: session.title,
            workingDirectory: session.workingDirectory,
            model: session.model,
            approvalMode: session.approvalMode,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            lastAccessedAt: session.lastAccessedAt,
          },
          chatItems: session.chatItems,
          tasks: session.tasks,
          artifacts: session.artifacts,
        });
      } catch (error) {
        console.error(`Failed to persist working directory update for ${session.id}:`, error);
      }
    }

    // Emit session updated event
    const firstMessageWd = this.getFirstMessagePreview(session);

    const sessionInfo: SessionInfo = {
      id: session.id,
      type: session.type,
      title: session.title,
      firstMessage: firstMessageWd,
      workingDirectory: session.workingDirectory,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastAccessedAt: session.lastAccessedAt,
      messageCount: session.messages.length,
    };
    eventEmitter.sessionUpdated(sessionInfo);
  }

  /**
   * Get tasks for a session.
   * Tasks come from DeepAgents state synchronization.
   */
  getTasks(sessionId: string): Task[] {
    const session = this.sessions.get(sessionId);
    return session?.tasks ?? [];
  }

  /**
   * Get artifacts for a session.
   */
  getArtifacts(sessionId: string): Artifact[] {
    const session = this.sessions.get(sessionId);
    return session?.artifacts || [];
  }

  /**
   * Get context usage for a session.
   * Uses the model's actual context window from the API.
   */
  getContextUsage(sessionId: string): { used: number; total: number; percentage: number } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const defaultContext = getModelContextWindow('gemini-3-flash-preview');
      return { used: 0, total: defaultContext.input, percentage: 0 };
    }

    // Prefer API-tracked usage if available (more accurate than estimation)
    const used = session.lastKnownPromptTokens > 0
      ? session.lastKnownPromptTokens
      : this.estimateTokens(session.messages);

    // Get context window from model configuration
    const contextWindow = getModelContextWindow(session.model);
    const total = contextWindow.input;

    return {
      used,
      total,
      percentage: Math.round((used / total) * 100),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async buildSystemPrompt(session: ActiveSession): Promise<string> {
    const now = new Date();
    const basePrompt = `You are Gemini Cowork, a software development assistant powered by DeepAgents.

## Environment
Working Directory: ${session.workingDirectory}
Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}
Platform: ${process.platform}
Home: ${homedir()}

## Tone and Style
Be direct and concise. Avoid unnecessary preamble, postamble, or filler phrases.
- DO NOT start responses with "I'll", "Let me", "Sure", "Of course"
- DO NOT end with offers of further help unless relevant
- DO use active voice and be specific about what you're doing
- Output code without excessive comments unless requested

When asked to do something:
- If straightforward, do it without commentary
- If complex, briefly explain your approach, then execute
- If unclear, ask for clarification before acting

## Task Management with write_todos
For complex multi-step work, use write_todos to track progress. The UI displays these in real-time.

### When to Use
- Task requires 3+ distinct steps
- Work spans multiple tool calls
- Need to show progress on longer operations

### Workflow
1. Create tasks when starting:
\`\`\`
write_todos([
  { status: 'in_progress', content: 'Analyze existing code' },
  { status: 'pending', content: 'Implement changes' },
  { status: 'pending', content: 'Verify and test' }
])
\`\`\`

2. Update as you work - mark 'in_progress' when starting, 'completed' when done:
\`\`\`
write_todos([
  { status: 'completed', content: 'Analyze existing code' },
  { status: 'in_progress', content: 'Implement changes' },
  { status: 'pending', content: 'Verify and test' }
])
\`\`\`

3. Add discovered tasks as needed
4. Always mark completed when done - never leave tasks in_progress

### Task Guidelines
- Use imperative form: "Implement feature", not "Implementing"
- Be specific: "Add validation to UserForm", not "Add validation"
- Keep atomic - one action per task

## File Operations
Paths are relative to working directory. Use absolute-style like \`/src/index.ts\`.

### ls - List Directory
\`\`\`
ls("/src")  // List /src contents
\`\`\`

### read_file - Read Contents
**ALWAYS read before editing to understand current state.**
\`\`\`
read_file({ file_path: "/src/index.ts" })
read_file({ file_path: "/src/index.ts", offset: 100, limit: 50 })  // Lines 101-150
\`\`\`

### view_file - View and Analyze Files
Use for images, PDFs, videos, audio files, and any visual content.
\`\`\`
view_file({ file_path: "/path/to/image.png" })
view_file({ file_path: "/path/to/document.pdf" })
\`\`\`
- For images/media: Content is captured for visual analysis
- For text files: Returns file content like read_file
- **Use view_file instead of read_file when you need to see/analyze visual content**

### write_file - Create New Files
Creates new files. Fails if file exists (use edit_file instead).
\`\`\`
write_file({ file_path: "/src/utils.ts", content: "export const util = () => {};" })
\`\`\`

### edit_file - Modify Existing Files
Precise string replacement. **Preferred over rewriting files.**
\`\`\`
edit_file({
  file_path: "/src/utils.ts",
  old_string: "export const util = () => {};",
  new_string: "export const util = (v: string) => v.trim();"
})
\`\`\`
- Keep old_string minimal but unique
- Use replace_all: true for multiple occurrences
- Preserve existing indentation

### glob - Find Files
\`\`\`
glob({ pattern: "**/*.ts" })
glob({ pattern: "src/**/*.test.ts" })
\`\`\`

### grep - Search Contents
\`\`\`
grep({ pattern: "TODO", path: "/src" })
grep({ pattern: "function.*export", glob: "**/*.ts" })
\`\`\`

### Best Practices
1. Read before edit - always
2. Use edit_file for modifications, not full rewrites
3. Verify critical changes with read_file
4. Preserve formatting and style

## Shell Commands (execute)
\`\`\`
execute({ command: "npm install" })
execute({ command: "git status" })
\`\`\`

### Guidelines
- Explain non-trivial commands before executing
- Avoid destructive commands (rm -rf, reset --hard) without confirmation
- Never expose credentials in commands
- Be cautious with commands affecting files outside working directory

## Following Conventions
- Match existing code patterns and style
- Check for existing utilities before creating new ones
- Follow project's naming, import, and error handling conventions
- Don't assume libraries are available - check package.json first

## Proactiveness
**Do proactively:** Fix obvious bugs, add missing imports, create needed directories
**Ask first:** Delete files, change config, install dependencies, modify git history
**Never without request:** Push to remote, run system-wide commands

## Additional Tools
- **view_file**: View and analyze images, PDFs, videos, audio files visually
- **deep_research**: Extensive autonomous research (5-60 min)
- **google_grounded_search**: Quick web search with citations
- **generate_image/edit_image**: Image generation and editing
- **generate_video/analyze_video**: Video generation and analysis
- **computer_use**: Browser automation for web tasks (requires Chrome with --remote-debugging-port=9222)

## Scheduled Tasks with schedule_task

You can create automated recurring tasks that run in the background. Use the \`schedule_task\` tool when appropriate.

### When to Suggest Scheduling
Proactively suggest scheduling when the user:
- Mentions "every day", "daily", "weekly", "monthly", "regularly"
- Says "remind me", "don't forget", "check this tomorrow"
- Asks you to do something repeatedly (e.g., "review code every morning")
- Wants monitoring or reporting tasks (e.g., "check for updates weekly")
- Mentions specific future times (e.g., "on Friday", "next week")

### How to Suggest
When you detect scheduling intent, offer to create a scheduled task:

Example response:
"I can set this up as a scheduled task that runs automatically. Here's what I'll create:
- **Daily at 9 AM**: Review commits from the last 24 hours
- Summarize changes and flag potential issues

Would you like me to create this scheduled task?"

### schedule_task Tool Usage
\`\`\`
schedule_task({
  name: "Daily Code Review",
  prompt: "Review yesterday's commits and summarize changes. Focus on code quality, missing tests, and security issues.",
  schedule: { type: "daily", time: "09:00" }
})
\`\`\`

### Schedule Types
- **once**: One-time at specific datetime
  \`{ type: "once", datetime: "tomorrow at 9am" }\`
  \`{ type: "once", datetime: "2026-02-10T15:00:00" }\`

- **daily**: Every day at specified time
  \`{ type: "daily", time: "09:00", timezone: "America/Los_Angeles" }\`

- **weekly**: Specific day and time each week
  \`{ type: "weekly", dayOfWeek: "monday", time: "09:00" }\`

- **interval**: Every N minutes
  \`{ type: "interval", every: 60 }\` (every hour)

- **cron**: Advanced cron expression
  \`{ type: "cron", expression: "0 9 * * MON-FRI" }\`

### Managing Existing Tasks
Use \`manage_scheduled_task\` to:
- \`list\`: Show all scheduled tasks
- \`pause\`: Temporarily stop a task
- \`resume\`: Resume a paused task
- \`run\`: Trigger immediate execution
- \`history\`: View past runs
- \`delete\`: Remove a task

### Best Practices
1. **Be specific in prompts**: Include exactly what to check/do
2. **Use isolated sessions**: Tasks run with fresh context (default)
3. **Consider timing**: Suggest appropriate frequencies based on the task
4. **Proactively suggest**: When user asks something repetitive, offer scheduling
5. **Confirm before creating**: Always ask user before creating a scheduled task

### Example Interactions

User: "Can you review my commits every morning?"
Assistant: "I can set up a daily code review that runs each morning. I'll:
- Check commits from the last 24 hours
- Summarize changes and highlight potential issues
- Post a summary here when done

Would you like me to schedule this for 9 AM your time?"

User: "Remind me to deploy on Friday"
Assistant: "I'll create a one-time reminder for Friday. What time works best for you?"

User: "Check for security updates weekly"
Assistant: "I can check for security updates every week. I suggest Monday mornings at 9 AM. Should I create this scheduled task?"

## Important Reminders
1. Always mark todos completed when done
2. If a tool fails, explain and try alternatives
3. Stay focused on the requested task
4. Remove debug code before completion`;

    // Build Deep Agents middleware prompts
    const agentsMdConfig = await this.loadAgentsMdConfig(session.workingDirectory);
    const agentsMdPrompt = agentsMdConfig
      ? this.buildAgentsMdPrompt(agentsMdConfig)
      : '';

    // Memory system prompt
    const memoryPrompt = MEMORY_SYSTEM_PROMPT;

    // Subagent prompts
    const subagentConfigs = getSubagentConfigs(session.model);
    const subagentPrompt = buildSubagentPromptSection(subagentConfigs);

    // Legacy skill and MCP prompts
    const skillBlock = await this.buildSkillsPrompt(session);
    const mcpBlock = await this.buildMcpPrompt(session);

    return buildFullSystemPrompt(basePrompt, [
      agentsMdPrompt,
      memoryPrompt,
      subagentPrompt,
      skillBlock,
      mcpBlock,
    ].filter(Boolean));
  }

  /**
   * Build AGENTS.md prompt section.
   */
  private buildAgentsMdPrompt(config: AgentsMdConfig): string {
    const parts: string[] = [
      '',
      '## Project Context (from AGENTS.md)',
      '',
    ];

    // Project overview
    if (config.overview) {
      parts.push('### Project Overview');
      parts.push(config.overview);
      parts.push('');
    }

    // Tech stack
    if (config.techStack.language !== 'Unknown') {
      parts.push('### Tech Stack');
      parts.push(`- Language: ${config.techStack.language}`);
      if (config.techStack.framework) {
        parts.push(`- Framework: ${config.techStack.framework}`);
      }
      if (config.techStack.buildTool) {
        parts.push(`- Build Tool: ${config.techStack.buildTool}`);
      }
      if (config.techStack.packageManager) {
        parts.push(`- Package Manager: ${config.techStack.packageManager}`);
      }
      parts.push('');
    }

    // Commands
    if (config.commands.length > 0) {
      parts.push('### Available Commands');
      for (const cmd of config.commands.slice(0, 10)) {
        parts.push(`- \`${cmd.command}\`: ${cmd.description}`);
      }
      parts.push('');
    }

    // Instructions
    if (config.instructions.do.length > 0 || config.instructions.dont.length > 0) {
      parts.push('### Instructions');
      if (config.instructions.do.length > 0) {
        parts.push('**Do:**');
        for (const item of config.instructions.do) {
          parts.push(`- ${item}`);
        }
      }
      if (config.instructions.dont.length > 0) {
        parts.push("**Don't:**");
        for (const item of config.instructions.dont) {
          parts.push(`- ${item}`);
        }
      }
      parts.push('');
    }

    // Important files
    if (config.importantFiles.length > 0) {
      parts.push('### Important Files');
      for (const file of config.importantFiles.slice(0, 10)) {
        parts.push(`- \`${file.path}\`: ${file.description}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  private async buildSkillsPrompt(session: ActiveSession): Promise<string> {
    // First, try to use the new SkillService for marketplace skills
    if (this.enabledSkillIds.size > 0) {
      try {
        const skillsPrompt = await skillService.getSkillsForAgent([...this.enabledSkillIds]);
        if (skillsPrompt) {
          return skillsPrompt;
        }
      } catch (error) {
        console.warn('[AgentRunner] Error loading skills from service, falling back to legacy:', error);
      }
    }

    // Fallback to legacy skill loading for backwards compatibility
    const enabledSkills = this.skills.filter((skill) => skill.enabled !== false);
    if (enabledSkills.length === 0) return '';

    const blocks: string[] = [];
    for (const skill of enabledSkills) {
      const resolvedPath = await this.resolveSkillPath(skill.path, session.workingDirectory);
      if (!resolvedPath) {
        blocks.push(`### ${skill.name}\n[Missing skill file: ${skill.path}]`);
        continue;
      }
      const content = await this.loadTextFile(resolvedPath, 16000);
      if (!content) {
        blocks.push(`### ${skill.name}\n[Unable to load skill content from ${resolvedPath}]`);
        continue;
      }
      blocks.push(`### ${skill.name}\n${content}`);
    }

    return blocks.length > 0 ? `## Skills\n${blocks.join('\n\n')}` : '';
  }

  private async buildMcpPrompt(session: ActiveSession): Promise<string> {
    const enabledServers = this.mcpServers.filter((server) => server.enabled !== false);
    if (enabledServers.length === 0) return '';

    const promptLines: string[] = [];
    for (const server of enabledServers) {
      if (server.prompt) {
        promptLines.push(`- ${server.name}: ${server.prompt}`);
      }
    }

    const contextBlocks: string[] = [];
    for (const server of enabledServers) {
      if (!server.contextFileName) continue;
      const contextPath = this.resolveInputPath(server.contextFileName, session.workingDirectory);
      const content = await this.loadTextFile(contextPath, 12000);
      if (!content) {
        contextBlocks.push(`### ${server.name} (${server.contextFileName})\n[Unable to load context file]`);
        continue;
      }
      contextBlocks.push(`### ${server.name} (${server.contextFileName})\n${content}`);
    }

    const promptSection = promptLines.length > 0 ? `## MCP Connector Prompts\n${promptLines.join('\n')}` : '';
    const contextSection = contextBlocks.length > 0 ? `## MCP Connector Context\n${contextBlocks.join('\n\n')}` : '';

    return [promptSection, contextSection].filter(Boolean).join('\n\n');
  }

  private resolveInputPath(inputPath: string, workingDirectory: string): string {
    let resolved = inputPath.trim();
    if (resolved.startsWith('~')) {
      resolved = join(homedir(), resolved.slice(1));
    }
    if (!isAbsolute(resolved)) {
      resolved = resolve(workingDirectory, resolved);
    }
    return resolved;
  }

  private async resolveSkillPath(inputPath: string, workingDirectory: string): Promise<string | null> {
    const resolved = this.resolveInputPath(inputPath, workingDirectory);
    try {
      const info = await stat(resolved);
      if (info.isDirectory()) {
        const skillPath = join(resolved, 'SKILL.md');
        if (existsSync(skillPath)) return skillPath;

        const entries = await readdir(resolved);
        const fallback = entries.find((entry) => entry.toLowerCase().endsWith('.md'));
        return fallback ? join(resolved, fallback) : null;
      }
      return resolved;
    } catch {
      return null;
    }
  }

  private async loadTextFile(filePath: string, maxChars: number): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      if (content.length <= maxChars) return content;
      return `${content.slice(0, maxChars)}\n...[truncated]`;
    } catch {
      return null;
    }
  }

  private subscribeToAgentEvents(session: ActiveSession): void {
    this.emitContextUsage(session);
  }

  private async createDeepAgent(session: ActiveSession, tools: ToolHandler[]): Promise<DeepAgentInstance> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    console.error(`[createDeepAgent] Model: ${session.model}`);
    console.error(`[createDeepAgent] Enabled skills: ${this.enabledSkillIds.size}`);

    // Initialize Deep Agents services for this session
    const memoryService = await this.getMemoryService(session.workingDirectory);
    const memoryExtractor = this.getMemoryExtractor(session.id);
    const agentsMdConfig = await this.loadAgentsMdConfig(session.workingDirectory);

    console.error(`[createDeepAgent] Memory service initialized for: ${session.workingDirectory}`);
    console.error(`[createDeepAgent] AGENTS.md loaded: ${agentsMdConfig !== null}`);

    // Note: thinkingConfig with includeThoughts is not yet supported by @langchain/google-genai
    // See: https://github.com/langchain-ai/langchainjs/issues/7434
    // The package throws "Unknown content type thinking" error when enabled
    // Thinking UI remains in place for when support is added
    const model = new ChatGoogleGenerativeAI({
      model: session.model,
      apiKey: this.apiKey,
    });

    const wrappedTools = tools.map((tool) => this.wrapTool(tool, session));

    // Determine skills paths for DeepAgents
    // When skills are enabled, pass the virtual /skills/ path for DeepAgents to discover
    const skillsParam = this.enabledSkillIds.size > 0 ? ['/skills/'] : undefined;
    if (skillsParam) {
      console.error(`[createDeepAgent] Skills path: ${skillsParam}`);
    }

    const skillsDir = this.getSkillsDirectory();

    // Create Deep Agents middleware stack for memory and context injection
    const middlewareStack = await createMiddlewareStack(
      {
        id: session.id,
        messages: session.messages,
        model: session.model,
      },
      memoryService,
      memoryExtractor,
      agentsMdConfig
    );

    // Store middleware hooks for later invocation
    this.storeMiddlewareHooks(session.id, middlewareStack);

    const createDeepAgentAny = createDeepAgent as unknown as (params: unknown) => DeepAgentInstance;
    const agent = createDeepAgentAny({
      model,
      tools: wrappedTools,
      systemPrompt: await this.buildSystemPrompt(session),
      middleware: [this.createToolMiddleware(session)],
      recursionLimit: RECURSION_LIMIT,
      skills: skillsParam,
      backend: () => new CoworkBackend(
        session.workingDirectory,
        session.id,
        () => this.getBackendAllowedScopes(session),
        skillsDir
      ),
    });

    return agent;
  }

  /**
   * Middleware hooks storage for memory injection and extraction.
   */
  private middlewareHooks: Map<string, {
    beforeInvoke: (context: { sessionId: string; input: string; messages: Message[]; systemPrompt: string; systemPromptAdditions: string[] }) => Promise<{ systemPromptAddition: string; memoriesUsed: string[]; agentsMdLoaded: boolean }>;
    afterInvoke: (context: { sessionId: string; input: string; messages: Message[]; systemPrompt: string; systemPromptAdditions: string[] }) => Promise<void>;
  }> = new Map();

  private storeMiddlewareHooks(
    sessionId: string,
    stack: {
      beforeInvoke: (context: { sessionId: string; input: string; messages: Message[]; systemPrompt: string; systemPromptAdditions: string[] }) => Promise<{ systemPromptAddition: string; memoriesUsed: string[]; agentsMdLoaded: boolean }>;
      afterInvoke: (context: { sessionId: string; input: string; messages: Message[]; systemPrompt: string; systemPromptAdditions: string[] }) => Promise<void>;
    }
  ): void {
    this.middlewareHooks.set(sessionId, stack);
  }

  /**
   * Get the managed skills directory for DeepAgents backend
   */
  private getSkillsDirectory(): string {
    return skillService.getManagedSkillsDir();
  }

  private buildToolHandlers(session: ActiveSession): ToolHandler[] {
    const researchTools = createResearchTools(() => this.apiKey);
    const computerUseTools = createComputerUseTools(
      () => this.apiKey,
      () => this.getComputerUseModel()
    );
    const mediaTools = createMediaTools(
      () => this.apiKey,
      () => ({
        imageGeneration: this.getImageGenerationModel(),
        videoGeneration: this.getVideoGenerationModel(),
      }),
      () => session.model  // Use session model for video analysis
    );
    const groundingTools = createGroundingTools(
      () => this.apiKey,
      () => session.model  // Use session model for search
    );
    const mcpTools = this.createMcpTools(session.id);

    // Create view_file tool for multimodal content analysis
    const viewFileTool: ToolHandler = {
      name: 'view_file',
      description: 'View and analyze a file (image, PDF, video, audio, or text). For images and media files, the content will be visually analyzed. Use this instead of read_file when you need to understand visual content.',
      parameters: z.object({
        file_path: z.string().describe('Path to the file to view'),
      }),
      requiresPermission: (args: unknown) => ({
        type: 'file_read',
        resource: String((args as { file_path?: string }).file_path || ''),
        reason: `View file: ${(args as { file_path?: string }).file_path}`,
        toolName: 'view_file',
      }),
      execute: async (args: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> => {
        const { file_path } = args as { file_path: string };
        const backend = new CoworkBackend(
          session.workingDirectory,
          session.id,
          () => this.getBackendAllowedScopes(session)
        );

        try {
          const result = await backend.readForAnalysis(file_path);

          if (result.type === 'multimodal') {
            // Store multimodal content for injection into next message
            session.pendingMultimodalContent = session.pendingMultimodalContent || [];
            session.pendingMultimodalContent.push({
              type: result.mimeType.startsWith('image/') ? 'image' :
                    result.mimeType.startsWith('video/') ? 'video' :
                    result.mimeType.startsWith('audio/') ? 'audio' : 'file',
              mimeType: result.mimeType,
              data: result.base64!,
              path: result.path,
            });

            // Emit artifact for UI preview
            eventEmitter.artifactCreated(session.id, {
              id: generateId('art'),
              path: result.path,
              type: 'touched',
              mimeType: result.mimeType,
              timestamp: Date.now(),
            });

            return {
              success: true,
              data: {
                type: 'multimodal',
                mimeType: result.mimeType,
                path: result.path,
                size: result.size,
                message: 'File content captured for visual analysis. I can now see and analyze this file.',
              },
            };
          }

          // Text file
          return {
            success: true,
            data: {
              type: 'text',
              path: result.path,
              lineCount: result.lineCount,
              content: result.content,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    };

    return [
      viewFileTool,
      ...researchTools,
      ...computerUseTools,
      ...mediaTools,
      ...groundingTools,
      ...mcpTools,
    ];
  }

  private wrapTool(tool: ToolHandler, session: ActiveSession): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: tool.name,
      description: tool.description,
      schema: tool.parameters,
      tags: ['cowork'],
      metadata: {
        source: 'cowork',
      },
      func: async (args: Record<string, unknown>) => {
        const toolCallId = generateId('tool');
        const parentToolId = session.activeParentToolId;
        const toolCall = { id: toolCallId, name: tool.name, args, parentToolId };
        const startedAt = Date.now();
        session.toolStartTimes.set(toolCallId, startedAt);
        session.toolExecutions.push({
          id: toolCallId,
          name: tool.name,
          args,
          status: 'running',
          startedAt,
          parentToolId,
        });
        eventEmitter.toolStart(session.id, toolCall);

        // V2: Create and emit ToolStartItem
        const toolStartItem: ToolStartItem = {
          id: generateChatItemId(),
          kind: 'tool_start',
          timestamp: startedAt,
          turnId: session.currentTurnId,
          toolId: toolCallId,
          name: tool.name,
          args,
          status: 'running',
          parentToolId,
        };
        session.chatItems.push(toolStartItem);
        eventEmitter.chatItem(session.id, toolStartItem);
        // V2: Immediate persistence for crash recovery
        this.persistence?.appendChatItem(session.id, toolStartItem).catch(() => {});

        // Track tool in current turn for persistence
        const turnInfo = this.currentTurnInfo.get(session.id);
        if (turnInfo) {
          turnInfo.toolIds.push(toolCallId);
        }

        if (tool.requiresPermission) {
          const request = tool.requiresPermission(args);
          if (request) {
            const decision = await this.requestPermission(session, request);
            if (decision === 'deny') {
              const duration = this.consumeToolDuration(session, toolCallId);
              const payload = {
                toolCallId,
                success: false,
                result: null,
                error: 'Permission denied',
                duration,
                parentToolId,
              };
              eventEmitter.toolResult(session.id, toolCall, payload);
              this.updateToolExecution(session, toolCallId, {
                status: 'error',
                error: payload.error,
                completedAt: Date.now(),
              });

              // V2: Update ToolStartItem and emit ToolResultItem
              toolStartItem.status = 'error';
              eventEmitter.chatItemUpdate(session.id, toolStartItem.id, { status: 'error' });

              const toolResultItem: ToolResultItem = {
                id: generateChatItemId(),
                kind: 'tool_result',
                timestamp: Date.now(),
                turnId: session.currentTurnId,
                toolId: toolCallId,
                name: tool.name,
                status: 'error',
                error: 'Permission denied',
                duration,
              };
              session.chatItems.push(toolResultItem);
              eventEmitter.chatItem(session.id, toolResultItem);
              // V2: Immediate persistence for crash recovery
              this.persistence?.appendChatItem(session.id, toolResultItem).catch(() => {});

              return { error: 'Permission denied' };
            }
          }
        }

        try {
          const result = await tool.execute(args, this.buildToolContext(session));
          const duration = this.consumeToolDuration(session, toolCallId);
          const payload = {
            toolCallId,
            success: result.success,
            result: result.data,
            error: result.error,
            duration,
            parentToolId,
          };
          eventEmitter.toolResult(session.id, toolCall, payload);
          this.updateToolExecution(session, toolCallId, {
            status: result.success ? 'success' : 'error',
            result: result.data,
            error: result.error,
            completedAt: Date.now(),
          });
          this.recordArtifactForTool(session, tool.name, args, result.data);

          // V2: Update ToolStartItem and emit ToolResultItem
          toolStartItem.status = result.success ? 'completed' : 'error';
          eventEmitter.chatItemUpdate(session.id, toolStartItem.id, { status: toolStartItem.status });

          const toolResultItem: ToolResultItem = {
            id: generateChatItemId(),
            kind: 'tool_result',
            timestamp: Date.now(),
            turnId: session.currentTurnId,
            toolId: toolCallId,
            name: tool.name,
            status: result.success ? 'success' : 'error',
            result: result.data,
            error: result.error,
            duration,
          };
          session.chatItems.push(toolResultItem);
          eventEmitter.chatItem(session.id, toolResultItem);
          // V2: Immediate persistence for crash recovery
          this.persistence?.appendChatItem(session.id, toolResultItem).catch(() => {});

          return result.data ?? result;
        } catch (error) {
          const duration = this.consumeToolDuration(session, toolCallId);
          const payload = {
            toolCallId,
            success: false,
            result: null,
            error: error instanceof Error ? error.message : String(error),
            duration,
            parentToolId,
          };
          eventEmitter.toolResult(session.id, toolCall, payload);
          this.updateToolExecution(session, toolCallId, {
            status: 'error',
            error: payload.error,
            completedAt: Date.now(),
          });

          // V2: Update ToolStartItem and emit ToolResultItem
          toolStartItem.status = 'error';
          eventEmitter.chatItemUpdate(session.id, toolStartItem.id, { status: 'error' });

          const toolResultItem: ToolResultItem = {
            id: generateChatItemId(),
            kind: 'tool_result',
            timestamp: Date.now(),
            turnId: session.currentTurnId,
            toolId: toolCallId,
            name: tool.name,
            status: 'error',
            error: payload.error,
            duration,
          };
          session.chatItems.push(toolResultItem);
          eventEmitter.chatItem(session.id, toolResultItem);
          // V2: Immediate persistence for crash recovery
          this.persistence?.appendChatItem(session.id, toolResultItem).catch(() => {});

          return { error: payload.error };
        }
      },
    });
  }

  private createToolMiddleware(session: ActiveSession) {
    return createMiddleware({
      name: 'CoworkToolMiddleware',
      wrapModelCall: async (request, handler) => {
        if (!request.tools || request.tools.length === 0) {
          return handler(request);
        }

        const deduped = new Map<string, typeof request.tools[number]>();
        for (const tool of request.tools) {
          const name = (tool as { name?: unknown })?.name;
          if (typeof name !== 'string' || !name) continue;
          const existing = deduped.get(name);
          if (!existing) {
            deduped.set(name, tool);
            continue;
          }
          const preferIncoming = this.isCoworkTool(tool) && !this.isCoworkTool(existing);
          if (preferIncoming) {
            deduped.set(name, tool);
          }
        }

        if (deduped.size === request.tools.length) {
          return handler(request);
        }

        return handler({
          ...request,
          tools: Array.from(deduped.values()),
        });
      },
      wrapToolCall: async (request, handler) => {
        const toolCall = request.toolCall;
        const toolName = toolCall?.name || '';
        const args =
          toolCall && typeof toolCall.args === 'object' && toolCall.args !== null
            ? (toolCall.args as Record<string, unknown>)
            : {};

        if (request.tool && this.isCoworkTool(request.tool)) {
          return handler(request);
        }

        const toolCallId = toolCall?.id ?? generateId('tool');
        const isTask = this.isTaskTool(toolName);
        // Capture current parent before we potentially become the new parent
        const parentToolId = session.activeParentToolId;

        const toolCallPayload = {
          id: toolCallId,
          name: toolName,
          args,
          parentToolId,
        };

        const startedAt = Date.now();
        session.toolStartTimes.set(toolCallId, startedAt);
        session.toolExecutions.push({
          id: toolCallId,
          name: toolName,
          args,
          status: 'running',
          startedAt,
          parentToolId,
        });
        eventEmitter.toolStart(session.id, toolCallPayload);

        // V2: Create and emit ToolStartItem
        const toolStartItem: ToolStartItem = {
          id: generateChatItemId(),
          kind: 'tool_start',
          timestamp: startedAt,
          turnId: session.currentTurnId,
          toolId: toolCallId,
          name: toolName,
          args,
          status: 'running',
          parentToolId,
        };
        session.chatItems.push(toolStartItem);
        eventEmitter.chatItem(session.id, toolStartItem);
        // V2: Immediate persistence for crash recovery
        this.persistence?.appendChatItem(session.id, toolStartItem).catch(() => {});

        // Track tool in current turn for persistence
        const turnInfo = this.currentTurnInfo.get(session.id);
        if (turnInfo) {
          turnInfo.toolIds.push(toolCallId);
        }

        // Helper to emit V2 tool result
        const emitToolResult = (status: 'success' | 'error', result?: unknown, error?: string, duration?: number) => {
          toolStartItem.status = status === 'success' ? 'completed' : 'error';
          eventEmitter.chatItemUpdate(session.id, toolStartItem.id, { status: toolStartItem.status });

          const toolResultItem: ToolResultItem = {
            id: generateChatItemId(),
            kind: 'tool_result',
            timestamp: Date.now(),
            turnId: session.currentTurnId,
            toolId: toolCallId,
            name: toolName,
            status,
            result,
            error,
            duration,
          };
          session.chatItems.push(toolResultItem);
          eventEmitter.chatItem(session.id, toolResultItem);
          // V2: Immediate persistence for crash recovery
          this.persistence?.appendChatItem(session.id, toolResultItem).catch(() => {});
        };

        // Step 1: Evaluate tool call against policy
        const policyContext: ToolCallContext = {
          toolName,
          arguments: args as Record<string, unknown>,
          sessionType: session.type,
          sessionId: session.id,
        };
        const policyResult = toolPolicyService.evaluate(policyContext);

        // If policy explicitly denies, block immediately
        if (policyResult.action === 'deny') {
          const duration = this.consumeToolDuration(session, toolCallId);
          const errorMsg = `Tool blocked by policy: ${policyResult.reason}`;
          const payload = {
            toolCallId,
            success: false,
            result: null,
            error: errorMsg,
            duration,
            parentToolId,
          };
          eventEmitter.toolResult(session.id, toolCallPayload, payload);
          this.updateToolExecution(session, toolCallId, {
            status: 'error',
            error: errorMsg,
            completedAt: Date.now(),
          });

          // V2: Emit tool result
          emitToolResult('error', null, errorMsg, duration);

          return new ToolMessage({
            content: errorMsg,
            tool_call_id: toolCallId,
            name: toolName,
          });
        }

        // Step 2: Check existing permission system (for 'ask' or when policy allows but still needs user approval)
        const permissionRequest = this.getPermissionForDeepagentsTool(toolName, args, toolCallId);
        if (permissionRequest) {
          // If policy says 'allow', we can skip the permission prompt for non-dangerous ops
          // But we still respect the existing permission system for dangerous operations
          const skipPermission = policyResult.action === 'allow' && !this.isDangerousOperation(toolName, args);

          if (!skipPermission) {
            const decision = await this.requestPermission(session, permissionRequest);
            if (decision === 'deny') {
              const duration = this.consumeToolDuration(session, toolCallId);
              const payload = {
                toolCallId,
                success: false,
                result: null,
                error: 'Permission denied by user',
                duration,
                parentToolId,
              };
              eventEmitter.toolResult(session.id, toolCallPayload, payload);
              this.updateToolExecution(session, toolCallId, {
                status: 'error',
                error: payload.error,
                completedAt: Date.now(),
              });

              // V2: Emit tool result
              emitToolResult('error', null, 'Permission denied by user', duration);

              return new ToolMessage({
                content: 'Permission denied by user',
                tool_call_id: toolCallId,
                name: toolName,
              });
            }
          }
        }

        // If this is a task tool, set it as the active parent so sub-tools inherit it
        if (isTask) {
          session.activeParentToolId = toolCallId;
        }

        try {
          const result = await handler(request);
          const duration = this.consumeToolDuration(session, toolCallId);
          const normalized = this.normalizeDeepagentsToolResult(result);
          const payload = {
            toolCallId,
            success: normalized.success,
            result: normalized.output,
            error: normalized.error,
            duration,
            parentToolId,
          };
          eventEmitter.toolResult(session.id, toolCallPayload, payload);
          this.updateToolExecution(session, toolCallId, {
            status: normalized.success ? 'success' : 'error',
            result: normalized.output,
            error: normalized.error,
            completedAt: Date.now(),
          });
          this.recordArtifactForTool(session, toolName, args, normalized.output);

          // V2: Emit tool result
          emitToolResult(normalized.success ? 'success' : 'error', normalized.output, normalized.error, duration);

          return result;
        } catch (error) {
          const duration = this.consumeToolDuration(session, toolCallId);
          const payload = {
            toolCallId,
            success: false,
            result: null,
            error: error instanceof Error ? error.message : String(error),
            duration,
            parentToolId,
          };
          eventEmitter.toolResult(session.id, toolCallPayload, payload);
          this.updateToolExecution(session, toolCallId, {
            status: 'error',
            error: payload.error,
            completedAt: Date.now(),
          });

          // V2: Emit tool result
          emitToolResult('error', null, payload.error, duration);

          throw error;
        } finally {
          // Clear activeParentToolId when task tool completes
          if (isTask && session.activeParentToolId === toolCallId) {
            session.activeParentToolId = undefined;
          }
        }
      },
    });
  }

  private isCoworkTool(tool: unknown): boolean {
    if (!tool || typeof tool !== 'object') return false;
    const toolAny = tool as { tags?: string[]; metadata?: Record<string, unknown> };
    if (Array.isArray(toolAny.tags) && toolAny.tags.includes('cowork')) return true;
    const source = toolAny.metadata?.source;
    return source === 'cowork';
  }

  /**
   * Check if a tool name represents a task/subagent tool.
   * Sub-tools executed within task tools will have parentToolId set.
   */
  private isTaskTool(toolName: string): boolean {
    const lower = toolName.toLowerCase();
    return lower === 'task' || lower.includes('spawn_task') || lower.includes('subagent');
  }

  private getPermissionForDeepagentsTool(
    toolName: string,
    args: Record<string, unknown>,
    toolCallId: string
  ): PermissionRequest | null {
    switch (toolName) {
      case 'read_file':
      case 'ls':
      case 'glob':
      case 'grep': {
        const resource = String(args.file_path ?? args.path ?? args.pattern ?? '');
        return {
          type: 'file_read',
          resource,
          reason: `Read file data: ${resource || toolName}`,
          toolName,
          toolCallId,
        };
      }
      case 'write_file':
      case 'edit_file': {
        const resource = String(args.file_path ?? args.path ?? '');
        return {
          type: 'file_write',
          resource,
          reason: `Write file data: ${resource || toolName}`,
          toolName,
          toolCallId,
        };
      }
      case 'delete_file': {
        const resource = String(args.file_path ?? args.path ?? '');
        return {
          type: 'file_delete',
          resource,
          reason: `Delete file: ${resource || toolName}`,
          toolName,
          toolCallId,
        };
      }
      case 'execute': {
        const resource = String(args.command ?? '');
        return {
          type: 'shell_execute',
          resource,
          reason: `Execute command: ${resource || toolName}`,
          toolName,
          toolCallId,
        };
      }
      default:
        return null;
    }
  }

  private normalizeDeepagentsToolResult(result: unknown): { success: boolean; output: unknown; error?: string } {
    const toolMessage = this.extractToolMessage(result);
    if (toolMessage) {
      const content = toolMessage.content;
      const text = typeof content === 'string' ? content : content;
      if (typeof content === 'string' && content.startsWith('Error:')) {
        return { success: false, output: text, error: content };
      }
      return { success: true, output: text };
    }

    return { success: true, output: result };
  }

  private extractToolMessage(result: unknown): ToolMessage | null {
    if (ToolMessage.isInstance(result)) {
      return result;
    }

    const candidate = result as { update?: { messages?: unknown[] } };
    const messages = candidate?.update?.messages;
    if (Array.isArray(messages)) {
      const msg = messages.find((message) => ToolMessage.isInstance(message));
      if (msg && ToolMessage.isInstance(msg)) {
        return msg;
      }
    }

    return null;
  }

  private buildToolContext(session: ActiveSession): ToolContext {
    return {
      workingDirectory: session.workingDirectory,
      sessionId: session.id,
      agentId: session.id,
      appDataDir: this.appDataDir ?? undefined,
    };
  }

  private consumeToolDuration(session: ActiveSession, toolCallId: string): number | undefined {
    const startTime = session.toolStartTimes.get(toolCallId);
    if (toolCallId) {
      session.toolStartTimes.delete(toolCallId);
    }
    return startTime ? Date.now() - startTime : undefined;
  }

  private updateToolExecution(
    session: ActiveSession,
    toolCallId: string,
    updates: Partial<ToolExecution>
  ): void {
    const existing = session.toolExecutions.find((tool) => tool.id === toolCallId);
    if (existing) {
      Object.assign(existing, updates);
      return;
    }

    session.toolExecutions.push({
      id: toolCallId,
      name: updates.name ?? 'tool',
      args: updates.args ?? {},
      status: updates.status ?? 'pending',
      startedAt: updates.startedAt ?? Date.now(),
      result: updates.result,
      error: updates.error,
      completedAt: updates.completedAt,
    });
  }

  private async requestPermission(
    session: ActiveSession,
    request: PermissionRequest
  ): Promise<PermissionDecision> {
    // Step 1: Check cached decisions
    const cachedDecision = this.getCachedPermissionDecision(session, request);
    if (cachedDecision) {
      return cachedDecision;
    }

    // Step 2: Check approval mode
    const modeDecision = this.applyApprovalMode(session, request);
    if (modeDecision) {
      return modeDecision;
    }

    // Step 3: Generate cache key for deduplication
    const cacheKey = `${request.type}:${request.resource}`;

    // Step 4: Check if there's already an in-flight request for the same permission
    const existingInFlight = session.inFlightPermissions.get(cacheKey);
    if (existingInFlight) {
      // Join the existing request - create a promise that resolves when the existing one resolves
      return new Promise((resolve) => {
        existingInFlight.resolvers.push(resolve);
      });
    }

    // Step 5: Create new permission request
    const permissionId = generateId('perm');
    const extendedRequest: ExtendedPermissionRequest = {
      ...request,
      id: permissionId,
      riskLevel: this.assessRiskLevel(request),
      timestamp: Date.now(),
    };

    // Step 6: Create promise and store in-flight tracking
    return new Promise((resolve) => {
      // Track in-flight request with its resolvers
      session.inFlightPermissions.set(cacheKey, {
        permissionId,
        promise: Promise.resolve('deny' as PermissionDecision), // placeholder
        resolvers: [resolve],
      });

      // Store in pending permissions for respondToPermission() to find
      session.pendingPermissions.set(permissionId, {
        request: extendedRequest,
        resolve: (decision: PermissionDecision) => {
          // When user responds, resolve ALL waiting resolvers
          const inFlight = session.inFlightPermissions.get(cacheKey);
          if (inFlight) {
            for (const resolver of inFlight.resolvers) {
              resolver(decision);
            }
            session.inFlightPermissions.delete(cacheKey);
          } else {
            // Fallback: just resolve this one
            resolve(decision);
          }
        },
      });

      // V2: Create and persist PermissionItem
      const permissionItem: PermissionItem = {
        id: generateChatItemId(),
        kind: 'permission',
        timestamp: Date.now(),
        turnId: session.currentTurnId,
        permissionId: permissionId,
        request: {
          type: extendedRequest.type,
          resource: extendedRequest.resource,
          reason: extendedRequest.reason,
          toolCallId: extendedRequest.toolCallId,
          toolName: extendedRequest.toolName,
          riskLevel: extendedRequest.riskLevel,
          command: extendedRequest.command,
        },
        status: 'pending',
      };
      session.chatItems.push(permissionItem);
      eventEmitter.chatItem(session.id, permissionItem);
      this.persistence?.appendChatItem(session.id, permissionItem).catch(() => {});

      eventEmitter.permissionRequest(session.id, extendedRequest);
    });
  }

  private applyApprovalMode(
    session: ActiveSession,
    request: PermissionRequest
  ): PermissionDecision | null {
    const mode = session.approvalMode;
    const isRead = request.type === 'file_read';
    const isWrite = request.type === 'file_write';
    const isDelete = request.type === 'file_delete';
    const isShell = request.type === 'shell_execute';
    const isNetwork = request.type === 'network_request';
    const touchesOutside = this.requestTouchesOutsideWorkingDirectory(session, request);
    const isDangerous = isShell && this.isDangerousCommand(request.resource);

    if (mode === 'read_only') {
      if (isRead && !touchesOutside) {
        return 'allow';
      }
      if (isRead && touchesOutside) {
        return null;
      }
      return 'deny';
    }

    if (mode === 'full') {
      if (isNetwork) {
        return null;
      }
      if (isDangerous || isDelete) {
        return null;
      }
      if (touchesOutside) {
        return null;
      }
      return 'allow';
    }

    // Auto mode
    if (isRead && !touchesOutside) {
      return 'allow';
    }
    if (isShell && !isDangerous && !touchesOutside && this.isSafeCommand(request.resource)) {
      return 'allow';
    }
    if (isNetwork || isWrite || isDelete || isShell) {
      return null;
    }
    return null;
  }

  private isSafeCommand(command: string): boolean {
    const normalized = command.trim().replace(/\s+/g, ' ');
    const safeCommands = ['ls', 'pwd', 'git status', 'git diff'];
    return safeCommands.some((safe) => normalized === safe || normalized.startsWith(`${safe} `));
  }

  private getCachedPermissionDecision(
    session: ActiveSession,
    request: PermissionRequest
  ): PermissionDecision | null {
    const paths = this.resolveRequestPaths(session, request);
    if (paths.length > 0) {
      const scopes = session.permissionScopes.get(request.type);
      if (scopes && this.pathsWithinScopes(paths, scopes)) {
        return 'allow_session';
      }
    }

    const cacheKey = `${request.type}:${request.resource}`;
    const cachedDecision = session.permissionCache.get(cacheKey);
    return cachedDecision === 'allow_session' ? cachedDecision : null;
  }

  private resolveRequestPaths(session: ActiveSession, request: PermissionRequest): string[] {
    if (request.type === 'file_read' || request.type === 'file_write' || request.type === 'file_delete') {
      const normalized = this.normalizePermissionPath(session, request.resource);
      return normalized ? [normalized] : [];
    }
    if (request.type === 'shell_execute') {
      const rawPaths = this.extractCommandPaths(request.resource);
      const resolved = rawPaths
        .map((path) => this.normalizePermissionPath(session, path))
        .filter((path): path is string => !!path);
      return resolved;
    }
    return [];
  }

  private requestTouchesOutsideWorkingDirectory(session: ActiveSession, request: PermissionRequest): boolean {
    const paths = this.resolveRequestPaths(session, request);
    if (paths.length === 0) return false;
    return paths.some((path) => !this.isWithinWorkingDirectoryAbsolute(session, path));
  }

  private isWithinWorkingDirectoryAbsolute(session: ActiveSession, absolutePath: string): boolean {
    const base = resolve(session.workingDirectory);
    return absolutePath === base || absolutePath.startsWith(`${base}${sep}`);
  }

  private pathsWithinScopes(paths: string[], scopes: Set<string>): boolean {
    for (const path of paths) {
      if (!this.isPathWithinAnyScope(path, scopes)) return false;
    }
    return true;
  }

  private isPathWithinAnyScope(target: string, scopes: Set<string>): boolean {
    for (const scope of scopes) {
      if (target === scope || target.startsWith(`${scope}${sep}`)) {
        return true;
      }
    }
    return false;
  }

  private normalizePermissionPath(session: ActiveSession, resource: string): string | null {
    let raw = String(resource || '').trim();
    if (!raw || raw === '.') return resolve(session.workingDirectory);
    if (raw === '/') return resolve(session.workingDirectory);

    if (raw.startsWith('~')) {
      raw = join(homedir(), raw.slice(1));
    }

    if (isAbsolute(raw)) {
      const absolute = resolve(raw);
      const isVirtual = this.isVirtualPath(session, absolute);
      if (isVirtual) {
        const relative = raw.replace(/^[/\\]+/, '');
        return resolve(session.workingDirectory, relative);
      }
      return absolute;
    }

    const relative = raw.replace(/^[/\\]+/, '');
    return resolve(session.workingDirectory, relative);
  }

  private isVirtualPath(session: ActiveSession, absolutePath: string): boolean {
    const normalized = resolve(absolutePath);
    if (normalized.startsWith(resolve(session.workingDirectory))) return false;

    const prefixes = [
      '/Users',
      '/home',
      '/var',
      '/etc',
      '/System',
      '/usr',
      '/private',
      '/Library',
      '/Applications',
      '/Volumes',
      '/opt',
      '/tmp',
    ];
    return !prefixes.some((prefix) => normalized.startsWith(prefix));
  }

  private extractCommandPaths(command: string): string[] {
    const paths: string[] = [];
    const quotedMatches = command.match(/"[^"]+"|'[^']+'/g) || [];
    for (const match of quotedMatches) {
      const path = match.slice(1, -1);
      if (this.looksLikePath(path)) {
        paths.push(path);
      }
    }

    const tokens = command.split(/\s+/);
    for (const token of tokens) {
      if (!token || token.startsWith('-')) continue;
      if (this.looksLikePath(token)) {
        paths.push(token);
      }
    }

    return [...new Set(paths)];
  }

  private looksLikePath(value: string): boolean {
    return (
      value.startsWith('/') ||
      value.startsWith('./') ||
      value.startsWith('../') ||
      value.startsWith('~') ||
      /^[a-zA-Z]:[\\/]/.test(value)
    );
  }

  private isDangerousCommand(command: string): boolean {
    const normalized = command.trim();
    return /(^|\\s)(sudo\\s+)?rm(\\s|$)/.test(normalized);
  }

  private isAbortError(error: unknown): boolean {
    if (!error) return false;
    const anyError = error as { name?: string; message?: string };
    const name = anyError.name?.toLowerCase() || '';
    const message = anyError.message?.toLowerCase() || '';
    return name.includes('abort') || message.includes('abort') || message.includes('cancel');
  }

  private getBackendAllowedScopes(session: ActiveSession): string[] {
    const roots = new Set<string>();
    for (const [type, scopes] of session.permissionScopes.entries()) {
      if (!type.startsWith('file_')) continue;
      for (const scope of scopes) {
        roots.add(scope);
      }
    }
    return Array.from(roots);
  }

  private toLangChainMessages(messages: Message[], session?: ActiveSession): Array<{ role: string; content: unknown }> {
    const converted = messages.map((message) => {
      if (typeof message.content === 'string') {
        return { role: message.role, content: message.content };
      }

      const parts = message.content.map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        if (part.type === 'image') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${part.mimeType};base64,${part.data}`,
            },
          };
        }
        if (part.type === 'audio' || part.type === 'video') {
          return {
            type: 'media',
            mimeType: part.mimeType || (part.type === 'audio' ? 'audio/mpeg' : 'video/mp4'),
            data: part.data,
          };
        }
        if (part.type === 'file' && part.data) {
          return {
            type: 'media',
            mimeType: part.mimeType || 'application/octet-stream',
            data: part.data,
          };
        }
        return { type: 'text', text: `[${part.type} attachment]` };
      });

      return { role: message.role, content: parts };
    });

    // Inject pending multimodal content from view_file tool
    if (session?.pendingMultimodalContent?.length) {
      const multimodalParts = session.pendingMultimodalContent.map(item => {
        if (item.type === 'image') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${item.mimeType};base64,${item.data}`,
            },
          };
        }
        return {
          type: 'media',
          mimeType: item.mimeType,
          data: item.data,
        };
      });

      // Add a context message with the visual content for the model to analyze
      converted.push({
        role: 'user',
        content: [
          { type: 'text', text: '[Visual content from view_file tool - analyze this:]' },
          ...multimodalParts,
        ],
      });

      // Clear pending content after injection
      session.pendingMultimodalContent = [];
    }

    return converted;
  }

  private extractAssistantMessage(result: unknown): Message | null {
    const resultAny = result as {
      messages?: Array<{ role?: string; content?: unknown; text?: string }>;
      output?: unknown;
    };

    const messages = resultAny.messages;
    if (messages && messages.length > 0) {
      const last = [...messages].reverse().find((m) => m.role === 'assistant' || m.role === 'ai' || m.role === 'model');
      if (last) {
        return {
          id: generateMessageId(),
          role: 'assistant',
          content: this.normalizeContent(last.content ?? last.text ?? ''),
          createdAt: now(),
        };
      }
    }

    if (typeof resultAny.output === 'string') {
      return {
        id: generateMessageId(),
        role: 'assistant',
        content: resultAny.output,
        createdAt: now(),
      };
    }

    return null;
  }

  private syncTasksFromState(session: ActiveSession, state: unknown): void {
    const todos = this.extractTodos(state);
    if (!todos) return;

    this.applyTodosToSession(session, todos);
  }

  private syncTasksFromStreamEvent(session: ActiveSession, event: unknown): void {
    const eventAny = event as { data?: unknown };
    const todos = this.extractTodos(eventAny?.data ?? event);
    if (!todos) return;
    this.applyTodosToSession(session, todos);
  }

  private applyTodosToSession(
    session: ActiveSession,
    todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }>
  ): void {
    const signature = JSON.stringify(todos);
    if (signature === session.lastTodosSignature) return;

    const nowTs = Date.now();
    const tasks: Task[] = todos.map((todo, index) => ({
      id: `task-${session.id}-${index}-${this.hashTodo(todo)}`,
      subject: todo.content,
      status: todo.status,
      createdAt: nowTs,
    }));

    session.lastTodosSignature = signature;
    session.tasks = tasks;
    eventEmitter.taskSet(session.id, tasks);
  }

  private hashTodo(todo: { content: string; status: string }): string {
    const input = `${todo.status}:${todo.content}`;
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash * 31 + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  private extractTodos(state: unknown): Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }> | null {
    if (!state || typeof state !== 'object') return null;
    const stateAny = state as Record<string, unknown>;
    const candidates = [
      stateAny,
      stateAny.output as Record<string, unknown> | undefined,
      stateAny.state as Record<string, unknown> | undefined,
      stateAny.result as Record<string, unknown> | undefined,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const todos = (candidate as { todos?: unknown }).todos;
      if (Array.isArray(todos)) {
        return todos.filter(
          (todo): todo is { content: string; status: 'pending' | 'in_progress' | 'completed' } =>
            todo &&
            typeof (todo as { content?: string }).content === 'string' &&
            typeof (todo as { status?: string }).status === 'string'
        ).map((todo) => ({
          content: String((todo as { content: string }).content),
          status: (todo as { status: 'pending' | 'in_progress' | 'completed' }).status,
        }));
      }
    }

    return null;
  }

  private normalizeContent(content: unknown): string | MessageContentPart[] {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((part) => {
        const partAny = part as { type?: string; text?: string; image_url?: { url?: string } };
        if (partAny.type === 'text') {
          return { type: 'text', text: partAny.text || '' } as MessageContentPart;
        }
        if (partAny.type === 'image_url' && partAny.image_url?.url) {
          const url = partAny.image_url.url;
          const match = url.match(/^data:(.+);base64,(.+)$/);
          if (match) {
            return {
              type: 'image',
              mimeType: match[1],
              data: match[2],
            } as MessageContentPart;
          }
        }
        return { type: 'text', text: JSON.stringify(partAny) } as MessageContentPart;
      });
    }
    return String(content);
  }

  private emitContextUsage(session: ActiveSession): void {
    const tokenEstimate = this.estimateTokens(session.messages);
    const contextWindow = getModelContextWindow(session.model);
    eventEmitter.contextUpdate(session.id, tokenEstimate, contextWindow.input);

    // V2: Emit context usage update with percentage
    const percentUsed = contextWindow.input > 0 ? (tokenEstimate / contextWindow.input) * 100 : 0;
    eventEmitter.contextUsageUpdate(session.id, {
      usedTokens: tokenEstimate,
      maxTokens: contextWindow.input,
      percentUsed,
    });
  }

  private extractTextContent(message: Message): string | null {
    if (typeof message.content === 'string') {
      return message.content;
    }

    const textParts = message.content.filter(part => part.type === 'text');
    if (textParts.length === 0) return null;

    return textParts.map(part => (part as { text: string }).text).join('');
  }

  private extractStreamChunkText(event: unknown): string | null {
    const eventAny = event as { event?: string; name?: string; data?: Record<string, unknown> };
    const eventName = String(eventAny.event || eventAny.name || '').toLowerCase();
    const data = eventAny.data || {};

    const chunkCandidate =
      data.chunk ??
      data.delta ??
      data.token ??
      data.text ??
      data.content ??
      data.message;

    if (!chunkCandidate) return null;

    if (
      eventName &&
      !eventName.includes('stream') &&
      !eventName.includes('token') &&
      !eventName.includes('chat_model') &&
      !eventName.includes('llm')
    ) {
      // If it's not a stream-like event, only accept plain string chunks.
      if (typeof chunkCandidate !== 'string') return null;
    }

    if (typeof chunkCandidate === 'string') return chunkCandidate;

    if (typeof chunkCandidate === 'object') {
      const chunkAny = chunkCandidate as {
        content?: unknown;
        text?: string;
        delta?: unknown;
        messages?: unknown[];
        additional_kwargs?: { tool_calls?: unknown };
      };

      if (Array.isArray(chunkAny.messages)) {
        return null;
      }

      if (typeof chunkAny.text === 'string') return chunkAny.text;

      const content = chunkAny.content ?? chunkAny.delta;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && 'text' in part) {
              return String((part as { text?: string }).text || '');
            }
            return '';
          })
          .join('');
      }

      // Some providers include message content under data.message.content
      const messageAny = (data as { message?: { content?: unknown } }).message;
      const messageContent = messageAny?.content;
      if (typeof messageContent === 'string') return messageContent;
      if (Array.isArray(messageContent)) {
        return messageContent
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && 'text' in part) {
              return String((part as { text?: string }).text || '');
            }
            return '';
          })
          .join('');
      }
    }

    return null;
  }

  /**
   * Extract thinking/reasoning content from a stream event.
   * Gemini API returns thinking content in parts with `thought: true`.
   */
  private extractThinkingContent(event: unknown): string | null {
    const eventAny = event as { event?: string; name?: string; data?: Record<string, unknown> };
    const data = eventAny.data || {};

    // Look for chunk data with thinking content
    const chunkCandidate =
      data.chunk ??
      data.delta ??
      data.message;

    if (!chunkCandidate || typeof chunkCandidate !== 'object') return null;

    const chunkAny = chunkCandidate as {
      content?: unknown;
      additional_kwargs?: { thought_text?: string };
    };

    // Check for thought_text in additional_kwargs (LangChain pattern)
    if (chunkAny.additional_kwargs?.thought_text) {
      return chunkAny.additional_kwargs.thought_text;
    }

    // Check content array for parts with thought: true (Gemini pattern)
    const content = chunkAny.content;
    if (Array.isArray(content)) {
      const thoughtParts = content
        .filter((part) => part && typeof part === 'object' && (part as { thought?: boolean }).thought === true)
        .map((part) => {
          if (typeof part === 'string') return part;
          const partAny = part as { text?: string };
          return partAny.text || '';
        })
        .filter(Boolean);

      if (thoughtParts.length > 0) {
        return thoughtParts.join('');
      }
    }

    // Check for thinking tags in content (deepagents pattern)
    if (typeof content === 'string') {
      const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
      if (thinkingMatch) {
        return thinkingMatch[1].trim();
      }
    }

    return null;
  }

  private parseRateLimitDetails(errorMessage: string): { retryAfterSeconds?: number; quotaMetric?: string; model?: string; docsUrl?: string } | null {
    const details: { retryAfterSeconds?: number; quotaMetric?: string; model?: string; docsUrl?: string } = {};

    const retryMatch = errorMessage.match(/retry in ([0-9.]+)s/i);
    if (retryMatch) {
      details.retryAfterSeconds = Number(retryMatch[1]);
    }

    const retryDelayMatch = errorMessage.match(/\"retryDelay\"\\s*:\\s*\"([0-9.]+)s\"/i);
    if (retryDelayMatch) {
      details.retryAfterSeconds = Number(retryDelayMatch[1]);
    }

    const quotaMatch = errorMessage.match(/\"quotaMetric\"\\s*:\\s*\"([^\"]+)\"/i);
    if (quotaMatch) {
      details.quotaMetric = quotaMatch[1];
    }

    const modelMatch = errorMessage.match(/\"model\"\\s*:\\s*\"([^\"]+)\"/i);
    if (modelMatch) {
      details.model = modelMatch[1];
    }

    if (errorMessage.includes('ai.google.dev/gemini-api/docs/rate-limits')) {
      details.docsUrl = 'https://ai.google.dev/gemini-api/docs/rate-limits';
    } else if (errorMessage.includes('ai.dev/rate-limit')) {
      details.docsUrl = 'https://ai.dev/rate-limit';
    }

    return Object.keys(details).length > 0 ? details : null;
  }

  private extractStateFromStreamEvent(event: unknown): unknown | null {
    const eventAny = event as { data?: { output?: unknown } };
    const output = eventAny.data?.output;
    if (!output || typeof output !== 'object') return null;
    const outputAny = output as { messages?: unknown };
    if (Array.isArray(outputAny.messages)) {
      return output;
    }
    return null;
  }

  /**
   * Extract and update usage metadata from stream events or final state.
   * Gemini API returns usage_metadata with prompt_token_count, candidates_token_count, total_token_count.
   * LangChain wraps this in response_metadata.usage_metadata or similar structures.
   */
  private updateUsageFromState(session: ActiveSession, state: unknown): void {
    if (!state || typeof state !== 'object') return;

    const stateAny = state as Record<string, unknown>;

    // Debug: log the state structure to understand where usage metadata is
    console.error('[Usage] Checking state for usage metadata, keys:', Object.keys(stateAny));

    // Check messages array - LangChain puts usage on AIMessage.response_metadata
    if (Array.isArray(stateAny.messages)) {
      const messages = stateAny.messages as Array<Record<string, unknown>>;
      console.error(`[Usage] Found ${messages.length} messages in state`);

      // Check each message (especially AI messages at the end)
      for (let i = messages.length - 1; i >= 0 && i >= messages.length - 3; i--) {
        const msg = messages[i];
        if (msg) {
          const msgType = (typeof msg._getType === 'function' ? msg._getType() : null) || msg.type || msg.role || 'unknown';
          console.error(`[Usage] Message[${i}] type=${msgType}, keys:`, Object.keys(msg).slice(0, 15));

          // Check response_metadata (LangChain AI message pattern)
          if (msg.response_metadata && typeof msg.response_metadata === 'object') {
            console.error(`[Usage] Message[${i}] has response_metadata:`, JSON.stringify(msg.response_metadata).slice(0, 500));
          }

          // Check usage_metadata directly
          if (msg.usage_metadata && typeof msg.usage_metadata === 'object') {
            console.error(`[Usage] Message[${i}] has usage_metadata:`, JSON.stringify(msg.usage_metadata).slice(0, 500));
          }
        }
      }
    }

    // Try to find usage metadata in various places it might be
    const usage = this.extractUsageMetadata(stateAny);
    if (usage && usage.promptTokens > 0) {
      console.error('[Usage] Found usage metadata:', usage);
      session.lastKnownPromptTokens = usage.promptTokens;
    } else {
      console.error('[Usage] No usage metadata found in state');
    }
  }

  /**
   * Extract usage metadata from a stream event and update the session.
   */
  private extractUsageFromStreamEvent(session: ActiveSession, event: unknown): void {
    if (!event || typeof event !== 'object') return;

    const eventAny = event as Record<string, unknown>;
    const data = eventAny.data as Record<string, unknown> | undefined;

    // Check for usage in various places in stream events
    if (data) {
      // LangChain often puts it in data.output or data.chunk
      const output = data.output as Record<string, unknown> | undefined;
      const chunk = data.chunk as Record<string, unknown> | undefined;

      if (output) {
        const usage = this.extractUsageMetadata(output);
        if (usage && usage.promptTokens > 0) {
          console.error('[Usage] Found usage in stream output:', usage);
          session.lastKnownPromptTokens = usage.promptTokens;
          return;
        }
      }

      if (chunk) {
        // Check response_metadata on chunk (common LangChain pattern)
        const responseMetadata = chunk.response_metadata as Record<string, unknown> | undefined;
        if (responseMetadata) {
          const usage = this.extractUsageMetadata(responseMetadata);
          if (usage && usage.promptTokens > 0) {
            console.error('[Usage] Found usage in chunk response_metadata:', usage);
            session.lastKnownPromptTokens = usage.promptTokens;
            return;
          }
        }
        // Check usage_metadata directly on chunk
        if (chunk.usage_metadata && typeof chunk.usage_metadata === 'object') {
          const usageMetadata = chunk.usage_metadata as Record<string, unknown>;
          const promptTokens = Number(usageMetadata.prompt_token_count ?? usageMetadata.promptTokenCount ?? 0);
          if (promptTokens > 0) {
            console.error('[Usage] Found usage_metadata on chunk:', usageMetadata);
            session.lastKnownPromptTokens = promptTokens;
            return;
          }
        }
      }
    }
  }

  private extractUsageMetadata(obj: Record<string, unknown>, depth = 0): { promptTokens: number; completionTokens: number; totalTokens: number } | null {
    // Prevent infinite recursion
    if (depth > 5) return null;

    // Direct usage object
    if (obj.usage && typeof obj.usage === 'object') {
      const usage = obj.usage as Record<string, unknown>;
      const promptTokens = Number(usage.prompt_tokens ?? usage.promptTokens ?? usage.prompt_token_count ?? usage.inputTokens ?? 0);
      const completionTokens = Number(usage.completion_tokens ?? usage.completionTokens ?? usage.candidates_token_count ?? usage.outputTokens ?? 0);
      const totalTokens = Number(usage.total_tokens ?? usage.totalTokens ?? usage.total_token_count ?? promptTokens + completionTokens);
      if (promptTokens > 0) {
        return { promptTokens, completionTokens, totalTokens };
      }
    }

    // usage_metadata (Gemini style)
    if (obj.usage_metadata && typeof obj.usage_metadata === 'object') {
      const usage = obj.usage_metadata as Record<string, unknown>;
      const promptTokens = Number(usage.prompt_token_count ?? usage.promptTokenCount ?? usage.input_tokens ?? 0);
      const completionTokens = Number(usage.candidates_token_count ?? usage.candidatesTokenCount ?? usage.output_tokens ?? 0);
      const totalTokens = Number(usage.total_token_count ?? usage.totalTokenCount ?? promptTokens + completionTokens);
      if (promptTokens > 0) {
        return { promptTokens, completionTokens, totalTokens };
      }
    }

    // usageMetadata (camelCase - common in JS SDKs)
    if (obj.usageMetadata && typeof obj.usageMetadata === 'object') {
      const usage = obj.usageMetadata as Record<string, unknown>;
      const promptTokens = Number(usage.promptTokenCount ?? usage.prompt_token_count ?? 0);
      const completionTokens = Number(usage.candidatesTokenCount ?? usage.candidates_token_count ?? 0);
      const totalTokens = Number(usage.totalTokenCount ?? usage.total_token_count ?? promptTokens + completionTokens);
      if (promptTokens > 0) {
        return { promptTokens, completionTokens, totalTokens };
      }
    }

    // response_metadata (LangChain style)
    if (obj.response_metadata && typeof obj.response_metadata === 'object') {
      const nested = this.extractUsageMetadata(obj.response_metadata as Record<string, unknown>, depth + 1);
      if (nested) return nested;
    }

    // Check in messages array (final state often has messages with metadata)
    if (Array.isArray(obj.messages)) {
      // Check from the end (most recent message likely has usage)
      for (let i = obj.messages.length - 1; i >= 0; i--) {
        const msg = obj.messages[i];
        if (msg && typeof msg === 'object') {
          const msgAny = msg as Record<string, unknown>;
          // LangChain AIMessage often has response_metadata
          if (msgAny.response_metadata && typeof msgAny.response_metadata === 'object') {
            const nested = this.extractUsageMetadata(msgAny.response_metadata as Record<string, unknown>, depth + 1);
            if (nested) return nested;
          }
          // Check usage_metadata directly on message
          if (msgAny.usage_metadata && typeof msgAny.usage_metadata === 'object') {
            const nested = this.extractUsageMetadata({ usage_metadata: msgAny.usage_metadata }, depth + 1);
            if (nested) return nested;
          }
          // Check usageMetadata (camelCase)
          if (msgAny.usageMetadata && typeof msgAny.usageMetadata === 'object') {
            const nested = this.extractUsageMetadata({ usageMetadata: msgAny.usageMetadata }, depth + 1);
            if (nested) return nested;
          }
          // Recurse into the message itself
          const nested = this.extractUsageMetadata(msgAny, depth + 1);
          if (nested) return nested;
        }
      }
    }

    // Check in output object (deepagents pattern)
    if (obj.output && typeof obj.output === 'object') {
      const nested = this.extractUsageMetadata(obj.output as Record<string, unknown>, depth + 1);
      if (nested) return nested;
    }

    return null;
  }

  private getFirstMessagePreview(session: ActiveSession): string | null {
    const firstUserMsg = session.messages.find(m => m.role === 'user');
    if (!firstUserMsg) return null;

    const content = typeof firstUserMsg.content === 'string'
      ? firstUserMsg.content
      : this.extractTextContent(firstUserMsg);

    return content ? content.slice(0, 100) : null;
  }

  private assessRiskLevel(request: PermissionRequest): 'low' | 'medium' | 'high' {
    switch (request.type) {
      case 'file_read':
        return 'low';
      case 'file_write':
      case 'file_delete':
        // Check if writing to system directories
        if (request.resource.startsWith('/System') ||
            request.resource.startsWith('/etc') ||
            request.resource.startsWith('/usr')) {
          return 'high';
        }
        return 'medium';
      case 'shell_execute':
        // Shell commands are potentially dangerous
        return 'medium';
      case 'network_request':
        return 'medium';
      default:
        return 'medium';
    }
  }

  /**
   * Check if an operation is dangerous and requires user approval even when policy allows.
   * These are high-risk operations that should always prompt the user.
   */
  private isDangerousOperation(toolName: string, args: Record<string, unknown>): boolean {
    // Shell commands with dangerous patterns
    if (toolName === 'execute' || toolName === 'Bash') {
      const command = (args.command as string) || '';
      const dangerousPatterns = [
        /\brm\s+(-rf?|--recursive)\b/i,  // rm -rf
        /\brm\s+.*\*/,                    // rm with wildcard
        /\bsudo\b/,                       // sudo commands
        /\bchmod\s+777\b/,                // chmod 777
        /\bdd\b/,                         // dd command
        />\s*\/dev\//,                    // writing to /dev
        /\bgit\s+(push|reset\s+--hard|clean\s+-[fd])/i, // dangerous git ops
        /\bnpm\s+publish\b/,              // npm publish
        /\bcurl\b.*\|\s*(ba)?sh/,         // curl | sh
      ];
      return dangerousPatterns.some(p => p.test(command));
    }

    // File operations on system directories
    if (toolName === 'write_file' || toolName === 'Write' ||
        toolName === 'edit_file' || toolName === 'Edit' ||
        toolName === 'delete_file') {
      const path = (args.file_path as string) || (args.path as string) || '';
      const systemDirs = ['/System', '/etc', '/usr', '/bin', '/sbin', '/var', '/private'];
      return systemDirs.some(dir => path.startsWith(dir));
    }

    return false;
  }

  private createMcpTools(_sessionId: string): ToolHandler[] {
    const tools = mcpBridge.getTools();
    return tools.map((tool) => ({
      name: `mcp_${tool.serverId}_${tool.name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      description: `[MCP:${tool.serverId}] ${tool.description || tool.name}`,
      parameters: z.record(z.unknown()),
      execute: async (args: unknown) => {
        const result = await mcpBridge.callTool(
          tool.serverId,
          tool.name,
          (args as Record<string, unknown>) || {}
        );
        return { success: true, data: result };
      },
    }));
  }

  private recordArtifactForTool(
    session: ActiveSession,
    toolName: string,
    args: Record<string, unknown>,
    result: unknown
  ): void {
    const name = toolName.toLowerCase();
    const artifacts: Artifact[] = [];

    const addArtifact = (artifact: Artifact) => {
      session.artifacts.push(artifact);
      eventEmitter.artifactCreated(session.id, artifact);
    };

    const resolvePathArg = (...keys: string[]) => {
      for (const key of keys) {
        if (key in args && args[key] !== undefined) {
          return String(args[key]);
        }
      }
      return null;
    };

    const filePath = resolvePathArg('file_path', 'path');

    if ((name === 'read_file' || name === 'read') && filePath) {
      artifacts.push({
        id: generateId('art'),
        path: filePath,
        type: 'touched',
        content: typeof result === 'string' ? result : undefined,
        timestamp: Date.now(),
      });
    }

    if (name === 'write_file' && filePath) {
      artifacts.push({
        id: generateId('art'),
        path: filePath,
        type: 'created',
        content: typeof args.content === 'string' ? args.content : undefined,
        timestamp: Date.now(),
      });
    }

    if (name === 'edit_file' && filePath) {
      artifacts.push({
        id: generateId('art'),
        path: filePath,
        type: 'modified',
        content: typeof args.new_string === 'string' ? args.new_string : undefined,
        timestamp: Date.now(),
      });
    }

    if (name === 'delete_file' && args.path) {
      artifacts.push({
        id: generateId('art'),
        path: String(args.path),
        type: 'deleted',
        timestamp: Date.now(),
      });
    }

    if (name === 'create_directory' && args.path) {
      artifacts.push({
        id: generateId('art'),
        path: String(args.path),
        type: 'created',
        timestamp: Date.now(),
      });
    }

    if (name === 'generate_image' || name === 'edit_image' || name === 'generate_video') {
      const resultAny = result as { images?: Array<{ path?: string; url?: string }>; videos?: Array<{ path?: string; url?: string }> };
      const files = [...(resultAny?.images || []), ...(resultAny?.videos || [])];
      for (const file of files) {
        if (!file.path && !file.url) continue;
        artifacts.push({
          id: generateId('art'),
          path: file.path || file.url || '',
          type: 'created',
          url: file.url,
          timestamp: Date.now(),
        });
      }
    }

    if (name === 'deep_research') {
      const resultAny = result as { report?: string; reportPath?: string } | undefined;
      if (resultAny?.reportPath) {
        artifacts.push({
          id: generateId('art'),
          path: resultAny.reportPath,
          type: 'created',
          content: resultAny.report,
          timestamp: Date.now(),
        });
      }
    }

    // Handle execute/bash/shell commands for artifact tracking
    if (name === 'execute' || name === 'bash' || name === 'shell' || name === 'run_command') {
      const command = String(args.command ?? args.cmd ?? '');
      const resultAny = result as { output?: string; stdout?: string } | string | undefined;
      const output = typeof resultAny === 'string'
        ? resultAny
        : resultAny?.output ?? resultAny?.stdout ?? '';

      const shellArtifacts = this.parseShellCommandArtifacts(
        command,
        output,
        session.workingDirectory
      );
      artifacts.push(...shellArtifacts);
    }

    if (name.startsWith('mcp_') || name.includes('stitch')) {
      artifacts.push(...this.extractDesignArtifacts(toolName, result));
    }

    for (const artifact of artifacts) {
      addArtifact(artifact);
    }
  }

  private extractDesignArtifacts(toolName: string, result: unknown): Artifact[] {
    if (!result || typeof result !== 'object') return [];
    const resultAny = result as Record<string, unknown>;
    const artifacts: Artifact[] = [];
    const safeName = toolName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'design';
    const timestamp = Date.now();

    const addArtifact = (path: string, content?: string, url?: string) => {
      artifacts.push({
        id: generateId('art'),
        path,
        type: 'created',
        content,
        url,
        timestamp,
      });
    };

    const design = resultAny.design as Record<string, unknown> | undefined;
    const code = resultAny.code as Record<string, unknown> | undefined;

    const html = (resultAny.html || design?.html || code?.html) as string | undefined;
    const css = (resultAny.css || design?.css || code?.css) as string | undefined;
    const svg = (resultAny.svg || design?.svg) as string | undefined;
    const previewUrl = (resultAny.previewUrl || (resultAny.preview as { url?: string } | undefined)?.url) as string | undefined;

    if (html || css) {
      const htmlContent = html
        ? html
        : `<html><head>${css ? `<style>${css}</style>` : ''}</head><body></body></html>`;
      const combined = css && html && !html.includes('<style')
        ? htmlContent.replace(/<head>/i, `<head><style>${css}</style>`)
        : htmlContent;
      addArtifact(`${safeName}-design.html`, combined);
    }

    if (svg) {
      const wrappedSvg = `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#fff;">${svg}</body></html>`;
      addArtifact(`${safeName}-design.svg.html`, wrappedSvg);
    }

    if (previewUrl) {
      const previewHtml = `<html><body style="margin:0;"><iframe src="${previewUrl}" style="width:100%;height:100%;border:0;"></iframe></body></html>`;
      addArtifact(`${safeName}-preview.html`, previewHtml, previewUrl);
    }

    const files = resultAny.files as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(files)) {
      for (const file of files) {
        const path = String(file.path || file.name || file.filename || '');
        if (!path) continue;
        const content =
          typeof file.content === 'string'
            ? file.content
            : typeof file.data === 'string'
              ? file.data
              : undefined;
        const url = typeof file.url === 'string' ? file.url : undefined;
        addArtifact(path, content, url);
      }
    }

    return artifacts;
  }

  /**
   * Parse shell command outputs to detect file creation/deletion.
   * Handles git clone, mkdir, touch, cp, rm, and common scaffolding commands.
   */
  private parseShellCommandArtifacts(
    command: string,
    output: string,
    workingDirectory: string
  ): Artifact[] {
    const artifacts: Artifact[] = [];
    const timestamp = Date.now();
    const cmd = command.trim().toLowerCase();

    // 1. Git clone detection - "Cloning into 'repo-name'..."
    const gitCloneMatch = output.match(/Cloning into ['"]?([^'".\n]+)['"]?/i);
    if (gitCloneMatch && cmd.includes('git clone')) {
      const clonedName = gitCloneMatch[1];
      const clonedPath = isAbsolute(clonedName)
        ? clonedName
        : join(workingDirectory, clonedName);
      artifacts.push({
        id: generateId('art'),
        path: clonedPath,
        type: 'created',
        timestamp,
      });
    }

    // 2. mkdir detection
    const mkdirMatch = cmd.match(/^mkdir\s+(?:-p\s+)?(.+)$/);
    if (mkdirMatch && !output.toLowerCase().includes('error')) {
      const paths = this.parseShellPaths(mkdirMatch[1], workingDirectory);
      for (const p of paths) {
        artifacts.push({ id: generateId('art'), path: p, type: 'created', timestamp });
      }
    }

    // 3. touch detection
    const touchMatch = cmd.match(/^touch\s+(.+)$/);
    if (touchMatch && !output.toLowerCase().includes('error')) {
      const paths = this.parseShellPaths(touchMatch[1], workingDirectory);
      for (const p of paths) {
        artifacts.push({ id: generateId('art'), path: p, type: 'created', timestamp });
      }
    }

    // 4. cp detection (creates at destination)
    const cpMatch = cmd.match(/^cp\s+(?:-[rRfai]+\s+)?(.+)\s+(\S+)$/);
    if (cpMatch && !output.toLowerCase().includes('error')) {
      const dest = this.resolveShellPath(cpMatch[2], workingDirectory);
      artifacts.push({ id: generateId('art'), path: dest, type: 'created', timestamp });
    }

    // 5. npm init / npx create-* / yarn create detection
    if (cmd.match(/^(npm\s+init|npx\s+create-|yarn\s+create)/)) {
      // Look for "Created X" patterns in output
      const createdMatches = output.match(/[Cc]reated?\s+([^\n]+)/g);
      if (createdMatches) {
        for (const match of createdMatches) {
          const filePath = match.replace(/[Cc]reated?\s+/, '').trim();
          if (filePath && !filePath.includes(' ')) {
            artifacts.push({
              id: generateId('art'),
              path: this.resolveShellPath(filePath, workingDirectory),
              type: 'created',
              timestamp,
            });
          }
        }
      }
      // Also check for common project directory creation
      const projectMatch = output.match(/Success[!]?\s+Created\s+(\S+)/i) ||
                          output.match(/Creating a new .+ app in\s+(\S+)/i);
      if (projectMatch) {
        artifacts.push({
          id: generateId('art'),
          path: this.resolveShellPath(projectMatch[1], workingDirectory),
          type: 'created',
          timestamp,
        });
      }
    }

    // 6. rm detection
    const rmMatch = cmd.match(/^rm\s+(?:-[rRfi]+\s+)?(.+)$/);
    if (rmMatch && !output.includes('No such file')) {
      const paths = this.parseShellPaths(rmMatch[1], workingDirectory);
      for (const p of paths) {
        artifacts.push({ id: generateId('art'), path: p, type: 'deleted', timestamp });
      }
    }

    return artifacts;
  }

  /**
   * Parse space-separated paths from shell arguments, handling quotes.
   */
  private parseShellPaths(argsString: string, workingDirectory: string): string[] {
    const paths: string[] = [];
    const regex = /(?:"([^"]+)"|'([^']+)'|(\S+))/g;
    let match;
    while ((match = regex.exec(argsString)) !== null) {
      const p = match[1] || match[2] || match[3];
      if (p && !p.startsWith('-')) {
        paths.push(this.resolveShellPath(p, workingDirectory));
      }
    }
    return paths;
  }

  /**
   * Resolve a file path relative to working directory if not absolute.
   */
  private resolveShellPath(filePath: string, workingDirectory: string): string {
    // Remove any trailing quotes or whitespace
    const cleaned = filePath.replace(/['"]/g, '').trim();
    return isAbsolute(cleaned) ? cleaned : join(workingDirectory, cleaned);
  }

  private async maybeCompactContext(session: ActiveSession): Promise<void> {
    if (!this.provider) return;
    const contextWindow = getModelContextWindow(session.model);
    const used = this.estimateTokens(session.messages);
    const ratio = contextWindow.input > 0 ? used / contextWindow.input : 0;
    if (ratio < 0.7) return;

    const keepLast = 6;
    if (session.messages.length <= keepLast + 2) return;

    const toSummarize = session.messages.slice(0, -keepLast);
    const summary = await this.summarizeMessages(toSummarize, session.model);
    if (!summary) return;

    const summaryMessage: Message = {
      id: generateMessageId(),
      role: 'system',
      content: `Summary of earlier conversation:\n${summary}`,
      createdAt: now(),
    };

    session.messages = [summaryMessage, ...session.messages.slice(-keepLast)];
    await this.persistSummary(session.workingDirectory, summary);
    this.emitContextUsage(session);
  }

  private async summarizeMessages(messages: Message[], model: string): Promise<string> {
    if (!this.provider) return '';
    const transcript = messages
      .map((msg) => {
        const content = typeof msg.content === 'string'
          ? msg.content
          : this.extractTextContent(msg) || '[non-text content]';
        return `${msg.role.toUpperCase()}: ${content}`;
      })
      .join('\n\n');

    const response = await this.provider.generate({
      model,
      messages: [
        {
          id: generateMessageId(),
          role: 'system',
          content: 'Summarize the conversation so far into compact project memory. Focus on decisions, plans, files, and open questions.',
          createdAt: now(),
        },
        {
          id: generateMessageId(),
          role: 'user',
          content: transcript,
          createdAt: now(),
        },
      ],
    });

    return typeof response.message.content === 'string'
      ? response.message.content
      : this.extractTextContent(response.message) || '';
  }

  private async persistSummary(workingDirectory: string, summary: string): Promise<void> {
    const memoryPath = join(workingDirectory, 'GEMINI.md');
    const header = '# GEMINI.md - Project Memory';
    const section = '## Additional Context';
    const entry = `- ${new Date().toISOString()}: ${summary.replace(/\n/g, ' ')}`;

    if (!existsSync(memoryPath)) {
      const content = [header, '', section, entry, ''].join('\n');
      await mkdir(workingDirectory, { recursive: true });
      await writeFile(memoryPath, content, 'utf-8');
      return;
    }

    const existing = await readFile(memoryPath, 'utf-8');
    if (existing.includes(section)) {
      const updated = existing.replace(section, `${section}\n${entry}`);
      await writeFile(memoryPath, updated, 'utf-8');
    } else {
      const updated = `${existing.trim()}\n\n${section}\n${entry}\n`;
      await writeFile(memoryPath, updated, 'utf-8');
    }
  }

  private estimateTokens(messages: Message[]): number {
    // Rough estimation: ~4 characters per token
    let totalChars = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else {
        for (const part of message.content) {
          if (part.type === 'text') {
            totalChars += part.text.length;
          } else if (part.type === 'image') {
            totalChars += 500 * 4; // ~500 tokens for images
          } else {
            totalChars += JSON.stringify(part).length;
          }
        }
      }
    }

    return Math.ceil(totalChars / 4);
  }
}

// Singleton instance
export const agentRunner = new AgentRunner();
