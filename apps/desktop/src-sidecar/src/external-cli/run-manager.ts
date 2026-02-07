import { EventEmitter } from 'events';
import { mkdir, stat } from 'fs/promises';
import { resolve } from 'path';
import { generateId } from '@gemini-cowork/shared';
import { parseNaturalLanguageResponse } from './nl-response-parser.js';
import { ExternalCliRunStateStore } from './run-state-store.js';
import { ExternalCliDiscoveryService } from './discovery-service.js';
import type {
  ExternalCliAdapter,
  ExternalCliProgressEntry,
  ExternalCliRunRecord,
  ExternalCliRunSummary,
  ExternalCliRuntimeConfig,
  ExternalCliStartRunInput,
} from './types.js';
import { CodexAppServerAdapter } from './providers/codex-app-server-adapter.js';
import { ClaudeStreamAdapter } from './providers/claude-stream-adapter.js';
import { ExternalCliError } from './errors.js';

const MAX_PROGRESS_ENTRIES = 200;

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRunActive(status: ExternalCliRunRecord['status']): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting_user';
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === code;
}

function toSummary(run: ExternalCliRunRecord): ExternalCliRunSummary {
  const latestProgress = run.progress.length > 0 ? run.progress[run.progress.length - 1]?.message || null : null;

  return {
    runId: run.runId,
    sessionId: run.sessionId,
    provider: run.provider,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt,
    latestProgress,
    progressCount: run.progress.length,
    pendingInteraction: run.pendingInteraction
      ? {
          interactionId: run.pendingInteraction.interactionId,
          type: run.pendingInteraction.type,
          prompt: run.pendingInteraction.prompt,
          options: run.pendingInteraction.options,
          requestedAt: run.pendingInteraction.requestedAt,
        }
      : undefined,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    resultSummary: run.resultSummary,
  };
}

interface ExternalCliRunManagerOptions {
  appDataDir: string;
  discoveryService: ExternalCliDiscoveryService;
  getRuntimeConfig: () => ExternalCliRuntimeConfig;
}

export class ExternalCliRunManager extends EventEmitter {
  private readonly store: ExternalCliRunStateStore;
  private readonly discoveryService: ExternalCliDiscoveryService;
  private readonly getRuntimeConfig: () => ExternalCliRuntimeConfig;

  private runs = new Map<string, ExternalCliRunRecord>();
  private adapters = new Map<string, ExternalCliAdapter>();

  constructor(options: ExternalCliRunManagerOptions) {
    super();
    this.store = new ExternalCliRunStateStore(options.appDataDir);
    this.discoveryService = options.discoveryService;
    this.getRuntimeConfig = options.getRuntimeConfig;
  }

  async initialize(): Promise<void> {
    const restoredRuns = await this.store.load();
    this.runs.clear();

    for (const run of restoredRuns) {
      this.runs.set(run.runId, run);
    }

    await this.persist();
  }

  listRuns(sessionId?: string): ExternalCliRunSummary[] {
    return Array.from(this.runs.values())
      .filter((run) => !sessionId || run.sessionId === sessionId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toSummary);
  }

  getRun(runId: string): ExternalCliRunRecord | null {
    return this.runs.get(runId) || null;
  }

  getLatestRun(sessionId: string, provider?: 'codex' | 'claude'): ExternalCliRunRecord | null {
    const items = Array.from(this.runs.values())
      .filter((run) => run.sessionId === sessionId)
      .filter((run) => !provider || run.provider === provider)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return items[0] || null;
  }

