/**
 * CronExecutor - Executes cron jobs in isolated or main sessions
 *
 * Execution modes:
 * - Isolated: Creates fresh session, runs agent, returns result
 * - Main: Queues event for heartbeat processing (future feature)
 */

import type { CronJob, CronRun } from '@gemini-cowork/shared';
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
      if (job.sessionTarget === 'isolated') {
        return await this.executeIsolated(job, runId, startedAt, timeout);
      } else {
        return await this.executeInMain(job, runId, startedAt);
      }
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

    // Create fresh isolated session with cron-specific title
    const sessionTitle = `[cron:${job.id}] ${job.name}`;
    const session = await this.agentRunner.createSession(
      job.workingDirectory,
      job.model ?? null,
      sessionTitle
      // Note: session type 'cron' will be added when AgentRunner is updated
    );

    try {
      // Execute with timeout
      const result = await Promise.race([
        this.runAgentTurn(session.id, job.prompt),
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
   * Execute in main session (via heartbeat system event)
   * Note: This will be fully implemented when HeartbeatService is added
   */
  private async executeInMain(
    job: CronJob,
    runId: string,
    startedAt: number
  ): Promise<CronRun> {
    // For now, main session execution is a placeholder
    // When HeartbeatService is implemented, this will queue a system event
    console.log(`[CronExecutor] Main session execution not yet implemented for job ${job.id}`);
    console.log(`[CronExecutor] Job "${job.name}" would be queued for main session`);

    // Queue system event for processing in main session
    // This will be enabled when HeartbeatService is implemented:
    // const eventId = heartbeatService.queueEvent({
    //   type: 'cron:trigger',
    //   payload: {
    //     jobId: job.id,
    //     jobName: job.name,
    //     prompt: job.prompt,
    //     runId,
    //   },
    //   priority: 'normal',
    // });
    //
    // if (job.wakeMode === 'now') {
    //   heartbeatService.wake('now');
    // }

    return {
      id: runId,
      jobId: job.id,
      sessionId: 'main',
      startedAt,
      completedAt: Date.now(),
      result: 'success',
      summary: `Queued for main session (feature pending)`,
    };
  }

  /**
   * Run a single agent turn and wait for completion
   */
  private async runAgentTurn(
    sessionId: string,
    prompt: string
  ): Promise<{ content: string; promptTokens?: number; completionTokens?: number }> {
    if (!this.agentRunner) {
      throw new Error('AgentRunner not set');
    }

    // Get session messages before sending
    const sessionBefore = this.agentRunner.getSession(sessionId);
    const messageCountBefore = sessionBefore?.messages.length ?? 0;

    // Send message and wait for completion
    // sendMessage is async and waits for the agent to finish
    await this.agentRunner.sendMessage(sessionId, prompt);

    // Get session after to extract the response
    const sessionAfter = this.agentRunner.getSession(sessionId);
    if (!sessionAfter) {
      throw new Error('Session not found after sending message');
    }

    // Find the assistant's response message(s)
    const newMessages = sessionAfter.messages.slice(messageCountBefore);
    const assistantMessages = newMessages.filter(
      (m: { role: string }) => m.role === 'assistant'
    );

    // Combine all assistant message content
    const content = assistantMessages
      .map((m: { content: string | Array<{ type: string; text?: string }> }) => {
        if (typeof m.content === 'string') {
          return m.content;
        }
        // Handle content parts array
        return m.content
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
  async postSummaryToMain(job: CronJob, run: CronRun): Promise<void> {
    if (!run.summary) return;

    const message = `**Scheduled Task Completed: ${job.name}**\n\n${run.summary}\n\n_Run ID: ${run.id} | Duration: ${run.completedAt ? run.completedAt - run.startedAt : '?'}ms_`;

    console.log(`[CronExecutor] Would post to main session:`, message);

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
