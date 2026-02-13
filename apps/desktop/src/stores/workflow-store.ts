import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  CreateWorkflowFromPromptInput,
  CreateWorkflowDraftInput,
  UpdateWorkflowDraftInput,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowNodeRun,
  WorkflowRun,
  WorkflowScheduledTaskSummary,
  WorkflowRunStatus,
} from '@gemini-cowork/shared';

const DEFAULT_RUN_STREAM_INTERVAL_MS = 1500;
const SCHEDULE_OVERDUE_STALL_MS = 5 * 60 * 1000;
const RUN_STALL_MS = 20 * 1000;

const TERMINAL_RUN_STATUSES = new Set<WorkflowRunStatus>([
  'completed',
  'failed',
  'cancelled',
  'failed_recoverable',
]);

const STREAMABLE_RUN_STATUSES = new Set<WorkflowRunStatus>(['queued', 'running']);

const runStreamTimers = new Map<string, ReturnType<typeof setInterval>>();
const runStreamInFlight = new Set<string>();

function isStreamableStatus(status: WorkflowRunStatus): boolean {
  return STREAMABLE_RUN_STATUSES.has(status);
}

function isTerminalStatus(status: WorkflowRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

function mergeWorkflowEvents(existing: WorkflowEvent[], incoming: WorkflowEvent[]): WorkflowEvent[] {
  if (incoming.length === 0) return existing;

  const byId = new Map<string, WorkflowEvent>();
  for (const event of existing) {
    byId.set(event.id, event);
  }
  for (const event of incoming) {
    byId.set(event.id, event);
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.id.localeCompare(b.id);
  });
}

function latestEventTs(events: WorkflowEvent[]): number | null {
  if (events.length === 0) return null;
  return events[events.length - 1]?.ts ?? null;
}

function upsertRun(runs: WorkflowRun[], run: WorkflowRun): WorkflowRun[] {
  const index = runs.findIndex((candidate) => candidate.id === run.id);
  if (index < 0) {
    return [run, ...runs];
  }

  const next = [...runs];
  next[index] = run;
  return next;
}

function rankRuns(runs: WorkflowRun[]): WorkflowRun[] {
  return [...runs].sort((a, b) => b.createdAt - a.createdAt);
}

export interface WorkflowRunDetails {
  run: WorkflowRun;
  nodeRuns: WorkflowNodeRun[];
  events: WorkflowEvent[];
}

export interface WorkflowRunStreamState {
  active: boolean;
  intervalMs: number;
  lastPolledAt?: number;
  lastError?: string;
}

export interface WorkflowRunHealthState {
  runId: string;
  status: WorkflowRunStatus;
  health: 'healthy' | 'degraded' | 'stalled' | 'terminal';
  reason: string;
  lastEventAt: number | null;
  staleMs: number | null;
  updatedAt: number;
}

export interface WorkflowScheduledHealthState {
  workflowId: string;
  status: 'healthy' | 'degraded' | 'stalled' | 'paused' | 'idle';
  reason: string;
  nextRunAt: number | null;
  overdueMs: number;
  runningRuns: number;
  queuedRuns: number;
  recentFailures: number;
  evaluatedAt: number;
}

