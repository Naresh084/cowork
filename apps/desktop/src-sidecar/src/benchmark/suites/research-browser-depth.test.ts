// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import {
  browserOperatorResilienceSuite,
  researchWideDepthSuite,
} from './research-browser-depth.js';

function dimensionCounts(scenarios: Array<{ dimension: string }>): Record<string, number> {
  return scenarios.reduce<Record<string, number>>((acc, scenario) => {
    acc[scenario.dimension] = (acc[scenario.dimension] || 0) + 1;
    return acc;
  }, {});
}

describe('research/browser month-6 suites', () => {
  it('builds deterministic research-wide suite shape', () => {
    expect(researchWideDepthSuite.scenarios).toHaveLength(240);
    const counts = dimensionCounts(researchWideDepthSuite.scenarios);
    expect(counts.research_browser_depth).toBe(140);
    expect(counts.reliability_recovery).toBe(30);
    expect(counts.end_to_end_completion).toBe(25);
    expect(counts.security_trust).toBe(20);
    expect(counts.latency_performance).toBe(15);
    expect(counts.ux_simplicity_satisfaction).toBe(10);
  });

  it('builds deterministic browser resilience suite shape', () => {
    expect(browserOperatorResilienceSuite.scenarios).toHaveLength(240);
    const counts = dimensionCounts(browserOperatorResilienceSuite.scenarios);
    expect(counts.research_browser_depth).toBe(120);
    expect(counts.reliability_recovery).toBe(50);
    expect(counts.security_trust).toBe(35);
    expect(counts.latency_performance).toBe(20);
    expect(counts.end_to_end_completion).toBe(15);
  });

  it('keeps scenario ids unique across both suites', () => {
    const ids = [
      ...researchWideDepthSuite.scenarios.map((scenario) => scenario.id),
      ...browserOperatorResilienceSuite.scenarios.map((scenario) => scenario.id),
    ];
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
