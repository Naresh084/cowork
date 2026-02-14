// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { twinTrackCoreSuite } from './twin-track-core.js';

describe('twinTrackCoreSuite', () => {
  it('contains exactly 600 deterministic scenarios', () => {
    expect(twinTrackCoreSuite.scenarios).toHaveLength(600);
  });

  it('distributes scenarios across all benchmark dimensions', () => {
    const counts = twinTrackCoreSuite.scenarios.reduce<Record<string, number>>((acc, scenario) => {
      acc[scenario.dimension] = (acc[scenario.dimension] || 0) + 1;
      return acc;
    }, {});

    expect(counts.end_to_end_completion).toBe(120);
    expect(counts.reliability_recovery).toBe(90);
    expect(counts.memory_quality).toBe(90);
    expect(counts.workflow_skill_depth).toBe(60);
    expect(counts.research_browser_depth).toBe(70);
    expect(counts.ux_simplicity_satisfaction).toBe(60);
    expect(counts.latency_performance).toBe(40);
    expect(counts.security_trust).toBe(40);
    expect(counts.extensibility_ecosystem).toBe(30);
  });
});