  async startRun(input: ExternalCliStartRunInput): Promise<ExternalCliRunSummary> {
    const availability = await this.discoveryService.getAvailability(false);
    const runtimeConfig = this.getRuntimeConfig();

    const availabilityEntry = input.provider === 'codex' ? availability.codex : availability.claude;
    const providerConfig = runtimeConfig[input.provider];

    if (!availabilityEntry.installed) {
      throw new ExternalCliError(
        'CLI_NOT_INSTALLED',
        `${input.provider} CLI is not installed on this machine.`,
      );
    }

    if (!providerConfig.enabled) {
      throw new ExternalCliError(
        'CLI_DISABLED_IN_SETTINGS',
        `${input.provider} CLI tools are disabled in settings.`,
      );
    }

    if (input.bypassPermission && !providerConfig.allowBypassPermissions) {
      throw new ExternalCliError(
        'CLI_PERMISSION_BYPASS_BLOCKED',
        `Bypass permission is disabled for ${input.provider} in settings.`,
      );
    }

    if (availabilityEntry.authStatus === 'unauthenticated') {
      throw new ExternalCliError(
        'CLI_AUTH_REQUIRED',
        availabilityEntry.authMessage || `${input.provider} is not authenticated.`,
      );
    }

    const existing = this.findActiveRun(input.sessionId, input.provider);
    if (existing) {
      throw new ExternalCliError(
        'CLI_PROTOCOL_ERROR',
        `${input.provider} already has an active run in this session.`,
      );
    }

    const workingDirectory = await this.prepareWorkingDirectory(input);
    const requestedBypassPermission = input.requestedBypassPermission ?? input.bypassPermission;
    const effectiveBypassPermission = input.bypassPermission;

    const now = Date.now();
    const runId = generateId('ext-run');

    const run: ExternalCliRunRecord = {
      runId,
      sessionId: input.sessionId,
      provider: input.provider,
      prompt: input.prompt,
      workingDirectory,
      resolvedWorkingDirectory: workingDirectory,
      createIfMissing: input.createIfMissing,
      requestedBypassPermission,
      effectiveBypassPermission,
      bypassPermission: effectiveBypassPermission,
      status: 'queued',
      startedAt: now,
      updatedAt: now,
      origin: input.origin,
      progress: [
        {
          timestamp: now,
          kind: 'status',
          message: `Queued ${input.provider} run.`,
        },
      ],
    };

    this.runs.set(runId, run);
    await this.persist();
    this.emit('run_updated', toSummary(run));

    const adapter: ExternalCliAdapter =
      input.provider === 'codex' ? new CodexAppServerAdapter() : new ClaudeStreamAdapter(input.origin);

    this.adapters.set(runId, adapter);

    try {
      run.status = 'running';
      run.updatedAt = Date.now();
      this.appendProgress(run, {
        timestamp: Date.now(),
        kind: 'status',
        message: `Starting ${input.provider} process...`,
      });
      await this.persist();
      this.emit('run_updated', toSummary(run));

      await adapter.start(
        {
          runId,
          sessionId: run.sessionId,
          provider: run.provider,
          prompt: run.prompt,
          workingDirectory: run.workingDirectory,
          bypassPermission: run.bypassPermission,
        },
        {
          onProgress: (entry) => {
            this.appendProgress(run, entry);
            run.updatedAt = Date.now();
            void this.persist();
            this.emit('run_updated', toSummary(run));
          },
          onWaitingInteraction: (interaction) => {
            run.status = 'waiting_user';
            run.pendingInteraction = {
              ...interaction,
              runId,
              sessionId: run.sessionId,
              origin: run.origin,
            };
            run.updatedAt = Date.now();
            this.appendProgress(run, {
              timestamp: Date.now(),
              kind: 'status',
              message: interaction.prompt,
            });
            void this.persist();
            this.emit('run_updated', toSummary(run));
            this.emit('interaction', run.pendingInteraction);
          },
          onInteractionResolved: (interactionId) => {
            if (run.pendingInteraction?.interactionId === interactionId) {
              run.pendingInteraction = undefined;
            }
            if (run.status === 'waiting_user') {
              run.status = 'running';
            }
            run.updatedAt = Date.now();
            void this.persist();
            this.emit('run_updated', toSummary(run));
            this.emit('interaction_resolved', { runId, interactionId, sessionId: run.sessionId });
          },
          onCompleted: (summary) => {
            run.status = 'completed';
            run.resultSummary = summary;
            run.pendingInteraction = undefined;
            run.finishedAt = Date.now();
            run.updatedAt = run.finishedAt;
            this.appendProgress(run, {
              timestamp: run.finishedAt,
              kind: 'status',
              message: summary,
            });
            this.adapters.delete(runId);
            void adapter.dispose();
            void this.persist();
            this.emit('run_updated', toSummary(run));
          },
          onFailed: (code, message) => {
            run.status = 'failed';
            run.errorCode = code;
            run.errorMessage = message;
            run.pendingInteraction = undefined;
            run.finishedAt = Date.now();
            run.updatedAt = run.finishedAt;
            this.appendProgress(run, {
              timestamp: run.finishedAt,
              kind: 'error',
              message,
            });
            this.adapters.delete(runId);
            void adapter.dispose();
            void this.persist();
            this.emit('run_updated', toSummary(run));
          },
          onCancelled: (message) => {
            run.status = 'cancelled';
            run.pendingInteraction = undefined;
            run.finishedAt = Date.now();
            run.updatedAt = run.finishedAt;
            this.appendProgress(run, {
              timestamp: run.finishedAt,
              kind: 'status',
              message: message || 'Run cancelled.',
            });
            this.adapters.delete(runId);
            void adapter.dispose();
            void this.persist();
            this.emit('run_updated', toSummary(run));
          },
        },
      );
    } catch (error) {
      const errorMessage = stringifyError(error);
      run.status = 'failed';
      run.errorCode = 'CLI_PROTOCOL_ERROR';
      run.errorMessage = errorMessage;
      run.finishedAt = Date.now();
      run.updatedAt = run.finishedAt;
      run.pendingInteraction = undefined;
      this.appendProgress(run, {
        timestamp: run.finishedAt,
        kind: 'error',
        message: errorMessage,
      });
      this.adapters.delete(runId);
      await adapter.dispose();
      await this.persist();
      this.emit('run_updated', toSummary(run));
    }

    return toSummary(run);
  }