function computeRunHealth(run: WorkflowRun, events: WorkflowEvent[]): WorkflowRunHealthState {
  const nowTs = Date.now();
  const lastEventAt = latestEventTs(events);
  const staleMs =
    run.status === 'running' && typeof lastEventAt === 'number'
      ? Math.max(0, nowTs - lastEventAt)
      : null;

  if (isTerminalStatus(run.status)) {
    return {
      runId: run.id,
      status: run.status,
      health: 'terminal',
      reason: run.error ? `Run ended: ${run.error}` : `Run ended: ${run.status}`,
      lastEventAt,
      staleMs,
      updatedAt: nowTs,
    };
  }

  if (run.status === 'running') {
    if (typeof staleMs === 'number' && staleMs > RUN_STALL_MS) {
      return {
        runId: run.id,
        status: run.status,
        health: 'stalled',
        reason: `No timeline updates for ${Math.round(staleMs / 1000)}s`,
        lastEventAt,
        staleMs,
        updatedAt: nowTs,
      };
    }

    return {
      runId: run.id,
      status: run.status,
      health: 'healthy',
      reason: run.currentNodeId ? `Running node ${run.currentNodeId}` : 'Running',
      lastEventAt,
      staleMs,
      updatedAt: nowTs,
    };
  }

  if (run.status === 'paused') {
    return {
      runId: run.id,
      status: run.status,
      health: 'degraded',
      reason: run.error ? `Paused: ${run.error}` : 'Paused',
      lastEventAt,
      staleMs,
      updatedAt: nowTs,
    };
  }

  return {
    runId: run.id,
    status: run.status,
    health: 'degraded',
    reason: run.status,
    lastEventAt,
    staleMs,
    updatedAt: nowTs,
  };
}

function deriveScheduledHealth(
  scheduledTasks: WorkflowScheduledTaskSummary[],
  runs: WorkflowRun[],
): Record<string, WorkflowScheduledHealthState> {
  const nowTs = Date.now();
  const healthMap: Record<string, WorkflowScheduledHealthState> = {};

  for (const task of scheduledTasks) {
    const taskRuns = runs.filter((run) => run.workflowId === task.workflowId).slice(0, 20);
    const runningRuns = taskRuns.filter((run) => run.status === 'running').length;
    const queuedRuns = taskRuns.filter((run) => run.status === 'queued').length;
    const recentFailures = taskRuns.filter(
      (run) => run.status === 'failed' || run.status === 'failed_recoverable',
    ).length;

    const overdueMs =
      task.enabled && typeof task.nextRunAt === 'number'
        ? Math.max(0, nowTs - task.nextRunAt)
        : 0;

    let status: WorkflowScheduledHealthState['status'] = 'idle';
    let reason = 'No active runs';

    if (!task.enabled) {
      status = 'paused';
      reason = 'Schedule disabled';
    } else if (overdueMs > SCHEDULE_OVERDUE_STALL_MS) {
      status = 'stalled';
      reason = `Next run overdue by ${Math.round(overdueMs / 1000)}s`;
    } else if (recentFailures >= 2) {
      status = 'degraded';
      reason = `${recentFailures} recent failed runs`;
    } else if (runningRuns > 0 || queuedRuns > 0) {
      status = 'healthy';
      reason = `${runningRuns} running / ${queuedRuns} queued`;
    } else if (typeof task.nextRunAt === 'number') {
      status = 'healthy';
      reason = `Next run at ${new Date(task.nextRunAt).toLocaleTimeString()}`;
    }

    healthMap[task.workflowId] = {
      workflowId: task.workflowId,
      status,
      reason,
      nextRunAt: task.nextRunAt,
      overdueMs,
      runningRuns,
      queuedRuns,
      recentFailures,
      evaluatedAt: nowTs,
    };
  }

  return healthMap;
}

export interface WorkflowTriggerDiagnosticBreakdown {
  exactMatch: boolean;
  substringMatch: boolean;
  tokenCoverage: number;
  messageCoverage: number;
  strictMatch: boolean;
  effectiveThreshold: number;
  componentScores: {
    exactScore: number;
    substringScore: number;
    lexicalScore: number;
    penaltyScore: number;
  };
}

export interface WorkflowTriggerDiagnosticMatch {
  workflowId: string;
  workflowVersion: number;
  workflowName?: string;
  triggerId: string;
  confidence: number;
  shouldActivate: boolean;
  matchedPhrase: string | null;
  reasonCodes: string[];
  breakdown: WorkflowTriggerDiagnosticBreakdown;
}

interface WorkflowTriggerEvaluation {
  message: string;
  matches: WorkflowTriggerDiagnosticMatch[];
  activatedRun: WorkflowRun | null;
  evaluatedAt: number;
}

