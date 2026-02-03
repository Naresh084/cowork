import { FILE_TOOLS, SHELL_TOOLS, type ToolHandler, type ToolContext } from '@gemini-cowork/core';
import { GeminiProvider, getModelContextWindow } from '@gemini-cowork/providers';
import type { Message, PermissionRequest, PermissionDecision, MessageContentPart } from '@gemini-cowork/shared';
import { generateId, generateMessageId, now } from '@gemini-cowork/shared';
import { createDeepAgent } from 'deepagents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { eventEmitter } from './event-emitter.js';
import { TODO_TOOLS, getSessionTasks, createResearchTools, createComputerUseTools, createMediaTools, createGroundingTools } from './tools/index.js';
import { mcpBridge } from './mcp-bridge.js';
import { chromeBridge } from './chrome-bridge.js';
import type {
  SessionInfo,
  SessionDetails,
  Attachment,
  Task,
  Artifact,
  ExtendedPermissionRequest,
  QuestionRequest,
} from './types.js';

// ============================================================================
// Session Manager
// ============================================================================

type DeepAgentInstance = {
  invoke: (input: unknown, options?: unknown) => Promise<unknown>;
  stop?: () => void;
  abort?: () => void;
  cancel?: () => void;
};

interface ActiveSession {
  id: string;
  workingDirectory: string;
  model: string;
  title: string | null;
  agent: DeepAgentInstance;
  messages: Message[];
  tasks: Task[];
  artifacts: Artifact[];
  permissionCache: Map<string, PermissionDecision>;
  toolStartTimes: Map<string, number>;
  pendingPermissions: Map<string, {
    request: ExtendedPermissionRequest;
    resolve: (decision: PermissionDecision) => void;
  }>;
  pendingQuestions: Map<string, {
    request: QuestionRequest;
    resolve: (answer: string | string[]) => void;
  }>;
  createdAt: number;
  updatedAt: number;
}

export class AgentRunner {
  private sessions: Map<string, ActiveSession> = new Map();
  private provider: GeminiProvider | null = null;
  private apiKey: string | null = null;

  constructor() {
    chromeBridge.start();
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

    for (const session of this.sessions.values()) {
      const toolHandlers = this.buildToolHandlers(session);
      session.agent = this.createDeepAgent(session, toolHandlers);
    }
  }

