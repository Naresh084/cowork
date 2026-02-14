// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { generateId } from '@cowork/shared';
import type {
  ExternalCliAdapter,
  ExternalCliAdapterCallbacks,
  ExternalCliAdapterStartInput,
  ExternalCliPendingInteraction,
  ExternalCliResponsePayload,
} from '../types.js';
import {
  buildJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcServerRequest,
  type JsonRpcRequestId,
  type JsonRpcResponse,
} from './codex-protocol.js';

interface PendingRpcRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface PendingInteraction {
  requestId: JsonRpcRequestId;
  type: 'permission' | 'question';
  metadata: Record<string, unknown>;
}

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

function extractCodexErrorMessage(params: Record<string, unknown>): string {
  const directMessage = typeof params.message === 'string' ? params.message.trim() : '';
  if (directMessage) {
    return directMessage;
  }

  const nestedError = isObject(params.error) ? params.error : null;
  const nestedMessage = nestedError && typeof nestedError.message === 'string'
    ? nestedError.message.trim()
    : '';
  if (nestedMessage) {
    return nestedMessage;
  }

  return 'Codex reported an error.';
}

function classifyCodexError(params: Record<string, unknown>): { code: string; message: string } {
  const message = extractCodexErrorMessage(params);
  const lower = message.toLowerCase();

  if (
    lower.includes('model_not_found') ||
    (lower.includes('requested model') && lower.includes('does not exist'))
  ) {
    return {
      code: 'CLI_PROTOCOL_ERROR',
      message:
        'Codex default model is not available. Update your Codex CLI model configuration and retry.',
    };
  }

  if (
    lower.includes('authentication') ||
    lower.includes('unauthorized') ||
    lower.includes('not logged in')
  ) {
    return {
      code: 'CLI_AUTH_REQUIRED',
      message: 'Codex is installed but not authenticated. Run `codex login` and retry.',
    };
  }

  return {
    code: 'CLI_PROTOCOL_ERROR',
    message,
  };
}

