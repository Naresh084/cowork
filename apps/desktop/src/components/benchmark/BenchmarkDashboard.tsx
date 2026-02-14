// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useMemo } from 'react';
import { Activity, BarChart3, Loader2, Play, ShieldCheck, TrendingUp } from 'lucide-react';
import { useBenchmarkStore } from '@/stores/benchmark-store';
import { ReleaseGatePanel } from './ReleaseGatePanel';

function percent(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

export function BenchmarkDashboard() {
  const latestScorecard = useBenchmarkStore((state) => state.latestScorecard);
  const latestRunId = useBenchmarkStore((state) => state.latestRunId);
  const scoreHistory = useBenchmarkStore((state) => state.scoreHistory);
  const latestRunHealth = useBenchmarkStore((state) => state.latestRunHealth);
  const runs = useBenchmarkStore((state) => state.runs);
  const runBenchmarkSuite = useBenchmarkStore((state) => state.runBenchmarkSuite);
  const assertReleaseGateForLaunch = useBenchmarkStore((state) => state.assertReleaseGateForLaunch);
  const releaseGateStatus = useBenchmarkStore((state) => state.releaseGateStatus);
  const isLoading = useBenchmarkStore((state) => state.isLoading);
  const error = useBenchmarkStore((state) => state.error);
  const clearError = useBenchmarkStore((state) => state.clearError);

  const activeRun = latestRunId ? runs[latestRunId] : null;
  const dimensions = latestScorecard?.dimensions || [];
  const sortedDimensions = useMemo(
    () => [...dimensions].sort((a, b) => a.dimension.localeCompare(b.dimension)),
    [dimensions],
  );
  const trendHistory = useMemo(
    () => [...scoreHistory].sort((a, b) => a.generatedAt - b.generatedAt).slice(-20),
    [scoreHistory],
  );
  const launchBlocked = releaseGateStatus?.status === 'fail';

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white/90">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              Benchmark Dashboard
            </h2>
            <p className="text-xs text-white/55">
              Twin-track comparative benchmark execution and score tracking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void assertReleaseGateForLaunch()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Assert Launch Gate
            </button>
            <button
              type="button"
              onClick={() => void runBenchmarkSuite('twin-track-core', 'default')}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run Core Suite
            </button>
          </div>
        </div>

        {launchBlocked ? (
          <div className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            Public launch is blocked by current release-gate status.
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/45">Benchmark Score</p>
            <p className="mt-1 text-lg font-semibold text-white/90">{percent(latestScorecard?.benchmarkScore)}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/45">Feature Checklist</p>
            <p className="mt-1 text-lg font-semibold text-white/90">{percent(latestScorecard?.featureChecklistScore)}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/45">Final Score</p>
            <p className="mt-1 flex items-center gap-1 text-lg font-semibold text-white/90">
              <TrendingUp className="h-4 w-4 text-cyan-300" />
              {percent(latestScorecard?.finalScore)}
            </p>
          </div>
        </div>

        {activeRun ? (
          <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/65">
            Active Run: <span className="font-mono text-white/80">{activeRun.runId}</span> · Status:{' '}
            <span className="text-white/85">{activeRun.status}</span> · Progress:{' '}
            <span className="text-white/85">{activeRun.progress}%</span>
          </div>
        ) : null}

        {latestRunHealth ? (
          <div className="mt-3 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/70">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-white/85">
                <Activity className="h-3.5 w-3.5 text-emerald-300" />
                Reliability Health
              </span>
              <span className="text-white/90">
                {percent(latestRunHealth.reliabilityScore)} · {latestRunHealth.health}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-white/55">
              stalls {latestRunHealth.counters.runStalled} · recovered {latestRunHealth.counters.runRecovered} ·
              errors {latestRunHealth.counters.errors + latestRunHealth.counters.toolErrors}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            <div>{error}</div>
            <button
              type="button"
              onClick={clearError}
              className="mt-1 text-[11px] underline underline-offset-2 hover:text-rose-100"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <h3 className="text-sm font-semibold text-white/90">Score Trend History</h3>
        <div className="mt-3 space-y-2">
          {trendHistory.length === 0 ? (
            <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/50">
              No historical score snapshots yet.
            </div>
          ) : (
            trendHistory.map((entry, index) => {
              const prev = index > 0 ? trendHistory[index - 1] : null;
              const delta = prev ? entry.finalScore - prev.finalScore : null;
              const barWidth = `${Math.max(4, Math.min(100, Math.round(entry.finalScore * 100)))}%`;

              return (
                <div
                  key={`${entry.runId}-${entry.generatedAt}`}
                  className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-white/55">{new Date(entry.generatedAt).toLocaleString()}</span>
                    <span className="text-white/80">
                      {percent(entry.finalScore)}
                      {delta !== null ? (
                        <span className={delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                          {' '}
                          ({delta >= 0 ? '+' : ''}
                          {Math.round(delta * 100)}%)
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-cyan-300/80 transition-all"
                      style={{ width: barWidth }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <h3 className="text-sm font-semibold text-white/90">Dimension Scorecard</h3>
        <div className="mt-3 space-y-2">
          {sortedDimensions.length === 0 ? (
            <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/50">
              No benchmark scorecard available yet.
            </div>
          ) : (
            sortedDimensions.map((dimension) => (
              <div
                key={dimension.dimension}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2"
              >
                <div className="text-xs text-white/75">{dimension.dimension}</div>
                <div className="text-xs">
                  <span className="text-white/90">{percent(dimension.score)}</span>
                  <span className="px-1 text-white/35">/</span>
                  <span className="text-white/55">{percent(dimension.threshold)} gate</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <ReleaseGatePanel />
    </div>
  );
}
