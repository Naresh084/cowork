import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeRun,
  WorkflowRun,
  WorkflowRetryProfile,
  WorkflowRetryPolicy,
} from '@gemini-cowork/shared';
import type { WorkflowEventRepository, WorkflowRunRepository } from '@gemini-cowork/storage';
import { compileWorkflowDefinition, type CompiledWorkflow } from './compiler.js';
import { WorkflowNodeExecutor } from './node-executor.js';
import { computeRetryDelay, resolveRetryPolicy, sleep } from './retry-policy.js';
import { resolveTemplateString } from './template-resolver.js';

const MAX_EXECUTION_STEPS = 2000;
const DEFAULT_RUN_TIMEOUT_MS = 30 * 60 * 1000;
const RUNTIME_OUTPUT_KEY = '__runtime';
const BALANCED_DEFAULT_RETRY: WorkflowRetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  maxBackoffMs: 20000,
  jitterRatio: 0.2,
};
const RETRY_PROFILES = new Set<WorkflowRetryProfile>([
  'fast_safe',
  'balanced',
  'strict_enterprise',
]);

interface WorkflowRuntimeCheckpoint {
  step: number;
  completedNodeId: string;
  nextNodeId: string | null;
  nodeRunId: string;
  recordedAt: number;
}

interface WorkflowRuntimeResumeInfo {
  reason: string;
  fromNodeId?: string;
  toNodeId?: string | null;
  resumedAt: number;
}

interface WorkflowRuntimeOutput {
  checkpoint?: WorkflowRuntimeCheckpoint;
  resume?: WorkflowRuntimeResumeInfo;
}

interface WorkflowCompensationConfig {
  enabled?: boolean;
  strategy?: 'before_retry' | 'always' | 'none';
  promptTemplate?: string;
  maxTurns?: number;
  workingDirectory?: string;
  model?: string;
}