interface WorkflowState {
  workflows: WorkflowDefinition[];
  selectedWorkflowId: string | null;
  runs: WorkflowRun[];
  scheduledTasks: WorkflowScheduledTaskSummary[];
  selectedRunId: string | null;
  runDetails: Record<string, WorkflowRunDetails>;
  runEventBuffers: Record<string, WorkflowEvent[]>;
  runEventCursorTs: Record<string, number>;
  runReplayCursor: Record<string, number>;
  runStreamState: Record<string, WorkflowRunStreamState>;
  runHealth: Record<string, WorkflowRunHealthState>;
  scheduledHealth: Record<string, WorkflowScheduledHealthState>;
  triggerEvaluation: WorkflowTriggerEvaluation | null;
  triggerEvaluationLoading: boolean;
  isLoading: boolean;
  error: string | null;
}

interface WorkflowActions {
  loadWorkflows: (limit?: number, offset?: number) => Promise<void>;
  getWorkflow: (workflowId: string, version?: number) => Promise<WorkflowDefinition | null>;
  createDraft: (input: CreateWorkflowDraftInput) => Promise<WorkflowDefinition>;
  createFromPrompt: (input: CreateWorkflowFromPromptInput) => Promise<WorkflowDefinition>;
  updateDraft: (workflowId: string, updates: UpdateWorkflowDraftInput) => Promise<WorkflowDefinition>;
  publishWorkflow: (workflowId: string) => Promise<WorkflowDefinition>;
  archiveWorkflow: (workflowId: string) => Promise<WorkflowDefinition>;
  runWorkflow: (input: {
    workflowId: string;
    version?: number;
    input?: Record<string, unknown>;
    correlationId?: string;
  }) => Promise<WorkflowRun>;
  loadRuns: (opts?: {
    workflowId?: string;
    status?: WorkflowRunStatus;
    limit?: number;
    offset?: number;
  }) => Promise<void>;
  getRunDetails: (runId: string, sinceTs?: number) => Promise<WorkflowRunDetails>;
  pollRunNow: (runId: string) => Promise<void>;
  startRunStream: (
    runId: string,
    options?: {
      intervalMs?: number;
      includeSnapshot?: boolean;
    },
  ) => Promise<void>;
  stopRunStream: (runId: string) => void;
  stopAllRunStreams: () => void;
  setRunReplayCursor: (runId: string, eventIndex: number) => void;
  advanceRunReplayCursor: (runId: string, step?: number) => void;
  cancelRun: (runId: string) => Promise<WorkflowRun>;
  pauseRun: (runId: string) => Promise<WorkflowRun>;
  resumeRun: (runId: string) => Promise<WorkflowRun>;
  loadScheduledTasks: (limit?: number, offset?: number) => Promise<void>;
  pauseScheduledTask: (workflowId: string) => Promise<void>;
  resumeScheduledTask: (workflowId: string) => Promise<void>;
  recomputeScheduledHealth: () => void;
  evaluateTriggerMessage: (input: {
    message: string;
    workflowIds?: string[];
    minConfidence?: number;
    activationThreshold?: number;
    maxResults?: number;
    autoRun?: boolean;
    runInput?: Record<string, unknown>;
  }) => Promise<WorkflowTriggerEvaluation>;
  clearTriggerEvaluation: () => void;
  setSelectedWorkflow: (workflowId: string | null) => void;
  setSelectedRun: (runId: string | null) => void;
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>((set, get) => ({
  workflows: [],
  selectedWorkflowId: null,
  runs: [],
  scheduledTasks: [],
  selectedRunId: null,
  runDetails: {},
  runEventBuffers: {},
  runEventCursorTs: {},
  runReplayCursor: {},
  runStreamState: {},
  runHealth: {},
  scheduledHealth: {},
  triggerEvaluation: null,
  triggerEvaluationLoading: false,
  isLoading: false,
  error: null,

  loadWorkflows: async (limit = 100, offset = 0) => {
    set({ isLoading: true, error: null });
    try {
      const workflows = await invoke<WorkflowDefinition[]>('workflow_list', { limit, offset });
      set({ workflows, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  getWorkflow: async (workflowId: string, version?: number) => {
    try {
      return await invoke<WorkflowDefinition | null>('workflow_get', { workflowId, version });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },

  createDraft: async (input: CreateWorkflowDraftInput) => {
    set({ isLoading: true, error: null });
    try {
      const workflow = await invoke<WorkflowDefinition>('workflow_create_draft', { input });
      set((state) => ({
        workflows: [workflow, ...state.workflows],
        selectedWorkflowId: workflow.id,
        isLoading: false,
      }));
      return workflow;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
      throw error;
    }
  },

  createFromPrompt: async (input: CreateWorkflowFromPromptInput) => {
    set({ isLoading: true, error: null });
    try {
      const workflow = await invoke<WorkflowDefinition>('workflow_create_from_prompt', { input });
      set((state) => ({
        workflows: [workflow, ...state.workflows.filter((item) => item.id !== workflow.id)],
        selectedWorkflowId: workflow.id,
        isLoading: false,
      }));
      return workflow;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
      throw error;
    }
  },

  updateDraft: async (workflowId: string, updates: UpdateWorkflowDraftInput) => {
    set({ isLoading: true, error: null });
    try {
      const workflow = await invoke<WorkflowDefinition>('workflow_update_draft', {
        workflowId,
        updates,
      });
      set((state) => ({
        workflows: state.workflows.map((item) => (item.id === workflowId ? workflow : item)),
        isLoading: false,
      }));
      return workflow;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
      throw error;
    }
  },

  publishWorkflow: async (workflowId: string) => {
    const workflow = await invoke<WorkflowDefinition>('workflow_publish', { workflowId });
    set((state) => ({
      workflows: state.workflows.map((item) => (item.id === workflow.id ? workflow : item)),
    }));
    return workflow;
  },

  archiveWorkflow: async (workflowId: string) => {
    const workflow = await invoke<WorkflowDefinition>('workflow_archive', { workflowId });
    set((state) => ({
      workflows: state.workflows.map((item) => (item.id === workflow.id ? workflow : item)),
    }));
    return workflow;
  },

  runWorkflow: async ({ workflowId, version, input, correlationId }) => {
    const run = await invoke<WorkflowRun>('workflow_run', {
      input: {
        workflowId,
        version,
        input,
        correlationId,
      },
    });

    set((state) => ({
      runs: rankRuns(upsertRun(state.runs, run)),
      selectedRunId: run.id,
      runHealth: {
        ...state.runHealth,
        [run.id]: computeRunHealth(run, state.runEventBuffers[run.id] || []),
      },
    }));

    await get().startRunStream(run.id, {
      includeSnapshot: true,
      intervalMs: DEFAULT_RUN_STREAM_INTERVAL_MS,
    });
    get().recomputeScheduledHealth();

    return run;
  },

  loadRuns: async (opts) => {
    try {
      const runs = await invoke<WorkflowRun[]>('workflow_list_runs', {
        workflowId: opts?.workflowId,
        status: opts?.status,
        limit: opts?.limit,
        offset: opts?.offset,
      });

      set((state) => {
        const nextRunHealth: Record<string, WorkflowRunHealthState> = { ...state.runHealth };
        for (const run of runs) {
          const bufferedEvents =
            state.runEventBuffers[run.id] || state.runDetails[run.id]?.events || [];
          nextRunHealth[run.id] = computeRunHealth(run, bufferedEvents);
        }

        return {
          runs,
          runHealth: nextRunHealth,
        };
      });

      for (const run of runs) {
        if (isStreamableStatus(run.status)) {
          void get().startRunStream(run.id, { includeSnapshot: false });
        }
        if (isTerminalStatus(run.status)) {
          get().stopRunStream(run.id);
        }
      }

      get().recomputeScheduledHealth();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  getRunDetails: async (runId: string, sinceTs?: number) => {
    const [details, events] = await Promise.all([
      invoke<WorkflowRunDetails>('workflow_get_run', { runId }),
      invoke<WorkflowEvent[]>('workflow_get_run_events', { runId, sinceTs }),
    ]);

    const state = get();
    const baseEvents =
      typeof sinceTs === 'number'
        ? state.runEventBuffers[runId] || []
        : [];

    const mergedEvents = mergeWorkflowEvents(
      baseEvents,
      events.length > 0 ? events : details.events,
    );

    const withEvents: WorkflowRunDetails = {
      ...details,
      events: mergedEvents,
    };

    const cursorTs = latestEventTs(mergedEvents);
    const replayIndex = Math.max(mergedEvents.length - 1, 0);

    set((current) => ({
      runDetails: {
        ...current.runDetails,
        [runId]: withEvents,
      },
      runEventBuffers: {
        ...current.runEventBuffers,
        [runId]: mergedEvents,
      },
      runEventCursorTs: {
        ...current.runEventCursorTs,
        ...(cursorTs ? { [runId]: cursorTs } : {}),
      },
      runReplayCursor: {
        ...current.runReplayCursor,
        [runId]: current.runReplayCursor[runId] ?? replayIndex,
      },
      runs: rankRuns(upsertRun(current.runs, withEvents.run)),
      runHealth: {
        ...current.runHealth,
        [runId]: computeRunHealth(withEvents.run, mergedEvents),
      },
      selectedRunId: runId,
    }));

    if (isTerminalStatus(withEvents.run.status)) {
      get().stopRunStream(runId);
    }

    get().recomputeScheduledHealth();
    return withEvents;
  },

  pollRunNow: async (runId: string) => {
    if (runStreamInFlight.has(runId)) return;
    runStreamInFlight.add(runId);

    try {
      const state = get();
      const sinceTs = state.runEventCursorTs[runId];
      const [details, deltaEvents] = await Promise.all([
        invoke<WorkflowRunDetails>('workflow_get_run', { runId }),
        invoke<WorkflowEvent[]>('workflow_get_run_events', {
          runId,
          sinceTs: typeof sinceTs === 'number' ? sinceTs + 1 : undefined,
        }),
      ]);

      const existingEvents = state.runEventBuffers[runId] || [];
      const mergedEvents = mergeWorkflowEvents(
        existingEvents,
        deltaEvents.length > 0 ? deltaEvents : details.events,
      );
      const eventTs = latestEventTs(mergedEvents);
      const replayIndex = Math.max(mergedEvents.length - 1, 0);
      const streamState = state.runStreamState[runId];

      set((current) => ({
        runs: rankRuns(upsertRun(current.runs, details.run)),
        runDetails: {
          ...current.runDetails,
          [runId]: {
            ...details,
            events: mergedEvents,
          },
        },
        runEventBuffers: {
          ...current.runEventBuffers,
          [runId]: mergedEvents,
        },
        runEventCursorTs: {
          ...current.runEventCursorTs,
          ...(eventTs ? { [runId]: eventTs } : {}),
        },
        runReplayCursor: {
          ...current.runReplayCursor,
          [runId]: Math.min(
            current.runReplayCursor[runId] ?? replayIndex,
            replayIndex,
          ),
        },
        runStreamState: {
          ...current.runStreamState,
          [runId]: {
            active: streamState?.active ?? true,
            intervalMs: streamState?.intervalMs ?? DEFAULT_RUN_STREAM_INTERVAL_MS,
            lastPolledAt: Date.now(),
            lastError: undefined,
          },
        },
        runHealth: {
          ...current.runHealth,
          [runId]: computeRunHealth(details.run, mergedEvents),
        },
      }));

      if (isTerminalStatus(details.run.status)) {
        get().stopRunStream(runId);
      }

      get().recomputeScheduledHealth();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        runStreamState: {
          ...state.runStreamState,
          [runId]: {
            active: state.runStreamState[runId]?.active ?? false,
            intervalMs:
              state.runStreamState[runId]?.intervalMs ?? DEFAULT_RUN_STREAM_INTERVAL_MS,
            lastPolledAt: Date.now(),
            lastError: message,
          },
        },
      }));
    } finally {
      runStreamInFlight.delete(runId);
    }
  },

  startRunStream: async (runId, options) => {
    const desiredInterval = Math.max(
      500,
      options?.intervalMs ?? DEFAULT_RUN_STREAM_INTERVAL_MS,
    );
    const currentState = get().runStreamState[runId];
    const existingTimer = runStreamTimers.get(runId);
    const shouldReplaceTimer =
      !existingTimer || currentState?.intervalMs !== desiredInterval;

    if (shouldReplaceTimer && existingTimer) {
      clearInterval(existingTimer);
      runStreamTimers.delete(runId);
    }

    if (shouldReplaceTimer) {
      const timer = setInterval(() => {
        void get().pollRunNow(runId);
      }, desiredInterval);
      runStreamTimers.set(runId, timer);
    }

    set((state) => ({
      runStreamState: {
        ...state.runStreamState,
        [runId]: {
          active: true,
          intervalMs: desiredInterval,
          lastPolledAt: state.runStreamState[runId]?.lastPolledAt,
          lastError: undefined,
        },
      },
    }));

    if (options?.includeSnapshot !== false) {
      await get().pollRunNow(runId);
    }
  },

  stopRunStream: (runId: string) => {
    const timer = runStreamTimers.get(runId);
    if (timer) {
      clearInterval(timer);
      runStreamTimers.delete(runId);
    }

    set((state) => ({
      runStreamState: {
        ...state.runStreamState,
        [runId]: {
          active: false,
          intervalMs:
            state.runStreamState[runId]?.intervalMs ?? DEFAULT_RUN_STREAM_INTERVAL_MS,
          lastPolledAt: state.runStreamState[runId]?.lastPolledAt,
          lastError: state.runStreamState[runId]?.lastError,
        },
      },
    }));
  },

  stopAllRunStreams: () => {
    for (const timer of runStreamTimers.values()) {
      clearInterval(timer);
    }
    runStreamTimers.clear();

    set((state) => {
      const nextRunStreamState: Record<string, WorkflowRunStreamState> = {};
      for (const [runId, streamState] of Object.entries(state.runStreamState)) {
        nextRunStreamState[runId] = {
          ...streamState,
          active: false,
        };
      }
      return {
        runStreamState: nextRunStreamState,
      };
    });
  },

  setRunReplayCursor: (runId: string, eventIndex: number) => {
    set((state) => {
      const events = state.runEventBuffers[runId] || state.runDetails[runId]?.events || [];
      const maxIndex = Math.max(events.length - 1, 0);
      const clamped = Math.max(0, Math.min(eventIndex, maxIndex));

      return {
        runReplayCursor: {
          ...state.runReplayCursor,
          [runId]: clamped,
        },
      };
    });
  },

  advanceRunReplayCursor: (runId: string, step = 1) => {
    set((state) => {
      const events = state.runEventBuffers[runId] || state.runDetails[runId]?.events || [];
      const maxIndex = Math.max(events.length - 1, 0);
      const currentIndex = state.runReplayCursor[runId] ?? 0;
      const nextIndex = Math.max(0, Math.min(currentIndex + step, maxIndex));

      return {
        runReplayCursor: {
          ...state.runReplayCursor,
          [runId]: nextIndex,
        },
      };
    });
  },

  cancelRun: async (runId: string) => {
    const run = await invoke<WorkflowRun>('workflow_cancel_run', { runId });
    set((state) => ({
      runs: rankRuns(upsertRun(state.runs, run)),
      runHealth: {
        ...state.runHealth,
        [runId]: computeRunHealth(run, state.runEventBuffers[runId] || []),
      },
    }));

    get().stopRunStream(runId);
    get().recomputeScheduledHealth();
    return run;
  },

  pauseRun: async (runId: string) => {
    const run = await invoke<WorkflowRun>('workflow_pause_run', { runId });
    set((state) => ({
      runs: rankRuns(upsertRun(state.runs, run)),
      runHealth: {
        ...state.runHealth,
        [runId]: computeRunHealth(run, state.runEventBuffers[runId] || []),
      },
    }));

    get().stopRunStream(runId);
    get().recomputeScheduledHealth();
    return run;
  },

  resumeRun: async (runId: string) => {
    const run = await invoke<WorkflowRun>('workflow_resume_run', { runId });
    set((state) => ({
      runs: rankRuns(upsertRun(state.runs, run)),
      runHealth: {
        ...state.runHealth,
        [runId]: computeRunHealth(run, state.runEventBuffers[runId] || []),
      },
    }));

    if (isStreamableStatus(run.status)) {
      await get().startRunStream(runId, { includeSnapshot: true });
    }
    get().recomputeScheduledHealth();
    return run;
  },

  loadScheduledTasks: async (limit = 200, offset = 0) => {
    try {
      const scheduledTasks = await invoke<WorkflowScheduledTaskSummary[]>(
        'workflow_list_scheduled',
        { limit, offset },
      );
      set({ scheduledTasks });
      get().recomputeScheduledHealth();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  pauseScheduledTask: async (workflowId: string) => {
    await invoke('workflow_pause_scheduled', { workflowId });
    await get().loadScheduledTasks();
  },

  resumeScheduledTask: async (workflowId: string) => {
    await invoke('workflow_resume_scheduled', { workflowId });
    await get().loadScheduledTasks();
  },

  recomputeScheduledHealth: () => {
    set((state) => ({
      scheduledHealth: deriveScheduledHealth(state.scheduledTasks, state.runs),
    }));
  },

  evaluateTriggerMessage: async ({
    message,
    workflowIds,
    minConfidence,
    activationThreshold,
    maxResults,
    autoRun = false,
    runInput,
  }) => {
    set({ triggerEvaluationLoading: true, error: null });
    try {
      const response = await invoke<{
        matches: WorkflowTriggerDiagnosticMatch[];
        activatedRun: WorkflowRun | null;
      }>('workflow_evaluate_triggers', {
        message,
        workflowIds,
        minConfidence,
        activationThreshold,
        maxResults,
        autoRun,
        input: runInput,
      });

      const evaluation: WorkflowTriggerEvaluation = {
        message,
        matches: response.matches || [],
        activatedRun: response.activatedRun || null,
        evaluatedAt: Date.now(),
      };

      set((state) => {
        const nextRuns = evaluation.activatedRun
          ? rankRuns(upsertRun(state.runs, evaluation.activatedRun))
          : state.runs;

        return {
          triggerEvaluation: evaluation,
          triggerEvaluationLoading: false,
          runs: nextRuns,
          selectedRunId: evaluation.activatedRun?.id ?? state.selectedRunId,
          runHealth: evaluation.activatedRun
            ? {
                ...state.runHealth,
                [evaluation.activatedRun.id]: computeRunHealth(
                  evaluation.activatedRun,
                  state.runEventBuffers[evaluation.activatedRun.id] || [],
                ),
              }
            : state.runHealth,
        };
      });

      if (evaluation.activatedRun) {
        await get().startRunStream(evaluation.activatedRun.id, {
          includeSnapshot: true,
        });
      }

      get().recomputeScheduledHealth();
      return evaluation;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      set({
        error: messageText,
        triggerEvaluationLoading: false,
      });
      throw error;
    }
  },

  clearTriggerEvaluation: () => set({ triggerEvaluation: null }),

  setSelectedWorkflow: (workflowId: string | null) => set({ selectedWorkflowId: workflowId }),
  setSelectedRun: (runId: string | null) => set({ selectedRunId: runId }),
  clearError: () => set({ error: null }),
}));
