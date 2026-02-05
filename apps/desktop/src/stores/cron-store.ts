import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  CronJob,
  CronRun,
  CronSchedule,
  CreateCronJobInput,
  UpdateCronJobInput,
  CronServiceStatus,
} from '@gemini-cowork/shared';

// ============================================================================
// State Interface
// ============================================================================

interface CronState {
  // Data
  jobs: CronJob[];
  selectedJobId: string | null;
  runHistory: Record<string, CronRun[]>; // jobId -> runs
  status: CronServiceStatus | null;

  // UI State
  isLoading: boolean;
  isModalOpen: boolean;
  editorMode: 'create' | 'edit' | null;
  historyJobId: string | null; // Job ID for history panel
  error: string | null;

  // Computed (derived from jobs)
  activeJobCount: number;
  nextRunJob: CronJob | null;
}

interface CronActions {
  // Data fetching
  loadJobs: () => Promise<void>;
  loadStatus: () => Promise<void>;
  loadRunHistory: (jobId: string, limit?: number) => Promise<void>;
  refreshAll: () => Promise<void>;

  // Job CRUD
  createJob: (input: CreateCronJobInput) => Promise<CronJob>;
  updateJob: (jobId: string, updates: UpdateCronJobInput) => Promise<CronJob>;
  deleteJob: (jobId: string) => Promise<void>;

  // Job actions
  pauseJob: (jobId: string) => Promise<void>;
  resumeJob: (jobId: string) => Promise<void>;
  triggerJob: (jobId: string) => Promise<CronRun>;

  // UI actions
  openModal: () => void;
  closeModal: () => void;
  startCreate: () => void;
  startEdit: (jobId: string) => void;
  closeEditor: () => void;
  viewHistory: (jobId: string) => void;
  closeHistory: () => void;
  selectJob: (jobId: string | null) => void;
  clearError: () => void;

  // Helpers
  getJob: (jobId: string) => CronJob | undefined;
  getJobRuns: (jobId: string) => CronRun[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function computeDerivedState(jobs: CronJob[]): {
  activeJobCount: number;
  nextRunJob: CronJob | null;
} {
  const activeJobs = jobs.filter((j) => j.status === 'active');
  const nextJob =
    activeJobs
      .filter((j) => j.nextRunAt)
      .sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0))[0] || null;

