// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';

// ============================================================================
// Workflow Lifecycle
// ============================================================================

export const WorkflowStatusSchema = z.enum(['draft', 'published', 'archived']);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowRunStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'failed_recoverable',
]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

export const WorkflowNodeRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
]);
export type WorkflowNodeRunStatus = z.infer<typeof WorkflowNodeRunStatusSchema>;

export const WorkflowEventTypeSchema = z.enum([
  'run_started',
  'run_completed',
  'run_failed',
  'run_paused',
  'run_resumed',
  'run_cancelled',
  'node_started',
  'node_succeeded',
  'node_failed',
  'node_skipped',
]);
export type WorkflowEventType = z.infer<typeof WorkflowEventTypeSchema>;

// ============================================================================
// Triggers
// ============================================================================

export const WorkflowScheduleAtSchema = z.object({
  type: z.literal('at'),
  timestamp: z.number(),
});

export const WorkflowScheduleEverySchema = z.object({
  type: z.literal('every'),
  intervalMs: z.number().min(60000),
  startAt: z.number().optional(),
});

export const WorkflowScheduleCronSchema = z.object({
  type: z.literal('cron'),
  expression: z.string(),
  timezone: z.string().optional(),
});

export const WorkflowScheduleSchema = z.discriminatedUnion('type', [
  WorkflowScheduleAtSchema,
  WorkflowScheduleEverySchema,
  WorkflowScheduleCronSchema,
]);
export type WorkflowSchedule = z.infer<typeof WorkflowScheduleSchema>;

export const WorkflowTriggerSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('manual'),
    enabled: z.boolean().default(true),
  }),
  z.object({
    id: z.string(),
    type: z.literal('chat'),
    enabled: z.boolean().default(true),
    phrases: z.array(z.string()).default([]),
    strictMatch: z.boolean().default(false),
  }),
  z.object({
    id: z.string(),
    type: z.literal('schedule'),
    enabled: z.boolean().default(true),
    schedule: WorkflowScheduleSchema,
    maxRuns: z.number().int().positive().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('webhook'),
    enabled: z.boolean().default(true),
    endpointKey: z.string(),
    authMode: z.enum(['none', 'bearer', 'hmac']).default('none'),
    secretRef: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('integration_event'),
    enabled: z.boolean().default(true),
    platform: z.string(),
    eventType: z.string(),
    channelRef: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('workflow_call'),
    enabled: z.boolean().default(true),
    allowedCallerIds: z.array(z.string()).default([]),
  }),
]);
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

// ============================================================================
// Nodes and Edges
// ============================================================================

export const WorkflowNodeTypeSchema = z.enum([
  'start',
  'end',
  'tool',
  'mcp_tool',
  'connector_tool',
  'agent_step',
  'memory_read',
  'memory_write',
  'condition',
  'parallel',
  'loop',
  'wait',
  'approval',
  'subworkflow',
  'notification',
]);
export type WorkflowNodeType = z.infer<typeof WorkflowNodeTypeSchema>;

export const WorkflowRetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).default(3),
  backoffMs: z.number().int().min(0).default(1000),
  maxBackoffMs: z.number().int().min(0).default(20000),
  jitterRatio: z.number().min(0).max(1).default(0.2),
});
export type WorkflowRetryPolicy = z.infer<typeof WorkflowRetryPolicySchema>;

export const WorkflowRetryProfileSchema = z.enum([
  'fast_safe',
  'balanced',
  'strict_enterprise',
]);
export type WorkflowRetryProfile = z.infer<typeof WorkflowRetryProfileSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: WorkflowNodeTypeSchema,
  name: z.string(),
  config: z.record(z.unknown()).default({}),
  timeoutMs: z.number().int().positive().optional(),
  retryProfile: WorkflowRetryProfileSchema.optional(),
  retry: WorkflowRetryPolicySchema.optional(),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  condition: z.enum(['success', 'failure', 'always', 'custom']).default('success'),
  expression: z.string().optional(),
  label: z.string().optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowDefaultsSchema = z.object({
  workingDirectory: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  maxRunTimeMs: z.number().int().positive().default(30 * 60 * 1000),
  nodeTimeoutMs: z.number().int().positive().default(5 * 60 * 1000),
  retryProfile: WorkflowRetryProfileSchema.optional(),
  retry: WorkflowRetryPolicySchema.default({
    maxAttempts: 3,
    backoffMs: 1000,
    maxBackoffMs: 20000,
    jitterRatio: 0.2,
  }),
});
export type WorkflowDefaults = z.infer<typeof WorkflowDefaultsSchema>;

