import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { MCPServerConfig } from '@gemini-cowork/mcp';

export interface GeminiExtensionsResult {
  servers: Array<MCPServerConfig & { id: string }>;
}

async function findExtensionManifests(root: string): Promise<string[]> {
  const manifests: string[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name === 'gemini-extension.json') {
        manifests.push(fullPath);
      }
    }
  }

  await walk(root);
  return manifests;
}

export async function loadGeminiExtensions(): Promise<GeminiExtensionsResult> {
  const extensionsRoot = join(homedir(), '.gemini', 'extensions');
  const manifests = await findExtensionManifests(extensionsRoot);
  const servers: Array<MCPServerConfig & { id: string }> = [];

  for (const manifestPath of manifests) {
    try {
      const content = await readFile(manifestPath, 'utf-8');
      const data = JSON.parse(content) as {
        mcpServers?: Array<{
          name: string;
          command: string;
          args?: string[];
          env?: Record<string, string>;
          enabled?: boolean;
          prompt?: string;
          contextFileName?: string;
        }>;
        prompt?: string;
        contextFileName?: string;
        context_file_name?: string;
      };

      const extensionPrompt = data.prompt;
      const extensionContext =
        data.contextFileName || data.context_file_name;

      for (const server of data.mcpServers ?? []) {
        servers.push({
          id: `ext-${server.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: server.name,
          command: server.command,
          args: server.args,
          env: server.env,
          enabled: server.enabled ?? true,
          prompt: server.prompt || extensionPrompt,
          contextFileName: server.contextFileName || extensionContext,
        });
      }
    } catch {
      // Skip invalid extension manifests
    }
  }

  return { servers };
}
