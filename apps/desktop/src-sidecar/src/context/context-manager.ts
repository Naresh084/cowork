// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * ContextManager - Context Window Management
 *
 * Manages context window size and compression
 */

import type { Message, MessageContentPart } from '@cowork/shared';

/**
 * Extract text content from a message.
 * Handles both string content and array of content parts.
 */
function getTextContent(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  // Extract text from content parts
  return (message.content as MessageContentPart[])
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n');
}

/**
 * Model context limits
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gemini-1.5-pro': 1000000,
  'gemini-1.5-flash': 1000000,
  'gemini-2.0-flash': 1000000,
  'gemini-2.0-flash-thinking': 1000000,
  'gemini-pro': 32000,
  default: 128000,
};

/**
 * Context manager configuration
 */
interface ContextManagerConfig {
  /** Model name */
  model: string;

  /** Maximum input tokens (auto-detected from model if not specified) */
  maxInputTokens?: number;

  /** Compression threshold (0-1, default 0.85) */
  compressionThreshold?: number;

  /** Ratio of recent messages to keep intact (0-1, default 0.1) */
  recentContextRatio?: number;

  /** Minimum messages before considering compression */
  minMessagesForCompression?: number;
}

/**
 * ContextManager class
 */
export class ContextManager {
  private model: string;
  private maxInputTokens: number;
  private compressionThreshold: number;
  private recentContextRatio: number;
  private minMessagesForCompression: number;

  constructor(config: ContextManagerConfig) {
    this.model = config.model;
    this.maxInputTokens = config.maxInputTokens ||
      MODEL_CONTEXT_LIMITS[config.model] ||
      MODEL_CONTEXT_LIMITS.default;
    this.compressionThreshold = config.compressionThreshold ?? 0.85;
    this.recentContextRatio = config.recentContextRatio ?? 0.1;
    this.minMessagesForCompression = config.minMessagesForCompression ?? 10;
  }

  /**
   * Check if context needs compression
   */
  async needsCompression(messages: Message[], systemPrompt: string): Promise<boolean> {
    if (messages.length < this.minMessagesForCompression) {
      return false;
    }

    const totalTokens = await this.estimateTokens(messages, systemPrompt);
    const threshold = this.maxInputTokens * this.compressionThreshold;

    return totalTokens > threshold;
  }

  /**
   * Compress messages to fit context window
   */
  async compress(messages: Message[]): Promise<Message[]> {
    if (messages.length < this.minMessagesForCompression) {
      return messages;
    }

    // Calculate how many recent messages to keep intact
    const recentCount = Math.max(
      3,
      Math.floor(messages.length * this.recentContextRatio)
    );

    const recent = messages.slice(-recentCount);
    const older = messages.slice(0, -recentCount);

    // If no older messages, return as-is
    if (older.length === 0) {
      return messages;
    }

    // Summarize older messages
    const summary = await this.summarizeMessages(older);

    // Create summary message
    const summaryMessage: Message = {
      id: `summary_${Date.now()}`,
      role: 'system',
      content: `## Previous Conversation Summary\n\n${summary}`,
      createdAt: older[0].createdAt,
    };

    return [summaryMessage, ...recent];
  }

  /**
   * Estimate token count for messages and system prompt
   */
  async estimateTokens(messages: Message[], systemPrompt: string): Promise<number> {
    // Rough estimation: ~4 characters per token for English
    // This is a simplified estimation; production would use proper tokenizer
    const charsPerToken = 4;

    let totalChars = systemPrompt.length;

    for (const message of messages) {
      const content = getTextContent(message);
      totalChars += content.length;

      // Add overhead for message structure (~20 tokens per message)
      totalChars += 80;
    }

    return Math.ceil(totalChars / charsPerToken);
  }

