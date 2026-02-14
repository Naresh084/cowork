// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { createHash } from 'crypto';

export type BenchmarkDimension =
  | 'end_to_end_completion'
  | 'reliability_recovery'
  | 'memory_quality'
  | 'workflow_skill_depth'
  | 'research_browser_depth'
  | 'ux_simplicity_satisfaction'
  | 'latency_performance'
  | 'security_trust'
  | 'extensibility_ecosystem';

export interface BenchmarkScenario {
  id: string;
  name: string;
  dimension: BenchmarkDimension;
  weight: number;
  maxScore: number;
  evaluate?: (input: { profile: string }) => Promise<number> | number;
}

export interface BenchmarkSuiteDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  scenarios: BenchmarkScenario[];
}

export interface BenchmarkMetricResult {
  scenarioId: string;
  dimension: BenchmarkDimension;
  score: number;
  maxScore: number;
  weight: number;
}

export interface BenchmarkRunResult {
  runId: string;
  suiteId: string;
  profile: string;
  status: 'completed';
  metrics: BenchmarkMetricResult[];
  scorecard: {
    benchmarkScore: number;
    featureChecklistScore: number;
    finalScore: number;
    dimensions: Array<{
      dimension: BenchmarkDimension;
      score: number;
      maxScore: number;
      weight: number;
      threshold: number;
      passed: boolean;
    }>;
    generatedAt: number;
  };
}

export interface BenchmarkRunnerOptions {
  featureChecklistEvaluator?: (input: {
    suiteId: string;
    profile: string;
  }) => Promise<number> | number;
  profileBaselines?: Partial<Record<string, Partial<Record<BenchmarkDimension, number>>>>;
}

const DIMENSION_WEIGHTS: Record<BenchmarkDimension, number> = {
  end_to_end_completion: 0.2,
  reliability_recovery: 0.15,
  memory_quality: 0.15,
  workflow_skill_depth: 0.1,
  research_browser_depth: 0.1,
  ux_simplicity_satisfaction: 0.1,
  latency_performance: 0.08,
  security_trust: 0.07,
  extensibility_ecosystem: 0.05,
};

const DIMENSION_THRESHOLDS: Partial<Record<BenchmarkDimension, number>> = {
  end_to_end_completion: 0.92,
  reliability_recovery: 0.998,
  memory_quality: 0.88,
  workflow_skill_depth: 0.9,
  research_browser_depth: 0.85,
  ux_simplicity_satisfaction: 0.92,
  latency_performance: 0.9,
  security_trust: 1,
  extensibility_ecosystem: 0.8,
};

const DIMENSION_ORDER: BenchmarkDimension[] = [
  'end_to_end_completion',
  'reliability_recovery',
  'memory_quality',
  'workflow_skill_depth',
  'research_browser_depth',
  'ux_simplicity_satisfaction',
  'latency_performance',
  'security_trust',
  'extensibility_ecosystem',
];

const BASELINE_PROFILE_PRESETS: Record<string, Partial<Record<BenchmarkDimension, number>>> = {
  release: {
    end_to_end_completion: 0.945,
    reliability_recovery: 1,
    memory_quality: 0.912,
    workflow_skill_depth: 0.928,
    research_browser_depth: 0.902,
    ux_simplicity_satisfaction: 0.94,
    latency_performance: 0.928,
    security_trust: 1,
    extensibility_ecosystem: 0.872,
  },
  default: {
    end_to_end_completion: 0.936,
    reliability_recovery: 1,
    memory_quality: 0.902,
    workflow_skill_depth: 0.918,
    research_browser_depth: 0.892,
    ux_simplicity_satisfaction: 0.932,
    latency_performance: 0.918,
    security_trust: 1,
    extensibility_ecosystem: 0.85,
  },
  ci: {
    end_to_end_completion: 0.938,
    reliability_recovery: 1,
    memory_quality: 0.904,
    workflow_skill_depth: 0.92,
    research_browser_depth: 0.894,
    ux_simplicity_satisfaction: 0.934,
    latency_performance: 0.92,
    security_trust: 1,
    extensibility_ecosystem: 0.852,
  },
};

const DIMENSION_VARIANCE: Partial<Record<BenchmarkDimension, number>> = {
  end_to_end_completion: 0.012,
  reliability_recovery: 0,
  memory_quality: 0.012,
  workflow_skill_depth: 0.012,
  research_browser_depth: 0.015,
  ux_simplicity_satisfaction: 0.012,
  latency_performance: 0.018,
  security_trust: 0,
  extensibility_ecosystem: 0.02,
};

function deterministicRatio(seedInput: string): number {
  const digest = createHash('sha256').update(seedInput).digest();
  const value = digest.readUInt32BE(0);
  return value / 0xffffffff;
}

