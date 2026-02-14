// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import type {
  ExternalCliAdapter,
  ExternalCliAdapterCallbacks,
  ExternalCliAdapterStartInput,
  ExternalCliResponsePayload,
} from '../types.js';

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildCommandString(command: string, args: string[]): string {
  const pieces = [command, ...args.map((arg) => (/[^\w@%+=:,./-]/.test(arg) ? shellEscape(arg) : arg))];
  return pieces.join(' ');
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
  private process: ChildProcess | null = null;
  private callbacks: ExternalCliAdapterCallbacks | null = null;
  private stopped = false;
  private stderrLines: string[] = [];
  private stdoutLines: string[] = [];

  async start(input: ExternalCliAdapterStartInput, callbacks: ExternalCliAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.stopped = false;

    const args = [
      '-p',
      input.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
    ];

    if (input.bypassPermission) {
      args.push('--allow-dangerously-skip-permissions');
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
    callbacks.onLaunchCommand?.(
      buildCommandString('claude', args),
    );

    this.process.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        this.captureStream('stderr', text);
        this.callbacks?.onDiagnosticLog?.({ stream: 'stderr', text });
        process.stderr.write(`[external-cli][claude] ${text}\n`);
      }
    });

    this.process.on('error', (error) => {
      this.callbacks?.onDiagnosticLog?.({
        stream: 'note',
        text: `Process spawn error: ${stringifyError(error)}`,
      });
      this.callbacks?.onFailed('CLI_PROTOCOL_ERROR', this.buildFailureMessage(`Failed to start claude: ${stringifyError(error)}`));
    });

    this.process.on('close', (code, signal) => {
      this.callbacks?.onProcessExit?.({
        code: typeof code === 'number' ? code : null,
        signal: signal || null,
      });
      this.callbacks?.onDiagnosticLog?.({
        stream: 'note',
        text: `Process closed (code=${code ?? 'null'} signal=${signal || 'null'})`,
      });
      if (this.stopped) {
        return;
      }

      if (code === 0) {
        return;
      }

      this.callbacks?.onFailed(
        'CLI_PROTOCOL_ERROR',
        this.buildFailureMessage(`Claude process exited unexpectedly with code ${code ?? 1}.`),
      );
    });

    if (this.process.stdout) {
      const rl = createInterface({
        input: this.process.stdout,
        terminal: false,
      });

      rl.on('line', (line) => {
        const raw = line.trim();
        if (raw) {
          this.captureStream('stdout', raw);
          this.callbacks?.onDiagnosticLog?.({ stream: 'stdout', text: raw });
        }
        this.handleStreamLine(line);
      });
    }
  }

  async respond(interactionId: string, response: ExternalCliResponsePayload): Promise<void> {
    void interactionId;
    void response;
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
      this.callbacks?.onDiagnosticLog?.({
        stream: 'note',
        text: 'Received non-JSON stdout line from Claude CLI.',
      });
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
            this.buildFailureMessage('Claude is installed but not authenticated. Run `claude /login` and retry.'),
          );
          return;
        }

        this.callbacks.onFailed(
          'CLI_PROTOCOL_ERROR',
          this.buildFailureMessage(resultText || 'Claude run failed.'),
        );
        return;
      }

      this.callbacks.onCompleted(resultText || 'Claude run completed successfully.');
    }
  }

  private captureStream(stream: 'stdout' | 'stderr', text: string): void {
    const target = stream === 'stderr' ? this.stderrLines : this.stdoutLines;
    target.push(text);
    if (target.length > 120) {
      target.shift();
    }
  }

  private buildFailureMessage(base: string): string {
    const stderrTail = this.stderrLines.slice(-8).join('\n').trim();
    const stdoutTail = this.stdoutLines.slice(-8).join('\n').trim();
    const details: string[] = [base];
    if (stderrTail) {
      details.push(`stderr tail:\n${stderrTail}`);
    }
    if (stdoutTail) {
      details.push(`stdout tail:\n${stdoutTail}`);
    }
    return details.join('\n\n');
  }
}
