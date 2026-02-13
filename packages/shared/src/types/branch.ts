import { z } from 'zod';

export const BranchSessionStatusSchema = z.enum(['active', 'merged', 'abandoned']);
export type BranchSessionStatus = z.infer<typeof BranchSessionStatusSchema>;

export const BranchSessionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  parentBranchId: z.string().optional(),
  fromTurnId: z.string().optional(),
  name: z.string(),
  status: BranchSessionStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type BranchSession = z.infer<typeof BranchSessionSchema>;

export const BranchMergeStrategySchema = z.enum(['auto', 'ours', 'theirs', 'manual']);
export type BranchMergeStrategy = z.infer<typeof BranchMergeStrategySchema>;

export const BranchMergeStatusSchema = z.enum(['merged', 'conflict', 'failed']);
export type BranchMergeStatus = z.infer<typeof BranchMergeStatusSchema>;

export const BranchMergeConflictSchema = z.object({
  id: z.string(),
  path: z.string(),
  reason: z.string(),
  resolution: z.enum(['ours', 'theirs', 'manual']).optional(),
});
export type BranchMergeConflict = z.infer<typeof BranchMergeConflictSchema>;

export const BranchMergeResultSchema = z.object({
  mergeId: z.string(),
  sourceBranchId: z.string(),
  targetBranchId: z.string(),
  strategy: BranchMergeStrategySchema,
  status: BranchMergeStatusSchema,
  conflictCount: z.number().int().nonnegative(),
  conflicts: z.array(BranchMergeConflictSchema).default([]),
  mergedAt: z.number(),
});
export type BranchMergeResult = z.infer<typeof BranchMergeResultSchema>;
