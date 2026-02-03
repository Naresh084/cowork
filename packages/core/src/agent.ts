import { z } from 'zod';
import type {
  Agent,
  AgentConfig,
  AgentState,
  AgentEvent,
  AgentEventType,
  AgentEventHandler,
  ToolCall,
  ToolHandler,
  ToolContext,
  PermissionHandler,
} from './types.js';
import type { Message, ToolDefinition, PermissionDecision, MessageContentPart } from '@gemini-cowork/shared';
import { generateId, generateMessageId, now } from '@gemini-cowork/shared';
import type { AIProvider, GenerateRequest } from '@gemini-cowork/providers';

// ============================================================================
// Cowork Agent
// ============================================================================

interface CoworkAgentOptions {
  config: AgentConfig;
  provider: AIProvider;
  tools?: ToolHandler[];
  permissionHandler?: PermissionHandler;
  workingDirectory?: string;
  sessionId?: string;
}

export class CoworkAgent implements Agent {
  readonly id: string;
  readonly config: AgentConfig;

  private provider: AIProvider;
  private tools: Map<string, ToolHandler>;
  private permissionHandler?: PermissionHandler;
  private workingDirectory: string;
  private sessionId: string;
  private state: AgentState;
  private eventHandlers: Map<AgentEventType, Set<AgentEventHandler>>;
  private abortController: AbortController | null = null;

  constructor(options: CoworkAgentOptions) {
    this.id = generateId('agent');
    this.config = options.config;
    this.provider = options.provider;
    this.permissionHandler = options.permissionHandler;
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.sessionId = options.sessionId || generateId('session');
    this.tools = new Map();
    this.eventHandlers = new Map();

    // Register tools
    if (options.tools) {
      for (const tool of options.tools) {
        this.tools.set(tool.name, tool);
      }
    }

    // Initialize state
    this.state = this.createInitialState();
  }

  private createInitialState(): AgentState {
    return {
      messages: [],
      currentIteration: 0,
      pendingToolCalls: [],
      pendingPermissions: [],
      isRunning: false,
    };
  }

  async *run(userMessage: string | Message['content']): AsyncGenerator<AgentEvent> {
    // Add user message
    const userMsg: Message = {
      id: generateMessageId(),
      role: 'user',
      content: userMessage,
      createdAt: now(),
    };

    this.state.messages.push(userMsg);
    this.state.isRunning = true;
    this.state.currentIteration = 0;
    this.abortController = new AbortController();

    yield this.emit('agent:started', { message: userMessage });
    yield this.emit('agent:message', { message: userMsg });

    try {
      // Run agent loop
      yield* this.runLoop();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.lastError = errorMessage;
      yield this.emit('agent:error', { error: errorMessage });
    } finally {
      this.state.isRunning = false;
      yield this.emit('agent:complete', { iterations: this.state.currentIteration });
    }
  }

  async *resume(decision: PermissionDecision): AsyncGenerator<AgentEvent> {
    if (this.state.pendingToolCalls.length === 0) {
      yield this.emit('agent:error', { error: 'No pending tool calls to resume' });
      return;
    }

    yield this.emit('agent:permission_decision', { decision });

    const pendingCall = this.state.pendingToolCalls[0];

    if (decision === 'allow' || decision === 'allow_once' || decision === 'allow_session') {
      pendingCall.status = 'approved';
      this.state.isRunning = true;

      try {
        yield* this.runLoop();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.state.lastError = errorMessage;
        yield this.emit('agent:error', { error: errorMessage });
      } finally {
        this.state.isRunning = false;
        yield this.emit('agent:complete', { iterations: this.state.currentIteration });
      }
    } else {
      pendingCall.status = 'denied';
      pendingCall.error = 'Permission denied by user';
      yield* this.handleToolResult(pendingCall);
    }
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.state.isRunning = false;
    this.emit('agent:stopped', {});
  }

  getState(): AgentState {
    return { ...this.state };
  }

  reset(): void {
    this.state = this.createInitialState();
  }

