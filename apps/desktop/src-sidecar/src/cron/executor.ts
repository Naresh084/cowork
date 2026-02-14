// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * CronExecutor - Executes cron jobs in isolated sessions
 *
 * Execution mode:
 * - Isolated: Creates fresh session, runs agent, returns result
 */

import type { CronJob, CronRun } from '@cowork/shared';
import type { AgentRunner } from '../agent-runner.js';

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Executor options
 */
export interface ExecutorOptions {
  /** Max execution time in ms (default: 5 minutes) */
  timeout?: number;
  /** Post summary to main session after completion */
  postSummaryToMain?: boolean;
}

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * CronExecutor handles running cron jobs
 */
export class CronExecutor {
  private agentRunner: AgentRunner | null = null;

  /**
   * Set the agent runner (allows breaking circular dependency)
   */
  setAgentRunner(agentRunner: AgentRunner): void {
    this.agentRunner = agentRunner;
  }

  /**
   * Execute a cron job
   */
  async execute(job: CronJob, options: ExecutorOptions = {}): Promise<CronRun> {
    if (!this.agentRunner) {
      throw new Error('AgentRunner not set. Call setAgentRunner() first.');
    }

    const runId = generateId('run');
    const startedAt = Date.now();
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    try {
      return await this.executeIsolated(job, runId, startedAt, timeout);
    } catch (error) {
      return {
        id: runId,
        jobId: job.id,
        sessionId: '',
        startedAt,
        completedAt: Date.now(),
        result: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute in isolated session (fresh context)
   */
  private async executeIsolated(
    job: CronJob,
    runId: string,
    startedAt: number,
    timeout: number
  ): Promise<CronRun> {
    if (!this.agentRunner) {
      throw new Error('AgentRunner not set');
    }

    // Create fresh isolated session; title is derived from the first message/prompt.
    const sessionTitle = this.deriveSessionTitle(job.prompt, job.name);
    const session = await this.agentRunner.createSession(
      job.workingDirectory,
      job.model ?? null,
      sessionTitle,
      'isolated'
    );

    try {
      // Execute with timeout
      const result = await Promise.race([
        this.runAgentTurn(session.id, job.prompt, job.maxTurns),
        this.timeoutPromise(timeout),
      ]);

      if (result === 'timeout') {
        // Stop the agent
        this.agentRunner.stopGeneration(session.id);
        return {
          id: runId,
          jobId: job.id,
          sessionId: session.id,
          startedAt,
          completedAt: Date.now(),
          result: 'timeout',
          error: `Execution timed out after ${timeout}ms`,
        };
      }

      // Extract summary from agent response
      const summary = this.extractSummary(result.content);

      return {
        id: runId,
        jobId: job.id,
        sessionId: session.id,
        startedAt,
        completedAt: Date.now(),
        result: 'success',
        summary,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      };
    } catch (error) {
      return {
        id: runId,
        jobId: job.id,
        sessionId: session.id,
        startedAt,
        completedAt: Date.now(),
        result: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Derive session title from the first instruction text.
   */
  private deriveSessionTitle(prompt: string, fallbackName: string): string {
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return fallbackName || 'Scheduled Task';
    }
    if (normalized.length <= 80) {
      return normalized;
    }
    return `${normalized.slice(0, 77).trimEnd()}...`;
  }

  /**
   * Run a single agent turn and wait for completion
   */
  private async runAgentTurn(
    sessionId: string,
    prompt: string,
    maxTurns?: number
  ): Promise<{ content: string; promptTokens?: number; completionTokens?: number }> {
    if (!this.agentRunner) {
      throw new Error('AgentRunner not set');
    }

    // Get session chatItems count before sending (V2 architecture)
    const sessionBefore = this.agentRunner.getSession(sessionId);
    const itemCountBefore = (sessionBefore as { chatItems?: unknown[] })?.chatItems?.length ?? 0;

    // Send message and wait for completion
    // sendMessage is async and waits for the agent to finish
    await this.agentRunner.sendMessage(sessionId, prompt, undefined, maxTurns);

    // Get session after to extract the response
    const sessionAfter = this.agentRunner.getSession(sessionId);
    if (!sessionAfter) {
      throw new Error('Session not found after sending message');
    }

    // Find the assistant's response chatItems (V2 architecture)
    const allItems = ((sessionAfter as { chatItems?: Array<{ kind: string; content: string | Array<{ type: string; text?: string }> }> })?.chatItems ?? []);
    const newItems = allItems.slice(itemCountBefore);
    const assistantItems = newItems.filter(
      (ci: { kind: string }) => ci.kind === 'assistant_message'
    );

    // Combine all assistant message content
    const content = assistantItems
      .map((ci: { content: string | Array<{ type: string; text?: string }> }) => {
        if (typeof ci.content === 'string') {
          return ci.content;
        }
        // Handle content parts array
        return ci.content
          .filter((p: { type: string }) => p.type === 'text')
          .map((p: { text?: string }) => p.text ?? '')
          .join('\n');
      })
      .join('\n\n');

    // Token usage would need to be tracked in session - placeholder for now
    return {
      content,
      promptTokens: undefined,
      completionTokens: undefined,
    };
  }

  /**
   * Create a timeout promise
   */
  private timeoutPromise(ms: number): Promise<'timeout'> {
    return new Promise(resolve => {
      setTimeout(() => resolve('timeout'), ms);
    });
  }

  /**
   * Extract a summary from agent response (first ~500 chars or first paragraph)
   */
  private extractSummary(content: string): string {
    if (!content) return '';

    // Try to find first paragraph
    const paragraphs = content.split(/\n\n+/);
    const firstPara = paragraphs[0]?.trim() || '';

    if (firstPara.length <= 500) {
      return firstPara;
    }

    // Truncate to 500 chars at word boundary
    const truncated = firstPara.slice(0, 500);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 400 ? truncated.slice(0, lastSpace) : truncated) + '...';
  }

  /**
   * Post summary to main session (optional cross-session communication)
   * Will be implemented when HeartbeatService is available
   */
  async postSummaryToMain(_job: CronJob, run: CronRun): Promise<void> {
    if (!run.summary) return;

    // Queue as system event when HeartbeatService is implemented:
    // heartbeatService.queueEvent({
    //   type: 'custom',
    //   payload: {
    //     action: 'post_summary',
    //     message,
    //     jobId: job.id,
    //     runId: run.id,
    //   },
    //   priority: 'low',
    // });
  }
}

/**
 * Singleton instance of CronExecutor
 */
export const cronExecutor = new CronExecutor();
