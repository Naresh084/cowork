// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { Message, MessageContentPart } from '@cowork/shared';

/**
 * Options for message compaction
 */
export interface CompactionOptions {
  /** Maximum tokens before triggering compaction (default: 100000) */
  maxTokens?: number;
  /** Percentage of context to compact (default: 0.5 = 50%) */
  compactionRatio?: number;
  /** Minimum number of messages to keep uncompacted (default: 10) */
  minPreservedMessages?: number;
  /** Always preserve tool calls and results (default: true) */
  preserveToolCalls?: boolean;
  /** Always preserve messages with these roles (default: ['system']) */
  preserveRoles?: string[];
}

/**
 * Result of compaction operation
 */
export interface CompactionResult {
  /** Summary message to replace compacted messages */
  summary: Message;
  /** Messages that were preserved */
  preservedMessages: Message[];
  /** Number of messages removed */
  removedCount: number;
  /** Estimated tokens saved */
  tokensSaved: number;
  /** Total tokens after compaction */
  totalTokensAfter: number;
}

/**
 * Simple token estimation (4 chars per token is a rough approximation)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get text content from a message
 */
function getMessageText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .filter((part): part is Extract<MessageContentPart, { type: 'text' }> =>
      part.type === 'text'
    )
    .map(part => part.text)
    .join('\n');
}

/**
 * Check if a message contains tool calls or results
 */
function hasToolContent(message: Message): boolean {
  if (typeof message.content === 'string') {
    return false;
  }

  return message.content.some(
    part => part.type === 'tool_call' || part.type === 'tool_result'
  );
}

/**
 * CompactionService handles message history compaction to manage context window usage.
 *
 * When the conversation grows too long, it can compact older messages into a summary
 * while preserving important context like tool calls, system messages, and recent history.
 */
export class CompactionService {
  private options: Required<CompactionOptions>;

  constructor(options: CompactionOptions = {}) {
    this.options = {
      maxTokens: options.maxTokens ?? 100000,
      compactionRatio: options.compactionRatio ?? 0.5,
      minPreservedMessages: options.minPreservedMessages ?? 10,
      preserveToolCalls: options.preserveToolCalls ?? true,
      preserveRoles: options.preserveRoles ?? ['system'],
    };
  }

  /**
   * Calculate total tokens for a list of messages
   */
  getTokenCount(messages: Message[]): number {
    return messages.reduce((total, msg) => {
      const text = getMessageText(msg);
      return total + estimateTokens(text);
    }, 0);
  }

  /**
   * Check if compaction should be triggered
   */
  shouldCompact(messages: Message[], threshold?: number): boolean {
    const maxTokens = threshold ?? this.options.maxTokens;
    const currentTokens = this.getTokenCount(messages);
    return currentTokens > maxTokens * 0.85; // Trigger at 85% capacity
  }

  /**
   * Compact messages into a summary
   */
  async compact(
    messages: Message[],
    summarizer?: (messages: Message[]) => Promise<string>
  ): Promise<CompactionResult> {
    const currentTokens = this.getTokenCount(messages);

    // Determine which messages to compact
    const { toCompact, toPreserve } = this.partitionMessages(messages);

    // If nothing to compact, return early
    if (toCompact.length === 0) {
      return {
        summary: this.createEmptySummary(),
        preservedMessages: toPreserve,
        removedCount: 0,
        tokensSaved: 0,
        totalTokensAfter: currentTokens,
      };
    }

    // Generate summary
    const summaryText = summarizer
      ? await summarizer(toCompact)
      : this.generateDefaultSummary(toCompact);

    const summary = this.createSummaryMessage(summaryText);

    // Calculate token savings
    const compactedTokens = this.getTokenCount(toCompact);
    const summaryTokens = estimateTokens(summaryText);
    const tokensSaved = compactedTokens - summaryTokens;
    const totalTokensAfter = this.getTokenCount(toPreserve) + summaryTokens;

    return {
      summary,
      preservedMessages: toPreserve,
      removedCount: toCompact.length,
      tokensSaved,
      totalTokensAfter,
    };
  }

  /**
   * Partition messages into those to compact and those to preserve
   */
  private partitionMessages(
    messages: Message[]
  ): { toCompact: Message[]; toPreserve: Message[] } {
    const toPreserve: Message[] = [];
    const toCompact: Message[] = [];

    // Calculate target compaction point
    const targetCompactCount = Math.floor(
      messages.length * this.options.compactionRatio
    );
    const minPreserveIndex = messages.length - this.options.minPreservedMessages;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const shouldPreserve =
        // Always preserve recent messages
        i >= minPreserveIndex ||
        // Preserve based on role
        this.options.preserveRoles.includes(message.role) ||
        // Preserve tool calls/results if configured
        (this.options.preserveToolCalls && hasToolContent(message));

      if (shouldPreserve || i >= targetCompactCount) {
        toPreserve.push(message);
      } else {
        toCompact.push(message);
      }
    }

    return { toCompact, toPreserve };
  }

  /**
   * Generate a default summary when no custom summarizer is provided
   */
  private generateDefaultSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    const topics: string[] = [];

    // Extract key topics from user messages
    for (const msg of userMessages.slice(-5)) {
      const text = getMessageText(msg);
      if (text.length > 50) {
        topics.push(`- ${text.slice(0, 100)}...`);
      } else if (text.length > 0) {
        topics.push(`- ${text}`);
      }
    }

    return `[Conversation Summary - ${messages.length} messages compacted]

Previous discussion included:
${topics.join('\n') || '- General conversation'}

Key points:
- ${userMessages.length} user messages
- ${assistantMessages.length} assistant responses
- Various topics discussed

This is a condensed summary. Recent context follows below.`;
  }

  /**
   * Create a summary message
   */
  private createSummaryMessage(summaryText: string): Message {
    return {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: summaryText,
      createdAt: Date.now(),
    };
  }

  /**
   * Create an empty summary message
   */
  private createEmptySummary(): Message {
    return {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: '',
      createdAt: Date.now(),
    };
  }

  /**
   * Apply compaction result to message list
   */
  applyCompaction(result: CompactionResult): Message[] {
    if (result.removedCount === 0) {
      return result.preservedMessages;
    }

    // Return summary followed by preserved messages
    return [result.summary, ...result.preservedMessages];
  }
}

/**
 * Create a compaction service with default options
 */
export function createCompactionService(
  options?: CompactionOptions
): CompactionService {
  return new CompactionService(options);
}

/**
 * Token counter utility for context window management
 */
export class TokenCounter {
  private cache = new Map<string, number>();

  /**
   * Count tokens for text (with caching)
   */
  count(text: string): number {
    const cached = this.cache.get(text);
    if (cached !== undefined) {
      return cached;
    }

    const count = estimateTokens(text);

    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(text, count);
    return count;
  }

  /**
   * Count tokens for a message
   */
  countMessage(message: Message): number {
    const text = getMessageText(message);
    return this.count(text);
  }

  /**
   * Count tokens for multiple messages
   */
  countMessages(messages: Message[]): number {
    return messages.reduce((total, msg) => total + this.countMessage(msg), 0);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Create a token counter instance
 */
export function createTokenCounter(): TokenCounter {
  return new TokenCounter();
}
