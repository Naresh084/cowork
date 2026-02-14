// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateId } from '@cowork/shared';
import type {
  ExternalCliPendingInteraction,
  ExternalCliResponsePayload,
  ExternalCliRunOrigin,
} from '../types.js';

interface PendingBridgeInteraction {
  resolve: (result: { decision: 'allow_once' | 'allow_session' | 'deny' | 'cancel'; message?: string }) => void;
  reject: (error: Error) => void;
}

interface BridgeIncomingPayload {
  toolName?: string;
  toolUseId?: string;
  input?: Record<string, unknown>;
}

interface ClaudePermissionBridgeOptions {
  runId: string;
  sessionId: string;
  origin: ExternalCliRunOrigin;
  onInteraction: (interaction: ExternalCliPendingInteraction) => void;
  onInteractionResolved: (interactionId: string) => void;
}

export class ClaudePermissionBridge {
  private readonly runId: string;
  private readonly sessionId: string;
  private readonly origin: ExternalCliRunOrigin;
  private readonly onInteraction: (interaction: ExternalCliPendingInteraction) => void;
  private readonly onInteractionResolved: (interactionId: string) => void;
  private readonly serverName: string;
  private readonly toolName = 'permission_prompt';
  private readonly bridgeToken: string;

  private tempDir: string | null = null;
  private mcpConfigPath: string | null = null;
  private server = createServer();
  private serverPort: number | null = null;

  private pendingByInteractionId = new Map<string, PendingBridgeInteraction>();

  constructor(options: ClaudePermissionBridgeOptions) {
    this.runId = options.runId;
    this.sessionId = options.sessionId;
    this.origin = options.origin;
    this.onInteraction = options.onInteraction;
    this.onInteractionResolved = options.onInteractionResolved;
    this.serverName = `cowork_perm_${this.runId.slice(-8)}`;
    this.bridgeToken = generateId('bridge-token');
  }

  async start(): Promise<void> {
    this.server.on('request', (req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        resolve();
      });
    });

    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind Claude permission bridge server.');
    }
    this.serverPort = address.port;

    this.tempDir = await mkdtemp(join(tmpdir(), 'cowork-claude-mcp-'));
    this.mcpConfigPath = join(this.tempDir, 'mcp-config.json');

    const scriptArgs = this.getPermissionServerArgs();

    const mcpConfig = {
      mcpServers: {
        [this.serverName]: {
          command: process.execPath,
          args: scriptArgs,
        },
      },
    };

    await writeFile(this.mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
  }

  async stop(): Promise<void> {
    for (const [interactionId, pending] of this.pendingByInteractionId.entries()) {
      pending.reject(new Error('Permission bridge closed before interaction completed.'));
      this.onInteractionResolved(interactionId);
    }
    this.pendingByInteractionId.clear();

    if (this.server.listening) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }

    if (this.tempDir) {
      await rm(this.tempDir, { recursive: true, force: true });
      this.tempDir = null;
      this.mcpConfigPath = null;
    }
  }

  getMcpConfigPath(): string {
    if (!this.mcpConfigPath) {
      throw new Error('Bridge has not been started.');
    }
    return this.mcpConfigPath;
  }

  getPermissionPromptToolName(): string {
    return `mcp__${this.serverName}__${this.toolName}`;
  }

  resolveInteraction(interactionId: string, response: ExternalCliResponsePayload): boolean {
    const pending = this.pendingByInteractionId.get(interactionId);
    if (!pending) {
      return false;
    }

    const decision =
      response.decision === 'allow_session'
        ? 'allow_session'
        : response.decision === 'allow_once'
          ? 'allow_once'
          : response.decision === 'cancel'
            ? 'cancel'
            : 'deny';

    pending.resolve({
      decision,
      message: response.text,
    });
    this.pendingByInteractionId.delete(interactionId);
    this.onInteractionResolved(interactionId);
    return true;
  }

  private getPermissionServerArgs(): string[] {
    const bridgeUrl = `http://127.0.0.1:${this.serverPort || 0}/permission`;
    const runtimeArgs = [
      '--claude-permission-mcp-server',
      '--tool-name',
      this.toolName,
      '--bridge-url',
      bridgeUrl,
      '--bridge-token',
      this.bridgeToken,
    ];

    const isPkg = Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
    if (isPkg) {
      return runtimeArgs;
    }

    return [process.argv[1], ...runtimeArgs];
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== '/permission') {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const token = req.headers['x-cowork-bridge-token'];
    if (token !== this.bridgeToken) {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });

    await new Promise<void>((resolve) => {
      req.on('end', () => resolve());
    });

    let parsed: BridgeIncomingPayload;
    try {
      parsed = JSON.parse(body) as BridgeIncomingPayload;
    } catch {
      res.statusCode = 400;
      res.end('Invalid JSON');
      return;
    }

    const interactionId = generateId('ext-int');
    const toolName = parsed.toolName || 'unknown';
    const prompt = `Claude requests permission for tool \`${toolName}\`. Reply with allow, allow session, deny, or cancel.`;

    const interaction: ExternalCliPendingInteraction = {
      interactionId,
      runId: this.runId,
      sessionId: this.sessionId,
      provider: 'claude',
      type: 'permission',
      prompt,
      options: ['allow', 'allow session', 'deny', 'cancel'],
      requestedAt: Date.now(),
      origin: this.origin,
      metadata: {
        toolName,
        toolUseId: parsed.toolUseId,
        input: parsed.input || {},
      },
    };

    const bridgeResult = await new Promise<{ decision: 'allow_once' | 'allow_session' | 'deny' | 'cancel'; message?: string }>((resolve, reject) => {
      this.pendingByInteractionId.set(interactionId, {
        resolve,
        reject,
      });
      this.onInteraction(interaction);
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      return {
        decision: 'deny' as const,
        message,
      };
    });

    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        decision: bridgeResult.decision,
        message: bridgeResult.message,
      }),
    );
  }
}
