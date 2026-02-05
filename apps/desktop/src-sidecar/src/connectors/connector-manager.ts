/**
 * Connector Manager
 *
 * Manages runtime connections to MCP servers for connectors.
 * Wraps MCPClientManager with connector-specific logic including
 * secret injection, status tracking, and tool aggregation.
 */

import { MCPClientManager, type MCPServerConfig, type MCPTool, type MCPResource, type MCPPrompt } from '@gemini-cowork/mcp';
import type {
  ConnectorManifest,
  ConnectorStatus,
  MCPTool as ConnectorMCPTool,
  MCPResource as ConnectorMCPResource,
  MCPPrompt as ConnectorMCPPrompt,
} from '@gemini-cowork/shared';
import type { SecretService } from './secret-service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Internal connection state
 */
interface ConnectorConnection {
  connectorId: string;
  manifest: ConnectorManifest;
  serverId: string;  // Internal MCPClientManager server ID
  tools: ConnectorMCPTool[];
  resources: ConnectorMCPResource[];
  prompts: ConnectorMCPPrompt[];
  status: ConnectorStatus;
  connectedAt?: number;
  error?: string;
  lastError?: string;
  retryCount: number;
}

/**
 * Capabilities returned after connecting
 */
export interface ConnectorCapabilities {
  tools: ConnectorMCPTool[];
  resources: ConnectorMCPResource[];
  prompts: ConnectorMCPPrompt[];
}

/**
 * Connection result
 */
export interface ConnectorConnectionResult {
  success: boolean;
  capabilities?: ConnectorCapabilities;
  error?: string;
}

// ============================================================================
// Connector Manager
// ============================================================================

export class ConnectorManager {
  private connections: Map<string, ConnectorConnection> = new Map();
  private mcpManager: MCPClientManager;
  private secretService: SecretService;

  constructor(secretService: SecretService) {
    this.secretService = secretService;
    this.mcpManager = new MCPClientManager();
  }

  /**
   * Connect to a connector's MCP server
   */
  async connect(manifest: ConnectorManifest): Promise<ConnectorConnectionResult> {
    const connectorId = manifest.id;

    // Check if already connected
    const existing = this.connections.get(connectorId);
    if (existing && existing.status === 'connected') {
      return {
        success: true,
        capabilities: {
          tools: existing.tools,
          resources: existing.resources,
          prompts: existing.prompts,
        },
      };
    }

    // Only stdio transport is supported currently
    if (manifest.transport.type !== 'stdio') {
      return {
        success: false,
        error: `Transport type "${manifest.transport.type}" is not yet supported`,
      };
    }

    // Initialize connection state
    const connection: ConnectorConnection = {
      connectorId,
      manifest,
      serverId: '',
      tools: [],
      resources: [],
      prompts: [],
      status: 'connecting',
      retryCount: existing?.retryCount || 0,
    };
    this.connections.set(connectorId, connection);

    try {
      // Build environment with secrets
      const env = await this.buildEnvFromSecrets(manifest);

      // Interpolate ${VAR} in transport args
      const interpolatedArgs = manifest.transport.args.map((arg) =>
        arg.replace(/\$\{(\w+)\}/g, (_, key) => env[key] || '')
      );

      // Create MCP server config
      const serverConfig: MCPServerConfig = {
        name: manifest.displayName,
        command: manifest.transport.command,
        args: interpolatedArgs,
        env,
        enabled: true,
      };

      // Add server to MCP manager
      const serverId = this.mcpManager.addServer(serverConfig);
      connection.serverId = serverId;

      // Connect
      await this.mcpManager.connect(serverId);

      // Get server state with discovered capabilities
      const serverState = this.mcpManager.getServerState(serverId);
      if (!serverState) {
        throw new Error('Failed to get server state after connection');
      }

      // Map tools with connector ID
      connection.tools = (serverState.tools || []).map((tool: MCPTool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        connectorId,
      }));

      // Map resources with connector ID
      connection.resources = (serverState.resources || []).map((resource: MCPResource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        connectorId,
      }));

