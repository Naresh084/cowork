import { MCPClientManager, type MCPServerConfig, type MCPTool } from '@gemini-cowork/mcp';

export interface MCPServerConfigWithId extends MCPServerConfig {
  id: string;
}

export class MCPBridge {
  private manager = new MCPClientManager();
  private idMap = new Map<string, string>();
  private reverseIdMap = new Map<string, string>();

  async setServers(servers: MCPServerConfigWithId[]): Promise<void> {
    await this.manager.disconnectAll();
    this.manager = new MCPClientManager();
    this.idMap.clear();
    this.reverseIdMap.clear();

    for (const server of servers) {
      const internalId = this.manager.addServer({
        name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
        enabled: server.enabled,
      });
      this.idMap.set(server.id, internalId);
      this.reverseIdMap.set(internalId, server.id);
    }

    await this.manager.connectAll();
  }

  getTools(): MCPTool[] {
    const tools = this.manager.getAllTools();
    return tools.map((tool) => ({
      ...tool,
      serverId: this.reverseIdMap.get(tool.serverId) || tool.serverId,
    }));
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const internalId = this.idMap.get(serverId) || serverId;
    return this.manager.callTool(internalId, toolName, args);
  }
}

export const mcpBridge = new MCPBridge();
