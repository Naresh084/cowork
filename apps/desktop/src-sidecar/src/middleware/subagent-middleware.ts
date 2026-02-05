/**
 * Subagent Middleware
 *
 * Ensures context isolation for subagents
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
 * Message with metadata
 */
interface MessageWithMetadata extends Message {
  metadata?: {
    isSubagent?: boolean;
    subagentName?: string;
    isDelegationTask?: boolean;
    isolatedContext?: boolean;
    parentSessionId?: string;
  };
}

/**
 * Subagent context
 */
interface SubagentContext {
  name: string;
  parentSessionId: string;
  messages: MessageWithMetadata[];
  startTime: number;
}

/**
 * SubagentMiddleware class
 */
export class SubagentMiddleware {
  private contexts: Map<string, SubagentContext> = new Map();

  /**
   * Create a new subagent context
   */
  createContext(
    subagentId: string,
    name: string,
    parentSessionId: string
  ): SubagentContext {
    const context: SubagentContext = {
      name,
      parentSessionId,
      messages: [],
      startTime: Date.now(),
    };

    this.contexts.set(subagentId, context);
    return context;
  }

  /**
   * Get subagent context
   */
  getContext(subagentId: string): SubagentContext | undefined {
    return this.contexts.get(subagentId);
  }

  /**
   * Filter messages for a subagent
   * Includes: system prompt, delegation task, subagent's own messages
   * Excludes: Other messages from main conversation
   */
  filterMessagesForSubagent(
    messages: MessageWithMetadata[],
    subagentName: string
  ): MessageWithMetadata[] {
    return messages.filter(msg => {
      // Always include system messages
      if (msg.role === 'system') return true;

      // Include the delegation task
      if (msg.metadata?.isDelegationTask) return true;

      // Include subagent's own messages
      if (msg.metadata?.subagentName === subagentName) return true;

      // Exclude everything else
      return false;
    });
  }

  /**
   * Mark a message as belonging to a subagent
   */
  markMessageAsSubagent(
    message: MessageWithMetadata,
    subagentName: string
  ): MessageWithMetadata {
    return {
      ...message,
      metadata: {
        ...message.metadata,
        subagentName,
        isolatedContext: true,
      },
    };
  }

  /**
   * Mark a message as a delegation task
   */
  markAsDelegationTask(message: MessageWithMetadata): MessageWithMetadata {
    return {
      ...message,
      metadata: {
        ...message.metadata,
        isDelegationTask: true,
      },
    };
  }

  /**
   * Add message to subagent context
   */
  addMessage(subagentId: string, message: MessageWithMetadata): void {
    const context = this.contexts.get(subagentId);
    if (context) {
      const markedMessage = this.markMessageAsSubagent(message, context.name);
      context.messages.push(markedMessage);
    }
  }

  /**
   * Get messages from subagent context
   */
  getMessages(subagentId: string): MessageWithMetadata[] {
    const context = this.contexts.get(subagentId);
    return context?.messages || [];
  }

  /**
   * Clear subagent context
   */
  clearContext(subagentId: string): void {
    this.contexts.delete(subagentId);
  }

  /**
   * Get all active subagent IDs
   */
  getActiveSubagents(): string[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Get subagent summary for a parent session
   */
  getSubagentSummaryForSession(parentSessionId: string): Array<{
    id: string;
    name: string;
    messageCount: number;
    startTime: number;
  }> {
    const summaries: Array<{
      id: string;
      name: string;
      messageCount: number;
      startTime: number;
    }> = [];

    for (const [id, context] of this.contexts) {
      if (context.parentSessionId === parentSessionId) {
        summaries.push({
          id,
          name: context.name,
          messageCount: context.messages.length,
          startTime: context.startTime,
        });
      }
    }

    return summaries;
  }

  /**
   * Build isolated system prompt for subagent
   */
  buildSubagentSystemPrompt(
    baseSystemPrompt: string,
    subagentPrompt: string,
    parentContext?: string
  ): string {
    const parts: string[] = [baseSystemPrompt];

    if (parentContext) {
      parts.push('');
      parts.push('## Parent Context');
      parts.push(parentContext);
    }

    parts.push('');
    parts.push(subagentPrompt);

    return parts.join('\n');
  }

  /**
   * Extract result from subagent messages for parent
   */
  extractResultForParent(subagentId: string): string | null {
    const context = this.contexts.get(subagentId);
    if (!context) return null;

    // Find the last assistant message
    const lastAssistant = [...context.messages]
      .reverse()
      .find(m => m.role === 'assistant');

    if (!lastAssistant) return null;
    return getTextContent(lastAssistant);
  }

  /**
   * Clean up old subagent contexts (older than 1 hour)
   */
  cleanupOldContexts(): number {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    let cleaned = 0;

    for (const [id, context] of this.contexts) {
      if (now - context.startTime > maxAge) {
        this.contexts.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Create a SubagentMiddleware instance
 */
export function createSubagentMiddleware(): SubagentMiddleware {
  return new SubagentMiddleware();
}

/**
 * Check if a message is from a subagent
 */
export function isSubagentMessage(message: MessageWithMetadata): boolean {
  return message.metadata?.isSubagent === true ||
         message.metadata?.subagentName !== undefined;
}

/**
 * Get subagent name from message
 */
export function getSubagentName(message: MessageWithMetadata): string | undefined {
  return message.metadata?.subagentName;
}
