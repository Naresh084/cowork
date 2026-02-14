// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { create } from 'zustand';
import { getRemoteClient } from '@/lib/client';
import type { CronJob, WorkflowScheduledTaskSummary } from '@/types/remote';

interface ScheduleState {
  cronJobs: CronJob[];
  workflowTasks: WorkflowScheduledTaskSummary[];
  isLoading: boolean;
  error: string | null;
}

interface ScheduleActions {
  loadAll: () => Promise<void>;
  pauseCronJob: (jobId: string) => Promise<void>;
  resumeCronJob: (jobId: string) => Promise<void>;
  runCronJob: (jobId: string) => Promise<void>;
  pauseWorkflowTask: (workflowId: string) => Promise<void>;
  resumeWorkflowTask: (workflowId: string) => Promise<void>;
  runWorkflowTask: (workflowId: string) => Promise<void>;
  reset: () => void;
}

const initialState: ScheduleState = {
  cronJobs: [],
  workflowTasks: [],
  isLoading: false,
  error: null,
};

export const useScheduleStore = create<ScheduleState & ScheduleActions>((set, get) => ({
  ...initialState,

  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [cronJobs, workflowTasks] = await Promise.all([
        getRemoteClient().listCronJobs(),
        getRemoteClient().listScheduledWorkflows(),
      ]);
      set({ cronJobs, workflowTasks, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  pauseCronJob: async (jobId) => {
    await getRemoteClient().pauseCronJob(jobId);
    await get().loadAll();
  },

  resumeCronJob: async (jobId) => {
    await getRemoteClient().resumeCronJob(jobId);
    await get().loadAll();
  },

  runCronJob: async (jobId) => {
    await getRemoteClient().runCronJob(jobId);
    await get().loadAll();
  },

  pauseWorkflowTask: async (workflowId) => {
    await getRemoteClient().pauseScheduledWorkflow(workflowId);
    await get().loadAll();
  },

  resumeWorkflowTask: async (workflowId) => {
    await getRemoteClient().resumeScheduledWorkflow(workflowId);
    await get().loadAll();
  },

  runWorkflowTask: async (workflowId) => {
    await getRemoteClient().runScheduledWorkflow(workflowId);
    await get().loadAll();
  },

  reset: () => set({ ...initialState }),
}));
