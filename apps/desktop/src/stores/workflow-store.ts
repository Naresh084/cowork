import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  CreateWorkflowFromPromptInput,
  CreateWorkflowDraftInput,
  UpdateWorkflowDraftInput,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowRun,
  WorkflowScheduledTaskSummary,
  WorkflowRunStatus,
} from '@gemini-cowork/shared';

interface WorkflowRunDetails {
  run: WorkflowRun;
  nodeRuns: Array<Record<string, unknown>>;
  events: WorkflowEvent[];
}

interface WorkflowState {
  workflows: WorkflowDefinition[];
  selectedWorkflowId: string | null;
  runs: WorkflowRun[];
  scheduledTasks: WorkflowScheduledTaskSummary[];
  selectedRunId: string | null;
  runDetails: Record<string, WorkflowRunDetails>;
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
  cancelRun: (runId: string) => Promise<WorkflowRun>;
  pauseRun: (runId: string) => Promise<WorkflowRun>;
  resumeRun: (runId: string) => Promise<WorkflowRun>;
  loadScheduledTasks: (limit?: number, offset?: number) => Promise<void>;
  pauseScheduledTask: (workflowId: string) => Promise<void>;
  resumeScheduledTask: (workflowId: string) => Promise<void>;
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
      runs: [run, ...state.runs],
      selectedRunId: run.id,
    }));

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
      set({ runs });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  getRunDetails: async (runId: string, sinceTs?: number) => {
    const details = await invoke<WorkflowRunDetails>('workflow_get_run', { runId });
    const events = await invoke<WorkflowEvent[]>('workflow_get_run_events', { runId, sinceTs });
    const withEvents: WorkflowRunDetails = {
      ...details,
      events,
    };

    set((state) => ({
      runDetails: {
        ...state.runDetails,
        [runId]: withEvents,
      },
      selectedRunId: runId,
    }));

    return withEvents;
  },

  cancelRun: async (runId: string) => {
    const run = await invoke<WorkflowRun>('workflow_cancel_run', { runId });
    set((state) => ({
      runs: state.runs.map((item) => (item.id === runId ? run : item)),
    }));
    return run;
  },

  pauseRun: async (runId: string) => {
    const run = await invoke<WorkflowRun>('workflow_pause_run', { runId });
    set((state) => ({
      runs: state.runs.map((item) => (item.id === runId ? run : item)),
    }));
    return run;
  },

  resumeRun: async (runId: string) => {
    const run = await invoke<WorkflowRun>('workflow_resume_run', { runId });
    set((state) => ({
      runs: state.runs.map((item) => (item.id === runId ? run : item)),
    }));
    return run;
  },

  loadScheduledTasks: async (limit = 200, offset = 0) => {
    try {
      const scheduledTasks = await invoke<WorkflowScheduledTaskSummary[]>(
        'workflow_list_scheduled',
        { limit, offset },
      );
      set({ scheduledTasks });
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

  setSelectedWorkflow: (workflowId: string | null) => set({ selectedWorkflowId: workflowId }),
  setSelectedRun: (runId: string | null) => set({ selectedRunId: runId }),
  clearError: () => set({ error: null }),
}));
