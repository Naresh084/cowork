import { z } from 'zod';

export const MemoryAtomTypeSchema = z.enum([
  'instructions',
  'semantic',
  'episodic',
  'procedural',
  'preference',
  'context',
]);
export type MemoryAtomType = z.infer<typeof MemoryAtomTypeSchema>;

export const MemorySensitivitySchema = z.enum(['normal', 'sensitive', 'restricted']);
export type MemorySensitivity = z.infer<typeof MemorySensitivitySchema>;

export const MemoryAtomSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  runId: z.string().optional(),
  atomType: MemoryAtomTypeSchema,
  content: z.string(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  provenance: z
    .object({
      source: z.enum(['user', 'assistant', 'tool', 'import', 'legacy']),
      sourceRef: z.string().optional(),
      tags: z.array(z.string()).optional(),
      createdBy: z.string().optional(),
    })
    .optional(),
  confidence: z.number().min(0).max(1),
  sensitivity: MemorySensitivitySchema.default('normal'),
  pinned: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
  expiresAt: z.number().optional(),
});
export type MemoryAtom = z.infer<typeof MemoryAtomSchema>;

export const MemoryEdgeTypeSchema = z.enum([
  'supports',
  'contradicts',
  'depends_on',
  'related_to',
  'derived_from',
]);
export type MemoryEdgeType = z.infer<typeof MemoryEdgeTypeSchema>;

export const MemoryEdgeSchema = z.object({
  id: z.string(),
  fromAtomId: z.string(),
  toAtomId: z.string(),
  edgeType: MemoryEdgeTypeSchema,
  weight: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number(),
});
export type MemoryEdge = z.infer<typeof MemoryEdgeSchema>;

export const MemoryQueryOptionsSchema = z.object({
  limit: z.number().int().positive().max(50).default(8),
  includeSensitive: z.boolean().default(false),
  includeGraphExpansion: z.boolean().default(true),
  lexicalWeight: z.number().min(0).max(1).default(0.35),
  denseWeight: z.number().min(0).max(1).default(0.4),
  graphWeight: z.number().min(0).max(1).default(0.15),
  rerankWeight: z.number().min(0).max(1).default(0.1),
});
export type MemoryQueryOptions = z.infer<typeof MemoryQueryOptionsSchema>;

export const MemoryQueryEvidenceSchema = z.object({
  atomId: z.string(),
  score: z.number(),
  reasons: z.array(z.string()).default([]),
});
export type MemoryQueryEvidence = z.infer<typeof MemoryQueryEvidenceSchema>;

export const MemoryQueryResultSchema = z.object({
  queryId: z.string(),
  sessionId: z.string().optional(),
  query: z.string(),
  options: MemoryQueryOptionsSchema,
  evidence: z.array(MemoryQueryEvidenceSchema),
  atoms: z.array(MemoryAtomSchema),
  totalCandidates: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  createdAt: z.number(),
});
export type MemoryQueryResult = z.infer<typeof MemoryQueryResultSchema>;

export const MemoryFeedbackTypeSchema = z.enum([
  'positive',
  'negative',
  'pin',
  'unpin',
  'hide',
  'report_conflict',
]);
export type MemoryFeedbackType = z.infer<typeof MemoryFeedbackTypeSchema>;

export const MemoryFeedbackSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  queryId: z.string(),
  atomId: z.string(),
  feedback: MemoryFeedbackTypeSchema,
  note: z.string().optional(),
  createdAt: z.number(),
});
export type MemoryFeedback = z.infer<typeof MemoryFeedbackSchema>;
