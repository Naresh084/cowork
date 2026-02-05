/**
 * MemoryExtractor - Auto-extraction of memories from conversations
 *
 * Implements moderate aggressiveness extraction with confidence scoring
 */

import type { Message, MessageContentPart } from '@gemini-cowork/shared';
import type {
  ExtractedMemory,
  MemoryGroup,
  MemoryExtractionResult,
  MemoryExtractionConfig,
} from './types.js';

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
 * Default extraction patterns by category
 */
const EXTRACTION_PATTERNS: Record<MemoryGroup, RegExp[]> = {
  preferences: [
    /(?:I prefer|I like|I always|I usually|I want|please always)/i,
    /(?:don't|never|avoid|skip) (?:use|add|include)/i,
    /(?:my preference|preferred|favorite)/i,
    /(?:I'd rather|I would rather)/i,
  ],
  learnings: [
    /(?:remember that|note that|keep in mind|important:)/i,
    /(?:the pattern is|the convention is|we use)/i,
    /(?:learned that|turns out|discovered)/i,
    /(?:the trick is|the key is|the solution is)/i,
  ],
  context: [
    /(?:this project|this codebase|our architecture)/i,
    /(?:the way we|how we handle|we decided)/i,
    /(?:in this repo|this repository)/i,
    /(?:our team|our convention|our standard)/i,
  ],
  instructions: [
    /(?:always do|never do|you should|you must)/i,
    /(?:make sure to|be sure to|don't forget)/i,
    /(?:rule:|guideline:|policy:)/i,
  ],
};

/**
 * Patterns that indicate the message should NOT be extracted
 */
const EXCLUSION_PATTERNS = [
  /^(?:yes|no|ok|okay|thanks|thank you|got it)$/i,
  /^\s*$/,
  /^[?!.]+$/,
];

/**
 * MemoryExtractor class
 */
export class MemoryExtractor {
  private config: MemoryExtractionConfig;

  constructor(config?: Partial<MemoryExtractionConfig>) {
    this.config = {
      enabled: true,
      confidenceThreshold: 0.7,
      maxPerConversation: 5,
      patterns: EXTRACTION_PATTERNS,
      ...config,
    };
  }

  /**
   * Extract potential memories from conversation messages
   */
  async extract(messages: Message[]): Promise<MemoryExtractionResult> {
    if (!this.config.enabled) {
      return {
        memories: [],
        messagesProcessed: 0,
        extractedAt: new Date().toISOString(),
      };
    }

    const extracted: ExtractedMemory[] = [];
    let messagesProcessed = 0;

    for (const message of messages) {
      // Only extract from user messages
      if (message.role !== 'user') continue;

      messagesProcessed++;

      // Get text content from message
      const textContent = getTextContent(message);

      // Skip excluded patterns
      if (this.shouldExclude(textContent)) continue;

      // Try to extract from each category
      for (const [group, patterns] of Object.entries(this.config.patterns)) {
        for (const pattern of patterns) {
          if (pattern.test(textContent)) {
            const memory = await this.extractMemory(message, group as MemoryGroup);
            if (memory && memory.confidence >= this.config.confidenceThreshold) {
              // Check for duplicates
              const isDuplicate = extracted.some(
                e => this.isSimilar(e.content, memory.content)
              );
              if (!isDuplicate) {
                extracted.push(memory);
              }
            }
            break; // Only extract once per message per group
          }
        }

        // Limit total extractions
        if (extracted.length >= this.config.maxPerConversation) {
          break;
        }
      }

      if (extracted.length >= this.config.maxPerConversation) {
        break;
      }
    }

    return {
      memories: extracted,
      messagesProcessed,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract a memory from a message
   */
  private async extractMemory(
    message: Message,
    group: MemoryGroup
  ): Promise<ExtractedMemory | null> {
    const content = getTextContent(message).trim();

    // Skip very short or very long messages
    if (content.length < 20 || content.length > 1000) {
      return null;
    }

    // Generate title from content
    const title = this.generateTitle(content, group);

    // Calculate confidence based on pattern strength and content quality
    const confidence = this.calculateConfidence(content, group);

    // Extract tags from content
    const tags = this.extractTags(content);

    return {
      title,
      content: this.cleanContent(content),
      group,
      tags,
      confidence,
      sourceMessageId: message.id,
    };
  }

  /**
   * Generate a title from content
   */
  private generateTitle(content: string, _group: MemoryGroup): string {
    // Extract the main point from the content
    // _group could be used for group-specific title formatting in future
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const firstSentence = sentences[0]?.trim() || content;

    // Truncate and clean
    let title = firstSentence.slice(0, 60);
    if (firstSentence.length > 60) {
      title = title.replace(/\s+\S*$/, '...');
    }

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    return title;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(content: string, group: MemoryGroup): number {
    let confidence = 0.5; // Base confidence

    // Boost for strong indicators
    const strongIndicators: Record<MemoryGroup, RegExp[]> = {
      preferences: [/always/i, /never/i, /prefer/i],
      learnings: [/important/i, /remember/i, /key/i],
      context: [/architecture/i, /decision/i, /convention/i],
      instructions: [/must/i, /should/i, /rule/i],
    };

    const indicators = strongIndicators[group] || [];
    for (const pattern of indicators) {
      if (pattern.test(content)) {
        confidence += 0.1;
      }
    }

    // Boost for longer, more detailed content
    if (content.length > 100) confidence += 0.1;
    if (content.length > 200) confidence += 0.05;

    // Reduce for content with questions
    if (content.includes('?')) confidence -= 0.1;

    // Reduce for uncertain language
    if (/maybe|perhaps|might|could be/i.test(content)) {
      confidence -= 0.15;
    }

    // Clamp to 0-1
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Extract tags from content
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];

    // Technical terms
    const techTerms = content.match(/\b(typescript|javascript|python|react|vue|angular|api|database|test|lint)\b/gi);
    if (techTerms) {
      tags.push(...new Set(techTerms.map(t => t.toLowerCase())));
    }

    // Code-related
    if (/function|class|component|module/i.test(content)) {
      tags.push('code');
    }

    // Style-related
    if (/format|style|naming|convention/i.test(content)) {
      tags.push('style');
    }

    // Architecture-related
    if (/architecture|pattern|structure/i.test(content)) {
      tags.push('architecture');
    }

    return tags.slice(0, 5); // Limit to 5 tags
  }

  /**
   * Clean content for storage
   */
  private cleanContent(content: string): string {
    return content
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^\s*[-*]\s*/, ''); // Remove leading bullets
  }

  /**
   * Check if content should be excluded
   */
  private shouldExclude(content: string): boolean {
    return EXCLUSION_PATTERNS.some(pattern => pattern.test(content.trim()));
  }

  /**
   * Check if two contents are similar
   */
  private isSimilar(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedA = normalize(a);
    const normalizedB = normalize(b);

    // Exact match
    if (normalizedA === normalizedB) return true;

    // Containment check
    if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
      return true;
    }

    // Simple similarity (shared words)
    const wordsA = new Set(normalizedA.split(' ').filter(w => w.length > 3));
    const wordsB = new Set(normalizedB.split(' ').filter(w => w.length > 3));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const similarity = intersection.length / Math.max(wordsA.size, wordsB.size);

    return similarity > 0.7;
  }

  /**
   * Update extraction config
   */
  updateConfig(updates: Partial<MemoryExtractionConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current config
   */
  getConfig(): MemoryExtractionConfig {
    return { ...this.config };
  }

  /**
   * Check if extraction is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable extraction
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

/**
 * Create a new MemoryExtractor instance
 */
export function createMemoryExtractor(
  config?: Partial<MemoryExtractionConfig>
): MemoryExtractor {
  return new MemoryExtractor(config);
}
