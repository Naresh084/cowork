// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * RelevanceScorer - Memory Relevance Scoring
 *
 * Implements TF-IDF based text similarity with additional factors
 */

import type { Memory, ScoredMemory } from './types.js';

/**
 * Scoring weights
 */
const WEIGHTS = {
  textSimilarity: 0.4,
  tagMatch: 0.2,
  recency: 0.15,
  accessFrequency: 0.1,
  confidence: 0.15,
};

/**
 * Stop words to filter out
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'so', 'if',
  'then', 'than', 'too', 'very', 'just', 'also', 'only', 'such', 'no',
  'not', 'yes', 'any', 'all', 'some', 'more', 'most', 'other', 'into',
  'up', 'down', 'out', 'over', 'under', 'again', 'further', 'once',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they',
]);

/**
 * RelevanceScorer class
 */
export class RelevanceScorer {
  private weights: typeof WEIGHTS;

  constructor(customWeights?: Partial<typeof WEIGHTS>) {
    this.weights = { ...WEIGHTS, ...customWeights };
  }

  /**
   * Score memories against a context query
   */
  scoreMemories(memories: Memory[], context: string): ScoredMemory[] {
    if (memories.length === 0 || !context.trim()) {
      return [];
    }

    // Tokenize context
    const contextTokens = this.tokenize(context);
    if (contextTokens.length === 0) {
      return memories.map(m => ({ ...m, relevanceScore: 0 }));
    }

    // Calculate IDF for context tokens
    const idf = this.calculateIDF(memories, contextTokens);

    // Score each memory
    const scored = memories.map(memory => {
      const score = this.scoreMemory(memory, contextTokens, idf);
      return { ...memory, relevanceScore: score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return scored;
  }

  /**
   * Score a single memory
   */
  private scoreMemory(
    memory: Memory,
    contextTokens: string[],
    idf: Map<string, number>
  ): number {
    let totalScore = 0;

    // 1. Text similarity (TF-IDF)
    const textScore = this.calculateTextSimilarity(
      memory.title + ' ' + memory.content,
      contextTokens,
      idf
    );
    totalScore += textScore * this.weights.textSimilarity;

    // 2. Tag matching
    const tagScore = this.calculateTagScore(memory.tags, contextTokens);
    totalScore += tagScore * this.weights.tagMatch;

    // 3. Recency score
    const recencyScore = this.calculateRecencyScore(memory.lastAccessedAt);
    totalScore += recencyScore * this.weights.recency;

    // 4. Access frequency score
    const frequencyScore = this.calculateFrequencyScore(memory.accessCount);
    totalScore += frequencyScore * this.weights.accessFrequency;

    // 5. Confidence factor
    totalScore += memory.confidence * this.weights.confidence;

    // Normalize to 0-1
    return Math.min(1, Math.max(0, totalScore));
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word));
  }

  /**
   * Calculate IDF (Inverse Document Frequency) for tokens
   */
  private calculateIDF(memories: Memory[], tokens: string[]): Map<string, number> {
    const idf = new Map<string, number>();
    const totalDocs = memories.length;

    for (const token of tokens) {
      // Count documents containing this token
      let docCount = 0;
      for (const memory of memories) {
        const text = (memory.title + ' ' + memory.content).toLowerCase();
        if (text.includes(token)) {
          docCount++;
        }
      }

      // Calculate IDF
      const idfValue = docCount > 0
        ? Math.log((totalDocs + 1) / (docCount + 1)) + 1
        : 1;

      idf.set(token, idfValue);
    }

    return idf;
  }

  /**
   * Calculate text similarity using TF-IDF
   */
  private calculateTextSimilarity(
    text: string,
    contextTokens: string[],
    idf: Map<string, number>
  ): number {
    const textTokens = this.tokenize(text);
    if (textTokens.length === 0) return 0;

    // Calculate TF for text
    const tf = new Map<string, number>();
    for (const token of textTokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Normalize TF
    const maxTf = Math.max(...tf.values());
    for (const [token, count] of tf) {
      tf.set(token, count / maxTf);
    }

    // Calculate TF-IDF score
    let score = 0;
    for (const contextToken of contextTokens) {
      const termTf = tf.get(contextToken) || 0;
      const termIdf = idf.get(contextToken) || 1;
      score += termTf * termIdf;
    }

    // Normalize by number of context tokens
    return score / contextTokens.length;
  }

  /**
   * Calculate tag matching score
   */
  private calculateTagScore(tags: string[], contextTokens: string[]): number {
    if (tags.length === 0) return 0;

    const contextSet = new Set(contextTokens);
    let matches = 0;

    for (const tag of tags) {
      const tagTokens = this.tokenize(tag);
      for (const tagToken of tagTokens) {
        if (contextSet.has(tagToken)) {
          matches++;
          break; // Count each tag only once
        }
      }
    }

    return matches / tags.length;
  }

  /**
   * Calculate recency score (decay over time)
   */
  private calculateRecencyScore(lastAccessedAt: string): number {
    const lastAccess = new Date(lastAccessedAt).getTime();
    const now = Date.now();
    const hoursSinceAccess = (now - lastAccess) / (1000 * 60 * 60);

    // Exponential decay with half-life of 24 hours
    const halfLife = 24;
    return Math.exp(-Math.log(2) * hoursSinceAccess / halfLife);
  }

  /**
   * Calculate access frequency score (logarithmic scale)
   */
  private calculateFrequencyScore(accessCount: number): number {
    // Logarithmic scale to prevent high-access memories from dominating
    const maxScore = Math.log(100 + 1); // Cap at 100 accesses
    const score = Math.log(Math.min(accessCount, 100) + 1);
    return score / maxScore;
  }

  /**
   * Find most similar memories to a given memory
   */
  findSimilar(
    targetMemory: Memory,
    allMemories: Memory[],
    limit = 5
  ): ScoredMemory[] {
    // Use target's content as context
    const context = targetMemory.title + ' ' + targetMemory.content;

    // Filter out the target itself
    const otherMemories = allMemories.filter(m => m.id !== targetMemory.id);

    // Score and return top matches
    return this.scoreMemories(otherMemories, context).slice(0, limit);
  }

  /**
   * Get suggested tags based on content
   */
  suggestTags(content: string, existingTags: string[]): string[] {
    const tokens = this.tokenize(content);
    const existingSet = new Set(existingTags.map(t => t.toLowerCase()));

    // Count token frequencies
    const freq = new Map<string, number>();
    for (const token of tokens) {
      if (!existingSet.has(token) && token.length > 3) {
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }

    // Sort by frequency and return top tokens
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([token]) => token);
  }

  /**
   * Update scoring weights
   */
  updateWeights(newWeights: Partial<typeof WEIGHTS>): void {
    this.weights = { ...this.weights, ...newWeights };
  }

  /**
   * Get current weights
   */
  getWeights(): typeof WEIGHTS {
    return { ...this.weights };
  }
}

/**
 * Create a RelevanceScorer instance
 */
export function createRelevanceScorer(
  customWeights?: Partial<typeof WEIGHTS>
): RelevanceScorer {
  return new RelevanceScorer(customWeights);
}

/**
 * Quick score function for simple use cases
 */
export function quickScore(
  memory: Memory,
  context: string
): number {
  const scorer = new RelevanceScorer();
  const scored = scorer.scoreMemories([memory], context);
  return scored[0]?.relevanceScore || 0;
}