interface WorkflowCompensationResult {
  applied: boolean;
  strategy?: string;
  error?: string;
  missingPaths?: string[];
}

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

    const initialCheckpoint = this.getRuntimeCheckpoint(run.output);
    if (
      initialCheckpoint
      && run.currentNodeId
      && run.currentNodeId === initialCheckpoint.completedNodeId
    ) {
      const completedOutput = contextState.nodeOutputs[initialCheckpoint.completedNodeId];
      const safeOutput =
        completedOutput && typeof completedOutput === 'object'
          ? (completedOutput as Record<string, unknown>)
          : {};
      const inferredNextNode =
        initialCheckpoint.nextNodeId
        || this.selectNextEdge(compiled, initialCheckpoint.completedNodeId, safeOutput, contextState.runContext)?.to
        || undefined;

      run = this.runRepository.updateStatus(run.id, {
        currentNodeId: inferredNextNode,
        output: this.mergeRuntimeOutput(run.output, {
          checkpoint: {
            ...initialCheckpoint,
            nextNodeId: inferredNextNode ?? null,
          },
          resume: {
            reason: 'deterministic_resume_checkpoint',
            fromNodeId: initialCheckpoint.completedNodeId,
            toNodeId: inferredNextNode ?? null,
            resumedAt: Date.now(),
          },
        }),
      });

      this.eventRepository.append({
        runId,
        type: 'run_resumed',
        payload: {
          reason: 'deterministic_resume_checkpoint',
          fromNodeId: initialCheckpoint.completedNodeId,
          toNodeId: inferredNextNode ?? null,
          checkpointStep: initialCheckpoint.step,
        },
      });
    }

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

        const nodeExecution = await this.executeNodeWithRetry(
          run,
          definition,
          node,
          contextState,
          steps,
        );
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

        let nextNodeId: string | undefined;
        if (node.type !== 'end') {
          const nextEdge = this.selectNextEdge(compiled, node.id, output, contextState.runContext);
          nextNodeId = nextEdge?.to;
        }

        const runSnapshot = this.runRepository.getByIdOrThrow(run.id);
        const existingCheckpoint = this.getRuntimeCheckpoint(runSnapshot.output);
        run = this.runRepository.updateStatus(run.id, {
          status: 'running',
          currentNodeId: nextNodeId,
          error: undefined,
          output: this.mergeRuntimeOutput(runSnapshot.output, {
            checkpoint: {
              step: steps,
              completedNodeId: node.id,
              nextNodeId: nextNodeId ?? null,
              nodeRunId: nodeExecution.nodeRunId || existingCheckpoint?.nodeRunId || '',
              recordedAt: Date.now(),
            },
          }),
        });

        const postNodeControlState = this.getRunControlState(run.id);
        if (postNodeControlState) {
          return this.runRepository.getByIdOrThrow(run.id);
        }

        if (node.type === 'end') {
          break;
        }

        if (!nextNodeId) {
          break;
        }

        currentNodeId = nextNodeId;
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
          [RUNTIME_OUTPUT_KEY]: this.getRuntimeOutput(run.output) || {},
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
    step: number,
  ): Promise<{
      output?: Record<string, unknown>;
      pauseRequested?: boolean;
      pauseReason?: string;
      abortedStatus?: 'paused' | 'cancelled';
      nodeRunId?: string;
    }> {
    const { retryPolicy, retryProfile } = this.resolveNodeRetryPolicy(run, definition, node);

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
          retryProfile,
          retryPolicy,
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

        if (!result.pauseRequested) {
          const runSnapshot = this.runRepository.getByIdOrThrow(run.id);
          this.runRepository.updateStatus(run.id, {
            output: this.mergeRuntimeOutput(runSnapshot.output, {
              checkpoint: {
                step,
                completedNodeId: node.id,
                nextNodeId: null,
                nodeRunId: nodeRun.id,
                recordedAt: completedAt,
              },
            }),
          });
        }

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

        return {
          ...result,
          nodeRunId: nodeRun.id,
        };
      } catch (error) {
        const completedAt = Date.now();
        const durationMs = completedAt - startedAt;
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = errorMessage;

        let compensation: WorkflowCompensationResult | undefined;
        if (attempt < retryPolicy.maxAttempts) {
          compensation = await this.runCompensationHook({
            run,
            node,
            attempt,
            errorMessage,
            contextState,
          });
        }

        const failureOutput: Record<string, unknown> = {};
        if (compensation) {
          failureOutput.compensation = compensation;
        }

        this.runRepository.updateNodeRun(nodeRun.id, {
          status: 'failed',
          output: Object.keys(failureOutput).length > 0 ? failureOutput : undefined,
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
            willRetry: attempt < retryPolicy.maxAttempts,
            compensationApplied: compensation?.applied ?? false,
            compensationError: compensation?.error,
            retryProfile,
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

  private resolveNodeRetryPolicy(
    run: WorkflowRun,
    definition: WorkflowDefinition,
    node: WorkflowNode,
  ): {
      retryPolicy: WorkflowRetryPolicy;
      retryProfile: WorkflowRetryProfile;
    } {
    const retryProfile = this.resolveRetryProfile(run, definition, node);
    const nodePolicyOverride = node.retry;
    if (nodePolicyOverride) {
      return {
        retryPolicy: resolveRetryPolicy(retryProfile, nodePolicyOverride),
        retryProfile,
      };
    }

    const defaultsPolicy = definition.defaults.retry;
    if (defaultsPolicy && !this.isBalancedDefaultRetryPolicy(defaultsPolicy)) {
      return {
        retryPolicy: resolveRetryPolicy(retryProfile, defaultsPolicy),
        retryProfile,
      };
    }

    return {
      retryPolicy: resolveRetryPolicy(retryProfile),
      retryProfile,
    };
  }

  private resolveRetryProfile(
    run: WorkflowRun,
    definition: WorkflowDefinition,
    node: WorkflowNode,
  ): WorkflowRetryProfile {
    const runInput = run.input as Record<string, unknown>;
    const runInputProfile = runInput.retryProfile;
    const candidate = node.retryProfile
      || (typeof runInputProfile === 'string' ? runInputProfile : undefined)
      || definition.defaults.retryProfile
      || 'balanced';
    return RETRY_PROFILES.has(candidate as WorkflowRetryProfile)
      ? (candidate as WorkflowRetryProfile)
      : 'balanced';
  }

  private isBalancedDefaultRetryPolicy(policy: WorkflowRetryPolicy): boolean {
    return policy.maxAttempts === BALANCED_DEFAULT_RETRY.maxAttempts
      && policy.backoffMs === BALANCED_DEFAULT_RETRY.backoffMs
      && policy.maxBackoffMs === BALANCED_DEFAULT_RETRY.maxBackoffMs
      && policy.jitterRatio === BALANCED_DEFAULT_RETRY.jitterRatio;
  }

  private getRuntimeOutput(output?: Record<string, unknown>): WorkflowRuntimeOutput | null {
    if (!output) return null;
    const runtime = output[RUNTIME_OUTPUT_KEY];
    if (!runtime || typeof runtime !== 'object') return null;
    return runtime as WorkflowRuntimeOutput;
  }

  private getRuntimeCheckpoint(output?: Record<string, unknown>): WorkflowRuntimeCheckpoint | null {
    const runtime = this.getRuntimeOutput(output);
    if (!runtime?.checkpoint) return null;
    const checkpoint = runtime.checkpoint;
    if (
      typeof checkpoint.completedNodeId !== 'string'
      || typeof checkpoint.nodeRunId !== 'string'
      || typeof checkpoint.step !== 'number'
      || typeof checkpoint.recordedAt !== 'number'
    ) {
      return null;
    }

    return {
      step: checkpoint.step,
      completedNodeId: checkpoint.completedNodeId,
      nextNodeId: checkpoint.nextNodeId ?? null,
      nodeRunId: checkpoint.nodeRunId,
      recordedAt: checkpoint.recordedAt,
    };
  }

  private mergeRuntimeOutput(
    output: Record<string, unknown> | undefined,
    updates: Partial<WorkflowRuntimeOutput>,
  ): Record<string, unknown> {
    const existingRuntime = this.getRuntimeOutput(output) || {};
    return {
      ...(output || {}),
      [RUNTIME_OUTPUT_KEY]: {
        ...existingRuntime,
        ...updates,
      },
    };
  }

  private getCompensationConfig(node: WorkflowNode): WorkflowCompensationConfig | null {
    const raw = (node.config as Record<string, unknown>).compensation;
    if (!raw || typeof raw !== 'object') return null;

    const config = raw as Record<string, unknown>;
    const strategy = typeof config.strategy === 'string' ? config.strategy : undefined;
    if (strategy && strategy !== 'before_retry' && strategy !== 'always' && strategy !== 'none') {
      return null;
    }

    return {
      enabled: typeof config.enabled === 'boolean' ? config.enabled : undefined,
      strategy: strategy as WorkflowCompensationConfig['strategy'],
      promptTemplate: typeof config.promptTemplate === 'string' ? config.promptTemplate : undefined,
      maxTurns: typeof config.maxTurns === 'number' ? config.maxTurns : undefined,
      workingDirectory: typeof config.workingDirectory === 'string' ? config.workingDirectory : undefined,
      model: typeof config.model === 'string' ? config.model : undefined,
    };
  }

  private async runCompensationHook(params: {
    run: WorkflowRun;
    node: WorkflowNode;
    attempt: number;
    errorMessage: string;
    contextState: RunContextState;
  }): Promise<WorkflowCompensationResult> {
    const config = this.getCompensationConfig(params.node);
    if (!config || config.enabled === false) {
      return { applied: false, strategy: 'disabled' };
    }

    const strategy = config.strategy || 'before_retry';
    if (strategy === 'none') {
      return { applied: false, strategy };
    }

    const templateContext = {
      ...params.contextState.runContext,
      nodes: params.contextState.nodeOutputs,
      compensation: {
        runId: params.run.id,
        nodeId: params.node.id,
        attempt: params.attempt,
        error: params.errorMessage,
      },
    };

    const promptTemplate =
      config.promptTemplate
      || [
        'Compensation step for workflow node retry.',
        'Run: {{compensation.runId}}',
        'Node: {{compensation.nodeId}}',
        'Attempt: {{compensation.attempt}}',
        'Error: {{compensation.error}}',
        'Apply rollback or idempotent safeguards before retrying.',
      ].join('\n');
    const resolvedPrompt = resolveTemplateString(promptTemplate, templateContext);
    if (!resolvedPrompt.value.trim()) {
      return {
        applied: false,
        strategy,
        error: 'Compensation prompt resolved to empty text.',
      };
    }

    try {
      await this.executeAgentPrompt(resolvedPrompt.value, {
        runId: params.run.id,
        maxTurns: config.maxTurns,
        workingDirectory: config.workingDirectory,
        model: config.model,
      });
      return {
        applied: true,
        strategy,
        missingPaths: resolvedPrompt.missingPaths,
      };
    } catch (error) {
      return {
        applied: false,
        strategy,
        error: error instanceof Error ? error.message : String(error),
        missingPaths: resolvedPrompt.missingPaths,
      };
    }
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