  async respond(runId: string, text: string): Promise<ExternalCliRunSummary> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`External CLI run not found: ${runId}`);
    }

    if (!run.pendingInteraction) {
      throw new Error('No pending interaction for this run.');
    }

    const adapter = this.adapters.get(runId);
    if (!adapter) {
      throw new Error('Run adapter is not available.');
    }

    const parsed = parseNaturalLanguageResponse(text);
    if (run.pendingInteraction.type === 'permission' && parsed.decision === 'answer') {
      throw new Error('Ambiguous permission response. Reply with allow, allow session, deny, or cancel.');
    }

    await adapter.respond(run.pendingInteraction.interactionId, parsed);
    return toSummary(run);
  }

  async cancel(runId: string): Promise<ExternalCliRunSummary> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`External CLI run not found: ${runId}`);
    }

    const adapter = this.adapters.get(runId);
    if (adapter) {
      await adapter.cancel('Run cancelled by user request.');
      this.adapters.delete(runId);
    }

    if (isRunActive(run.status)) {
      run.status = 'cancelled';
      run.pendingInteraction = undefined;
      run.finishedAt = Date.now();
      run.updatedAt = run.finishedAt;
      this.appendProgress(run, {
        timestamp: run.finishedAt,
        kind: 'status',
        message: 'Run cancelled by user request.',
      });
      await this.persist();
      this.emit('run_updated', toSummary(run));
    }

    return toSummary(run);
  }

  async tryRespondFromIntegration(
    sessionId: string,
    platform: string,
    chatId: string,
    text: string,
  ): Promise<boolean> {
    const waitingRun = Array.from(this.runs.values())
      .filter((run) => run.sessionId === sessionId && run.status === 'waiting_user' && Boolean(run.pendingInteraction))
      .find((run) => {
        const origin = run.origin;
        return (
          origin.source === 'integration' &&
          origin.platform === platform &&
          origin.chatId === chatId
        );
      });

    if (!waitingRun) {
      return false;
    }

    await this.respond(waitingRun.runId, text);
    return true;
  }

  async shutdown(): Promise<void> {
    for (const [runId, adapter] of this.adapters.entries()) {
      try {
        await adapter.dispose();
      } catch {
        // Best-effort cleanup.
      }
      this.adapters.delete(runId);
    }

    await this.persist();
  }

  private findActiveRun(sessionId: string, provider: 'codex' | 'claude'): ExternalCliRunRecord | null {
    const match = Array.from(this.runs.values()).find(
      (run) => run.sessionId === sessionId && run.provider === provider && isRunActive(run.status),
    );

    return match || null;
  }

  private async prepareWorkingDirectory(input: ExternalCliStartRunInput): Promise<string> {
    const raw = String(input.workingDirectory || '').trim();
    if (!raw) {
      throw new ExternalCliError(
        'CLI_PROTOCOL_ERROR',
        'working_directory is required. Confirm it in conversation before starting the external CLI run.',
      );
    }

    const resolvedWorkingDirectory = resolve(raw);

    try {
      const existing = await stat(resolvedWorkingDirectory);
      if (!existing.isDirectory()) {
        throw new ExternalCliError(
          'CLI_PROTOCOL_ERROR',
          `Working directory is not a directory: ${resolvedWorkingDirectory}`,
        );
      }
      return resolvedWorkingDirectory;
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        if (!input.createIfMissing) {
          throw new ExternalCliError(
            'CLI_PROTOCOL_ERROR',
            `Working directory does not exist: ${resolvedWorkingDirectory}. Ask user to confirm creation and rerun with create_if_missing=true.`,
          );
        }

        try {
          await mkdir(resolvedWorkingDirectory, { recursive: true });
          const created = await stat(resolvedWorkingDirectory);
          if (!created.isDirectory()) {
            throw new ExternalCliError(
              'CLI_PROTOCOL_ERROR',
              `Failed to create directory: ${resolvedWorkingDirectory}`,
            );
          }
          return resolvedWorkingDirectory;
        } catch (createError) {
          if (createError instanceof ExternalCliError) {
            throw createError;
          }
          throw new ExternalCliError(
            'CLI_PROTOCOL_ERROR',
            `Unable to create working directory ${resolvedWorkingDirectory}: ${stringifyError(createError)}`,
          );
        }
      }

      throw new ExternalCliError(
        'CLI_PROTOCOL_ERROR',
        `Unable to access working directory ${resolvedWorkingDirectory}: ${stringifyError(error)}`,
      );
    }
  }

  private appendProgress(run: ExternalCliRunRecord, entry: ExternalCliProgressEntry): void {
    run.progress.push(entry);
    if (run.progress.length > MAX_PROGRESS_ENTRIES) {
      run.progress = run.progress.slice(run.progress.length - MAX_PROGRESS_ENTRIES);
    }
  }

  private async persist(): Promise<void> {
    const records = Array.from(this.runs.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 200);

    await this.store.save(records);
  }
}