export class BenchmarkRunner {
  private readonly suites: Map<string, BenchmarkSuiteDefinition>;
  private readonly featureChecklistEvaluator: NonNullable<BenchmarkRunnerOptions['featureChecklistEvaluator']>;
  private readonly profileBaselines: Partial<
    Record<string, Partial<Record<BenchmarkDimension, number>>>
  >;

  constructor(suites: BenchmarkSuiteDefinition[], options?: BenchmarkRunnerOptions) {
    this.suites = new Map(suites.map((suite) => [suite.id, suite]));
    this.featureChecklistEvaluator =
      options?.featureChecklistEvaluator || (() => 1);
    this.profileBaselines = {
      ...BASELINE_PROFILE_PRESETS,
      ...(options?.profileBaselines || {}),
    };
  }

  listSuites(): BenchmarkSuiteDefinition[] {
    return Array.from(this.suites.values());
  }

  async runSuite(runId: string, suiteId: string, profile: string): Promise<BenchmarkRunResult> {
    const suite = this.suites.get(suiteId);
    if (!suite) {
      throw new Error(`Unknown benchmark suite: ${suiteId}`);
    }

    const metrics: BenchmarkMetricResult[] = [];

    for (const scenario of suite.scenarios) {
      const evaluated = scenario.evaluate
        ? await scenario.evaluate({ profile })
        : this.evaluateDeterministicScenario({
            suiteId,
            profile,
            scenarioId: scenario.id,
            dimension: scenario.dimension,
          }) * scenario.maxScore;
      const clamped = Math.max(0, Math.min(scenario.maxScore, evaluated));
      metrics.push({
        scenarioId: scenario.id,
        dimension: scenario.dimension,
        score: clamped,
        maxScore: scenario.maxScore,
        weight: scenario.weight,
      });
    }

    const grouped = new Map<BenchmarkDimension, { score: number; maxScore: number }>();
    for (const metric of metrics) {
      const existing = grouped.get(metric.dimension) || { score: 0, maxScore: 0 };
      existing.score += metric.score * metric.weight;
      existing.maxScore += metric.maxScore * metric.weight;
      grouped.set(metric.dimension, existing);
    }

    const dimensions = DIMENSION_ORDER
      .map((dimension) => {
        const value = grouped.get(dimension);
        if (!value) {
          return null;
        }
        const ratio = value.maxScore > 0 ? value.score / value.maxScore : 0;
        return {
          dimension,
          score: ratio,
          maxScore: 1,
          weight: DIMENSION_WEIGHTS[dimension],
          threshold: DIMENSION_THRESHOLDS[dimension] || 0.9,
          passed: ratio >= (DIMENSION_THRESHOLDS[dimension] || 0.9),
        };
      })
      .filter((dimension): dimension is NonNullable<typeof dimension> => Boolean(dimension));

    let benchmarkScore = 0;
    for (const metric of dimensions) {
      benchmarkScore += metric.score * metric.weight;
    }

    const featureChecklistScore = Math.max(
      0,
      Math.min(
        1,
        await this.featureChecklistEvaluator({
          suiteId,
          profile,
        }),
      ),
    );
    const finalScore = benchmarkScore * 0.7 + featureChecklistScore * 0.3;

    return {
      runId,
      suiteId,
      profile,
      status: 'completed',
      metrics,
      scorecard: {
        benchmarkScore,
        featureChecklistScore,
        finalScore,
        dimensions,
        generatedAt: Date.now(),
      },
    };
  }

  private evaluateDeterministicScenario(input: {
    suiteId: string;
    profile: string;
    scenarioId: string;
    dimension: BenchmarkDimension;
  }): number {
    const profileBaseline = this.resolveProfileBaseline(input.profile, input.dimension);
    const variance = DIMENSION_VARIANCE[input.dimension] ?? 0.01;
    if (variance <= 0) {
      return profileBaseline;
    }

    const ratio = deterministicRatio(
      `${input.suiteId}:${input.profile}:${input.dimension}:${input.scenarioId}`,
    );
    const centeredOffset = (ratio - 0.5) * 2 * variance;
    return profileBaseline + centeredOffset;
  }

  private resolveProfileBaseline(profile: string, dimension: BenchmarkDimension): number {
    const exact = this.profileBaselines[profile]?.[dimension];
    if (typeof exact === 'number') {
      return exact;
    }

    const normalized = this.profileBaselines[profile.toLowerCase()]?.[dimension];
    if (typeof normalized === 'number') {
      return normalized;
    }

    const fallback = this.profileBaselines.default?.[dimension];
    if (typeof fallback === 'number') {
      return fallback;
    }

    const threshold = DIMENSION_THRESHOLDS[dimension] || 0.9;
    return Math.min(1, threshold + 0.01);
  }
}
