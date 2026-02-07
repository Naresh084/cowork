import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeRun,
  WorkflowRun,
  WorkflowRetryPolicy,
} from '@gemini-cowork/shared';
import type { WorkflowEventRepository, WorkflowRunRepository } from '@gemini-cowork/storage';
import { compileWorkflowDefinition, type CompiledWorkflow } from './compiler.js';
import { WorkflowNodeExecutor } from './node-executor.js';
import { computeRetryDelay, sleep } from './retry-policy.js';

const MAX_EXECUTION_STEPS = 2000;
const DEFAULT_RUN_TIMEOUT_MS = 30 * 60 * 1000;

interface EngineDependencies {
  runRepository: WorkflowRunRepository;
  eventRepository: WorkflowEventRepository;
  executeAgentPrompt: (
    prompt: string,
    options?: {
      workingDirectory?: string;
      model?: string;
      maxTurns?: number;
      runId?: string;
    },
  ) => Promise<{ content: string; promptTokens?: number; completionTokens?: number }>;
}

interface ResolveDefinitionResult {
  compiled: CompiledWorkflow;
  definition: WorkflowDefinition;
}

interface RunContextState {
  runContext: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
}

export class WorkflowEngine {
  private runRepository: WorkflowRunRepository;
  private eventRepository: WorkflowEventRepository;
  private nodeExecutor: WorkflowNodeExecutor;
  private executeAgentPrompt: EngineDependencies['executeAgentPrompt'];
  private resolveDefinition: (run: WorkflowRun) => ResolveDefinitionResult | null = () => null;

  constructor(deps: EngineDependencies) {
    this.runRepository = deps.runRepository;
    this.eventRepository = deps.eventRepository;
    this.executeAgentPrompt = deps.executeAgentPrompt;
    this.nodeExecutor = new WorkflowNodeExecutor();
  }

  setDefinitionResolver(resolver: (run: WorkflowRun) => ResolveDefinitionResult | null): void {
    this.resolveDefinition = resolver;
  }

