import { z } from 'zod';

export const BenchmarkDimensionSchema = z.enum([
  'end_to_end_completion',
  'reliability_recovery',
  'memory_quality',
  'workflow_skill_depth',
  'research_browser_depth',
  'ux_simplicity_satisfaction',
  'latency_performance',
  'security_trust',
  'extensibility_ecosystem',
]);
export type BenchmarkDimension = z.infer<typeof BenchmarkDimensionSchema>;

export const BenchmarkSuiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  scenarioCount: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type BenchmarkSuite = z.infer<typeof BenchmarkSuiteSchema>;

export const BenchmarkRunStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type BenchmarkRunStatus = z.infer<typeof BenchmarkRunStatusSchema>;

export const BenchmarkMetricSchema = z.object({
  dimension: BenchmarkDimensionSchema,
  score: z.number(),
  maxScore: z.number().positive(),
  weight: z.number().min(0).max(1),
  threshold: z.number(),
  passed: z.boolean(),
});
export type BenchmarkMetric = z.infer<typeof BenchmarkMetricSchema>;

export const BenchmarkScorecardSchema = z.object({
  runId: z.string(),
  suiteId: z.string(),
  benchmarkScore: z.number(),
  featureChecklistScore: z.number(),
  finalScore: z.number(),
  dimensions: z.array(BenchmarkMetricSchema),
  passed: z.boolean(),
  generatedAt: z.number(),
});
export type BenchmarkScorecard = z.infer<typeof BenchmarkScorecardSchema>;

export const BenchmarkRunSchema = z.object({
  id: z.string(),
  suiteId: z.string(),
  profile: z.string(),
  status: BenchmarkRunStatusSchema,
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  scorecard: BenchmarkScorecardSchema.optional(),
  error: z.string().optional(),
});
export type BenchmarkRun = z.infer<typeof BenchmarkRunSchema>;

export const ReleaseGateStatusSchema = z.object({
  status: z.enum(['pass', 'fail', 'warning']),
  reasons: z.array(z.string()).default([]),
  scorecard: BenchmarkScorecardSchema.optional(),
  evaluatedAt: z.number(),
});
export type ReleaseGateStatus = z.infer<typeof ReleaseGateStatusSchema>;