  /**
   * Summarize older messages
   */
  private async summarizeMessages(messages: Message[]): Promise<string> {
    // Extract key information from messages
    const keyDecisions: string[] = [];
    const preferences: string[] = [];
    const context: string[] = [];
    const actions: string[] = [];

    for (const message of messages) {
      const textContent = getTextContent(message);
      const content = textContent.toLowerCase();

      // Extract key decisions
      if (
        content.includes('decided') ||
        content.includes('choose') ||
        content.includes('will use') ||
        content.includes('going with')
      ) {
        const summary = this.extractSentenceContaining(textContent, [
          'decided',
          'choose',
          'will use',
          'going with',
        ]);
        if (summary) keyDecisions.push(summary);
      }

      // Extract preferences
      if (
        content.includes('prefer') ||
        content.includes('always') ||
        content.includes('never') ||
        content.includes('like')
      ) {
        const summary = this.extractSentenceContaining(textContent, [
          'prefer',
          'always',
          'never',
          'like',
        ]);
        if (summary) preferences.push(summary);
      }

      // Extract actions taken
      if (message.role === 'assistant' && textContent.length > 100) {
        // Track file modifications, command executions
        if (
          content.includes('created') ||
          content.includes('modified') ||
          content.includes('updated')
        ) {
          const summary = this.extractSentenceContaining(textContent, [
            'created',
            'modified',
            'updated',
          ]);
          if (summary) actions.push(summary);
        }
      }

      // Extract important context
      if (
        content.includes('important') ||
        content.includes('note that') ||
        content.includes('remember')
      ) {
        const summary = this.extractSentenceContaining(textContent, [
          'important',
          'note that',
          'remember',
        ]);
        if (summary) context.push(summary);
      }
    }

    // Build summary
    const parts: string[] = [];

    if (keyDecisions.length > 0) {
      parts.push('**Key Decisions:**');
      for (const decision of keyDecisions.slice(0, 5)) {
        parts.push(`- ${decision}`);
      }
      parts.push('');
    }

    if (preferences.length > 0) {
      parts.push('**User Preferences:**');
      for (const pref of preferences.slice(0, 5)) {
        parts.push(`- ${pref}`);
      }
      parts.push('');
    }

    if (actions.length > 0) {
      parts.push('**Actions Taken:**');
      for (const action of actions.slice(0, 5)) {
        parts.push(`- ${action}`);
      }
      parts.push('');
    }

    if (context.length > 0) {
      parts.push('**Important Context:**');
      for (const ctx of context.slice(0, 5)) {
        parts.push(`- ${ctx}`);
      }
      parts.push('');
    }

    // If no specific items extracted, create a general summary
    if (parts.length === 0) {
      const messageCount = messages.length;
      const userMessages = messages.filter(m => m.role === 'user').length;
      parts.push(
        `Conversation history: ${messageCount} messages (${userMessages} from user).`
      );
      parts.push('The conversation covered various topics and requests.');
    }

    return parts.join('\n');
  }

  /**
   * Extract sentence containing specific keywords
   */
  private extractSentenceContaining(text: string, keywords: string[]): string | null {
    const sentences = text.split(/[.!?]+/).map(s => s.trim());

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (keywords.some(kw => lower.includes(kw))) {
        // Clean and truncate
        const cleaned = sentence.slice(0, 150);
        if (sentence.length > 150) {
          return cleaned + '...';
        }
        return cleaned;
      }
    }

    return null;
  }

  /**
   * Get context usage percentage
   */
  async getContextUsage(messages: Message[], systemPrompt: string): Promise<{
    used: number;
    total: number;
    percentage: number;
  }> {
    const used = await this.estimateTokens(messages, systemPrompt);
    return {
      used,
      total: this.maxInputTokens,
      percentage: (used / this.maxInputTokens) * 100,
    };
  }

  /**
   * Update model (updates token limits)
   */
  setModel(model: string): void {
    this.model = model;
    this.maxInputTokens = MODEL_CONTEXT_LIMITS[model] || MODEL_CONTEXT_LIMITS.default;
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    model: string;
    maxInputTokens: number;
    compressionThreshold: number;
    recentContextRatio: number;
  } {
    return {
      model: this.model,
      maxInputTokens: this.maxInputTokens,
      compressionThreshold: this.compressionThreshold,
      recentContextRatio: this.recentContextRatio,
    };
  }
}

/**
 * Create a ContextManager instance
 */
export function createContextManager(config: ContextManagerConfig): ContextManager {
  return new ContextManager(config);
}