  async execute(runId: string): Promise<WorkflowRun> {
    const existingRun = this.runRepository.getByIdOrThrow(runId);
    const resolved = this.resolveDefinition(existingRun);
    if (!resolved) {
      throw new Error(`Workflow definition not found for run ${runId}`);
    }

    const { compiled, definition } = resolved;
    const contextState = this.buildRunContextState(existingRun, definition);

    let run = this.runRepository.updateStatus(runId, {
      status: 'running',
      startedAt: existingRun.startedAt || Date.now(),
      currentNodeId: existingRun.currentNodeId || compiled.startNodeId,
      error: undefined,
    });

    this.eventRepository.append({
      runId,
      type: 'run_started',
      payload: {
        workflowId: run.workflowId,
        workflowVersion: run.workflowVersion,
      },
    });

    let steps = 0;
    let currentNodeId: string | undefined = run.currentNodeId || compiled.startNodeId;
    const runTimeoutMs = definition.defaults.maxRunTimeMs || DEFAULT_RUN_TIMEOUT_MS;
    const runDeadline = (run.startedAt || Date.now()) + runTimeoutMs;

    try {
      while (currentNodeId && steps < MAX_EXECUTION_STEPS) {
        const controlState = this.getRunControlState(run.id);
        if (controlState) {
          return this.runRepository.getByIdOrThrow(run.id);
        }
        if (Date.now() > runDeadline) {
          throw new Error(`Run timed out after ${runTimeoutMs}ms`);
        }

        steps += 1;
        const node = definition.nodes.find((n) => n.id === currentNodeId);
        if (!node) {
          throw new Error(`Node not found: ${currentNodeId}`);
        }

        run = this.runRepository.updateStatus(run.id, {
          currentNodeId,
          status: 'running',
        });

        const nodeExecution = await this.executeNodeWithRetry(run, definition, node, contextState);
        if (nodeExecution.abortedStatus) {
          return this.runRepository.getByIdOrThrow(run.id);
        }

        if (nodeExecution.pauseRequested) {
          run = this.runRepository.updateStatus(run.id, {
            status: 'paused',
            currentNodeId,
            error: nodeExecution.pauseReason,
          });
          this.eventRepository.append({
            runId,
            type: 'run_paused',
            payload: {
              nodeId: currentNodeId,
              reason: nodeExecution.pauseReason,
            },
          });
          return run;
        }

        const output = nodeExecution.output || {};
        contextState.nodeOutputs[node.id] = output;

        const postNodeControlState = this.getRunControlState(run.id);
        if (postNodeControlState) {
          return this.runRepository.getByIdOrThrow(run.id);
        }

        if (node.type === 'end') {
          break;
        }

        const nextEdge = this.selectNextEdge(compiled, node.id, output, contextState.runContext);
        if (!nextEdge) {
          break;
        }

        currentNodeId = nextEdge.to;
      }

      const completionControlState = this.getRunControlState(run.id);
      if (completionControlState) {
        return this.runRepository.getByIdOrThrow(run.id);
      }

      if (steps >= MAX_EXECUTION_STEPS) {
        throw new Error('Workflow exceeded max execution steps.');
      }

      run = this.runRepository.updateStatus(run.id, {
        status: 'completed',
        completedAt: Date.now(),
        currentNodeId: undefined,
        output: {
          nodes: contextState.nodeOutputs,
          steps,
        },
        error: undefined,
      });

      this.eventRepository.append({
        runId,
        type: 'run_completed',
        payload: {
          steps,
        },
      });

      return run;
    } catch (error) {
      const controlState = this.getRunControlState(run.id);
      if (controlState) {
        return this.runRepository.getByIdOrThrow(run.id);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      run = this.runRepository.updateStatus(run.id, {
        status: 'failed',
        completedAt: Date.now(),
        error: errorMessage,
      });
      this.eventRepository.append({
        runId,
        type: 'run_failed',
        payload: {
          error: errorMessage,
          nodeId: currentNodeId,
        },
      });
      return run;
    }
  }

  private buildRunContextState(run: WorkflowRun, definition: WorkflowDefinition): RunContextState {
    const nodeRuns = this.runRepository.getNodeRuns(run.id);
    const nodeOutputs: Record<string, unknown> = {};

    for (const nodeRun of nodeRuns) {
      if (nodeRun.status === 'succeeded' && nodeRun.output) {
        nodeOutputs[nodeRun.nodeId] = nodeRun.output;
      }
    }

    return {
      runContext: {
        run: {
          id: run.id,
          input: run.input,
          triggerContext: run.triggerContext,
        },
        trigger: run.triggerContext,
        approvals: (run.input.approvals as Record<string, boolean> | undefined) || {},
        system: {
          now: Date.now(),
        },
        workflow: {
          id: definition.id,
          version: definition.version,
        },
      },
      nodeOutputs,
    };
  }

  private async executeNodeWithRetry(
    run: WorkflowRun,
    definition: WorkflowDefinition,
    node: WorkflowNode,
    contextState: RunContextState,
  ): Promise<{
      output?: Record<string, unknown>;
      pauseRequested?: boolean;
      pauseReason?: string;
      abortedStatus?: 'paused' | 'cancelled';
    }> {
    const defaults = definition.defaults || {};
    const retryPolicy: WorkflowRetryPolicy = node.retry || defaults.retry || {
      maxAttempts: 3,
      backoffMs: 1000,
      maxBackoffMs: 20000,
      jitterRatio: 0.2,
    };

    let lastError: string | null = null;

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
      const controlState = this.getRunControlState(run.id);
      if (controlState) {
        return { abortedStatus: controlState };
      }

      const startedAt = Date.now();
      const nodeRun = this.runRepository.createNodeRun({
        runId: run.id,
        nodeId: node.id,
        attempt,
        status: 'running',
        input: {
          runInput: run.input,
          nodeConfig: node.config,
        },
        startedAt,
      });

      this.eventRepository.append({
        runId: run.id,
        type: 'node_started',
        payload: {
          nodeId: node.id,
          attempt,
          nodeType: node.type,
        },
      });

      try {
        const timeoutMs = node.timeoutMs || definition.defaults.nodeTimeoutMs || 5 * 60 * 1000;
        let timeoutHandle: NodeJS.Timeout | null = null;
        const result = await Promise.race([
          this.nodeExecutor.execute(node, {
            runContext: contextState.runContext,
            nodeOutputs: contextState.nodeOutputs,
            executeAgentPrompt: (prompt, options) => this.executeAgentPrompt(prompt, {
              ...options,
              runId: run.id,
            }),
          }),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`Node timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
          }),
        ]).finally(() => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        });

        const completedAt = Date.now();
        const durationMs = completedAt - startedAt;

        this.runRepository.updateNodeRun(nodeRun.id, {
          status: 'succeeded',
          output: result.output || {},
          completedAt,
          durationMs,
          error: undefined,
        });

        this.eventRepository.append({
          runId: run.id,
          type: 'node_succeeded',
          payload: {
            nodeId: node.id,
            attempt,
            durationMs,
            pauseRequested: Boolean(result.pauseRequested),
          },
        });

        return result;
      } catch (error) {
        const completedAt = Date.now();
        const durationMs = completedAt - startedAt;
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = errorMessage;

        this.runRepository.updateNodeRun(nodeRun.id, {
          status: 'failed',
          error: errorMessage,
          completedAt,
          durationMs,
        });

        this.eventRepository.append({
          runId: run.id,
          type: 'node_failed',
          payload: {
            nodeId: node.id,
            attempt,
            error: errorMessage,
            durationMs,
          },
        });

        if (attempt < retryPolicy.maxAttempts) {
          const retryControlState = this.getRunControlState(run.id);
          if (retryControlState) {
            return { abortedStatus: retryControlState };
          }

          const delay = computeRetryDelay(retryPolicy, attempt);
          await sleep(delay);
          continue;
        }
      }
    }

    throw new Error(lastError || `Node failed: ${node.id}`);
  }

  private getRunControlState(runId: string): 'paused' | 'cancelled' | null {
    const run = this.runRepository.getById(runId);
    if (!run) return null;
    if (run.status === 'paused') return 'paused';
    if (run.status === 'cancelled') return 'cancelled';
    return null;
  }

  private selectNextEdge(
    compiled: CompiledWorkflow,
    nodeId: string,
    output: Record<string, unknown>,
    runContext: Record<string, unknown>,
  ) {
    const edges = compiled.outgoing.get(nodeId) || [];
    if (edges.length === 0) return null;

    const localContext = {
      ...runContext,
      current: output,
    };

    for (const edge of edges) {
      if (edge.condition === 'always' || edge.condition === 'success') {
        return edge;
      }

      if (edge.condition === 'custom') {
        const expression = edge.expression?.trim() || '';
        if (!expression) continue;

        if (expression.startsWith('eq(') && expression.endsWith(')')) {
          const inner = expression.slice(3, -1);
          const [leftRaw, rightRaw] = inner.split(',').map((part) => part.trim());
          const left = this.resolvePathValue(localContext, leftRaw);
          const right = this.resolvePathValue(localContext, rightRaw);
          if (left === right) return edge;
          continue;
        }

        const truthy = this.resolvePathValue(localContext, expression);
        if (Boolean(truthy)) return edge;
      }
    }

    return null;
  }

  private resolvePathValue(source: Record<string, unknown>, path: string): unknown {
    const normalized = path.replace(/\[(\d+)\]/g, '.$1');
    return normalized.split('.').filter(Boolean).reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, source);
  }

  getRunWithDetails(runId: string): {
    run: WorkflowRun;
    nodeRuns: WorkflowNodeRun[];
  } {
    const run = this.runRepository.getByIdOrThrow(runId);
    const nodeRuns = this.runRepository.getNodeRuns(runId);
    return { run, nodeRuns };
  }

  getCompiled(definition: WorkflowDefinition): CompiledWorkflow {
    return compileWorkflowDefinition(definition);
  }
}
