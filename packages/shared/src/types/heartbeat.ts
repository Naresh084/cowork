import { z } from 'zod';

// ============================================================================
// Heartbeat Configuration
// ============================================================================

/**
 * Heartbeat service configuration
 */
export const HeartbeatConfigSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMs: z.number().min(1000).default(60000).describe('Heartbeat interval in ms (min 1 second)'),
  systemEventsEnabled: z.boolean().default(true),
  cronEnabled: z.boolean().default(true),
});

export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;

// ============================================================================
// Wake Mode
// ============================================================================

/**
 * Wake mode for triggering heartbeat
 */
export const WakeModeSchema = z.enum(['next-heartbeat', 'now']);
export type WakeMode = z.infer<typeof WakeModeSchema>;

// ============================================================================
// System Events
// ============================================================================

/**
 * System event types
 */
export const SystemEventTypeSchema = z.enum([
  'cron:trigger',
  'session:compact',
  'context:prune',
  'memory:sync',
  'health:check',
  'custom',
]);

export type SystemEventType = z.infer<typeof SystemEventTypeSchema>;

/**
 * Event priority levels
 */
export const EventPrioritySchema = z.enum(['low', 'normal', 'high']);
export type EventPriority = z.infer<typeof EventPrioritySchema>;

/**
 * System event definition
 */
export const SystemEventSchema = z.object({
  id: z.string(),
  type: SystemEventTypeSchema,
  payload: z.record(z.unknown()).optional(),
  scheduledAt: z.number(),
  priority: EventPrioritySchema,
  sessionId: z.string().optional(),
});

export type SystemEvent = z.infer<typeof SystemEventSchema>;

/**
 * Input for creating a system event (without auto-generated fields)
 */
export const CreateSystemEventInputSchema = z.object({
  type: SystemEventTypeSchema,
  payload: z.record(z.unknown()).optional(),
  priority: EventPrioritySchema.default('normal'),
  sessionId: z.string().optional(),
});

export type CreateSystemEventInput = z.infer<typeof CreateSystemEventInputSchema>;

// ============================================================================
// Heartbeat Status
// ============================================================================

/**
 * Heartbeat service status
 */
export const HeartbeatStatusSchema = z.object({
  isRunning: z.boolean(),
  lastHeartbeat: z.number(),
  nextHeartbeat: z.number(),
  eventQueueSize: z.number(),
  isProcessing: z.boolean(),
});

export type HeartbeatStatus = z.infer<typeof HeartbeatStatusSchema>;

// ============================================================================
// Cron Trigger Event Payload
// ============================================================================

/**
 * Payload for cron:trigger system event
 */
export const CronTriggerPayloadSchema = z.object({
  jobId: z.string(),
  jobName: z.string(),
  prompt: z.string(),
  runId: z.string(),
});

export type CronTriggerPayload = z.infer<typeof CronTriggerPayloadSchema>;
