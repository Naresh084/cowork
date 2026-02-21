// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import type { ToolHandler, ToolResult } from '@cowork/core';
import type { Task } from '../types.js';
import { eventEmitter } from '../event-emitter.js';

export interface TaskToolSessionAccessor {
  getTasks: () => Task[];
  setTasks: (tasks: Task[]) => void;
  incrementTaskId: () => number;
  getSessionId: () => string;
}

function computeBlocks(tasks: Task[], taskId: string): string[] {
  return tasks
    .filter((t) => t.blockedBy?.includes(taskId))
    .map((t) => t.id);
}

export function createTaskTools(accessor: TaskToolSessionAccessor): ToolHandler[] {
  const taskCreate: ToolHandler = {
    name: 'task_create',
    description:
      'Create one or more tasks to track progress on multi-step work. Each task gets an auto-incrementing numeric ID.\n\n' +
      'Example:\n' +
      '```json\n' +
      '{ "tasks": [{ "subject": "Implement auth middleware", "description": "Add JWT validation to Express routes", "activeForm": "Implementing auth" }] }\n' +
      '```\n\n' +
      'Fields:\n' +
      '- subject (required): Brief imperative title, e.g. "Fix login bug"\n' +
      '- description (optional): Detailed context, acceptance criteria\n' +
      '- activeForm (optional): Present continuous text shown while task is in_progress, e.g. "Fixing login bug"',
    parameters: z.object({
      tasks: z
        .array(
          z.object({
            subject: z.string().describe('Brief imperative title for the task'),
            description: z.string().optional().describe('Detailed description with context and acceptance criteria'),
            activeForm: z.string().optional().describe('Present continuous text shown during in_progress, e.g. "Running tests"'),
          }),
        )
        .min(1)
        .describe('Array of tasks to create'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const { tasks: taskInputs } = args as {
        tasks: Array<{ subject: string; description?: string; activeForm?: string }>;
      };
      const sessionId = accessor.getSessionId();
      const nowTs = Date.now();
      const created: Task[] = [];

      for (const input of taskInputs) {
        const id = String(accessor.incrementTaskId());
        const task: Task = {
          id,
          subject: input.subject,
          description: input.description,
          status: 'pending',
          activeForm: input.activeForm,
          createdAt: nowTs,
        };
        created.push(task);
      }

      const existing = accessor.getTasks();
      accessor.setTasks([...existing, ...created]);

      for (const task of created) {
        eventEmitter.taskCreate(sessionId, task);
      }

      return {
        success: true,
        data: created.map((t) => ({ id: t.id, subject: t.subject, status: t.status })),
      };
    },
  };

  const taskUpdate: ToolHandler = {
    name: 'task_update',
    description:
      'Update one or more existing tasks. Supports bulk status changes, field updates, and task deletion.\n\n' +
      'Example — mark task in progress:\n' +
      '```json\n' +
      '{ "updates": [{ "id": "1", "status": "in_progress", "activeForm": "Running tests" }] }\n' +
      '```\n\n' +
      'Example — set dependency:\n' +
      '```json\n' +
      '{ "updates": [{ "id": "3", "blockedBy": ["1", "2"] }] }\n' +
      '```\n\n' +
      'Example — delete a task:\n' +
      '```json\n' +
      '{ "updates": [{ "id": "5", "status": "deleted" }] }\n' +
      '```\n\n' +
      'Fields:\n' +
      '- id (required): Task ID to update\n' +
      '- status: "pending" | "in_progress" | "completed" | "deleted"\n' +
      '- subject, description, activeForm: Replace existing value\n' +
      '- blockedBy: Array of task IDs this task depends on',
    parameters: z.object({
      updates: z
        .array(
          z.object({
            id: z.string().describe('Task ID to update'),
            status: z
              .enum(['pending', 'in_progress', 'completed', 'deleted'])
              .optional()
              .describe('New status. "deleted" removes the task.'),
            subject: z.string().optional().describe('New task title'),
            description: z.string().optional().describe('New description'),
            activeForm: z.string().optional().describe('New activeForm text'),
            blockedBy: z
              .array(z.string())
              .optional()
              .describe('Task IDs this task is blocked by'),
          }),
        )
        .min(1)
        .describe('Array of task updates'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const { updates } = args as {
        updates: Array<{
          id: string;
          status?: 'pending' | 'in_progress' | 'completed' | 'deleted';
          subject?: string;
          description?: string;
          activeForm?: string;
          blockedBy?: string[];
        }>;
      };
      const sessionId = accessor.getSessionId();
      const tasks = accessor.getTasks();
      const nowTs = Date.now();
      const results: Array<{ id: string; status: string }> = [];

      for (const update of updates) {
        const idx = tasks.findIndex((t) => t.id === update.id);
        if (idx === -1) {
          results.push({ id: update.id, status: 'not_found' });
          continue;
        }

        if (update.status === 'deleted') {
          tasks.splice(idx, 1);
          accessor.setTasks([...tasks]);
          eventEmitter.taskDelete(sessionId, update.id);
          results.push({ id: update.id, status: 'deleted' });
          continue;
        }

        const task = tasks[idx];
        if (update.subject !== undefined) task.subject = update.subject;
        if (update.description !== undefined) task.description = update.description;
        if (update.activeForm !== undefined) task.activeForm = update.activeForm;
        if (update.blockedBy !== undefined) task.blockedBy = update.blockedBy;
        if (update.status !== undefined) {
          task.status = update.status;
          if (update.status === 'completed') {
            task.completedAt = nowTs;
          }
        }
        task.updatedAt = nowTs;

        accessor.setTasks([...tasks]);
        eventEmitter.taskUpdate(sessionId, task);
        results.push({ id: task.id, status: task.status });
      }

      return { success: true, data: results };
    },
  };

  const taskRemove: ToolHandler = {
    name: 'task_remove',
    description:
      'Remove a task by ID. Use when a task is no longer needed.\n\n' +
      'Example:\n' +
      '```json\n' +
      '{ "id": "3" }\n' +
      '```',
    parameters: z.object({
      id: z.string().describe('Task ID to remove'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const { id } = args as { id: string };
      const sessionId = accessor.getSessionId();
      const tasks = accessor.getTasks();
      const idx = tasks.findIndex((t) => t.id === id);

      if (idx === -1) {
        return { success: false, error: `Task ${id} not found` };
      }

      tasks.splice(idx, 1);
      accessor.setTasks([...tasks]);
      eventEmitter.taskDelete(sessionId, id);

      return { success: true, data: { id, removed: true } };
    },
  };

  const taskList: ToolHandler = {
    name: 'task_list',
    description:
      'List all tasks with their current status, descriptions, and dependencies.\n' +
      'Returns each task with a computed `blocks` field showing which tasks depend on it.\n\n' +
      'Example:\n' +
      '```json\n' +
      '{}\n' +
      '```',
    parameters: z.object({}),
    execute: async (): Promise<ToolResult> => {
      const tasks = accessor.getTasks();
      const enriched = tasks.map((t) => ({
        id: t.id,
        subject: t.subject,
        description: t.description,
        status: t.status,
        activeForm: t.activeForm,
        blockedBy: t.blockedBy,
        blocks: computeBlocks(tasks, t.id),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        completedAt: t.completedAt,
      }));
      return { success: true, data: enriched };
    },
  };

  const taskGet: ToolHandler = {
    name: 'task_get',
    description:
      'Get full details of a single task by ID, including computed `blocks` (tasks that depend on it).\n\n' +
      'Example:\n' +
      '```json\n' +
      '{ "id": "2" }\n' +
      '```',
    parameters: z.object({
      id: z.string().describe('Task ID to retrieve'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const { id } = args as { id: string };
      const tasks = accessor.getTasks();
      const task = tasks.find((t) => t.id === id);

      if (!task) {
        return { success: false, error: `Task ${id} not found` };
      }

      return {
        success: true,
        data: {
          ...task,
          blocks: computeBlocks(tasks, task.id),
        },
      };
    },
  };

  return [taskCreate, taskUpdate, taskRemove, taskList, taskGet];
}