export class CodexAppServerAdapter implements ExternalCliAdapter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private callbacks: ExternalCliAdapterCallbacks | null = null;

  private requestCounter = 1;
  private requestMap = new Map<JsonRpcRequestId, PendingRpcRequest>();
  private pendingInteractions = new Map<string, PendingInteraction>();

  private threadId: string | null = null;
  private turnId: string | null = null;
  private stopped = false;
  private runId = '';
  private sessionId = '';
  private stderrLines: string[] = [];
  private stdoutLines: string[] = [];

  async start(input: ExternalCliAdapterStartInput, callbacks: ExternalCliAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.stopped = false;
    this.runId = input.runId;
    this.sessionId = input.sessionId;

    const codexArgs = ['app-server'];
    this.process = spawn('codex', codexArgs, {
      cwd: input.workingDirectory,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    callbacks.onLaunchCommand?.(
      buildCommandString('codex', codexArgs),
    );

    this.process.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        this.captureStream('stderr', text);
        this.callbacks?.onDiagnosticLog?.({ stream: 'stderr', text });
        process.stderr.write(`[external-cli][codex] ${text}\n`);
      }
    });

    this.process.on('error', (error) => {
      callbacks.onDiagnosticLog?.({
        stream: 'note',
        text: `Process spawn error: ${stringifyError(error)}`,
      });
      callbacks.onFailed(
        'CLI_PROTOCOL_ERROR',
        this.buildFailureMessage(`Failed to start codex app-server: ${stringifyError(error)}`),
      );
    });

    this.process.on('close', (code, signal) => {
      callbacks.onProcessExit?.({
        code: typeof code === 'number' ? code : null,
        signal: signal || null,
      });
      callbacks.onDiagnosticLog?.({
        stream: 'note',
        text: `Process closed (code=${code ?? 'null'} signal=${signal || 'null'})`,
      });
      if (this.stopped) {
        return;
      }

      if (code === 0) {
        return;
      }

      callbacks.onFailed(
        'CLI_PROTOCOL_ERROR',
        this.buildFailureMessage(`Codex process exited unexpectedly with code ${code ?? 1}.`),
      );
    });

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
      void this.handleLine(line);
    });

    void this.bootstrap(input).catch((error) => {
      callbacks.onFailed(
        'CLI_PROTOCOL_ERROR',
        this.buildFailureMessage(`Codex initialization failed: ${stringifyError(error)}`),
      );
    });
  }

  async respond(interactionId: string, response: ExternalCliResponsePayload): Promise<void> {
    const pending = this.pendingInteractions.get(interactionId);
    if (!pending) {
      return;
    }

    if (pending.type === 'permission') {
      const decision =
        response.decision === 'allow_session'
          ? 'acceptForSession'
          : response.decision === 'allow_once'
            ? 'accept'
            : response.decision === 'cancel'
              ? 'cancel'
              : 'decline';

      this.writeJson({
        jsonrpc: '2.0',
        id: pending.requestId,
        result: {
          decision,
        },
      });

      this.pendingInteractions.delete(interactionId);
      this.callbacks?.onInteractionResolved(interactionId);
      return;
    }

    const questionIds = Array.isArray(pending.metadata.questionIds)
      ? (pending.metadata.questionIds as string[])
      : [];
    const answerText = response.text?.trim() || '';

    const answers = questionIds.reduce<Record<string, { answers: string[] }>>((acc, questionId) => {
      acc[questionId] = {
        answers: [answerText],
      };
      return acc;
    }, {});

    this.writeJson({
      jsonrpc: '2.0',
      id: pending.requestId,
      result: {
        answers,
      },
    });

    this.pendingInteractions.delete(interactionId);
    this.callbacks?.onInteractionResolved(interactionId);
  }

  async cancel(reason?: string): Promise<void> {
    this.stopped = true;

    if (this.threadId && this.turnId) {
      try {
        await this.sendRequest('turn/interrupt', {
          threadId: this.threadId,
          turnId: this.turnId,
        });
      } catch {
        // Best effort. Process termination below is authoritative.
      }
    }

    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 1000).unref();
    }

    this.callbacks?.onCancelled(reason || 'Codex run cancelled.');
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

    for (const [id, pending] of this.requestMap.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Codex adapter disposed.'));
      this.requestMap.delete(id);
    }

    this.pendingInteractions.clear();
    this.callbacks = null;
    this.threadId = null;
    this.turnId = null;
  }

  private async bootstrap(input: ExternalCliAdapterStartInput): Promise<void> {
    if (!this.callbacks) {
      return;
    }

    this.callbacks.onProgress({
      timestamp: Date.now(),
      kind: 'status',
      message: 'Starting Codex CLI run...',
    });

    await this.sendRequest('initialize', {
      clientInfo: {
        name: 'cowork',
        version: '0.1.0',
      },
    });

    const accountRead = (await this.sendRequest('account/read', { refreshToken: false })) as {
      account?: unknown;
    };

    if (!accountRead || !isObject(accountRead) || !accountRead.account) {
      this.callbacks.onFailed(
        'CLI_AUTH_REQUIRED',
        'Codex is installed but not authenticated. Run `codex login` and retry.',
      );
      return;
    }

    const threadStart = (await this.sendRequest('thread/start', {
      cwd: input.workingDirectory,
      approvalPolicy: input.bypassPermission ? 'never' : 'on-request',
      sandbox: input.bypassPermission ? 'danger-full-access' : 'workspace-write',
    })) as { thread?: { id?: string } };

    const threadId = threadStart?.thread?.id;
    if (!threadId) {
      throw new Error('Codex thread/start did not return a thread id.');
    }

    this.threadId = threadId;

    await this.sendRequest('turn/start', {
      threadId,
      input: [
        {
          type: 'text',
          text: input.prompt,
        },
      ],
      cwd: input.workingDirectory,
      approvalPolicy: input.bypassPermission ? 'never' : 'on-request',
      sandboxPolicy: input.bypassPermission
        ? { type: 'dangerFullAccess' }
        : { type: 'workspaceWrite', networkAccess: false },
    });
  }

  private async handleLine(line: string): Promise<void> {
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
        text: 'Received non-JSON stdout line from Codex app-server.',
      });
      return;
    }

    if (isJsonRpcResponse(parsed)) {
      this.resolveResponse(parsed);
      return;
    }

    if (isJsonRpcServerRequest(parsed)) {
      this.handleServerRequest(parsed.id, parsed.method, parsed.params || {});
      return;
    }

    if (isJsonRpcNotification(parsed)) {
      this.handleNotification(parsed.method, parsed.params || {});
    }
  }

  private resolveResponse(response: JsonRpcResponse): void {
    if (typeof response.id !== 'number' && typeof response.id !== 'string') {
      return;
    }

    const pending = this.requestMap.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.requestMap.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message || `JSON-RPC error ${response.error.code ?? 'unknown'}`));
      return;
    }

    pending.resolve(response.result);
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    if (!this.callbacks) {
      return;
    }

    if (method === 'turn/started') {
      const turn = params.turn;
      if (isObject(turn) && typeof turn.id === 'string') {
        this.turnId = turn.id;
      }
      this.callbacks.onProgress({
        timestamp: Date.now(),
        kind: 'status',
        message: 'Codex run started.',
      });
      return;
    }

    if (method === 'item/agentMessage/delta' || method === 'item/plan/delta') {
      const delta = typeof params.delta === 'string' ? params.delta.trim() : '';
      if (delta) {
        this.callbacks.onProgress({
          timestamp: Date.now(),
          kind: 'assistant',
          message: delta,
        });
      }
      return;
    }

    if (method === 'item/completed') {
      const item = params.item;
      if (!isObject(item)) {
        return;
      }

      if ((item.type === 'agentMessage' || item.type === 'plan') && typeof item.text === 'string') {
        const text = item.text.trim();
        if (text) {
          this.callbacks.onProgress({
            timestamp: Date.now(),
            kind: 'assistant',
            message: text,
          });
        }
      }
      return;
    }

    if (method === 'error') {
      const failure = classifyCodexError(params);
      this.callbacks.onFailed(failure.code, failure.message);
      return;
    }

    if (method === 'turn/completed') {
      const turn = params.turn;
      const status = isObject(turn) && typeof turn.status === 'string' ? turn.status : 'completed';
      if (status === 'failed') {
        const error = isObject(turn) && isObject(turn.error) ? turn.error : null;
        const failure = classifyCodexError(error || { message: 'Codex run failed.' });
        this.callbacks.onFailed(failure.code, failure.message);
        return;
      }

      this.callbacks.onCompleted('Codex run completed successfully.');
    }
  }

  private handleServerRequest(
    requestId: JsonRpcRequestId,
    method: string,
    params: Record<string, unknown>,
  ): void {
    if (!this.callbacks) {
      this.writeJson({
        jsonrpc: '2.0',
        id: requestId,
        result: {},
      });
      return;
    }

    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      const interactionId = generateId('ext-int');
      const reason = typeof params.reason === 'string' && params.reason ? params.reason : null;
      const command = typeof params.command === 'string' ? params.command : null;

      const promptParts = ['Codex requests permission.'];
      if (command) {
        promptParts.push(`Command: ${command}`);
      }
      if (reason) {
        promptParts.push(`Reason: ${reason}`);
      }

      const interaction: ExternalCliPendingInteraction = {
        interactionId,
        runId: this.runId,
        sessionId: this.sessionId,
        provider: 'codex',
        type: 'permission',
        prompt: promptParts.join(' '),
        options: ['allow', 'allow session', 'deny', 'cancel'],
        requestedAt: Date.now(),
        origin: { source: 'desktop' },
        metadata: {
          method,
          itemId: typeof params.itemId === 'string' ? params.itemId : undefined,
          requestId,
        },
      };

      this.pendingInteractions.set(interactionId, {
        requestId,
        type: 'permission',
        metadata: {
          method,
          itemId: typeof params.itemId === 'string' ? params.itemId : undefined,
        },
      });

      this.callbacks.onWaitingInteraction(interaction);
      return;
    }

    if (method === 'item/tool/requestUserInput') {
      const questionsRaw = Array.isArray(params.questions) ? params.questions : [];
      const firstQuestion = isObject(questionsRaw[0]) ? questionsRaw[0] : null;
      const questionPrompt =
        (firstQuestion && typeof firstQuestion.question === 'string' && firstQuestion.question) ||
        'Codex requested additional user input.';

      const interactionId = generateId('ext-int');
      const questionIds = questionsRaw
        .filter((item): item is Record<string, unknown> => isObject(item) && typeof item.id === 'string')
        .map((item) => item.id as string);

      const optionLabels = firstQuestion && Array.isArray(firstQuestion.options)
        ? firstQuestion.options
            .filter((option): option is Record<string, unknown> => isObject(option) && typeof option.label === 'string')
            .map((option) => String(option.label))
        : [];

      const interaction: ExternalCliPendingInteraction = {
        interactionId,
        runId: this.runId,
        sessionId: this.sessionId,
        provider: 'codex',
        type: 'question',
        prompt: questionPrompt,
        options: optionLabels.length > 0 ? optionLabels : undefined,
        requestedAt: Date.now(),
        origin: { source: 'desktop' },
        metadata: {
          requestId,
          questionIds,
        },
      };

      this.pendingInteractions.set(interactionId, {
        requestId,
        type: 'question',
        metadata: {
          questionIds,
        },
      });

      this.callbacks.onWaitingInteraction(interaction);
      return;
    }

    this.writeJson({
      jsonrpc: '2.0',
      id: requestId,
      result: {},
    });
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const requestId = this.requestCounter++;
    const payload = buildJsonRpcRequest(requestId, method, params);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestMap.delete(requestId);
        reject(new Error(`Codex request timed out: ${method}`));
      }, 20_000);

      this.requestMap.set(requestId, {
        resolve,
        reject,
        timeout,
      });

      this.writeJson(payload);
    });
  }

  private writeJson(payload: unknown): void {
    if (!this.process || !this.process.stdin.writable) {
      return;
    }

    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private captureStream(stream: 'stdout' | 'stderr', text: string): void {
    const target = stream === 'stderr' ? this.stderrLines : this.stdoutLines;
    target.push(text);
    if (target.length > 180) {
      target.shift();
    }
  }

  private buildFailureMessage(base: string): string {
    const stderrTail = this.stderrLines.slice(-10).join('\n').trim();
    const stdoutTail = this.stdoutLines.slice(-10).join('\n').trim();
    const parts: string[] = [base];
    if (stderrTail) {
      parts.push(`stderr tail:\n${stderrTail}`);
    }
    if (stdoutTail) {
      parts.push(`stdout tail:\n${stdoutTail}`);
    }
    return parts.join('\n\n');
  }
}
