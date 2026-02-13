import { randomUUID } from 'crypto';
import type { MemoryAtom } from '@gemini-cowork/shared';
import type { MemoryConsolidationPolicy, MemoryConsolidationResult } from './types.js';

interface ConsolidationDependencies {
  listAtoms: () => MemoryAtom[];
  upsertAtom: (atom: MemoryAtom) => void;
  deleteAtom: (id: string) => boolean;
  now?: () => number;
}

interface SimilarityCandidate {
  atom: MemoryAtom;
  normalized: string;
  tokens: Set<string>;
}

const DEFAULT_POLICY: MemoryConsolidationPolicy = {
  strategy: 'balanced',
  redundancyThreshold: 0.9,
  decayFactor: 0.92,
  minConfidence: 0.15,
  staleAfterHours: 24 * 14,
};

function normalizeContent(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTokenSet(value: string): Set<string> {
  return new Set(
    normalizeContent(value)
      .split(' ')
      .filter((token) => token.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function comparePriority(a: MemoryAtom, b: MemoryAtom): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  return b.updatedAt - a.updatedAt;
}

function pickPrimary(a: MemoryAtom, b: MemoryAtom): MemoryAtom {
  return comparePriority(a, b) <= 0 ? a : b;
}

function mergeAtom(primary: MemoryAtom, duplicate: MemoryAtom, nowMs: number): MemoryAtom {
  const keywordSet = new Set([...(primary.keywords || []), ...(duplicate.keywords || [])]);
  const provenanceTags = new Set([
    ...(primary.provenance?.tags || []),
    ...(duplicate.provenance?.tags || []),
    'consolidated:merged',
  ]);

  return {
    ...primary,
    summary:
      primary.summary && primary.summary.length >= (duplicate.summary || '').length
        ? primary.summary
        : duplicate.summary || primary.summary,
    confidence: Math.max(primary.confidence, duplicate.confidence),
    keywords: Array.from(keywordSet),
    provenance: {
      source: primary.provenance?.source || duplicate.provenance?.source || 'assistant',
      sourceRef: primary.provenance?.sourceRef || duplicate.provenance?.sourceRef,
      createdBy: 'memory_consolidator_v1',
      tags: Array.from(provenanceTags),
    },
    updatedAt: nowMs,
  };
}

function resolvePolicy(input?: Partial<MemoryConsolidationPolicy>): MemoryConsolidationPolicy {
  const strategy = input?.strategy;
  return {
    strategy:
      strategy === 'aggressive' || strategy === 'conservative' || strategy === 'balanced'
        ? strategy
        : DEFAULT_POLICY.strategy,
    redundancyThreshold:
      typeof input?.redundancyThreshold === 'number'
        ? Math.max(0.6, Math.min(0.99, input.redundancyThreshold))
        : DEFAULT_POLICY.redundancyThreshold,
    decayFactor:
      typeof input?.decayFactor === 'number'
        ? Math.max(0.5, Math.min(0.999, input.decayFactor))
        : DEFAULT_POLICY.decayFactor,
    minConfidence:
      typeof input?.minConfidence === 'number'
        ? Math.max(0.05, Math.min(0.95, input.minConfidence))
        : DEFAULT_POLICY.minConfidence,
    staleAfterHours:
      typeof input?.staleAfterHours === 'number' && input.staleAfterHours > 0
        ? Math.min(24 * 365, Math.max(1, input.staleAfterHours))
        : DEFAULT_POLICY.staleAfterHours,
  };
}

export class MemoryConsolidationService {
  private deps: ConsolidationDependencies;

  constructor(deps: ConsolidationDependencies) {
    this.deps = deps;
  }

  run(inputPolicy?: Partial<MemoryConsolidationPolicy>): MemoryConsolidationResult {
    const nowMs = this.deps.now ? this.deps.now() : Date.now();
    const policy = resolvePolicy(inputPolicy);
    const startedAt = nowMs;
    const runId = `mcon_${randomUUID().slice(0, 8)}`;

    const atoms = this.deps.listAtoms();
    const beforeCount = atoms.length;
    const preservedPinnedCount = atoms.filter((atom) => atom.pinned).length;

    const sorted = [...atoms].sort(comparePriority);
    const survivors: SimilarityCandidate[] = [];
    const removedIds = new Set<string>();
    let mergedCount = 0;
    let removedCount = 0;
    let decayedCount = 0;

    for (const atom of sorted) {
      if (removedIds.has(atom.id)) continue;
      const normalized = normalizeContent(atom.content);
      const tokens = toTokenSet(atom.content);
      let duplicateMatch: SimilarityCandidate | null = null;

      for (const candidate of survivors) {
        if (candidate.atom.atomType !== atom.atomType) continue;
        if (candidate.atom.pinned && atom.pinned) continue;

        const exactMatch = normalized.length > 0 && normalized === candidate.normalized;
        const similarity = exactMatch ? 1 : jaccard(tokens, candidate.tokens);

        if (similarity >= policy.redundancyThreshold) {
          duplicateMatch = candidate;
          break;
        }
      }

      if (!duplicateMatch) {
        survivors.push({ atom, normalized, tokens });
        continue;
      }

      const primary = pickPrimary(duplicateMatch.atom, atom);
      const secondary = primary.id === atom.id ? duplicateMatch.atom : atom;

      if (secondary.pinned && primary.id !== secondary.id) {
        survivors.push({ atom, normalized, tokens });
        continue;
      }

      const merged = mergeAtom(primary, secondary, nowMs);
      this.deps.upsertAtom(merged);

      const deleted = this.deps.deleteAtom(secondary.id);
      if (deleted) {
        removedIds.add(secondary.id);
        removedCount += 1;
      }
      mergedCount += 1;

      if (primary.id !== duplicateMatch.atom.id) {
        duplicateMatch.atom = merged;
        duplicateMatch.normalized = normalizeContent(merged.content);
        duplicateMatch.tokens = toTokenSet(merged.content);
      } else {
        duplicateMatch.atom = merged;
      }
    }

    const staleCutoffMs = nowMs - policy.staleAfterHours * 60 * 60 * 1000;
    for (const candidate of survivors) {
      const atom = candidate.atom;
      if (atom.pinned) continue;
      if (atom.updatedAt >= staleCutoffMs) continue;

      const decayedConfidence = Math.max(policy.minConfidence, atom.confidence * policy.decayFactor);
      if (decayedConfidence >= atom.confidence - 1e-6) continue;

      this.deps.upsertAtom({
        ...atom,
        confidence: decayedConfidence,
        updatedAt: nowMs,
        provenance: {
          source: atom.provenance?.source || 'assistant',
          sourceRef: atom.provenance?.sourceRef,
          createdBy: 'memory_consolidator_v1',
          tags: [...new Set([...(atom.provenance?.tags || []), 'consolidated:decayed'])],
        },
      });
      decayedCount += 1;
    }

    const afterCount = Math.max(0, beforeCount - removedCount);
    const redundancyReduction = beforeCount > 0 ? removedCount / beforeCount : 0;
    const orphanedRemovals = Math.max(0, removedCount - mergedCount);
    const recallRetention = beforeCount > 0 ? Math.max(0, 1 - orphanedRemovals / beforeCount) : 1;

    return {
      runId,
      strategy: policy.strategy,
      startedAt,
      completedAt: this.deps.now ? this.deps.now() : Date.now(),
      beforeCount,
      afterCount,
      mergedCount,
      removedCount,
      decayedCount,
      preservedPinnedCount,
      redundancyReduction,
      recallRetention,
    };
  }
}

export function createMemoryConsolidationService(
  deps: ConsolidationDependencies,
): MemoryConsolidationService {
  return new MemoryConsolidationService(deps);
}
