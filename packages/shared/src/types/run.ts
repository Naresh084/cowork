// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';

export const RunStateSchema = z.enum([
  'queued',
  'running',
  'waiting_permission',
  'waiting_question',
  'retrying',
  'paused',
  'recovered',
  'completed',
  'failed',
  'cancelled',
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const RunCheckpointSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sessionId: z.string(),
  branchId: z.string().optional(),
  checkpointIndex: z.number().int().nonnegative(),
  stage: z.string(),
  state: z.record(z.unknown()),
  createdAt: z.number(),
});
export type RunCheckpoint = z.infer<typeof RunCheckpointSchema>;

export const RunRecoveryStateSchema = z.object({
  runId: z.string(),
  sessionId: z.string(),
  status: z.enum(['recoverable', 'recovered', 'unrecoverable']),
  resumeFromCheckpointId: z.string().optional(),
  reason: z.string().optional(),
  recoveredAt: z.number().optional(),
});
export type RunRecoveryState = z.infer<typeof RunRecoveryStateSchema>;
