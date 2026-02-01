import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPEventType,
  MCPEvent,
  MCPEventHandler,
} from './types.js';
import { generateId, now } from '@gemini-cowork/shared';

// ============================================================================
// MCP Client Manager
// ============================================================================

export class MCPClientManager {
  private servers: Map<string, MCPServerState> = new Map();
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  private eventHandlers: Map<MCPEventType, Set<MCPEventHandler>> = new Map();

  /**
   * Add a server configuration.
   */
  addServer(config: MCPServerConfig): string {
    const id = generateId('mcp');
    const state: MCPServerState = {
      id,
      config,
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
    };
    this.servers.set(id, state);
    return id;
  }

  /**
   * Connect to a server.
   */
  async connect(serverId: string): Promise<void> {
    const state = this.servers.get(serverId);
    if (!state) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (!state.config.enabled) {
      return;
    }

    state.status = 'connecting';

    try {
      const transport = new StdioClientTransport({
        command: state.config.command,
        args: state.config.args,
        env: state.config.env,
      });

      const client = new Client(
        { name: 'gemini-cowork', version: '0.1.0' },
        { capabilities: {} }
      );

      await client.connect(transport);

      this.clients.set(serverId, client);
      this.transports.set(serverId, transport);

      state.status = 'connected';
      this.emit('server:connected', serverId, { name: state.config.name });

      // Discover tools, resources, and prompts
      await this.discoverCapabilities(serverId);
    } catch (error) {
      state.status = 'error';
      state.error = error instanceof Error ? error.message : String(error);
      this.emit('server:error', serverId, { error: state.error });
      throw error;
    }
  }

  /**
   * Disconnect from a server.
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const transport = this.transports.get(serverId);
    const state = this.servers.get(serverId);

    if (client) {
      await client.close();
      this.clients.delete(serverId);
    }

    if (transport) {
      await transport.close();
      this.transports.delete(serverId);
    }

    if (state) {
      state.status = 'disconnected';
      state.tools = [];
      state.resources = [];
      state.prompts = [];
    }

    this.emit('server:disconnected', serverId, {});
  }

  /**
   * Connect to all enabled servers.
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map((id) =>
      this.connect(id).catch((error) => {
        console.error(`Failed to connect to MCP server ${id}:`, error);
      })
    );
    await Promise.all(promises);
  }

  /**
   * Disconnect from all servers.
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map((id) =>
      this.disconnect(id).catch((error) => {
        console.error(`Failed to disconnect from MCP server ${id}:`, error);
      })
    );
    await Promise.all(promises);
  }

  /**
   * Get all tools from all connected servers.
   */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const state of this.servers.values()) {
      tools.push(...state.tools);
    }
    return tools;
  }

  /**
   * Get all resources from all connected servers.
   */
  getAllResources(): MCPResource[] {
    const resources: MCPResource[] = [];
    for (const state of this.servers.values()) {
      resources.push(...state.resources);
    }
    return resources;
  }

  /**
   * Get all prompts from all connected servers.
   */
  getAllPrompts(): MCPPrompt[] {
    const prompts: MCPPrompt[] = [];
    for (const state of this.servers.values()) {
      prompts.push(...state.prompts);
    }
    return prompts;
  }

  /**
   * Call a tool on a server.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server not connected: ${serverId}`);
    }

    const result = await client.callTool({ name: toolName, arguments: args });
    return result;
  }

  /**
   * Read a resource from a server.
   */
  async readResource(serverId: string, uri: string): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server not connected: ${serverId}`);
    }

    const result = await client.readResource({ uri });
    return result;
  }

  /**
   * Get a prompt from a server.
   */
  async getPrompt(
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server not connected: ${serverId}`);
    }

    const result = await client.getPrompt({ name: promptName, arguments: args });
    return result;
  }

  /**
   * Get server state.
   */
  getServerState(serverId: string): MCPServerState | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Get all server states.
   */
  getAllServerStates(): MCPServerState[] {
    return Array.from(this.servers.values());
  }

  /**
   * Subscribe to events.
   */
  on<T>(type: MCPEventType, handler: MCPEventHandler<T>): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler as MCPEventHandler);
    return () => this.eventHandlers.get(type)?.delete(handler as MCPEventHandler);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async discoverCapabilities(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const state = this.servers.get(serverId);

    if (!client || !state) return;

    try {
      // Discover tools
      const toolsResult = await client.listTools();
      state.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as Record<string, unknown>,
        serverId,
      }));

      for (const tool of state.tools) {
        this.emit('tool:discovered', serverId, tool);
      }

      // Discover resources
      const resourcesResult = await client.listResources();
      state.resources = resourcesResult.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        serverId,
      }));

      for (const resource of state.resources) {
        this.emit('resource:discovered', serverId, resource);
      }

      // Discover prompts
      const promptsResult = await client.listPrompts();
      state.prompts = promptsResult.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
        serverId,
      }));

      for (const prompt of state.prompts) {
        this.emit('prompt:discovered', serverId, prompt);
      }
    } catch (error) {
      console.error(`Failed to discover capabilities for ${serverId}:`, error);
    }
  }

  private emit<T>(type: MCPEventType, serverId: string, payload: T): void {
    const event: MCPEvent<T> = {
      type,
      timestamp: now(),
      serverId,
      payload,
    };

    this.eventHandlers.get(type)?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in MCP event handler for ${type}:`, error);
      }
    });
  }
}

/**
 * Create an MCP client manager.
 */
export function createMCPManager(): MCPClientManager {
  return new MCPClientManager();
}
