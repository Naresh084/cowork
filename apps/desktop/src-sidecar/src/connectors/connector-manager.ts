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
  MCPApp,
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
  apps: MCPApp[];  // MCP Apps (ui:// resources)
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

    // Initialize connection state
    const connection: ConnectorConnection = {
      connectorId,
      manifest,
      serverId: '',
      tools: [],
      resources: [],
      prompts: [],
      apps: [],
      status: 'connecting',
      retryCount: existing?.retryCount || 0,
    };
    this.connections.set(connectorId, connection);

    try {
      // Build environment with secrets (used for both transport types)
      const env = await this.buildEnvFromSecrets(manifest);

      let serverConfig: MCPServerConfig;

      // Handle different transport types
      if (manifest.transport.type === 'stdio') {
        // Stdio transport: local process-based MCP server
        // Interpolate ${VAR} in transport args
        const interpolatedArgs = manifest.transport.args.map((arg) =>
          arg.replace(/\$\{(\w+)\}/g, (_, key) => env[key] || '')
        );
        const commandName = manifest.transport.command.trim().split(/[\\/]/).pop() || '';
        let transportEnv = env;
        if (commandName === 'npx') {
          transportEnv = { ...env };
          delete transportEnv['npm_config_node_linker'];
          delete transportEnv['npm_config_shamefully_hoist'];
          delete transportEnv['NPM_CONFIG_NODE_LINKER'];
          delete transportEnv['NPM_CONFIG_SHAMEFULLY_HOIST'];
          transportEnv['NPM_CONFIG_LOGLEVEL'] = 'error';
          transportEnv['NPM_CONFIG_UPDATE_NOTIFIER'] = 'false';
        }

        serverConfig = {
          name: manifest.displayName,
          transport: 'stdio',
          command: manifest.transport.command,
          args: interpolatedArgs,
          env: transportEnv,
          enabled: true,
        };
      } else if (manifest.transport.type === 'http') {
        // HTTP transport: remote MCP server via HTTP/SSE
        // Interpolate ${VAR} in headers
        const interpolatedHeaders: Record<string, string> = {};
        if (manifest.transport.headers) {
          for (const [key, value] of Object.entries(manifest.transport.headers)) {
            interpolatedHeaders[key] = value.replace(/\$\{(\w+)\}/g, (_, k) => env[k] || '');
          }
        }

        serverConfig = {
          name: manifest.displayName,
          transport: 'http',
          url: manifest.transport.url,
          headers: Object.keys(interpolatedHeaders).length > 0 ? interpolatedHeaders : undefined,
          enabled: true,
        };
      } else {
        return {
          success: false,
          error: `Transport type "${(manifest.transport as { type: string }).type}" is not supported`,
        };
      }

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

      // Extract MCP Apps (ui:// resources)
      connection.apps = (serverState.resources || [])
        .filter((resource: MCPResource) => resource.uri.startsWith('ui://'))
        .map((resource: MCPResource) => ({
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

      if (
        this.shouldRetryRemoteOAuthConnection(manifest, errorMessage, connection.retryCount)
      ) {
        connection.retryCount += 1;
        await this.sleep(400);
        return this.connect(manifest);
      }

      connection.status = 'error';
      connection.error = errorMessage;
      connection.lastError = errorMessage;
      connection.retryCount += 1;

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
    } catch {
      // Ignore disconnect errors
    }

    // Update state
    connection.status = 'configured';
    connection.tools = [];
    connection.resources = [];
    connection.prompts = [];
    connection.apps = [];
    connection.connectedAt = undefined;
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
      return await this.mcpManager.callTool(connection.serverId, toolName, args);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.isConnectionClosedError(errorMessage)) {
        // Mark current connection as unhealthy so UI/backend can reflect reality.
        connection.status = 'error';
        connection.error = errorMessage;
        connection.lastError = errorMessage;
        connection.retryCount += 1;

        // For browser-auth remote connectors (mcp-remote), attempt a single
        // reconnect before surfacing the failure to the caller.
        if (this.isRemoteBrowserOAuthConnector(connection.manifest)) {
          const reconnectResult = await this.reconnect(connection.manifest);
          if (reconnectResult.success) {
            const refreshed = this.connections.get(connectorId);
            if (refreshed && refreshed.status === 'connected') {
              return this.mcpManager.callTool(refreshed.serverId, toolName, args);
            }
          }
        }
      }

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
   * Get all MCP Apps from all connected connectors
   */
  getAllApps(): MCPApp[] {
    const apps: MCPApp[] = [];
    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        apps.push(...connection.apps);
      }
    }
    return apps;
  }

  /**
   * Get HTML content for an MCP App
   */
  async getAppContent(connectorId: string, appUri: string): Promise<string> {
    const connection = this.connections.get(connectorId);
    if (!connection) {
      throw new Error(`Connector not connected: ${connectorId}`);
    }

    if (connection.status !== 'connected') {
      throw new Error(`Connector not in connected state: ${connectorId}`);
    }

    // Read resource from MCP server
    const result = await this.mcpManager.readResource(connection.serverId, appUri) as {
      contents?: Array<{ text?: string; blob?: string; uri?: string; mimeType?: string }>;
    };

    if (!result.contents || result.contents.length === 0) {
      throw new Error(`No content returned for app: ${appUri}`);
    }

    const content = result.contents[0];

    // Handle text content
    if ('text' in content && content.text) {
      return content.text;
    }

    // Handle blob content (base64)
    if ('blob' in content && content.blob) {
      return Buffer.from(content.blob, 'base64').toString('utf-8');
    }

    throw new Error(`Unsupported content type for app: ${appUri}`);
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
      this.disconnect(id).catch(() => {
        // Ignore disconnect errors during cleanup
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

  private isRemoteBrowserOAuthConnector(manifest: ConnectorManifest): boolean {
    if (manifest.auth.type !== 'none' || manifest.transport.type !== 'stdio') {
      return false;
    }

    const commandName = manifest.transport.command.trim().split(/[\\/]/).pop() || '';
    if (commandName !== 'npx') {
      return false;
    }

    return manifest.transport.args.some((arg) => arg === 'mcp-remote');
  }

  private isConnectionClosedError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('connection closed') ||
      normalized.includes('socket hang up') ||
      normalized.includes('econnreset') ||
      normalized.includes('stream closed') ||
      normalized.includes('broken pipe') ||
      normalized.includes('-32000')
    );
  }

  private shouldRetryRemoteOAuthConnection(
    manifest: ConnectorManifest,
    errorMessage: string,
    retryCount: number
  ): boolean {
    return (
      this.isRemoteBrowserOAuthConnector(manifest) &&
      this.isConnectionClosedError(errorMessage) &&
      retryCount < 1
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
