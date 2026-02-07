import { EventEmitter } from 'events';
import { join } from 'path';
import { CronExpressionParser } from 'cron-parser';
import type {
  CreateWorkflowFromPromptInput,
  CreateWorkflowDraftInput,
  UpdateWorkflowDraftInput,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowRun,
  WorkflowRunInput,
  WorkflowScheduledTaskSummary,
  WorkflowRunStatus,
  WorkflowSchedule,
  WorkflowTrigger,
  WorkflowValidationReport,
} from '@gemini-cowork/shared';
import { DatabaseConnection, WorkflowEventRepository, WorkflowRepository, WorkflowRunRepository } from '@gemini-cowork/storage';
import { generateId } from '@gemini-cowork/shared';
import type { AgentRunner } from '../agent-runner.js';
import { compileWorkflowDefinition, validateWorkflowDefinition } from './compiler.js';
import { WorkflowEngine } from './engine.js';
import { WorkflowTriggerRouter } from './trigger-router.js';
import { buildWorkflowDraftFromPrompt } from './draft-generator.js';

interface ScheduleTriggerRow {
  id: string;
  workflow_id: string;
  workflow_version: number;
  config: string;
  enabled: number;
  next_run_at: number | null;
}

export interface WorkflowRunWithDetails {
  run: WorkflowRun;
  nodeRuns: ReturnType<WorkflowRunRepository['getNodeRuns']>;
  events: WorkflowEvent[];
}

export class WorkflowService extends EventEmitter {
  private initialized = false;
  private db: DatabaseConnection | null = null;
  private workflowRepository: WorkflowRepository | null = null;
  private runRepository: WorkflowRunRepository | null = null;
  private eventRepository: WorkflowEventRepository | null = null;
  private agentRunner: AgentRunner | null = null;
  private engine: WorkflowEngine | null = null;
  private triggerRouter: WorkflowTriggerRouter;
  private runningRunIds = new Set<string>();

  constructor() {
    super();

    this.triggerRouter = new WorkflowTriggerRouter({
      getNextScheduleAt: async () => this.getNextScheduledTriggerAt(),
      runDueSchedules: async () => this.runDueSchedules(),
    });
  }

