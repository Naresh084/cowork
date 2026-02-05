/**
 * Summarizer - Message Summarization
 *
 * Summarizes older messages for context compression
 */

import type { Message, MessageContentPart } from '@gemini-cowork/shared';

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
 * Summary options
 */
interface SummaryOptions {
  /** Maximum summary length in characters */
  maxLength?: number;

  /** Include code blocks */
  includeCode?: boolean;

  /** Include file references */
  includeFiles?: boolean;

  /** Focus areas */
  focus?: ('decisions' | 'preferences' | 'actions' | 'context')[];
}

/**
 * Summary result
 */
interface SummaryResult {
  /** Generated summary */
  summary: string;

  /** Number of messages summarized */
  messageCount: number;

  /** Key items extracted */
  keyItems: {
    decisions: string[];
    preferences: string[];
    actions: string[];
    context: string[];
    files: string[];
  };

  /** Estimated token savings */
  tokenSavings: number;
}

/**
 * Summarize messages
 */
export async function summarizeMessages(
  messages: Message[],
  options?: SummaryOptions
): Promise<SummaryResult> {
  const opts: SummaryOptions = {
    maxLength: 2000,
    includeCode: false,
    includeFiles: true,
    focus: ['decisions', 'preferences', 'actions', 'context'],
    ...options,
  };

  const keyItems = {
    decisions: [] as string[],
    preferences: [] as string[],
    actions: [] as string[],
    context: [] as string[],
    files: [] as string[],
  };

  // Extract key information
  for (const message of messages) {
    const content = getTextContent(message);
    const lower = content.toLowerCase();

    // Extract decisions
    if (opts.focus?.includes('decisions')) {
      if (isDecisionRelated(lower)) {
        const extracted = extractRelevantSentence(content, DECISION_KEYWORDS);
        if (extracted) keyItems.decisions.push(extracted);
      }
    }

    // Extract preferences
    if (opts.focus?.includes('preferences')) {
      if (isPreferenceRelated(lower)) {
        const extracted = extractRelevantSentence(content, PREFERENCE_KEYWORDS);
        if (extracted) keyItems.preferences.push(extracted);
      }
    }

    // Extract actions
    if (opts.focus?.includes('actions')) {
      if (isActionRelated(lower) && message.role === 'assistant') {
        const extracted = extractRelevantSentence(content, ACTION_KEYWORDS);
        if (extracted) keyItems.actions.push(extracted);
      }
    }

    // Extract context
    if (opts.focus?.includes('context')) {
      if (isContextRelated(lower)) {
        const extracted = extractRelevantSentence(content, CONTEXT_KEYWORDS);
        if (extracted) keyItems.context.push(extracted);
      }
    }

    // Extract file references
    if (opts.includeFiles) {
      const files = extractFileReferences(content);
      keyItems.files.push(...files);
    }
  }

  // Deduplicate
  keyItems.decisions = [...new Set(keyItems.decisions)].slice(0, 5);
  keyItems.preferences = [...new Set(keyItems.preferences)].slice(0, 5);
  keyItems.actions = [...new Set(keyItems.actions)].slice(0, 5);
  keyItems.context = [...new Set(keyItems.context)].slice(0, 5);
  keyItems.files = [...new Set(keyItems.files)].slice(0, 10);

  // Build summary
  const summary = buildSummary(keyItems, opts);

  // Estimate token savings
  const originalTokens = estimateTokens(messages.map(m => getTextContent(m)).join('\n'));
  const summaryTokens = estimateTokens(summary);
  const tokenSavings = originalTokens - summaryTokens;

  return {
    summary,
    messageCount: messages.length,
    keyItems,
    tokenSavings: Math.max(0, tokenSavings),
  };
}

/**
 * Keywords for detection
 */
const DECISION_KEYWORDS = [
  'decided',
  'choose',
  'chose',
  'will use',
  'going with',
  'selected',
  'picked',
  "let's go",
  'agreed',
];

