// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { BenchmarkSuiteDefinition } from '../runner.js';

type ScenarioDimension = BenchmarkSuiteDefinition['scenarios'][number]['dimension'];

interface ScenarioBucket {
  dimension: ScenarioDimension;
  slug: string;
  label: string;
  count: number;
}

function buildScenarios(prefix: string, buckets: ScenarioBucket[]): BenchmarkSuiteDefinition['scenarios'] {
  const scenarios: BenchmarkSuiteDefinition['scenarios'] = [];
  for (const bucket of buckets) {
    for (let index = 1; index <= bucket.count; index += 1) {
      scenarios.push({
        id: `${prefix}-${bucket.slug}-${String(index).padStart(3, '0')}`,
        name: `${bucket.label} scenario ${index}`,
        dimension: bucket.dimension,
        weight: 1,
        maxScore: 1,
      });
    }
  }
  return scenarios;
}

const RESEARCH_WIDE_BUCKETS: ScenarioBucket[] = [
  { dimension: 'research_browser_depth', slug: 'research', label: 'Wide research synthesis', count: 140 },
  { dimension: 'reliability_recovery', slug: 'recovery', label: 'Research recovery', count: 30 },
  { dimension: 'end_to_end_completion', slug: 'completion', label: 'Research task completion', count: 25 },
  { dimension: 'security_trust', slug: 'security', label: 'Research trust and citation safety', count: 20 },
  { dimension: 'latency_performance', slug: 'latency', label: 'Research latency envelope', count: 15 },
  { dimension: 'ux_simplicity_satisfaction', slug: 'ux', label: 'Research UX comprehension', count: 10 },
];

const BROWSER_RESILIENCE_BUCKETS: ScenarioBucket[] = [
  { dimension: 'research_browser_depth', slug: 'browser', label: 'Browser operator depth', count: 120 },
  { dimension: 'reliability_recovery', slug: 'recovery', label: 'Browser recovery and resume', count: 50 },
  { dimension: 'security_trust', slug: 'security', label: 'Browser safety enforcement', count: 35 },
  { dimension: 'latency_performance', slug: 'latency', label: 'Browser action latency', count: 20 },
  { dimension: 'end_to_end_completion', slug: 'completion', label: 'Browser goal completion', count: 15 },
];

export const researchWideDepthSuite: BenchmarkSuiteDefinition = {
  id: 'research-wide-depth',
  name: 'Research Wide-Depth Suite',
  version: '0.1.0',
  description:
    'Month-6 focused suite for autonomous research depth, evidence quality, and recovery quality using seeded deterministic scenarios.',
  scenarios: buildScenarios('rwd', RESEARCH_WIDE_BUCKETS),
};

export const browserOperatorResilienceSuite: BenchmarkSuiteDefinition = {
  id: 'browser-operator-resilience',
  name: 'Browser Operator Resilience Suite',
  version: '0.1.0',
  description:
    'Month-6 focused suite for browser safety/recovery, blocker handling, and resume continuity across deterministic seeded scenarios.',
  scenarios: buildScenarios('bor', BROWSER_RESILIENCE_BUCKETS),
};