  async initialize(appDataDir: string, agentRunner: AgentRunner): Promise<void> {
    if (this.initialized) return;

    const dbPath = join(appDataDir, 'data.db');
    this.db = new DatabaseConnection({ path: dbPath });
    this.workflowRepository = new WorkflowRepository(this.db);
    this.runRepository = new WorkflowRunRepository(this.db);
    this.eventRepository = new WorkflowEventRepository(this.db);
    this.agentRunner = agentRunner;

    this.engine = new WorkflowEngine({
      runRepository: this.runRepository,
      eventRepository: this.eventRepository,
      executeAgentPrompt: (prompt, options) => this.executeAgentPrompt(prompt, options),
    });

    this.engine.setDefinitionResolver((run) => {
      if (!this.workflowRepository) return null;
      const definition = this.workflowRepository.getByVersion(run.workflowId, run.workflowVersion);
      if (!definition) return null;
      const compiled = compileWorkflowDefinition(definition);
      return { definition, compiled };
    });

    this.recoverInFlightRuns();
    await this.startTriggerRouter();
    this.initialized = true;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db || !this.workflowRepository || !this.runRepository || !this.eventRepository || !this.agentRunner || !this.engine) {
      throw new Error('WorkflowService is not initialized');
    }
  }

  private async startTriggerRouter(): Promise<void> {
    await this.triggerRouter.start();
  }

  private async executeAgentPrompt(
    prompt: string,
    options?: {
      workingDirectory?: string;
      model?: string;
      maxTurns?: number;
      runId?: string;
    },
  ): Promise<{ content: string; promptTokens?: number; completionTokens?: number }> {
    this.ensureInitialized();

    const workingDirectory = options?.workingDirectory || process.cwd();
    const model = options?.model || null;
    const title = options?.runId ? `[workflow:${options.runId}] step` : '[workflow] step';
    const session = await this.agentRunner!.createSession(workingDirectory, model, title, 'isolated');

    const before = this.agentRunner!.getSession(session.id);
    const itemCountBefore = (before as { chatItems?: unknown[] })?.chatItems?.length ?? 0;

    await this.agentRunner!.sendMessage(session.id, prompt, undefined, options?.maxTurns);

    const after = this.agentRunner!.getSession(session.id);
    const allItems = ((after as {
      chatItems?: Array<{ kind: string; content: string | Array<{ type: string; text?: string }> }>;
    })?.chatItems ?? []);

    const content = allItems
      .slice(itemCountBefore)
      .filter((item) => item.kind === 'assistant_message')
      .map((item) => {
        if (typeof item.content === 'string') {
          return item.content;
        }
        return item.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text || '')
          .join('\n');
      })
      .join('\n\n');

    return { content };
  }

  list(limit = 100, offset = 0): WorkflowDefinition[] {
    this.ensureInitialized();
    return this.workflowRepository!.listLatest(limit, offset);
  }

  get(workflowId: string, version?: number): WorkflowDefinition | null {
    this.ensureInitialized();
    return this.workflowRepository!.get(workflowId, version);
  }

  createDraft(input: CreateWorkflowDraftInput, createdBy?: string): WorkflowDefinition {
    this.ensureInitialized();
    const definition = this.workflowRepository!.createDraft(input, createdBy);
    return definition;
  }

  createFromPrompt(input: CreateWorkflowFromPromptInput, createdBy?: string): WorkflowDefinition {
    this.ensureInitialized();
    const draftInput = buildWorkflowDraftFromPrompt(input);
    const draft = this.workflowRepository!.createDraft(draftInput, createdBy);
    if (input.publish) {
      return this.publish(draft.id);
    }
    return draft;
  }

  updateDraft(workflowId: string, updates: UpdateWorkflowDraftInput): WorkflowDefinition {
    this.ensureInitialized();
    return this.workflowRepository!.updateDraft(workflowId, updates);
  }

  validateDraft(definition: WorkflowDefinition): WorkflowValidationReport {
    return validateWorkflowDefinition(definition);
  }

  publish(workflowId: string): WorkflowDefinition {
    this.ensureInitialized();
    const published = this.workflowRepository!.publish(workflowId);
    this.syncMaterializedTriggers(published);
    void this.triggerRouter.refresh();
    return published;
  }

  archive(workflowId: string): WorkflowDefinition {
    this.ensureInitialized();
    return this.workflowRepository!.archive(workflowId);
  }

  listScheduledTasks(limit = 100, offset = 0): WorkflowScheduledTaskSummary[] {
    this.ensureInitialized();

    const workflows = this.workflowRepository!
      .listLatest(limit, offset)
      .filter((workflow) => workflow.status === 'published')
      .filter((workflow) =>
        workflow.triggers.some((trigger) => trigger.type === 'schedule'),
      );

    return workflows.map((workflow) => {
      const triggerRows = this.getScheduleTriggerRows(workflow.id);
      const enabled = triggerRows.some((row) => row.enabled === 1);
      const nextRunAtCandidates = triggerRows
        .filter((row) => row.enabled === 1 && row.next_run_at != null)
        .map((row) => row.next_run_at as number);
      const nextRunAt =
        nextRunAtCandidates.length > 0
          ? Math.min(...nextRunAtCandidates)
          : null;

      const runCountRow = this.db!.instance
        .prepare(
          `
          SELECT COUNT(*) as run_count
          FROM workflow_runs
          WHERE workflow_id = ?
          `,
        )
        .get(workflow.id) as { run_count: number } | undefined;
      const runCount = runCountRow?.run_count ?? 0;

      const lastRun = this.db!.instance
        .prepare(
          `
          SELECT status, COALESCE(completed_at, started_at, created_at) as last_run_at
          FROM workflow_runs
          WHERE workflow_id = ?
          ORDER BY created_at DESC
          LIMIT 1
          `,
        )
        .get(workflow.id) as
        | { status: WorkflowRunStatus; last_run_at: number | null }
        | undefined;

      return {
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        name: workflow.name,
        status: workflow.status,
        schedules: workflow.triggers
          .filter((trigger): trigger is Extract<WorkflowTrigger, { type: 'schedule' }> => trigger.type === 'schedule')
          .map((trigger) => trigger.schedule),
        enabled,
        nextRunAt,
        runCount,
        lastRunAt: lastRun?.last_run_at ?? null,
        lastRunStatus: lastRun?.status ?? null,
      };
    });
  }

  pauseScheduledWorkflow(workflowId: string): { workflowId: string; pausedTriggers: number } {
    this.ensureInitialized();

    const rows = this.getScheduleTriggerRows(workflowId);
    if (rows.length === 0) {
      throw new Error(`No schedule triggers found for workflow ${workflowId}`);
    }

    const nowTs = Date.now();
    this.db!.transaction(() => {
      for (const row of rows) {
        const trigger = JSON.parse(row.config) as Extract<WorkflowTrigger, { type: 'schedule' }>;
        const updatedTrigger: WorkflowTrigger = {
          ...trigger,
          enabled: false,
        };

        this.db!.instance
          .prepare(
            `
            UPDATE workflow_triggers
            SET enabled = 0, next_run_at = NULL, config = ?, updated_at = ?
            WHERE id = ?
            `,
          )
          .run(JSON.stringify(updatedTrigger), nowTs, row.id);
      }
    });

    void this.triggerRouter.refresh();
    return { workflowId, pausedTriggers: rows.length };
  }

  resumeScheduledWorkflow(
    workflowId: string,
  ): { workflowId: string; resumedTriggers: number; nextRunAt: number | null } {
    this.ensureInitialized();

    const rows = this.getScheduleTriggerRows(workflowId);
    if (rows.length === 0) {
      throw new Error(`No schedule triggers found for workflow ${workflowId}`);
    }

    const nowTs = Date.now();
    const nextRunCandidates: number[] = [];

    this.db!.transaction(() => {
      for (const row of rows) {
        const trigger = JSON.parse(row.config) as Extract<WorkflowTrigger, { type: 'schedule' }>;
        const updatedTrigger: WorkflowTrigger = {
          ...trigger,
          enabled: true,
        };
        const nextRunAt = this.computeNextScheduleAt(trigger.schedule, nowTs);
        if (typeof nextRunAt === 'number') {
          nextRunCandidates.push(nextRunAt);
        }

        this.db!.instance
          .prepare(
            `
            UPDATE workflow_triggers
            SET enabled = 1, next_run_at = ?, config = ?, updated_at = ?
            WHERE id = ?
            `,
          )
          .run(nextRunAt, JSON.stringify(updatedTrigger), nowTs, row.id);
      }
    });

    void this.triggerRouter.refresh();
    return {
      workflowId,
      resumedTriggers: rows.length,
      nextRunAt:
        nextRunCandidates.length > 0 ? Math.min(...nextRunCandidates) : null,
    };
  }

  async run(input: WorkflowRunInput): Promise<WorkflowRun> {
    this.ensureInitialized();

    const definition = input.version
      ? this.workflowRepository!.getByVersion(input.workflowId, input.version)
      : this.workflowRepository!.getPublished(input.workflowId) || this.workflowRepository!.getDraft(input.workflowId);

    if (!definition) {
      throw new Error(`Workflow not found: ${input.workflowId}`);
    }
    if (definition.status === 'archived') {
      throw new Error(`Workflow is archived and cannot be run: ${input.workflowId}`);
    }

    const report = validateWorkflowDefinition(definition);
    if (!report.valid) {
      throw new Error(`Workflow validation failed: ${report.errors.join(' | ')}`);
    }

    const run = this.runRepository!.create({
      workflowId: definition.id,
      workflowVersion: definition.version,
      triggerType: input.triggerType || 'manual',
      triggerContext: input.triggerContext || {},
      input: input.input || {},
      status: 'queued',
      correlationId: input.correlationId,
    });

    void this.executeRunAsync(run.id);
    return run;
  }

  listRuns(options?: {
    workflowId?: string;
    status?: WorkflowRunStatus;
    limit?: number;
    offset?: number;
  }): WorkflowRun[] {
    this.ensureInitialized();
    return this.runRepository!.list(options);
  }

  getRun(runId: string): WorkflowRunWithDetails {
    this.ensureInitialized();
    const details = this.engine!.getRunWithDetails(runId);
    const events = this.eventRepository!.list(runId);
    return {
      run: details.run,
      nodeRuns: details.nodeRuns,
      events,
    };
  }

  getRunEvents(runId: string, sinceTs?: number): WorkflowEvent[] {
    this.ensureInitialized();
    return this.eventRepository!.list(runId, sinceTs);
  }

  cancelRun(runId: string): WorkflowRun {
    this.ensureInitialized();
    const updated = this.runRepository!.updateStatus(runId, {
      status: 'cancelled',
      completedAt: Date.now(),
      error: 'Cancelled by user',
    });
    this.eventRepository!.append({
      runId,
      type: 'run_cancelled',
      payload: {
        reason: 'Cancelled by user',
      },
    });
    return updated;
  }

  pauseRun(runId: string): WorkflowRun {
    this.ensureInitialized();
    const updated = this.runRepository!.updateStatus(runId, {
      status: 'paused',
    });
    this.eventRepository!.append({
      runId,
      type: 'run_paused',
      payload: {
        reason: 'Paused by user',
      },
    });
    return updated;
  }

  async resumeRun(runId: string): Promise<WorkflowRun> {
    this.ensureInitialized();

    const run = this.runRepository!.getByIdOrThrow(runId);
    const currentNodeId = run.currentNodeId;

    if (currentNodeId) {
      const currentInput = { ...(run.input || {}) };
      const approvals = (currentInput.approvals as Record<string, boolean> | undefined) || {};
      approvals[currentNodeId] = true;
      currentInput.approvals = approvals;
      this.runRepository!.updateStatus(runId, {
        status: 'queued',
        error: undefined,
        output: undefined,
      });
      this.db!.instance
        .prepare('UPDATE workflow_runs SET input = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(currentInput), Date.now(), runId);
    } else {
      this.runRepository!.updateStatus(runId, {
        status: 'queued',
        error: undefined,
      });
    }
    this.eventRepository!.append({
      runId,
      type: 'run_resumed',
      payload: {
        currentNodeId: currentNodeId || null,
      },
    });

    void this.executeRunAsync(runId);
    return this.runRepository!.getByIdOrThrow(runId);
  }

  async backfillSchedule(workflowId: string, from: number, to: number): Promise<{ queued: number }> {
    this.ensureInitialized();

    const definition = this.workflowRepository!.getPublished(workflowId);
    if (!definition) {
      throw new Error('Published workflow not found for backfill');
    }

    let queued = 0;
    for (const trigger of definition.triggers) {
      if (trigger.type !== 'schedule' || !trigger.enabled) continue;

      const schedule = trigger.schedule;
      const times = this.computeScheduleBetween(schedule, from, to);
      for (const ts of times) {
        await this.run({
          workflowId,
          version: definition.version,
          triggerType: 'schedule',
          triggerContext: {
            triggerId: trigger.id,
            scheduledAt: ts,
            backfill: true,
          },
          correlationId: generateId('wf_backfill'),
        });
        queued += 1;
      }
    }

    return { queued };
  }

  private async executeRunAsync(runId: string): Promise<void> {
    if (this.runningRunIds.has(runId)) return;
    this.runningRunIds.add(runId);

    try {
      await this.engine!.execute(runId);
      this.emit('run:finished', runId);
    } finally {
      this.runningRunIds.delete(runId);
    }
  }

  private syncMaterializedTriggers(definition: WorkflowDefinition): void {
    const nowTs = Date.now();

    this.db!.transaction(() => {
      this.db!.instance.prepare('DELETE FROM workflow_triggers WHERE workflow_id = ?').run(definition.id);
      this.db!.instance.prepare('DELETE FROM workflow_webhooks WHERE workflow_id = ?').run(definition.id);

      for (const trigger of definition.triggers) {
        const materializedId = `${definition.id}:${definition.version}:${trigger.id}`;
        const nextRunAt = trigger.type === 'schedule' && trigger.enabled
          ? this.computeNextScheduleAt(trigger.schedule)
          : null;

        this.db!.instance
          .prepare(
            `
            INSERT INTO workflow_triggers (
              id, workflow_id, workflow_version, type, config, enabled,
              next_run_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            materializedId,
            definition.id,
            definition.version,
            trigger.type,
            JSON.stringify(trigger),
            trigger.enabled ? 1 : 0,
            nextRunAt,
            nowTs,
            nowTs,
          );

        if (trigger.type === 'webhook') {
          this.db!.instance
            .prepare(
              `
              INSERT INTO workflow_webhooks (
                endpoint_key, workflow_id, workflow_version, auth_mode, secret_ref, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
              `,
            )
            .run(
              trigger.endpointKey,
              definition.id,
              definition.version,
              trigger.authMode,
              trigger.secretRef || null,
              nowTs,
              nowTs,
            );
        }
      }
    });
  }

  private async getNextScheduledTriggerAt(): Promise<number | null> {
    this.ensureInitialized();

    const row = this.db!.instance
      .prepare(
        `
        SELECT next_run_at
        FROM workflow_triggers
        WHERE type = 'schedule' AND enabled = 1 AND next_run_at IS NOT NULL
        ORDER BY next_run_at ASC
        LIMIT 1
        `,
      )
      .get() as { next_run_at: number | null } | undefined;

    return row?.next_run_at ?? null;
  }

  private async runDueSchedules(): Promise<void> {
    this.ensureInitialized();

    const nowTs = Date.now();
    const due = this.db!.instance
      .prepare(
        `
        SELECT id, workflow_id, workflow_version, config, enabled, next_run_at
        FROM workflow_triggers
        WHERE type = 'schedule' AND enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
        ORDER BY next_run_at ASC
        LIMIT 100
        `,
      )
      .all(nowTs) as ScheduleTriggerRow[];

    for (const row of due) {
      const trigger = JSON.parse(row.config) as Extract<WorkflowTrigger, { type: 'schedule' }>;
      const triggerRunCount = this.getScheduleTriggerRunCount(row.workflow_id, trigger.id);
      const maxRuns = trigger.maxRuns;

      if (typeof maxRuns === 'number' && triggerRunCount >= maxRuns) {
        const disabledTrigger: WorkflowTrigger = { ...trigger, enabled: false };
        this.db!.instance
          .prepare(
            `
            UPDATE workflow_triggers
            SET enabled = 0, next_run_at = NULL, config = ?, updated_at = ?
            WHERE id = ?
            `,
          )
          .run(JSON.stringify(disabledTrigger), Date.now(), row.id);
        continue;
      }

      await this.run({
        workflowId: row.workflow_id,
        version: row.workflow_version,
        triggerType: 'schedule',
        triggerContext: {
          triggerId: trigger.id,
          scheduledAt: row.next_run_at,
        },
      });

      const reachedMaxRuns =
        typeof maxRuns === 'number' && triggerRunCount + 1 >= maxRuns;
      const nextRunAt = reachedMaxRuns
        ? null
        : this.computeNextScheduleAt(trigger.schedule, nowTs + 1);
      const nextEnabled = reachedMaxRuns ? 0 : row.enabled;
      const updatedTrigger = reachedMaxRuns
        ? { ...trigger, enabled: false }
        : trigger;

      this.db!.instance
        .prepare(
          `
          UPDATE workflow_triggers
          SET enabled = ?, next_run_at = ?, config = ?, updated_at = ?
          WHERE id = ?
          `,
        )
        .run(nextEnabled, nextRunAt, JSON.stringify(updatedTrigger), Date.now(), row.id);
    }
  }

  private recoverInFlightRuns(): void {
    if (!this.db || !this.runRepository || !this.eventRepository) {
      throw new Error('WorkflowService repositories are not ready for recovery.');
    }

    const runningRuns = this.db!.instance
      .prepare(
        `
        SELECT id
        FROM workflow_runs
        WHERE status = 'running'
        `,
      )
      .all() as Array<{ id: string }>;

    if (runningRuns.length === 0) return;

    const recoveredAt = Date.now();
    this.db!.transaction(() => {
      for (const row of runningRuns) {
        this.runRepository!.updateStatus(row.id, {
          status: 'failed_recoverable',
          completedAt: recoveredAt,
          error: 'Recovered after restart; run was in progress.',
        });
        this.eventRepository!.append({
          runId: row.id,
          type: 'run_failed',
          payload: {
            recoverable: true,
            error: 'Recovered after restart; run was in progress.',
          },
        });
      }
    });
  }

  private getScheduleTriggerRows(workflowId: string): ScheduleTriggerRow[] {
    return this.db!.instance
      .prepare(
        `
        SELECT id, workflow_id, workflow_version, config, enabled, next_run_at
        FROM workflow_triggers
        WHERE workflow_id = ? AND type = 'schedule'
        ORDER BY created_at ASC
        `,
      )
      .all(workflowId) as ScheduleTriggerRow[];
  }

  private getScheduleTriggerRunCount(workflowId: string, triggerId: string): number {
    try {
      const row = this.db!.instance
        .prepare(
          `
          SELECT COUNT(*) as run_count
          FROM workflow_runs
          WHERE workflow_id = ?
            AND trigger_type = 'schedule'
            AND json_extract(trigger_context, '$.triggerId') = ?
          `,
        )
        .get(workflowId, triggerId) as { run_count: number } | undefined;

      return row?.run_count ?? 0;
    } catch {
      const runs = this.runRepository!.list({
        workflowId,
        status: undefined,
        limit: 10000,
        offset: 0,
      });
      return runs.filter((run) =>
        run.triggerType === 'schedule'
        && run.triggerContext
        && typeof run.triggerContext === 'object'
        && (run.triggerContext as { triggerId?: string }).triggerId === triggerId,
      ).length;
    }
  }

  private computeNextScheduleAt(schedule: WorkflowSchedule, from = Date.now()): number | null {
    switch (schedule.type) {
      case 'at': {
        return schedule.timestamp > from ? schedule.timestamp : null;
      }
      case 'every': {
        const startAt = schedule.startAt ?? from;
        const elapsed = Math.max(0, from - startAt);
        const intervals = Math.floor(elapsed / schedule.intervalMs);
        return startAt + (intervals + 1) * schedule.intervalMs;
      }
      case 'cron': {
        try {
          const expr = CronExpressionParser.parse(schedule.expression, {
            currentDate: new Date(from),
            tz: schedule.timezone,
          });
          return expr.next().getTime();
        } catch {
          return null;
        }
      }
      default:
        return null;
    }
  }

  private computeScheduleBetween(schedule: WorkflowSchedule, from: number, to: number): number[] {
    const results: number[] = [];

    if (to < from) return results;

    switch (schedule.type) {
      case 'at': {
        if (schedule.timestamp >= from && schedule.timestamp <= to) {
          results.push(schedule.timestamp);
        }
        break;
      }
      case 'every': {
        const startAt = schedule.startAt ?? from;
        let ts = startAt;
        while (ts < from) {
          ts += schedule.intervalMs;
        }
        while (ts <= to) {
          results.push(ts);
          ts += schedule.intervalMs;
        }
        break;
      }
      case 'cron': {
        try {
          const expr = CronExpressionParser.parse(schedule.expression, {
            currentDate: new Date(from - 1),
            tz: schedule.timezone,
          });

          while (true) {
            const next = expr.next().getTime();
            if (next > to) break;
            results.push(next);
          }
        } catch {
          // ignore invalid cron
        }
        break;
      }
    }

    return results;
  }
}

export const workflowService = new WorkflowService();
