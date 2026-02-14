// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { describe, expect, it } from 'vitest';
import { BenchmarkRunner } from './runner.js';
import { BENCHMARK_SUITES } from './suites/index.js';

const MIN_SCENARIO_COUNT = 600;
const MIN_BENCHMARK_SCORE = 0.9;
const MIN_FINAL_SCORE = 0.92;

describe('benchmark regression gate', () => {
  it('keeps twin-track benchmark score above regression threshold', async () => {
    const suite = BENCHMARK_SUITES.find((candidate) => candidate.id === 'twin-track-core');
    expect(suite).toBeDefined();
    expect(suite?.scenarios.length).toBeGreaterThanOrEqual(MIN_SCENARIO_COUNT);

    const runner = new BenchmarkRunner(BENCHMARK_SUITES);
    const result = await runner.runSuite('ci-regression', suite!.id, 'release');

    expect(result.scorecard.benchmarkScore).toBeGreaterThanOrEqual(MIN_BENCHMARK_SCORE);
    expect(result.scorecard.finalScore).toBeGreaterThanOrEqual(MIN_FINAL_SCORE);
    expect(result.scorecard.featureChecklistScore).toBe(1);
    expect(result.scorecard.dimensions.every((dimension) => dimension.passed)).toBe(true);
  });
});