  on<T>(type: AgentEventType, handler: AgentEventHandler<T>): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler as AgentEventHandler);
    return () => this.eventHandlers.get(type)?.delete(handler as AgentEventHandler);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async *runLoop(): AsyncGenerator<AgentEvent> {
    const maxIterations = this.config.maxIterations || 10;

    while (this.state.isRunning && this.state.currentIteration < maxIterations) {
      this.state.currentIteration++;
      yield this.emit('agent:iteration', { iteration: this.state.currentIteration });

      // Check for aborted
      if (this.abortController?.signal.aborted) {
        break;
      }

      // Generate response (streaming or non-streaming)
      const request = this.buildRequest();
      const streamingEnabled = this.config.streaming ?? false;

      let response: Awaited<ReturnType<typeof this.provider.generate>>;

      if (streamingEnabled) {
        const stream = this.provider.stream(request);
        let streamResult = await stream.next();

        while (!streamResult.done) {
          const chunk = streamResult.value;
          if (chunk.type === 'text' && chunk.text) {
            yield this.emit('agent:stream_chunk', { text: chunk.text });
          }
          streamResult = await stream.next();
        }

        response = streamResult.value;
      } else {
        response = await this.provider.generate(request);
      }

      // Add assistant message
      this.state.messages.push(response.message);
      yield this.emit('agent:message', { message: response.message });

      // Check for tool calls
      const toolCalls = this.extractToolCalls(response.message);

      if (toolCalls.length === 0) {
        // No tool calls, we're done
        break;
      }

      // Process tool calls
      for (const toolCall of toolCalls) {
        this.state.pendingToolCalls.push(toolCall);
        yield this.emit('agent:tool_call', { toolCall });

        // Check if permission is required
        const tool = this.tools.get(toolCall.name);
        if (tool?.requiresPermission) {
          const permissionRequest = tool.requiresPermission(toolCall.args);

          if (permissionRequest) {
            this.state.pendingPermissions.push(permissionRequest);

            if (this.permissionHandler) {
              const context = {
                toolCall,
                sessionId: this.sessionId,
                history: this.state.messages,
              };

              yield this.emit('agent:permission_request', { request: permissionRequest });

              const decision = await this.permissionHandler(permissionRequest, context);
              yield this.emit('agent:permission_decision', { decision });

              if (decision === 'deny') {
                toolCall.status = 'denied';
                toolCall.error = 'Permission denied';
                yield* this.handleToolResult(toolCall);
                continue;
              }
            }
          }
        }

        // Execute tool
        toolCall.status = 'approved';
        yield* this.executeTool(toolCall);
      }
    }
  }

  private buildRequest(): GenerateRequest {
    const toolDefinitions: ToolDefinition[] = Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: this.zodToParameters(tool.parameters),
    }));

    return {
      model: this.config.model,
      messages: this.state.messages,
      tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      config: this.config.generationConfig,
      systemInstruction: this.config.systemPrompt,
    };
  }

  private zodToParameters(schema: unknown): ToolDefinition['parameters'] {
    if (!(schema instanceof z.ZodObject)) {
      return [];
    }

    const unwrapSchema = (input: z.ZodTypeAny): z.ZodTypeAny => {
      let current = input;
      // Unwrap optional/default/nullable/effects
      while (true) {
        if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
          current = current.unwrap();
          continue;
        }
        if (current instanceof z.ZodDefault) {
          current = current._def.innerType;
          continue;
        }
        if (current instanceof z.ZodEffects) {
          current = current._def.schema;
          continue;
        }
        break;
      }
      return current;
    };

    const getType = (input: z.ZodTypeAny): ToolDefinition['parameters'][number]['type'] => {
      const unwrapped = unwrapSchema(input);

      if (unwrapped instanceof z.ZodString) return 'string';
      if (unwrapped instanceof z.ZodNumber) return 'number';
      if (unwrapped instanceof z.ZodBoolean) return 'boolean';
      if (unwrapped instanceof z.ZodArray) return 'array';
      if (unwrapped instanceof z.ZodObject) return 'object';
      if (unwrapped instanceof z.ZodRecord) return 'object';
      if (unwrapped instanceof z.ZodEnum || unwrapped instanceof z.ZodNativeEnum) return 'string';
      if (unwrapped instanceof z.ZodLiteral) {
        const literalValue = unwrapped._def.value;
        const literalType = typeof literalValue;
        if (literalType === 'number') return 'number';
        if (literalType === 'boolean') return 'boolean';
        return 'string';
      }
      if (unwrapped instanceof z.ZodUnion) {
        const unionTypes = unwrapped._def.options.map((option: z.ZodTypeAny) => getType(option));
        const first = unionTypes[0];
        if (unionTypes.every((t: string) => t === first)) {
          return first as ToolDefinition['parameters'][number]['type'];
        }
        return 'string';
      }

      return 'string';
    };

    const getEnumValues = (input: z.ZodTypeAny): Array<string | number | boolean> | undefined => {
      const unwrapped = unwrapSchema(input);

      if (unwrapped instanceof z.ZodEnum) {
        return unwrapped._def.values;
      }

      if (unwrapped instanceof z.ZodNativeEnum) {
        const values = Object.values(unwrapped._def.values);
        const filtered = values.filter(
          (value): value is string | number | boolean =>
            typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        );
        return Array.from(new Set(filtered));
      }

      if (unwrapped instanceof z.ZodLiteral) {
        const literalValue = unwrapped._def.value;
        if (['string', 'number', 'boolean'].includes(typeof literalValue)) {
          return [literalValue as string | number | boolean];
        }
      }

      if (unwrapped instanceof z.ZodUnion) {
        const values: Array<string | number | boolean> = [];
        for (const option of unwrapped._def.options) {
          const optionValues = getEnumValues(option);
          if (!optionValues) return undefined;
          values.push(...optionValues);
        }
        return Array.from(new Set(values));
      }

      return undefined;
    };

    const isOptional = (input: z.ZodTypeAny): boolean => {
      let current = input;
      while (current instanceof z.ZodEffects) {
        current = current._def.schema;
      }
      if (current instanceof z.ZodOptional || current instanceof z.ZodDefault) return true;
      if (current instanceof z.ZodNullable) {
        const inner = current.unwrap();
        return inner instanceof z.ZodOptional || inner instanceof z.ZodDefault;
      }
      return false;
    };

    const buildParameter = (name: string, field: z.ZodTypeAny): ToolDefinition['parameters'][number] => {
      const description = (field.description || field._def.description || '') as string;
      const type = getType(field);
      const required = !isOptional(field);
      const defaultValue = field instanceof z.ZodDefault ? field._def.defaultValue() : undefined;

      const param: ToolDefinition['parameters'][number] = {
        name,
        type,
        description,
        required,
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
      };

      const unwrapped = unwrapSchema(field);
      const enumValues = getEnumValues(unwrapped);
      if (enumValues && enumValues.length > 0) {
        param.enum = enumValues;
      }

      if (unwrapped instanceof z.ZodArray) {
        param.items = buildParameter('items', unwrapped._def.type);
      } else if (unwrapped instanceof z.ZodObject) {
        param.properties = buildObjectParameters(unwrapped);
      }

      return param;
    };

    const buildObjectParameters = (objSchema: z.ZodObject<z.ZodRawShape>): ToolDefinition['parameters'] => {
      const shape = objSchema.shape;
      return Object.entries(shape).map(([name, fieldSchema]) =>
        buildParameter(name, fieldSchema as z.ZodTypeAny)
      );
    };

    return buildObjectParameters(schema);
  }

  private extractToolCalls(message: Message): ToolCall[] {
    if (typeof message.content === 'string') {
      return [];
    }

    return message.content
      .filter((part): part is MessageContentPart & { type: 'tool_call' } => part.type === 'tool_call')
      .map((part) => ({
        id: part.toolCallId,
        name: part.toolName,
        args: part.args,
        status: 'pending' as const,
      }));
  }

  private async *executeTool(toolCall: ToolCall): AsyncGenerator<AgentEvent> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      toolCall.status = 'error';
      toolCall.error = `Unknown tool: ${toolCall.name}`;
      yield* this.handleToolResult(toolCall);
      return;
    }

    try {
      const context: ToolContext = {
        workingDirectory: this.workingDirectory,
        sessionId: this.sessionId,
        agentId: this.id,
      };

      const result = await tool.execute(toolCall.args, context);

      toolCall.status = 'executed';
      toolCall.result = result.data;

      if (!result.success) {
        toolCall.error = result.error;
      }
    } catch (error) {
      toolCall.status = 'error';
      toolCall.error = error instanceof Error ? error.message : String(error);
    }

    yield* this.handleToolResult(toolCall);
  }

  private async *handleToolResult(toolCall: ToolCall): AsyncGenerator<AgentEvent> {
    yield this.emit('agent:tool_result', { toolCall });

    // Add tool result message
    const resultMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: toolCall.result ?? { error: toolCall.error },
          isError: toolCall.status === 'error' || toolCall.status === 'denied',
        },
      ],
      createdAt: now(),
    };

    this.state.messages.push(resultMessage);
    yield this.emit('agent:message', { message: resultMessage });

    // Remove from pending
    const index = this.state.pendingToolCalls.indexOf(toolCall);
    if (index > -1) {
      this.state.pendingToolCalls.splice(index, 1);
    }
  }

  private emit<T>(type: AgentEventType, payload: T): AgentEvent<T> {
    const event: AgentEvent<T> = {
      type,
      timestamp: now(),
      agentId: this.id,
      payload,
    };

    // Notify handlers
    this.eventHandlers.get(type)?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in event handler for ${type}:`, error);
      }
    });

    return event;
  }
}

/**
 * Create a Cowork agent.
 */
export function createAgent(options: CoworkAgentOptions): CoworkAgent {
  return new CoworkAgent(options);
}
