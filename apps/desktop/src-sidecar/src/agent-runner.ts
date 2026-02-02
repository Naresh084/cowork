import { CoworkAgent, createAgent, FILE_TOOLS, SHELL_TOOLS } from '@gemini-cowork/core';
import { GeminiProvider, getModelContextWindow } from '@gemini-cowork/providers';
import type { Message, PermissionRequest, PermissionDecision } from '@gemini-cowork/shared';
import { generateId } from '@gemini-cowork/shared';
import { eventEmitter } from './event-emitter.js';
import { TODO_TOOLS, getSessionTasks, createResearchTools } from './tools/index.js';
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

interface ActiveSession {
  id: string;
  workingDirectory: string;
  model: string;
  title: string | null;
  agent: CoworkAgent;
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

    // Tools for this session - includes file, shell, and todo tools
    const fileTools = FILE_TOOLS;
    const shellTools = SHELL_TOOLS;
    const todoTools = TODO_TOOLS;
    const researchTools = createResearchTools(() => this.apiKey);

    // Create permission handler that emits events and waits for response
    const permissionHandler = async (
      request: PermissionRequest,
      _context: unknown
    ): Promise<PermissionDecision> => {
      const session = this.sessions.get(sessionId);
      const cacheKey = `${request.type}:${request.resource}`;
      const cachedDecision = session?.permissionCache.get(cacheKey);
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
        // Store pending permission
        const activeSession = this.sessions.get(sessionId);
        if (activeSession) {
          activeSession.pendingPermissions.set(permissionId, {
            request: extendedRequest,
            resolve,
          });
        }

        // Emit permission request event
        eventEmitter.permissionRequest(sessionId, extendedRequest);
      });
    };

    // Create agent
    const agent = createAgent({
      config: {
        model: actualModel,
        maxIterations: 20,
        systemPrompt: this.buildSystemPrompt(workingDirectory),
      },
      provider: this.provider,
      tools: [...fileTools, ...shellTools, ...todoTools, ...researchTools],
      permissionHandler,
      workingDirectory,
      sessionId,
    });

    // Create session
    const session: ActiveSession = {
      id: sessionId,
      workingDirectory,
      model: actualModel,
      title: title || null,
      agent,
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
      messageContent = [
        { type: 'text' as const, text: content },
        ...attachments.map(att => ({
          type: 'image' as const,
          mimeType: att.mimeType,
          data: att.data,
        })),
      ];
    }

    // Emit stream start
    eventEmitter.streamStart(sessionId);

    try {
      // Run agent
      for await (const event of session.agent.run(
        typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent)
      )) {
        switch (event.type) {
          case 'agent:message': {
            const msg = event.payload as { message: Message };
            session.messages.push(msg.message);
            session.updatedAt = Date.now();

            if (msg.message.role === 'assistant') {
              // Extract text content for streaming
              const textContent = this.extractTextContent(msg.message);
              if (textContent) {
                eventEmitter.streamChunk(sessionId, textContent);
              }
            }
            break;
          }

          case 'agent:tool_call': {
            const toolCall = event.payload as { toolCall: unknown };
            const toolCallAny = toolCall.toolCall as { id?: string };
            if (toolCallAny?.id) {
              session.toolStartTimes.set(toolCallAny.id, Date.now());
            }
            eventEmitter.toolStart(sessionId, toolCall.toolCall);
            break;
          }

          case 'agent:tool_result': {
            const result = event.payload as { toolCall: { id?: string; status?: string; result?: unknown; error?: string } };
            const toolCallId = result.toolCall.id ?? '';
            const startTime = toolCallId ? session.toolStartTimes.get(toolCallId) : undefined;
            if (toolCallId) {
              session.toolStartTimes.delete(toolCallId);
            }

            const success = result.toolCall.status === 'executed' && !result.toolCall.error;
            const payload = {
              toolCallId,
              success,
              result: result.toolCall.result,
              error: result.toolCall.error,
              duration: startTime ? Date.now() - startTime : undefined,
            };

            eventEmitter.toolResult(sessionId, result.toolCall, payload);

            // Check if this creates an artifact
            this.checkForArtifact(session, result);
            break;
          }

          case 'agent:complete': {
            const lastAssistant = [...session.messages].reverse().find(m => m.role === 'assistant');
            if (lastAssistant) {
              eventEmitter.streamDone(sessionId, lastAssistant);
            }
            break;
          }

          case 'agent:error': {
            const error = event.payload as { error: string };
            eventEmitter.error(sessionId, error.error);
            break;
          }
        }
      }
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
      // CRITICAL: Force flush all pending events before returning
      // This ensures events are not lost due to buffering when the function exits
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

    session.agent.stop();
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
    session.agent.stop();

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

    // Update the agent's system prompt with new working directory
    // Note: The agent will use this for future tool operations

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
    // Subscribe to relevant events for task/artifact tracking
    session.agent.on('agent:iteration', () => {
      // Update context usage estimate using model's actual context window
      const tokenEstimate = this.estimateTokens(session.messages);
      const contextWindow = getModelContextWindow(session.model);
      eventEmitter.contextUpdate(session.id, tokenEstimate, contextWindow.input);
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

  private checkForArtifact(session: ActiveSession, result: unknown): void {
    // Check if the tool result indicates a file was created/modified
    const payload = result as { toolCall?: { name: string; args: Record<string, unknown> } };
    if (!payload.toolCall) return;

    const { name, args } = payload.toolCall;

    if (name === 'write_file' && args.path) {
      const artifact: Artifact = {
        id: generateId('art'),
        path: args.path as string,
        type: 'created', // Could check if file existed before
        content: args.content as string | undefined,
        timestamp: Date.now(),
      };

      session.artifacts.push(artifact);
      eventEmitter.artifactCreated(session.id, artifact);
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
