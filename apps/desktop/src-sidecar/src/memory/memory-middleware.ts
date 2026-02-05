/**
 * MemoryMiddleware - Deep Agents Middleware for Memory Integration
 *
 * Injects relevant memories into system prompt and auto-extracts memories
 */

import type { Message, MessageContentPart } from '@gemini-cowork/shared';
import type { MemoryService } from './memory-service.js';
import type { MemoryExtractor } from './memory-extractor.js';
import type { ScoredMemory, Memory } from './types.js';

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
 * Memory system prompt instructions
 */
export const MEMORY_SYSTEM_PROMPT = `
## Long-term Memory System

You have access to persistent memories stored in .cowork/memories/. These contain:
- User preferences and coding style
- Learnings from past interactions
- Project-specific context and decisions

### Memory Instructions

1. **Reading Memories**: Relevant memories are automatically injected above based on conversation context.

2. **Creating Memories** (Moderate approach):
   - Save clear user preferences: "I prefer X over Y"
   - Save recurring patterns: "We always do X this way"
   - Save important learnings: "Remember that X because Y"
   - Save project decisions: "We decided to use X for Y"

3. **Memory Groups**:
   - preferences/ - User coding style, tool preferences
   - learnings/ - Patterns, debugging tips, gotchas
   - context/ - Architecture decisions, project history
   - instructions/ - Custom guidelines for the agent

4. **When to Create Memories**:
   - User explicitly states a preference
   - User corrects you (learn from it)
   - Important project decision is made
   - Recurring pattern is identified

5. **When NOT to Create Memories**:
   - One-time instructions
   - Session-specific context
   - Temporary workarounds
   - Trivial information
`;

/**
 * Middleware context for memory operations
 */
interface MemoryMiddlewareContext {
  sessionId: string;
  messages: Message[];
  systemPrompt: string;
  input: string;
}

/**
 * MemoryMiddleware class
 */
export class MemoryMiddleware {
  private memoryService: MemoryService;
  private extractor: MemoryExtractor;
  private maxMemoriesInPrompt: number;

  constructor(
    memoryService: MemoryService,
    extractor: MemoryExtractor,
    maxMemoriesInPrompt = 5
  ) {
    this.memoryService = memoryService;
    this.extractor = extractor;
    this.maxMemoriesInPrompt = maxMemoriesInPrompt;
  }

  /**
   * Process before agent invocation
   * Injects relevant memories into the system prompt
   */
  async beforeInvoke(context: MemoryMiddlewareContext): Promise<{
    systemPromptAddition: string;
    memoriesUsed: string[];
  }> {
    // Get relevant memories based on conversation context
    const contextText = this.buildContextText(context);
    const relevantMemories = await this.memoryService.getRelevantMemories(
      contextText,
      this.maxMemoriesInPrompt
    );

    if (relevantMemories.length === 0) {
      return { systemPromptAddition: '', memoriesUsed: [] };
    }

    // Format memories for prompt
    const promptSection = this.formatMemoriesForPrompt(relevantMemories);
    const memoriesUsed = relevantMemories.map(m => m.id);

    // Track that these memories were used in this session
    for (const memory of relevantMemories) {
      await this.memoryService.addRelatedSession(memory.id, context.sessionId);
    }

    return {
      systemPromptAddition: promptSection,
      memoriesUsed,
    };
  }

  /**
   * Process after agent invocation
   * Extracts potential memories from the conversation
   */
  async afterInvoke(context: MemoryMiddlewareContext): Promise<{
    extracted: number;
    saved: number;
  }> {
    if (!this.extractor.isEnabled()) {
      return { extracted: 0, saved: 0 };
    }

    // Extract potential memories
    const result = await this.extractor.extract(context.messages);

    let saved = 0;
    for (const memory of result.memories) {
      try {
        await this.memoryService.create({
          title: memory.title,
          content: memory.content,
          group: memory.group,
          tags: memory.tags,
          source: 'auto',
          confidence: memory.confidence,
        });
        saved++;
      } catch {
        // Failed to save extracted memory - continue
      }
    }

    return {
      extracted: result.memories.length,
      saved,
    };
  }

  /**
   * Build context text from conversation
   */
  private buildContextText(context: MemoryMiddlewareContext): string {
    const parts: string[] = [];

    // Add current input
    if (context.input) {
      parts.push(context.input);
    }

    // Add recent user messages (last 3)
    const userMessages = context.messages
      .filter(m => m.role === 'user')
      .slice(-3);

    for (const msg of userMessages) {
      parts.push(getTextContent(msg));
    }

    return parts.join(' ');
  }

  /**
   * Format memories for injection into system prompt
   */
  private formatMemoriesForPrompt(memories: ScoredMemory[]): string {
    const lines: string[] = [
      '',
      '## Relevant Memories',
      '',
      'The following memories from previous interactions may be relevant:',
      '',
    ];

    for (const memory of memories) {
      const scorePercent = Math.round(memory.relevanceScore * 100);
      lines.push(`### ${memory.title} (${scorePercent}% relevant)`);
      lines.push(`*Group: ${memory.group} | Tags: ${memory.tags.join(', ') || 'none'}*`);
      lines.push('');
      lines.push(memory.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get full system prompt with memory instructions
   */
  getMemorySystemPrompt(): string {
    return MEMORY_SYSTEM_PROMPT;
  }

  /**
   * Build complete system prompt addition (instructions + relevant memories)
   */
  async buildSystemPromptAddition(context: MemoryMiddlewareContext): Promise<string> {
    const { systemPromptAddition } = await this.beforeInvoke(context);

    if (!systemPromptAddition) {
      return MEMORY_SYSTEM_PROMPT;
    }

    return MEMORY_SYSTEM_PROMPT + '\n' + systemPromptAddition;
  }

  /**
   * Get memory service reference
   */
  getMemoryService(): MemoryService {
    return this.memoryService;
  }

  /**
   * Get extractor reference
   */
  getExtractor(): MemoryExtractor {
    return this.extractor;
  }

  /**
   * Update max memories in prompt
   */
  setMaxMemoriesInPrompt(max: number): void {
    this.maxMemoriesInPrompt = max;
  }
}

/**
 * Create a MemoryMiddleware instance
 */
export function createMemoryMiddleware(
  memoryService: MemoryService,
  extractor: MemoryExtractor,
  maxMemoriesInPrompt = 5
): MemoryMiddleware {
  return new MemoryMiddleware(memoryService, extractor, maxMemoriesInPrompt);
}

/**
 * Format a single memory for display
 */
export function formatMemory(memory: Memory): string {
  return `**${memory.title}** (${memory.group})
Tags: ${memory.tags.join(', ') || 'none'}
${memory.content}`;
}

/**
 * Format multiple memories as a list
 */
export function formatMemoryList(memories: Memory[]): string {
  if (memories.length === 0) {
    return 'No memories found.';
  }

  return memories.map(m => `- **${m.title}** (${m.group})`).join('\n');
}