// ============================================================================
// Workflow Definitions
// ============================================================================

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  status: WorkflowStatusSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).default([]),
  schemaVersion: z.string().default('1'),
  triggers: z.array(WorkflowTriggerSchema).default([]),
  nodes: z.array(WorkflowNodeSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),
  defaults: WorkflowDefaultsSchema.default({
    maxRunTimeMs: 30 * 60 * 1000,
    nodeTimeoutMs: 5 * 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoffMs: 1000,
      maxBackoffMs: 20000,
      jitterRatio: 0.2,
    },
  }),
  permissionsProfile: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.string().optional(),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const WorkflowVersionSchema = z.object({
  workflowId: z.string(),
  version: z.number().int().positive(),
  definition: WorkflowDefinitionSchema,
  publishedAt: z.number(),
});
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;

// ============================================================================
// Runs
// ============================================================================

export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowVersion: z.number().int().positive(),
  triggerType: z.string(),
  triggerContext: z.record(z.unknown()).default({}),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).optional(),
  status: WorkflowRunStatusSchema,
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  currentNodeId: z.string().optional(),
  error: z.string().optional(),
  correlationId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const WorkflowNodeRunSchema = z.object({
  id: z.string(),
  runId: z.string(),
  nodeId: z.string(),
  attempt: z.number().int().positive(),
  status: WorkflowNodeRunStatusSchema,
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  durationMs: z.number().optional(),
});
export type WorkflowNodeRun = z.infer<typeof WorkflowNodeRunSchema>;

export const WorkflowEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  ts: z.number(),
  type: WorkflowEventTypeSchema,
  payload: z.record(z.unknown()).default({}),
});
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

export const WorkflowValidationReportSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type WorkflowValidationReport = z.infer<typeof WorkflowValidationReportSchema>;

export const CreateWorkflowDraftInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
  triggers: z.array(WorkflowTriggerSchema).optional(),
  nodes: z.array(WorkflowNodeSchema).optional(),
  edges: z.array(WorkflowEdgeSchema).optional(),
  defaults: WorkflowDefaultsSchema.optional(),
  permissionsProfile: z.string().optional(),
});
export type CreateWorkflowDraftInput = z.infer<typeof CreateWorkflowDraftInputSchema>;

export const UpdateWorkflowDraftInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
  triggers: z.array(WorkflowTriggerSchema).optional(),
  nodes: z.array(WorkflowNodeSchema).optional(),
  edges: z.array(WorkflowEdgeSchema).optional(),
  defaults: WorkflowDefaultsSchema.optional(),
  permissionsProfile: z.string().optional(),
});
export type UpdateWorkflowDraftInput = z.infer<typeof UpdateWorkflowDraftInputSchema>;

export const WorkflowRunInputSchema = z.object({
  workflowId: z.string(),
  version: z.number().int().positive().optional(),
  input: z.record(z.unknown()).optional(),
  triggerType: z.string().optional(),
  triggerContext: z.record(z.unknown()).optional(),
  correlationId: z.string().optional(),
});
export type WorkflowRunInput = z.infer<typeof WorkflowRunInputSchema>;

export const WorkflowScheduledTaskSummarySchema = z.object({
  workflowId: z.string(),
  workflowVersion: z.number().int().positive(),
  name: z.string(),
  status: WorkflowStatusSchema,
  schedules: z.array(WorkflowScheduleSchema).default([]),
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
  runCount: z.number().int().nonnegative(),
  lastRunAt: z.number().nullable(),
  lastRunStatus: WorkflowRunStatusSchema.nullable(),
});
export type WorkflowScheduledTaskSummary = z.infer<typeof WorkflowScheduledTaskSummarySchema>;

export const CreateWorkflowFromPromptInputSchema = z.object({
  prompt: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  workingDirectory: z.string().optional(),
  publish: z.boolean().optional(),
  maxTurnsPerStep: z.number().int().positive().optional(),
});
export type CreateWorkflowFromPromptInput = z.infer<typeof CreateWorkflowFromPromptInputSchema>;
