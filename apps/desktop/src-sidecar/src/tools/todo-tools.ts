import { z } from 'zod';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import { eventEmitter } from '../event-emitter.js';
import type { Task } from '../types.js';

// ============================================================================
// Todo Tools - DeepAgents Pattern
// ============================================================================

/**
 * In-memory storage for todos per session.
 * In a production system, this would be persisted.
 */
const sessionTodos: Map<string, Task[]> = new Map();

/**
 * Generate a unique task ID.
 */
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get tasks for a session.
 */
export function getSessionTasks(sessionId: string): Task[] {
  return sessionTodos.get(sessionId) || [];
}

/**
 * Set tasks for a session.
 */
export function setSessionTasks(sessionId: string, tasks: Task[]): void {
  sessionTodos.set(sessionId, tasks);
}

/**
 * Write todos - Update the task list for tracking progress on complex tasks.
 *
 * This tool enables DeepAgents-style task tracking where the agent can:
 * - Break down complex tasks into manageable steps
 * - Mark tasks as pending, in_progress, or completed
 * - Update the UI with real-time progress
 */
export const writeTodosTool: ToolHandler = {
  name: 'write_todos',
  description: `Update the task list for tracking progress on complex tasks.
Use this tool to:
- Break down complex tasks into smaller steps
- Mark tasks as 'pending', 'in_progress', or 'completed'
- Track your progress as you work through multi-step problems

The UI will update to show task progress in real-time.`,

  parameters: z.object({
    todos: z.array(z.object({
      status: z.enum(['pending', 'in_progress', 'completed']).describe('The current status of the task'),
      content: z.string().describe('Description of what needs to be done'),
    })).describe('Array of tasks to set. This replaces the existing task list.'),
  }),

  execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
    const { todos } = args as { todos: Array<{ status: 'pending' | 'in_progress' | 'completed'; content: string }> };
    const { sessionId } = context;

    try {
      // Convert to Task format with IDs
      const tasks: Task[] = todos.map((todo) => ({
        id: generateTaskId(),
        subject: todo.content,
        status: todo.status,
        createdAt: Date.now(),
      }));

      // Store tasks for this session
      setSessionTasks(sessionId, tasks);

      // Emit task updates to the frontend
      for (const task of tasks) {
        eventEmitter.taskUpdate(sessionId, task);
      }

      // Flush to ensure events are sent
      eventEmitter.flushSync();

      return {
        success: true,
        data: {
          message: `Updated task list with ${tasks.length} task(s)`,
          taskCount: tasks.length,
          tasks: tasks.map(t => ({
            id: t.id,
            status: t.status,
            content: t.subject,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

/**
 * Read todos - Read the current task list.
 *
 * This tool allows the agent to check the current state of tasks
 * and make decisions based on what's been completed.
 */
export const readTodosTool: ToolHandler = {
  name: 'read_todos',
  description: `Read the current task list.
Use this to check what tasks exist, their status, and what still needs to be done.`,

  parameters: z.object({}),

  execute: async (_args: unknown, context: ToolContext): Promise<ToolResult> => {
    const { sessionId } = context;

    try {
      const tasks = getSessionTasks(sessionId);

      return {
        success: true,
        data: {
          taskCount: tasks.length,
          tasks: tasks.map(t => ({
            id: t.id,
            status: t.status,
            content: t.subject,
          })),
          summary: {
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            inProgress: tasks.filter(t => t.status === 'in_progress').length,
            completed: tasks.filter(t => t.status === 'completed').length,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

/**
 * All todo tools exported as an array for easy registration.
 */
export const TODO_TOOLS: ToolHandler[] = [writeTodosTool, readTodosTool];
