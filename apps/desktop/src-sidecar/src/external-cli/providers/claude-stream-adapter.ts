import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import type {
  ExternalCliAdapter,
  ExternalCliAdapterCallbacks,
  ExternalCliAdapterStartInput,
  ExternalCliResponsePayload,
  ExternalCliRunOrigin,
} from '../types.js';
import { ClaudePermissionBridge } from './claude-permission-bridge.js';

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((item): item is Record<string, unknown> => isObject(item))
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => String(item.text))
    .join('\n')
    .trim();
}

export class ClaudeStreamAdapter implements ExternalCliAdapter {
  private readonly origin: ExternalCliRunOrigin;

  private process: ChildProcess | null = null;
  private callbacks: ExternalCliAdapterCallbacks | null = null;
  private bridge: ClaudePermissionBridge | null = null;
  private stopped = false;

  constructor(origin: ExternalCliRunOrigin) {
    this.origin = origin;
  }

  async start(input: ExternalCliAdapterStartInput, callbacks: ExternalCliAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.stopped = false;

    const args = [
      '-p',
      input.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      input.bypassPermission ? 'bypassPermissions' : 'default',
    ];

    if (!input.bypassPermission) {
      this.bridge = new ClaudePermissionBridge({
        runId: input.runId,
        sessionId: input.sessionId,
        origin: this.origin,
        onInteraction: (interaction) => {
          this.callbacks?.onWaitingInteraction(interaction);
        },
        onInteractionResolved: (interactionId) => {
          this.callbacks?.onInteractionResolved(interactionId);
        },
      });

      await this.bridge.start();
      args.push('--mcp-config', this.bridge.getMcpConfigPath());
      args.push('--strict-mcp-config');
      args.push('--permission-prompt-tool', this.bridge.getPermissionPromptToolName());
    }

    this.callbacks.onProgress({
      timestamp: Date.now(),
      kind: 'status',
      message: 'Starting Claude CLI run...',
    });

    this.process = spawn('claude', args, {
      cwd: input.workingDirectory,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        process.stderr.write(`[external-cli][claude] ${text}\n`);
      }
    });

    this.process.on('error', (error) => {
      this.callbacks?.onFailed('CLI_PROTOCOL_ERROR', `Failed to start claude: ${stringifyError(error)}`);
    });

    this.process.on('close', (code) => {
      if (this.stopped) {
        return;
      }

      if (code === 0) {
        return;
      }

      this.callbacks?.onFailed('CLI_PROTOCOL_ERROR', `Claude process exited unexpectedly with code ${code ?? 1}.`);
    });

    if (this.process.stdout) {
      const rl = createInterface({
        input: this.process.stdout,
        terminal: false,
      });

      rl.on('line', (line) => {
        this.handleStreamLine(line);
      });
    }
  }

  async respond(interactionId: string, response: ExternalCliResponsePayload): Promise<void> {
    if (!this.bridge) {
      return;
    }

    this.bridge.resolveInteraction(interactionId, response);
  }

  async cancel(reason?: string): Promise<void> {
    this.stopped = true;

    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 1000).unref();
    }

    this.callbacks?.onCancelled(reason || 'Claude run cancelled.');
  }

  async dispose(): Promise<void> {
    this.stopped = true;

    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 1000).unref();
    }

    if (this.bridge) {
      await this.bridge.stop();
      this.bridge = null;
    }

    this.callbacks = null;
  }

  private handleStreamLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (!isObject(parsed)) {
      return;
    }

    const type = typeof parsed.type === 'string' ? parsed.type : null;
    if (!type || !this.callbacks) {
      return;
    }

    if (type === 'system') {
      const subtype = typeof parsed.subtype === 'string' ? parsed.subtype : '';
      if (subtype === 'init') {
        this.callbacks.onProgress({
          timestamp: Date.now(),
          kind: 'status',
          message: 'Claude run initialized.',
        });
      }
      return;
    }

    if (type === 'assistant') {
      const message = isObject(parsed.message) ? parsed.message : null;
      const content = message?.content;
      const text = extractAssistantText(content);
      if (text) {
        this.callbacks.onProgress({
          timestamp: Date.now(),
          kind: 'assistant',
          message: text,
        });
      }

      if (Array.isArray(content)) {
        const toolUse = content.find(
          (item) => isObject(item) && item.type === 'tool_use' && typeof item.name === 'string',
        ) as Record<string, unknown> | undefined;
        if (toolUse && typeof toolUse.name === 'string') {
          this.callbacks.onProgress({
            timestamp: Date.now(),
            kind: 'status',
            message: `Claude is using tool ${toolUse.name}.`,
          });
        }
      }
      return;
    }

    if (type === 'result') {
      const isError = parsed.is_error === true;
      const resultText = typeof parsed.result === 'string' ? parsed.result.trim() : '';

      if (isError) {
        const lower = `${resultText} ${trimmed}`.toLowerCase();
        if (lower.includes('authentication_failed') || lower.includes('not logged in')) {
          this.callbacks.onFailed(
            'CLI_AUTH_REQUIRED',
            'Claude is installed but not authenticated. Run `claude /login` and retry.',
          );
          return;
        }

        this.callbacks.onFailed(
          'CLI_PROTOCOL_ERROR',
          resultText || 'Claude run failed.',
        );
        return;
      }

      this.callbacks.onCompleted(resultText || 'Claude run completed successfully.');
    }
  }
}