  return {
    activeJobCount: activeJobs.length,
    nextRunJob: nextJob,
  };
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useCronStore = create<CronState & CronActions>((set, get) => ({
  // Initial state
  jobs: [],
  selectedJobId: null,
  runHistory: {},
  status: null,
  isLoading: false,
  isModalOpen: false,
  editorMode: null,
  historyJobId: null,
  error: null,
  activeJobCount: 0,
  nextRunJob: null,

  // Data fetching
  loadJobs: async () => {
    set({ isLoading: true, error: null });
    try {
      const jobs = await invoke<CronJob[]>('cron_list_jobs');
      const derived = computeDerivedState(jobs);

      set({
        jobs,
        ...derived,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  loadStatus: async () => {
    try {
      const status = await invoke<CronServiceStatus>('cron_get_status');
      set({ status });
    } catch (error) {
      console.error('Failed to load cron status:', error);
    }
  },

  loadRunHistory: async (jobId: string, limit = 20) => {
    try {
      const runs = await invoke<CronRun[]>('cron_get_runs', {
        jobId,
        limit,
      });
      set((state) => ({
        runHistory: { ...state.runHistory, [jobId]: runs },
      }));
    } catch (error) {
      console.error('Failed to load run history:', error);
    }
  },

  refreshAll: async () => {
    const { loadJobs, loadStatus } = get();
    await Promise.all([loadJobs(), loadStatus()]);
  },

  // Job CRUD
  createJob: async (input: CreateCronJobInput) => {
    set({ isLoading: true, error: null });
    try {
      const job = await invoke<CronJob>('cron_create_job', { input });
      set((state) => {
        const newJobs = [...state.jobs, job];
        const derived = computeDerivedState(newJobs);
        return {
          jobs: newJobs,
          ...derived,
          isLoading: false,
          editorMode: null,
        };
      });
      return job;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
      throw error;
    }
  },

  updateJob: async (jobId: string, updates: UpdateCronJobInput) => {
    set({ isLoading: true, error: null });
    try {
      const job = await invoke<CronJob>('cron_update_job', { jobId, input: updates });
      set((state) => {
        const newJobs = state.jobs.map((j) => (j.id === jobId ? job : j));
        const derived = computeDerivedState(newJobs);
        return {
          jobs: newJobs,
          ...derived,
          isLoading: false,
          editorMode: null,
        };
      });
      return job;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
      throw error;
    }
  },

  deleteJob: async (jobId: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('cron_delete_job', { jobId });
      set((state) => {
        const newJobs = state.jobs.filter((j) => j.id !== jobId);
        const derived = computeDerivedState(newJobs);
        return {
          jobs: newJobs,
          selectedJobId: state.selectedJobId === jobId ? null : state.selectedJobId,
          ...derived,
          isLoading: false,
        };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
      throw error;
    }
  },

  // Job actions
  pauseJob: async (jobId: string) => {
    try {
      const job = await invoke<CronJob>('cron_pause_job', { jobId });
      set((state) => {
        const newJobs = state.jobs.map((j) => (j.id === jobId ? job : j));
        const derived = computeDerivedState(newJobs);
        return {
          jobs: newJobs,
          ...derived,
        };
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  resumeJob: async (jobId: string) => {
    try {
      const job = await invoke<CronJob>('cron_resume_job', { jobId });
      set((state) => {
        const newJobs = state.jobs.map((j) => (j.id === jobId ? job : j));
        const derived = computeDerivedState(newJobs);
        return {
          jobs: newJobs,
          ...derived,
        };
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  triggerJob: async (jobId: string) => {
    try {
      const run = await invoke<CronRun>('cron_trigger_job', { jobId });
      // Reload job to get updated state
      await get().loadJobs();
      // Update run history if we have it loaded
      const { runHistory } = get();
      if (runHistory[jobId]) {
        set((state) => ({
          runHistory: {
            ...state.runHistory,
            [jobId]: [run, ...state.runHistory[jobId]],
          },
        }));
      }
      return run;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  // UI actions
  openModal: () => set({ isModalOpen: true }),
  closeModal: () =>
    set({ isModalOpen: false, editorMode: null, historyJobId: null }),
  startCreate: () => set({ editorMode: 'create', selectedJobId: null }),
  startEdit: (jobId: string) => set({ editorMode: 'edit', selectedJobId: jobId }),
  closeEditor: () => set({ editorMode: null }),
  viewHistory: (jobId: string) => {
    set({ historyJobId: jobId });
    get().loadRunHistory(jobId);
  },
  closeHistory: () => set({ historyJobId: null }),
  selectJob: (jobId: string | null) => set({ selectedJobId: jobId }),
  clearError: () => set({ error: null }),

  // Helpers
  getJob: (jobId: string) => get().jobs.find((j) => j.id === jobId),
  getJobRuns: (jobId: string) => get().runHistory[jobId] || [],
}));

// ============================================================================
// Selectors
// ============================================================================

export const useActiveJobs = () =>
  useCronStore((state) => state.jobs.filter((j) => j.status === 'active'));

export const usePausedJobs = () =>
  useCronStore((state) => state.jobs.filter((j) => j.status === 'paused'));

export const useCompletedJobs = () =>
  useCronStore((state) => state.jobs.filter((j) => j.status === 'completed'));

export const useNextRunTime = () =>
  useCronStore((state) => state.nextRunJob?.nextRunAt);

export function useCronModalState() {
  const isOpen = useCronStore((state) => state.isModalOpen);
  const editorMode = useCronStore((state) => state.editorMode);
  const historyJobId = useCronStore((state) => state.historyJobId);
  return { isOpen, editorMode, historyJobId };
}

export const useCronActiveJobCount = () =>
  useCronStore((state) => state.activeJobCount);

export const useCronNextRunJob = () => useCronStore((state) => state.nextRunJob);

// Export schedule type for external use
export type { CronSchedule };