  /**
   * Create a new session.
   */
  async createSession(
    workingDirectory: string,
    model?: string | null,
    title?: string
  ): Promise<SessionInfo> {
    if (!this.provider) {
      throw new Error('Provider not initialized. Set API key first.');
    }

    // Use provided model or fall back to default
    // This handles both undefined and null cases (null comes from Rust's Option::None)
    const actualModel = model || 'gemini-3-flash-preview';

    const sessionId = generateId('sess');
    const now = Date.now();

    // Create session
    const session: ActiveSession = {
      id: sessionId,
      workingDirectory,
      model: actualModel,
      title: title || null,
      agent: {} as DeepAgentInstance,
      messages: [],
      tasks: [],
      artifacts: [],
      permissionCache: new Map(),
      toolStartTimes: new Map(),
      pendingPermissions: new Map(),
      pendingQuestions: new Map(),
      createdAt: now,
      updatedAt: now,
    };

    const toolHandlers = this.buildToolHandlers(session);
    session.agent = this.createDeepAgent(session, toolHandlers);

    this.sessions.set(sessionId, session);

    // Subscribe to agent events
    this.subscribeToAgentEvents(session);

    const sessionInfo: SessionInfo = {
      id: sessionId,
      title: session.title,
      firstMessage: null,
      workingDirectory,
      model: actualModel,
      createdAt: now,
      updatedAt: now,
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
        } else if (attachment.type === 'text' && attachment.data) {
          parts.push({
            type: 'text' as const,
            text: `File: ${attachment.name}\n${attachment.data}`,
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

    // Emit stream start
    eventEmitter.streamStart(sessionId);

    try {
      const lcMessages = this.toLangChainMessages(session.messages);
      const result = await session.agent.invoke({ messages: lcMessages });
      const assistantMessage = this.extractAssistantMessage(result);

      if (assistantMessage) {
        session.messages.push(assistantMessage);
        session.updatedAt = Date.now();

        const textContent = this.extractTextContent(assistantMessage);
        if (textContent) {
          eventEmitter.streamChunk(sessionId, textContent);
        }

        eventEmitter.streamDone(sessionId, assistantMessage);
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

      eventEmitter.error(sessionId, errorMessage, errorCode);
      throw error;
    } finally {
      eventEmitter.flushSync();
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
      const cacheKey = `${pending.request.type}:${pending.request.resource}`;
      session.permissionCache.set(cacheKey, decision);
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
   * Get all sessions.
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => {
      const firstMessage = this.getFirstMessagePreview(session);

      return {
        id: session.id,
        title: session.title,
        firstMessage,
        workingDirectory: session.workingDirectory,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
      };
    });
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
      title: session.title,
      firstMessage,
      workingDirectory: session.workingDirectory,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      messages: session.messages,
    };
  }

  /**
   * Delete a session.
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Stop agent if running
    session.agent.stop?.();

    // Clear pending permissions
    for (const pending of session.pendingPermissions.values()) {
      pending.resolve('deny');
    }
    session.pendingPermissions.clear();

    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Update session title.
   */
  updateSessionTitle(sessionId: string, title: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.title = title;
    session.updatedAt = Date.now();

    // Emit session updated event
    const firstMessage = this.getFirstMessagePreview(session);

    const sessionInfo: SessionInfo = {
      id: session.id,
      title: session.title,
      firstMessage,
      workingDirectory: session.workingDirectory,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
    };
    eventEmitter.sessionUpdated(sessionInfo);
  }

  /**
   * Update session working directory.
   */
  updateSessionWorkingDirectory(sessionId: string, workingDirectory: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.workingDirectory = workingDirectory;
    session.updatedAt = Date.now();

    // Refresh agent with updated working directory
    const toolHandlers = this.buildToolHandlers(session);
    session.agent = this.createDeepAgent(session, toolHandlers);

    // Emit session updated event
    const firstMessageWd = this.getFirstMessagePreview(session);

    const sessionInfo: SessionInfo = {
      id: session.id,
      title: session.title,
      firstMessage: firstMessageWd,
      workingDirectory: session.workingDirectory,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
    };
    eventEmitter.sessionUpdated(sessionInfo);
  }

  /**
   * Get tasks for a session.
   * Tasks can come from either the session state or the todo tools module.
   */
  getTasks(sessionId: string): Task[] {
    // First check session state
    const session = this.sessions.get(sessionId);
    if (session?.tasks && session.tasks.length > 0) {
      return session.tasks;
    }
    // Fall back to todo tools storage
    return getSessionTasks(sessionId);
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

    const used = this.estimateTokens(session.messages);
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

  private buildSystemPrompt(workingDirectory: string): string {
    return `You are Gemini Cowork, an AI assistant that helps with software development tasks.

Working Directory: ${workingDirectory}

## Planning & Task Tracking
For complex tasks, use write_todos to break down work into manageable steps:
- Mark tasks as 'pending', 'in_progress', or 'completed'
- Update todos as you progress through multi-step work
- Use read_todos to check current task state
- The UI will show task progress in real-time

Example usage:
\`\`\`
write_todos([
  { status: 'in_progress', content: 'Analyze codebase structure' },
  { status: 'pending', content: 'Implement new feature' },
  { status: 'pending', content: 'Write tests' }
])
\`\`\`

## File Operations
You have access to file and shell tools:
- read_file: Read file contents before editing
- write_file: Create new files
- list_directory: Browse directory contents
- Use exact old_string matches when editing

## Shell Commands
- execute_command: Run shell commands
- analyze_command: Check command safety before execution

## Best Practices
- Explain what you're doing before taking action
- Ask for confirmation before destructive operations
- Track progress with todos for multi-step tasks
- Read files before modifying to understand current content
- Be concise but thorough in your responses`;
  }

  private subscribeToAgentEvents(session: ActiveSession): void {
    this.emitContextUsage(session);
  }

  private createDeepAgent(session: ActiveSession, tools: ToolHandler[]): DeepAgentInstance {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    const model = new ChatGoogleGenerativeAI({
      model: session.model,
      apiKey: this.apiKey,
    });

    const wrappedTools = tools.map((tool) => this.wrapTool(tool, session));

    const createDeepAgentAny = createDeepAgent as unknown as (params: unknown) => DeepAgentInstance;
    const agent = createDeepAgentAny({
      model,
      tools: wrappedTools,
      systemPrompt: this.buildSystemPrompt(session.workingDirectory),
    });

    return agent;
  }

  private buildToolHandlers(session: ActiveSession): ToolHandler[] {
    const fileTools = FILE_TOOLS;
    const shellTools = SHELL_TOOLS;
    const todoTools = TODO_TOOLS;
    const researchTools = createResearchTools(() => this.apiKey);
    const computerUseTools = createComputerUseTools(() => this.apiKey);
    const mediaTools = createMediaTools(() => this.apiKey);
    const groundingTools = createGroundingTools(() => this.apiKey);
    const mcpTools = this.createMcpTools(session.id);

    return [
      ...fileTools,
      ...shellTools,
      ...todoTools,
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
      func: async (args: Record<string, unknown>) => {
        const toolCallId = generateId('tool');
        const toolCall = { id: toolCallId, name: tool.name, args };
        session.toolStartTimes.set(toolCallId, Date.now());
        eventEmitter.toolStart(session.id, toolCall);

        if (tool.requiresPermission) {
          const request = tool.requiresPermission(args);
          if (request) {
            const decision = await this.requestPermission(session, request);
            if (decision === 'deny') {
              const payload = {
                toolCallId,
                success: false,
                result: null,
                error: 'Permission denied',
                duration: this.consumeToolDuration(session, toolCallId),
              };
              eventEmitter.toolResult(session.id, toolCall, payload);
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
          };
          eventEmitter.toolResult(session.id, toolCall, payload);
          this.recordArtifactForTool(session, tool.name, args, result.data);
          return result.data ?? result;
        } catch (error) {
          const duration = this.consumeToolDuration(session, toolCallId);
          const payload = {
            toolCallId,
            success: false,
            result: null,
            error: error instanceof Error ? error.message : String(error),
            duration,
          };
          eventEmitter.toolResult(session.id, toolCall, payload);
          return { error: payload.error };
        }
      },
    });
  }

  private buildToolContext(session: ActiveSession): ToolContext {
    return {
      workingDirectory: session.workingDirectory,
      sessionId: session.id,
      agentId: session.id,
    };
  }

  private consumeToolDuration(session: ActiveSession, toolCallId: string): number | undefined {
    const startTime = session.toolStartTimes.get(toolCallId);
    if (toolCallId) {
      session.toolStartTimes.delete(toolCallId);
    }
    return startTime ? Date.now() - startTime : undefined;
  }

  private async requestPermission(
    session: ActiveSession,
    request: PermissionRequest
  ): Promise<PermissionDecision> {
    const cacheKey = `${request.type}:${request.resource}`;
    const cachedDecision = session.permissionCache.get(cacheKey);
    if (cachedDecision === 'allow_session') {
      return cachedDecision;
    }

    const permissionId = generateId('perm');
    const extendedRequest: ExtendedPermissionRequest = {
      ...request,
      id: permissionId,
      riskLevel: this.assessRiskLevel(request),
      timestamp: Date.now(),
    };

    return new Promise((resolve) => {
      session.pendingPermissions.set(permissionId, {
        request: extendedRequest,
        resolve,
      });
      eventEmitter.permissionRequest(session.id, extendedRequest);
    });
  }

  private toLangChainMessages(messages: Message[]): Array<{ role: string; content: unknown }> {
    return messages.map((message) => {
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
  }

  private extractTextContent(message: Message): string | null {
    if (typeof message.content === 'string') {
      return message.content;
    }

    const textParts = message.content.filter(part => part.type === 'text');
    if (textParts.length === 0) return null;

    return textParts.map(part => (part as { text: string }).text).join('');
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

    if ((name === 'read_file' || name === 'read') && args.path) {
      artifacts.push({
        id: generateId('art'),
        path: String(args.path),
        type: 'touched',
        content: typeof result === 'string' ? result : undefined,
        timestamp: Date.now(),
      });
    }

    if (name === 'write_file' && args.path) {
      artifacts.push({
        id: generateId('art'),
        path: String(args.path),
        type: 'created',
        content: typeof args.content === 'string' ? args.content : undefined,
        timestamp: Date.now(),
      });
    }

    if (name === 'edit_file' && args.path) {
      artifacts.push({
        id: generateId('art'),
        path: String(args.path),
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
      const resultAny = result as { images?: Array<{ path?: string; url?: string; data?: string }>; videos?: Array<{ path?: string; url?: string; data?: string }> };
      const files = [...(resultAny?.images || []), ...(resultAny?.videos || [])];
      for (const file of files) {
        if (!file.path && !file.url) continue;
        artifacts.push({
          id: generateId('art'),
          path: file.path || file.url || '',
          type: 'created',
          content: file.data,
          url: file.url,
          timestamp: Date.now(),
        });
      }
    }

    for (const artifact of artifacts) {
      addArtifact(artifact);
    }
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
