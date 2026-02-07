import { createInterface } from 'readline';
import { request as httpRequest } from 'http';
import { URL } from 'url';

interface BridgeResponse {
  decision: 'allow_once' | 'allow_session' | 'deny' | 'cancel';
  message?: string;
}

interface ToolCallArguments {
  tool_name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
}

interface LaunchOptions {
  toolName: string;
  bridgeUrl: string;
  bridgeToken: string;
}

function parseArgs(argv: string[]): LaunchOptions {
  const getArg = (name: string): string | null => {
    const index = argv.indexOf(name);
    if (index < 0) return null;
    const value = argv[index + 1];
    return typeof value === 'string' ? value : null;
  };

  const toolName = getArg('--tool-name') || process.env.COWORK_CLAUDE_PERMISSION_TOOL_NAME;
  const bridgeUrl = getArg('--bridge-url') || process.env.COWORK_CLAUDE_PERMISSION_BRIDGE_URL;
  const bridgeToken = getArg('--bridge-token') || process.env.COWORK_CLAUDE_PERMISSION_BRIDGE_TOKEN;

  if (!toolName || !bridgeUrl || !bridgeToken) {
    throw new Error('Missing required bridge arguments for Claude permission MCP server.');
  }

  return {
    toolName,
    bridgeUrl,
    bridgeToken,
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function postBridgeRequest(
  bridgeUrl: string,
  bridgeToken: string,
  payload: Record<string, unknown>,
): Promise<BridgeResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(bridgeUrl);
    const body = JSON.stringify(payload);

    const req = httpRequest(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        protocol: url.protocol,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body).toString(),
          'x-cowork-bridge-token': bridgeToken,
        },
      },
      (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
          responseBody += String(chunk);
        });

        res.on('end', () => {
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`Bridge request failed with status ${res.statusCode || 500}`));
            return;
          }

          try {
            const parsed = JSON.parse(responseBody) as BridgeResponse;
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(10 * 60 * 1000, () => {
      req.destroy(new Error('Bridge request timed out waiting for user response.'));
    });

    req.write(body);
    req.end();
  });
}

async function handleToolCall(
  id: number,
  options: LaunchOptions,
  params: Record<string, unknown> | undefined,
): Promise<void> {
  const name = typeof params?.name === 'string' ? params.name : '';
  if (name !== options.toolName) {
    writeJson({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: `Unknown tool: ${name}`,
      },
    });
    return;
  }

  const args = (params?.arguments as ToolCallArguments | undefined) || {};

  try {
    const bridgeResult = await postBridgeRequest(options.bridgeUrl, options.bridgeToken, {
      toolName: args.tool_name || 'unknown',
      toolUseId: args.tool_use_id,
      input: args.input || {},
    });

    const resultPayload =
      bridgeResult.decision === 'allow_once' || bridgeResult.decision === 'allow_session'
        ? {
            behavior: 'allow',
            updatedInput: args.input || {},
          }
        : {
            behavior: 'deny',
            message: bridgeResult.message || 'Permission denied by user.',
          };

    writeJson({
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(resultPayload),
          },
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson({
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              behavior: 'deny',
              message: `Permission bridge error: ${message}`,
            }),
          },
        ],
      },
    });
  }
}

export function runClaudePermissionMcpServer(argv = process.argv.slice(2)): void {
  const options = parseArgs(argv);

  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    const id = typeof parsed.id === 'number' ? parsed.id : null;
    const method = typeof parsed.method === 'string' ? parsed.method : null;
    const params = (parsed.params as Record<string, unknown> | undefined) || undefined;

    if (!method) {
      if (id !== null) {
        writeJson({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32600,
            message: 'Invalid request',
          },
        });
      }
      return;
    }

    if (method === 'initialize' && id !== null) {
      writeJson({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'cowork-claude-permission-bridge',
            version: '0.1.0',
          },
        },
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'tools/list' && id !== null) {
      writeJson({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: options.toolName,
              description: 'Bridges Claude permission prompts to Cowork human approval.',
              inputSchema: {
                type: 'object',
                additionalProperties: true,
              },
            },
          ],
        },
      });
      return;
    }

    if (method === 'tools/call' && id !== null) {
      await handleToolCall(id, options, params);
      return;
    }

    if (id !== null) {
      writeJson({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      });
    }
  });
}
