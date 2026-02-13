/**
 * Middleware Stack Configuration
 *
 * Full middleware stack for Deep Agents integration
 */

import type { Message, MessageContentPart } from '@gemini-cowork/shared';
import type { MemoryService } from '../memory/memory-service.js';
import type { MemoryExtractor } from '../memory/memory-extractor.js';
import type { AgentsMdConfig } from '../agents-md/types.js';
import { MEMORY_SYSTEM_PROMPT } from '../memory/memory-middleware.js';
import { createSubagentService } from '../subagents/index.js';

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
 * Session reference for middleware
 */
interface SessionRef {
  id: string;
  messages: Message[];
  model: string;
}

/**
 * Middleware context
 */
export interface MiddlewareContext {
  sessionId: string;
  input: string;
  messages: Message[];
  systemPrompt: string;
  systemPromptAdditions: string[];
}

/**
 * Middleware result
 */
export interface MiddlewareResult {
  systemPromptAddition: string;
  memoriesUsed: string[];
  agentsMdLoaded: boolean;
}

/**
 * Create the full middleware stack for a session
 */
export async function createMiddlewareStack(
  session: SessionRef,
  memoryService: MemoryService,
  memoryExtractor: MemoryExtractor,
  agentsMdConfig: AgentsMdConfig | null,
  options?: {
    maxMemoriesInPrompt?: number;
    autoExtract?: boolean;
    consolidation?: {
      enabled?: boolean;
      intervalMinutes?: number;
      redundancyThreshold?: number;
      decayFactor?: number;
      minConfidence?: number;
      staleAfterHours?: number;
      strategy?: 'balanced' | 'aggressive' | 'conservative';
    };
  },
): Promise<{
  beforeInvoke: (context: MiddlewareContext) => Promise<MiddlewareResult>;
  afterInvoke: (context: MiddlewareContext) => Promise<void>;
}> {
  const maxMemoriesInPrompt = Math.max(1, Math.floor(options?.maxMemoriesInPrompt ?? 5));
  const autoExtract = options?.autoExtract ?? true;

  return {
    beforeInvoke: async (context: MiddlewareContext) => {
      const additions: string[] = [];
      const memoriesUsed: string[] = [];
      const normalizedSystemPrompt = context.systemPrompt.trim();
      const hasInSystemPrompt = (value: string): boolean => {
        const normalized = value.trim();
        if (!normalized) return true;
        return normalizedSystemPrompt.includes(normalized);
      };
      const pushIfMissing = (value: string): void => {
        const normalized = value.trim();
        if (!normalized) return;
        if (hasInSystemPrompt(normalized)) return;
        if (additions.some((entry) => entry.trim() === normalized)) return;
        additions.push(value);
      };

      // 1. Inject AGENTS.md context
      if (agentsMdConfig) {
        pushIfMissing(buildAgentsMdPrompt(agentsMdConfig));
      }

      // 2. Inject memory system instructions
      pushIfMissing(MEMORY_SYSTEM_PROMPT);

      // 3. Inject relevant memories based on context
      const contextText = buildContextText(context);
      const relevantMemories = await memoryService.getRelevantMemories(contextText, maxMemoriesInPrompt);

      if (relevantMemories.length > 0) {
        additions.push(formatMemoriesForPrompt(relevantMemories));
        memoriesUsed.push(...relevantMemories.map(m => m.id));

        // Track session usage
        for (const memory of relevantMemories) {
          await memoryService.addRelatedSession(memory.id, context.sessionId);
        }
      }

      // 4. Add subagent information (dynamically from installed subagents)
      const subagentService = createSubagentService();
      const subagentConfigs = await subagentService.getSubagentConfigs(session.model);
      const subagentSection = subagentService.buildSubagentPromptSection(subagentConfigs);
      pushIfMissing(subagentSection);

      return {
        systemPromptAddition: additions.join('\n'),
        memoriesUsed,
        agentsMdLoaded: !!agentsMdConfig,
      };
    },

    afterInvoke: async (context: MiddlewareContext) => {
      if (!autoExtract) {
        return;
      }

      // Extract potential memories from conversation
      if (memoryExtractor.isEnabled()) {
        const result = await memoryExtractor.extract(context.messages);

        for (const memory of result.memories) {
          try {
            await memoryService.upsertAutoMemory({
              title: memory.title,
              content: memory.content,
              group: memory.group,
              tags: memory.tags,
              source: 'auto',
              confidence: memory.confidence,
            });
          } catch {
            // Failed to save extracted memory - continue
          }
        }
      }

      await memoryService.maybeRunPeriodicConsolidation({
        enabled: options?.consolidation?.enabled,
        intervalMinutes: options?.consolidation?.intervalMinutes,
        redundancyThreshold: options?.consolidation?.redundancyThreshold,
        decayFactor: options?.consolidation?.decayFactor,
        minConfidence: options?.consolidation?.minConfidence,
        staleAfterHours: options?.consolidation?.staleAfterHours,
        strategy: options?.consolidation?.strategy,
      });
    },
  };
}

