// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { BenchmarkSuiteDefinition } from '../runner.js';

type ScenarioDimension = BenchmarkSuiteDefinition['scenarios'][number]['dimension'];

interface ScenarioPlan {
  dimension: ScenarioDimension;
  slug: string;
  label: string;
  count: number;
}

const SCENARIO_PLANS: ScenarioPlan[] = [
  { dimension: 'end_to_end_completion', slug: 'e2e', label: 'End-to-end coding', count: 120 },
  { dimension: 'reliability_recovery', slug: 'recovery', label: 'Reliability recovery', count: 90 },
  { dimension: 'memory_quality', slug: 'memory', label: 'Memory quality', count: 90 },
  { dimension: 'workflow_skill_depth', slug: 'workflow', label: 'Workflow depth', count: 60 },
  { dimension: 'research_browser_depth', slug: 'research', label: 'Research/browser depth', count: 70 },
  { dimension: 'ux_simplicity_satisfaction', slug: 'ux', label: 'UX simplicity', count: 60 },
  { dimension: 'latency_performance', slug: 'latency', label: 'Latency/performance', count: 40 },
  { dimension: 'security_trust', slug: 'security', label: 'Security/trust', count: 40 },
  { dimension: 'extensibility_ecosystem', slug: 'ecosystem', label: 'Extensibility ecosystem', count: 30 },
];

function buildScenarios() {
  const scenarios: BenchmarkSuiteDefinition['scenarios'] = [];

  for (const plan of SCENARIO_PLANS) {
    for (let index = 1; index <= plan.count; index += 1) {
      scenarios.push({
        id: `${plan.slug}-${String(index).padStart(3, '0')}`,
        name: `${plan.label} scenario ${index}`,
        dimension: plan.dimension,
        weight: 1,
        maxScore: 1,
      });
    }
  }

  return scenarios;
}

export const twinTrackCoreSuite: BenchmarkSuiteDefinition = {
  id: 'twin-track-core',
  name: 'Twin-Track Core Suite',
  version: '0.2.0',
  description:
    'Deterministic comparability suite for reliability, memory, workflow, research, browser, and UX depth with 600 seeded scenarios.',
  scenarios: buildScenarios(),
};