      // Map prompts with connector ID
      connection.prompts = (serverState.prompts || []).map((prompt: MCPPrompt) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
        connectorId,
      }));

      // Update connection state
      connection.status = 'connected';
      connection.connectedAt = Date.now();
      connection.error = undefined;
      connection.retryCount = 0;

      console.error(`[ConnectorManager] Connected to ${manifest.displayName} (${connectorId})`);
      console.error(`[ConnectorManager] Discovered ${connection.tools.length} tools`);

      return {
        success: true,
        capabilities: {
          tools: connection.tools,
          resources: connection.resources,
          prompts: connection.prompts,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      connection.status = 'error';
      connection.error = errorMessage;
      connection.lastError = errorMessage;
      connection.retryCount += 1;

      console.error(`[ConnectorManager] Failed to connect to ${manifest.displayName}:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Disconnect from a connector's MCP server
   */
  async disconnect(connectorId: string): Promise<void> {
    const connection = this.connections.get(connectorId);
    if (!connection) {
      return;
    }

    try {
      if (connection.serverId) {
        await this.mcpManager.disconnect(connection.serverId);
      }
    } catch (error) {
      console.error(`[ConnectorManager] Error disconnecting ${connectorId}:`, error);
    }

    // Update state
    connection.status = 'configured';
    connection.tools = [];
    connection.resources = [];
    connection.prompts = [];
    connection.connectedAt = undefined;

    console.error(`[ConnectorManager] Disconnected from ${connection.manifest.displayName}`);
  }

  /**
   * Reconnect to a connector
   */
  async reconnect(manifest: ConnectorManifest): Promise<ConnectorConnectionResult> {
    await this.disconnect(manifest.id);
    return this.connect(manifest);
  }

  /**
   * Call a tool on a connector
   */
  async callTool(
    connectorId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const connection = this.connections.get(connectorId);
    if (!connection) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    if (connection.status !== 'connected') {
      throw new Error(`Connector not connected: ${connectorId} (status: ${connection.status})`);
    }

    try {
      const result = await this.mcpManager.callTool(connection.serverId, toolName, args);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ConnectorManager] Tool call failed for ${connectorId}/${toolName}:`, errorMessage);
      throw error;
    }
  }

  /**
   * Check if a connector is connected
   */
  isConnected(connectorId: string): boolean {
    const connection = this.connections.get(connectorId);
    return connection?.status === 'connected';
  }

  /**
   * Get connection status
   */
  getStatus(connectorId: string): ConnectorStatus {
    const connection = this.connections.get(connectorId);
    return connection?.status || 'available';
  }

  /**
   * Get connection error
   */
  getError(connectorId: string): string | undefined {
    const connection = this.connections.get(connectorId);
    return connection?.error;
  }

  /**
   * Get all tools from all connected connectors
   */
  getAllTools(): ConnectorMCPTool[] {
    const tools: ConnectorMCPTool[] = [];
    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        tools.push(...connection.tools);
      }
    }
    return tools;
  }

  /**
   * Get all resources from all connected connectors
   */
  getAllResources(): ConnectorMCPResource[] {
    const resources: ConnectorMCPResource[] = [];
    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        resources.push(...connection.resources);
      }
    }
    return resources;
  }

  /**
   * Get all prompts from all connected connectors
   */
  getAllPrompts(): ConnectorMCPPrompt[] {
    const prompts: ConnectorMCPPrompt[] = [];
    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        prompts.push(...connection.prompts);
      }
    }
    return prompts;
  }

  /**
   * Get all connection states
   */
  getAllConnections(): Map<string, { status: ConnectorStatus; error?: string }> {
    const result = new Map<string, { status: ConnectorStatus; error?: string }>();
    for (const [id, connection] of this.connections) {
      result.set(id, {
        status: connection.status,
        error: connection.error,
      });
    }
    return result;
  }

  /**
   * Disconnect from all connectors
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map((id) =>
      this.disconnect(id).catch((error) => {
        console.error(`[ConnectorManager] Error disconnecting ${id}:`, error);
      })
    );
    await Promise.all(promises);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Build environment variables from connector secrets
   */
  private async buildEnvFromSecrets(manifest: ConnectorManifest): Promise<Record<string, string>> {
    // Start with current process environment
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    // Handle env auth type
    if (manifest.auth.type === 'env') {
      for (const secret of manifest.auth.secrets) {
        const value = await this.secretService.getSecret(manifest.id, secret.key);
        if (value) {
          // Use envVar override if specified, otherwise use key
          const envKey = secret.envVar || secret.key;
          env[envKey] = value;
        } else if (secret.required) {
          throw new Error(`Missing required secret: ${secret.key}`);
        }
      }
    }

    // Handle oauth auth type
    if (manifest.auth.type === 'oauth') {
      const accessToken = await this.secretService.getSecret(manifest.id, 'ACCESS_TOKEN');
      if (accessToken) {
        // Set provider-specific environment variables
        switch (manifest.auth.provider) {
          case 'google':
            env['GOOGLE_ACCESS_TOKEN'] = accessToken;
            break;
          case 'microsoft':
            // Microsoft uses device code flow, tokens are typically cached by the MCP server
            env['MS_ACCESS_TOKEN'] = accessToken;
            break;
          case 'github':
            env['GITHUB_TOKEN'] = accessToken;
            break;
          case 'slack':
            env['SLACK_TOKEN'] = accessToken;
            break;
          default:
            env['ACCESS_TOKEN'] = accessToken;
        }
      }

      // Also check for any additional secrets defined
      if (manifest.auth.secrets) {
        for (const secret of manifest.auth.secrets) {
          const value = await this.secretService.getSecret(manifest.id, secret.key);
          if (value) {
            const envKey = secret.envVar || secret.key;
            env[envKey] = value;
          }
        }
      }
    }

    return env;
  }
}