const PREFERENCE_KEYWORDS = [
  'prefer',
  'always',
  'never',
  'like',
  'want',
  "don't like",
  'avoid',
  'instead of',
];

const ACTION_KEYWORDS = [
  'created',
  'modified',
  'updated',
  'deleted',
  'added',
  'removed',
  'changed',
  'fixed',
  'implemented',
];

const CONTEXT_KEYWORDS = [
  'important',
  'note that',
  'remember',
  'keep in mind',
  'because',
  'reason',
  'architecture',
  'pattern',
];

/**
 * Check if content is decision-related
 */
function isDecisionRelated(content: string): boolean {
  return DECISION_KEYWORDS.some(kw => content.includes(kw));
}

/**
 * Check if content is preference-related
 */
function isPreferenceRelated(content: string): boolean {
  return PREFERENCE_KEYWORDS.some(kw => content.includes(kw));
}

/**
 * Check if content is action-related
 */
function isActionRelated(content: string): boolean {
  return ACTION_KEYWORDS.some(kw => content.includes(kw));
}

/**
 * Check if content is context-related
 */
function isContextRelated(content: string): boolean {
  return CONTEXT_KEYWORDS.some(kw => content.includes(kw));
}

/**
 * Extract relevant sentence containing keywords
 */
function extractRelevantSentence(text: string, keywords: string[]): string | null {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);

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
 * Extract file references from content
 */
function extractFileReferences(content: string): string[] {
  const files: string[] = [];

  // Match file paths
  const pathMatches = content.match(/(?:\/[\w.-]+)+(?:\.\w+)?/g);
  if (pathMatches) {
    for (const match of pathMatches) {
      if (match.includes('.') && !match.startsWith('//')) {
        files.push(match);
      }
    }
  }

  // Match backtick paths
  const backtickMatches = content.match(/`([^`]+\.(ts|js|py|rs|go|md|json|yaml|yml))`/g);
  if (backtickMatches) {
    for (const match of backtickMatches) {
      files.push(match.replace(/`/g, ''));
    }
  }

  return files;
}

/**
 * Build summary from key items
 */
function buildSummary(
  keyItems: SummaryResult['keyItems'],
  options: SummaryOptions
): string {
  const parts: string[] = [];

  if (keyItems.decisions.length > 0) {
    parts.push('**Key Decisions:**');
    for (const item of keyItems.decisions) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  if (keyItems.preferences.length > 0) {
    parts.push('**User Preferences:**');
    for (const item of keyItems.preferences) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  if (keyItems.actions.length > 0) {
    parts.push('**Actions Taken:**');
    for (const item of keyItems.actions) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  if (keyItems.context.length > 0) {
    parts.push('**Important Context:**');
    for (const item of keyItems.context) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  if (options.includeFiles && keyItems.files.length > 0) {
    parts.push('**Files Referenced:**');
    for (const file of keyItems.files.slice(0, 10)) {
      parts.push(`- \`${file}\``);
    }
    parts.push('');
  }

  // If nothing extracted, provide generic summary
  if (parts.length === 0) {
    parts.push('Previous conversation covered various topics and requests.');
    parts.push('No specific decisions or preferences were captured.');
  }

  let summary = parts.join('\n');

  // Truncate if needed
  if (options.maxLength && summary.length > options.maxLength) {
    summary = summary.slice(0, options.maxLength - 3) + '...';
  }

  return summary;
}

/**
 * Estimate token count
 */
function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Create a quick summary of recent activity
 */
export function createQuickSummary(messages: Message[], count = 5): string {
  const recent = messages.slice(-count);
  const summary: string[] = [];

  for (const msg of recent) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    const content = getTextContent(msg);
    const preview = content.slice(0, 100).replace(/\n/g, ' ');
    summary.push(`${role}: ${preview}${content.length > 100 ? '...' : ''}`);
  }

  return summary.join('\n');
}

// Export helper for use in other modules
export { getTextContent };
