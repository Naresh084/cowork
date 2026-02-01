import { CoworkAgent, createAgent, FILE_TOOLS, SHELL_TOOLS } from '@gemini-cowork/core';
import { GeminiProvider } from '@gemini-cowork/providers';
import type { Message, PermissionRequest, PermissionDecision } from '@gemini-cowork/shared';
import { generateId } from '@gemini-cowork/shared';
import { eventEmitter } from './event-emitter.js';
import type {
  SessionInfo,
  SessionDetails,
  Attachment,
  Task,
  Artifact,
  ExtendedPermissionRequest,
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
  pendingPermissions: Map<string, {
    request: ExtendedPermissionRequest;
    resolve: (decision: PermissionDecision) => void;
  }>;
  createdAt: number;
  updatedAt: number;
}

export class AgentRunner {
  private sessions: Map<string, ActiveSession> = new Map();
  private provider: GeminiProvider | null = null;

  /**
   * Initialize the provider with API key.
   */
  setApiKey(apiKey: string): void {
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
    model: string = 'gemini-3.0-flash-preview',
    title?: string
  ): Promise<SessionInfo> {
    if (!this.provider) {
      throw new Error('Provider not initialized. Set API key first.');
    }

    const sessionId = generateId('sess');
    const now = Date.now();

    // Tools for this session
    const fileTools = FILE_TOOLS;
    const shellTools = SHELL_TOOLS;

    // Create permission handler that emits events and waits for response
    const permissionHandler = async (
      request: PermissionRequest,
      _context: unknown
    ): Promise<PermissionDecision> => {
      const permissionId = generateId('perm');

      const extendedRequest: ExtendedPermissionRequest = {
        ...request,
        id: permissionId,
        riskLevel: this.assessRiskLevel(request),
        timestamp: Date.now(),
      };

      return new Promise((resolve) => {
        // Store pending permission
        const session = this.sessions.get(sessionId);
        if (session) {
          session.pendingPermissions.set(permissionId, {
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
        model,
        maxIterations: 20,
        systemPrompt: this.buildSystemPrompt(workingDirectory),
      },
      provider: this.provider,
      tools: [...fileTools, ...shellTools],
      permissionHandler,
      workingDirectory,
      sessionId,
    });

    // Create session
    const session: ActiveSession = {
      id: sessionId,
      workingDirectory,
      model,
      title: title || null,
      agent,
      messages: [],
      tasks: [],
      artifacts: [],
      pendingPermissions: new Map(),
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);

    // Subscribe to agent events
    this.subscribeToAgentEvents(session);

    const sessionInfo: SessionInfo = {
      id: sessionId,
      title: session.title,
      workingDirectory,
      model,
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
            eventEmitter.toolStart(sessionId, toolCall.toolCall);
            break;
          }

          case 'agent:tool_result': {
            const result = event.payload as { toolCall: unknown };
            eventEmitter.toolResult(sessionId, result.toolCall, result);

            // Check if this creates an artifact
            this.checkForArtifact(session, result);
            break;
          }

          case 'agent:complete': {
            const lastMessage = session.messages[session.messages.length - 1];
            eventEmitter.streamDone(sessionId, lastMessage);
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
      eventEmitter.error(sessionId, errorMessage);
      throw error;
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

    // Emit resolved event
    eventEmitter.permissionResolved(sessionId, permissionId);
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
   * Get all sessions.
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      title: session.title,
      workingDirectory: session.workingDirectory,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
    }));
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): SessionDetails | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      title: session.title,
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
   * Get tasks for a session.
   */
  getTasks(sessionId: string): Task[] {
    const session = this.sessions.get(sessionId);
    return session?.tasks || [];
  }

  /**
   * Get artifacts for a session.
   */
  getArtifacts(sessionId: string): Artifact[] {
    const session = this.sessions.get(sessionId);
    return session?.artifacts || [];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildSystemPrompt(workingDirectory: string): string {
    return `You are Gemini Cowork, an AI assistant that helps with software development tasks.

Working Directory: ${workingDirectory}

You have access to file and shell tools to help the user. Use them when needed to:
- Read, write, and modify files
- Execute shell commands
- List directory contents

Always explain what you're doing and ask for confirmation before making significant changes.
Be concise but thorough in your responses.`;
  }

  private subscribeToAgentEvents(session: ActiveSession): void {
    // Subscribe to relevant events for task/artifact tracking
    session.agent.on('agent:iteration', () => {
      // Update context usage estimate
      const tokenEstimate = this.estimateTokens(session.messages);
      eventEmitter.contextUpdate(session.id, tokenEstimate, 128000);
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

  private assessRiskLevel(request: PermissionRequest): 'safe' | 'moderate' | 'dangerous' {
    switch (request.type) {
      case 'file_read':
        return 'safe';
      case 'file_write':
      case 'file_delete':
        // Check if writing to system directories
        if (request.resource.startsWith('/System') ||
            request.resource.startsWith('/etc') ||
            request.resource.startsWith('/usr')) {
          return 'dangerous';
        }
        return 'moderate';
      case 'shell_execute':
        // Shell commands are potentially dangerous
        return 'moderate';
      case 'network_request':
        return 'moderate';
      default:
        return 'moderate';
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
