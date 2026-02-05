/**
 * Connector Bridge
 *
 * Provides a singleton interface to the ConnectorManager for use across the sidecar.
 * Manages connections to MCP servers via connectors.
 */

import { ConnectorManager, getSecretService } from './connectors/index.js';
import type { ConnectorManifest, MCPTool as ConnectorMCPTool } from '@gemini-cowork/shared';

export interface ConnectorTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  connectorId: string;
}

class ConnectorBridge {
  private manager: ConnectorManager | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the connector bridge (lazy initialization)
   */
  private async ensureInitialized(): Promise<ConnectorManager> {
    if (this.manager) {
      return this.manager;
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        const secretService = await getSecretService();
        this.manager = new ConnectorManager(secretService);
      })();
    }

    await this.initPromise;
    return this.manager!;
  }

  /**
   * Connect to a connector's MCP server
   */
  async connect(manifest: ConnectorManifest): Promise<{
    tools: ConnectorMCPTool[];
    resources: unknown[];
    prompts: unknown[];
  }> {
    const manager = await this.ensureInitialized();
    const result = await manager.connect(manifest);
    if (!result.success) {
      throw new Error(result.error || 'Connection failed');
    }
    return {
      tools: result.capabilities?.tools || [],
      resources: result.capabilities?.resources || [],
      prompts: result.capabilities?.prompts || [],
    };
  }

  /**
   * Disconnect from a connector
   */
  async disconnect(connectorId: string): Promise<void> {
    const manager = await this.ensureInitialized();
    await manager.disconnect(connectorId);
  }

  /**
   * Reconnect to a connector
   */
  async reconnect(manifest: ConnectorManifest): Promise<{
    tools: ConnectorMCPTool[];
    resources: unknown[];
    prompts: unknown[];
  }> {
    const manager = await this.ensureInitialized();
    const result = await manager.reconnect(manifest);
    if (!result.success) {
      throw new Error(result.error || 'Reconnection failed');
    }
    return {
      tools: result.capabilities?.tools || [],
      resources: result.capabilities?.resources || [],
      prompts: result.capabilities?.prompts || [],
    };
  }

  /**
   * Get all tools from all connected connectors
   */
  getTools(): ConnectorTool[] {
    if (!this.manager) {
      return [];
    }
    const tools = this.manager.getAllTools();
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      connectorId: tool.connectorId,
    }));
  }

  /**
   * Call a tool on a connector
   */
  async callTool(
    connectorId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const manager = await this.ensureInitialized();
    return manager.callTool(connectorId, toolName, args);
  }

  /**
   * Check if a connector is connected
   */
  isConnected(connectorId: string): boolean {
    if (!this.manager) {
      return false;
    }
    return this.manager.isConnected(connectorId);
  }

  /**
   * Get connector status
   */
  getStatus(connectorId: string): string {
    if (!this.manager) {
      return 'available';
    }
    return this.manager.getStatus(connectorId);
  }

  /**
   * Get connector error
   */
  getError(connectorId: string): string | undefined {
    if (!this.manager) {
      return undefined;
    }
    return this.manager.getError(connectorId);
  }

  /**
   * Disconnect from all connectors
   */
  async disconnectAll(): Promise<void> {
    if (this.manager) {
      await this.manager.disconnectAll();
    }
  }

  /**
   * Get the underlying manager instance (for advanced use cases)
   */
  async getManager(): Promise<ConnectorManager> {
    return this.ensureInitialized();
  }
}

// Export singleton instance
export const connectorBridge = new ConnectorBridge();
