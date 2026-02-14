// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { persist } from 'zustand/middleware';

export type ReleaseGateStatus = 'pass' | 'fail' | 'warning';

export interface BenchmarkRunProgress {
  runId: string;
  suiteId: string;
  profile: string;
  progress: number;
  status: string;
  updatedAt: number;
}

export interface BenchmarkDimension {
  dimension: string;
  score: number;
  maxScore: number;
  weight: number;
  threshold: number;
  passed: boolean;
}

export interface BenchmarkScorecard {
  runId: string;
  suiteId: string;
  benchmarkScore: number;
  featureChecklistScore: number;
  finalScore: number;
  generatedAt: number;
  dimensions: BenchmarkDimension[];
  passed?: boolean;
}

export interface BenchmarkTrendPoint {
  runId: string;
  suiteId: string;
  benchmarkScore: number;
  featureChecklistScore: number;
  finalScore: number;
  generatedAt: number;
}

export interface RunHealthCounters {
  streamStarts: number;
  streamDone: number;
  checkpoints: number;
  runRecovered: number;
  runStalled: number;
  fallbackApplied: number;
  errors: number;
  toolErrors: number;
  lastUpdatedAt: number;
}

export interface RunHealthSnapshot {
  sessionId: string;
  health: 'healthy' | 'degraded' | 'unhealthy';
  reliabilityScore: number;
  counters: RunHealthCounters;
  timestamp: number;
}

interface BenchmarkState {
  runs: Record<string, BenchmarkRunProgress>;
  latestRunId: string | null;
  latestScorecard: BenchmarkScorecard | null;
  scoreHistory: BenchmarkTrendPoint[];
  runHealthBySession: Record<string, RunHealthSnapshot>;
  latestRunHealth: RunHealthSnapshot | null;
  releaseGateStatus: {
    status: ReleaseGateStatus;
    reasons: string[];
    evaluatedAt: number;
    scorecard?: BenchmarkScorecard;
  } | null;
  isLoading: boolean;
  error: string | null;
}

interface BenchmarkActions {
  setRunProgress: (input: Omit<BenchmarkRunProgress, 'updatedAt'>) => void;
  setScorecard: (scorecard: BenchmarkScorecard) => void;
  setRunHealth: (snapshot: RunHealthSnapshot) => void;
  setReleaseGateStatus: (input: BenchmarkState['releaseGateStatus']) => void;
  runBenchmarkSuite: (suiteId: string, profile?: string) => Promise<void>;
  refreshReleaseGateStatus: () => Promise<void>;
  assertReleaseGateForLaunch: () => Promise<boolean>;
  clearError: () => void;
}

export const useBenchmarkStore = create<BenchmarkState & BenchmarkActions>()(
  persist(
    (set) => ({
      runs: {},
      latestRunId: null,
      latestScorecard: null,
      scoreHistory: [],
      runHealthBySession: {},
      latestRunHealth: null,
      releaseGateStatus: null,
      isLoading: false,
      error: null,

      setRunProgress: (input) =>
        set((state) => ({
          runs: {
            ...state.runs,
            [input.runId]: {
              ...input,
              updatedAt: Date.now(),
            },
          },
          latestRunId: input.runId,
        })),

      setScorecard: (scorecard) =>
        set((state) => {
          const point: BenchmarkTrendPoint = {
            runId: scorecard.runId,
            suiteId: scorecard.suiteId,
            benchmarkScore: scorecard.benchmarkScore,
            featureChecklistScore: scorecard.featureChecklistScore,
            finalScore: scorecard.finalScore,
            generatedAt: scorecard.generatedAt,
          };

          const existingIdx = state.scoreHistory.findIndex((entry) => entry.runId === scorecard.runId);
          const scoreHistory =
            existingIdx >= 0
              ? state.scoreHistory.map((entry, index) => (index === existingIdx ? point : entry))
              : [...state.scoreHistory, point];

          scoreHistory.sort((a, b) => a.generatedAt - b.generatedAt);
          const trimmedHistory = scoreHistory.slice(-200);

          return {
            latestScorecard: scorecard,
            latestRunId: scorecard.runId,
            scoreHistory: trimmedHistory,
          };
        }),

      setRunHealth: (snapshot) =>
        set((state) => ({
          runHealthBySession: {
            ...state.runHealthBySession,
            [snapshot.sessionId]: snapshot,
          },
          latestRunHealth: snapshot,
        })),

      setReleaseGateStatus: (input) =>
        set({
          releaseGateStatus: input,
        }),

      runBenchmarkSuite: async (suiteId, profile = 'default') => {
        set({ isLoading: true, error: null });
        try {
          const result = await invoke<{
            runId: string;
            suiteId: string;
            profile: string;
            status: string;
            scorecard?: BenchmarkScorecard;
          }>('agent_run_benchmark', {
            suiteId,
            profile,
          });

          set((state) => ({
            isLoading: false,
            runs: {
              ...state.runs,
              [result.runId]: {
                runId: result.runId,
                suiteId: result.suiteId,
                profile: result.profile,
                progress: 100,
                status: result.status,
                updatedAt: Date.now(),
              },
            },
            latestRunId: result.runId,
            latestScorecard: result.scorecard || state.latestScorecard,
          }));
          if (result.scorecard) {
            useBenchmarkStore.getState().setScorecard(result.scorecard);
          }
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      refreshReleaseGateStatus: async () => {
        try {
          const status = await invoke<{
            status: ReleaseGateStatus;
            reasons: string[];
            evaluatedAt: number;
            scorecard?: BenchmarkScorecard;
          }>('agent_get_release_gate_status');
          set({
            releaseGateStatus: status,
          });
          if (status.scorecard) {
            useBenchmarkStore.getState().setScorecard(status.scorecard);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      assertReleaseGateForLaunch: async () => {
        try {
          const assertion = await invoke<{
            allowed: true;
            status: 'pass' | 'warning';
            reasons: string[];
            evaluatedAt: number;
          }>('agent_assert_release_gate');
          set({
            releaseGateStatus: {
              status: assertion.status,
              reasons: assertion.reasons,
              evaluatedAt: assertion.evaluatedAt,
            },
            error: null,
          });
          return true;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'benchmark-store-v1',
      partialize: (state) => ({
        runs: state.runs,
        latestRunId: state.latestRunId,
        latestScorecard: state.latestScorecard,
        scoreHistory: state.scoreHistory,
        runHealthBySession: state.runHealthBySession,
        latestRunHealth: state.latestRunHealth,
        releaseGateStatus: state.releaseGateStatus,
      }),
    },
  ),
);
