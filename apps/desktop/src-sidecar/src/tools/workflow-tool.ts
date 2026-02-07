import { z } from 'zod';
import type { ToolHandler, ToolResult } from '@gemini-cowork/core';
import { workflowService } from '../workflow/index.js';
import type {
  CreateWorkflowFromPromptInput,
  CreateWorkflowDraftInput,
  UpdateWorkflowDraftInput,
  WorkflowRunStatus,
} from '@gemini-cowork/shared';

export function createCreateWorkflowTool(): ToolHandler {
  return {
    name: 'create_workflow',
    description: 'Create a workflow draft from structured nodes/triggers definition.',
    parameters: z.object({
      name: z.string(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      triggers: z.array(z.record(z.unknown())).optional(),
      nodes: z.array(z.record(z.unknown())).optional(),
      edges: z.array(z.record(z.unknown())).optional(),
      defaults: z.record(z.unknown()).optional(),
      permissionsProfile: z.string().optional(),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      try {
        const input = args as CreateWorkflowDraftInput;
        const draft = workflowService.createDraft(input);
        return {
          success: true,
          data: {
            workflowId: draft.id,
            version: draft.version,
            status: draft.status,
            message: `Workflow draft created: ${draft.name}`,
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
}

export function createUpdateWorkflowTool(): ToolHandler {
  return {
    name: 'update_workflow',
    description: 'Update an existing workflow draft.',
    parameters: z.object({
      workflowId: z.string(),
      updates: z.record(z.unknown()),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const { workflowId, updates } = args as {
        workflowId: string;
        updates: UpdateWorkflowDraftInput;
      };

      try {
        const draft = workflowService.updateDraft(workflowId, updates);
        return {
          success: true,
          data: {
            workflowId: draft.id,
            version: draft.version,
            status: draft.status,
            message: `Workflow draft updated: ${draft.name}`,
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
}

export function createPublishWorkflowTool(): ToolHandler {
  return {
    name: 'publish_workflow',
    description: 'Publish the current workflow draft as a new immutable version.',
    parameters: z.object({
      workflowId: z.string(),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const { workflowId } = args as { workflowId: string };

      try {
        const published = workflowService.publish(workflowId);
        return {
          success: true,
          data: {
            workflowId: published.id,
            version: published.version,
            status: published.status,
            message: `Workflow published: ${published.name} v${published.version}`,
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
}

export function createRunWorkflowTool(): ToolHandler {
  return {
    name: 'run_workflow',
    description: 'Run a workflow manually with optional input payload.',
    parameters: z.object({
      workflowId: z.string(),
      version: z.number().int().positive().optional(),
      input: z.record(z.unknown()).optional(),
      correlationId: z.string().optional(),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const { workflowId, version, input, correlationId } = args as {
        workflowId: string;
        version?: number;
        input?: Record<string, unknown>;
        correlationId?: string;
      };

      try {
        const run = await workflowService.run({
          workflowId,
          version,
          input,
          triggerType: 'manual',
          correlationId,
        });

        return {
          success: true,
          data: {
            runId: run.id,
            workflowId: run.workflowId,
            workflowVersion: run.workflowVersion,
            status: run.status,
            message: `Workflow run queued: ${run.id}`,
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
}

export function createWorkflowFromChatTool(): ToolHandler {
  return {
    name: 'create_workflow_from_chat',
    description:
      'Build a workflow draft from a natural-language workflow specification. Useful for chat-based workflow authoring.',
    parameters: z.object({
      prompt: z
        .string()
        .describe('Natural language workflow description, including trigger/schedule details if any.'),
      name: z.string().optional().describe('Optional workflow name override.'),
      workingDirectory: z.string().optional().describe('Optional working directory for generated steps.'),
      publish: z.boolean().optional().describe('Whether to publish immediately after draft creation.'),
      maxTurnsPerStep: z.number().int().positive().optional().describe('Max agent turns per generated step.'),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const input = args as CreateWorkflowFromPromptInput;
      try {
        const workflow = workflowService.createFromPrompt(input);
        return {
          success: true,
          data: {
            workflowId: workflow.id,
            version: workflow.version,
            status: workflow.status,
            name: workflow.name,
            message:
              workflow.status === 'published'
                ? `Workflow created and published: ${workflow.name}`
                : `Workflow draft created from chat: ${workflow.name}`,
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
}

export function createManageWorkflowTool(): ToolHandler {
  return {
    name: 'manage_workflow',
    description:
      'List/get/archive workflows, inspect scheduled workflows, or pause/resume/cancel workflow runs.',
    parameters: z.object({
      action: z.enum([
        'list',
        'get',
        'archive',
        'list_scheduled',
        'pause_scheduled',
        'resume_scheduled',
        'pause_run',
        'resume_run',
        'cancel_run',
      ]),
      workflowId: z.string().optional(),
      runId: z.string().optional(),
      version: z.number().int().positive().optional(),
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const parsed = args as {
        action:
          | 'list'
          | 'get'
          | 'archive'
          | 'list_scheduled'
          | 'pause_scheduled'
          | 'resume_scheduled'
          | 'pause_run'
          | 'resume_run'
          | 'cancel_run';
        workflowId?: string;
        runId?: string;
        version?: number;
        limit?: number;
        offset?: number;
      };

      try {
        switch (parsed.action) {
          case 'list': {
            const workflows = workflowService.list(parsed.limit, parsed.offset);
            return {
              success: true,
              data: {
                count: workflows.length,
                workflows: workflows.map((wf) => ({
                  id: wf.id,
                  name: wf.name,
                  version: wf.version,
                  status: wf.status,
                  updatedAt: wf.updatedAt,
                })),
              },
            };
          }
          case 'get': {
            if (!parsed.workflowId) {
              return { success: false, error: 'workflowId is required for get action' };
            }

            const workflow = workflowService.get(parsed.workflowId, parsed.version);
            if (!workflow) {
              return { success: false, error: `Workflow not found: ${parsed.workflowId}` };
            }

            return {
              success: true,
              data: workflow,
            };
          }
          case 'archive': {
            if (!parsed.workflowId) {
              return { success: false, error: 'workflowId is required for archive action' };
            }

            const archived = workflowService.archive(parsed.workflowId);
            return {
              success: true,
              data: {
                workflowId: archived.id,
                status: archived.status,
                message: `Workflow archived: ${archived.name}`,
              },
            };
          }
          case 'list_scheduled': {
            const tasks = workflowService.listScheduledTasks(parsed.limit, parsed.offset);
            return {
              success: true,
              data: {
                count: tasks.length,
                tasks,
              },
            };
          }
          case 'pause_scheduled': {
            if (!parsed.workflowId) {
              return { success: false, error: 'workflowId is required for pause_scheduled action' };
            }
            const result = workflowService.pauseScheduledWorkflow(parsed.workflowId);
            return { success: true, data: result };
          }
          case 'resume_scheduled': {
            if (!parsed.workflowId) {
              return { success: false, error: 'workflowId is required for resume_scheduled action' };
            }
            const result = workflowService.resumeScheduledWorkflow(parsed.workflowId);
            return { success: true, data: result };
          }
          case 'pause_run': {
            if (!parsed.runId) return { success: false, error: 'runId is required for pause_run' };
            const run = workflowService.pauseRun(parsed.runId);
            return { success: true, data: run };
          }
          case 'resume_run': {
            if (!parsed.runId) return { success: false, error: 'runId is required for resume_run' };
            const run = await workflowService.resumeRun(parsed.runId);
            return { success: true, data: run };
          }
          case 'cancel_run': {
            if (!parsed.runId) return { success: false, error: 'runId is required for cancel_run' };
            const run = workflowService.cancelRun(parsed.runId);
            return { success: true, data: run };
          }
          default:
            return { success: false, error: `Unknown action: ${(parsed as { action: string }).action}` };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function createGetWorkflowRunsTool(): ToolHandler {
  return {
    name: 'get_workflow_runs',
    description: 'List workflow runs and inspect run details/events.',
    parameters: z.object({
      workflowId: z.string().optional(),
      status: z
        .enum(['queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'failed_recoverable'])
        .optional(),
      runId: z.string().optional(),
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
      sinceTs: z.number().optional(),
    }),
    execute: async (args: unknown): Promise<ToolResult> => {
      const parsed = args as {
        workflowId?: string;
        status?: WorkflowRunStatus;
        runId?: string;
        limit?: number;
        offset?: number;
        sinceTs?: number;
      };

      try {
        if (parsed.runId) {
          const details = workflowService.getRun(parsed.runId);
          return {
            success: true,
            data: {
              ...details,
              events: workflowService.getRunEvents(parsed.runId, parsed.sinceTs),
            },
          };
        }

        const runs = workflowService.listRuns({
          workflowId: parsed.workflowId,
          status: parsed.status,
          limit: parsed.limit,
          offset: parsed.offset,
        });

        return {
          success: true,
          data: {
            count: runs.length,
            runs,
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
}

export function createWorkflowTools(): ToolHandler[] {
  return [
    createCreateWorkflowTool(),
    createWorkflowFromChatTool(),
    createUpdateWorkflowTool(),
    createPublishWorkflowTool(),
    createRunWorkflowTool(),
    createManageWorkflowTool(),
    createGetWorkflowRunsTool(),
  ];
}