/**
 * Build context text from middleware context
 */
function buildContextText(context: MiddlewareContext): string {
  const parts: string[] = [];

  // Add current input
  if (context.input) {
    parts.push(context.input);
  }

  // Add recent user messages
  const userMessages = context.messages
    .filter(m => m.role === 'user')
    .slice(-3);

  for (const msg of userMessages) {
    parts.push(getTextContent(msg));
  }

  return parts.join(' ');
}

/**
 * Build AGENTS.md prompt section
 */
function buildAgentsMdPrompt(config: AgentsMdConfig): string {
  const parts: string[] = [
    '',
    '## Project Context (from AGENTS.md)',
    '',
  ];

  // Project overview
  if (config.overview) {
    parts.push('### Project Overview');
    parts.push(config.overview);
    parts.push('');
  }

  // Tech stack
  if (config.techStack.language !== 'Unknown') {
    parts.push('### Tech Stack');
    parts.push(`- Language: ${config.techStack.language}`);
    if (config.techStack.framework) {
      parts.push(`- Framework: ${config.techStack.framework}`);
    }
    if (config.techStack.buildTool) {
      parts.push(`- Build Tool: ${config.techStack.buildTool}`);
    }
    if (config.techStack.packageManager) {
      parts.push(`- Package Manager: ${config.techStack.packageManager}`);
    }
    parts.push('');
  }

  // Commands
  if (config.commands.length > 0) {
    parts.push('### Available Commands');
    for (const cmd of config.commands.slice(0, 10)) {
      parts.push(`- \`${cmd.command}\`: ${cmd.description}`);
    }
    parts.push('');
  }

  // Instructions
  if (config.instructions.do.length > 0 || config.instructions.dont.length > 0) {
    parts.push('### Instructions');
    if (config.instructions.do.length > 0) {
      parts.push('**Do:**');
      for (const item of config.instructions.do) {
        parts.push(`- ${item}`);
      }
    }
    if (config.instructions.dont.length > 0) {
      parts.push("**Don't:**");
      for (const item of config.instructions.dont) {
        parts.push(`- ${item}`);
      }
    }
    parts.push('');
  }

  // Important files
  if (config.importantFiles.length > 0) {
    parts.push('### Important Files');
    for (const file of config.importantFiles.slice(0, 10)) {
      parts.push(`- \`${file.path}\`: ${file.description}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Format memories for prompt injection
 */
function formatMemoriesForPrompt(memories: Array<{ id: string; title: string; content: string; group: string; tags: string[]; relevanceScore: number }>): string {
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
 * Build full system prompt with all additions
 */
export function buildFullSystemPrompt(
  basePrompt: string,
  additions: string[]
): string {
  return [basePrompt, ...additions].filter(Boolean).join('\n\n');
}
