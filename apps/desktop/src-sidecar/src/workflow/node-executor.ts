import type { WorkflowNode } from '@gemini-cowork/shared';
import { resolveTemplateString, resolveTemplateValue } from './template-resolver.js';

export interface NodeExecutionContext {
  runContext: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  executeAgentPrompt: (prompt: string, options?: {
    workingDirectory?: string;
    model?: string;
    maxTurns?: number;
  }) => Promise<{ content: string; promptTokens?: number; completionTokens?: number }>;
}

export interface NodeExecutionResult {
  output?: Record<string, unknown>;
  pauseRequested?: boolean;
  pauseReason?: string;
}

function evaluateSimpleExpression(expression: string, context: Record<string, unknown>): boolean {
  const trimmed = expression.trim();

  if (!trimmed) return false;

  if (trimmed.startsWith('not(') && trimmed.endsWith(')')) {
    return !evaluateSimpleExpression(trimmed.slice(4, -1), context);
  }

  const eqMatch = trimmed.match(/^eq\((.+),(.+)\)$/);
  if (eqMatch) {
    const left = resolveTemplateString(`{{${eqMatch[1].trim()}}}`, context).value;
    const right = resolveTemplateString(`{{${eqMatch[2].trim()}}}`, context).value;
    return left === right;
  }

  const containsMatch = trimmed.match(/^contains\((.+),(.+)\)$/);
  if (containsMatch) {
    const base = resolveTemplateString(`{{${containsMatch[1].trim()}}}`, context).value;
    const target = resolveTemplateString(`{{${containsMatch[2].trim()}}}`, context).value;
    return base.includes(target);
  }

  const truthy = resolveTemplateString(`{{${trimmed}}}`, context).value;
  return Boolean(truthy && truthy !== 'false' && truthy !== '0' && truthy !== '{}');
}

export class WorkflowNodeExecutor {
  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const templateContext = {
      ...context.runContext,
      nodes: context.nodeOutputs,
    };

    switch (node.type) {
      case 'start':
      case 'end': {
        return { output: { ok: true } };
      }

      case 'wait': {
        const rawDuration = (node.config.durationMs as number | string | undefined) ?? 0;
        const durationResolved = typeof rawDuration === 'string'
          ? resolveTemplateString(rawDuration, templateContext).value
          : String(rawDuration);
        const durationMs = Math.max(0, Number(durationResolved) || 0);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, durationMs);
          if (typeof timer.unref === 'function') timer.unref();
        });
        return { output: { waitedMs: durationMs } };
      }

      case 'condition': {
        const expression = String(node.config.expression || '').trim();
        const result = evaluateSimpleExpression(expression, templateContext);
        return { output: { expression, result } };
      }

      case 'approval': {
        const approvals = (context.runContext.approvals as Record<string, boolean> | undefined) || {};
        const autoApprove = Boolean(node.config.autoApprove);
        const approved = autoApprove || approvals[node.id] === true;

        if (!approved) {
          return {
            pauseRequested: true,
            pauseReason: String(node.config.reason || 'Approval required'),
            output: {
              approved: false,
              reason: node.config.reason || 'Approval required',
            },
          };
        }

        return { output: { approved: true } };
      }

      case 'agent_step': {
        const promptTemplate = String(node.config.promptTemplate || node.config.prompt || '').trim();
        const resolvedPrompt = resolveTemplateString(promptTemplate, templateContext);

        if (!resolvedPrompt.value) {
          throw new Error(`agent_step node ${node.id} has an empty promptTemplate.`);
        }

        const result = await context.executeAgentPrompt(resolvedPrompt.value, {
          workingDirectory: typeof node.config.workingDirectory === 'string' ? node.config.workingDirectory : undefined,
          model: typeof node.config.model === 'string' ? node.config.model : undefined,
          maxTurns: typeof node.config.maxTurns === 'number' ? node.config.maxTurns : undefined,
        });

        return {
          output: {
            text: result.content,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            missingPaths: resolvedPrompt.missingPaths,
          },
        };
      }

      case 'tool':
      case 'mcp_tool':
      case 'connector_tool':
      case 'memory_read':
      case 'memory_write':
      case 'notification':
      case 'subworkflow': {
        const resolvedConfig = resolveTemplateValue(node.config, templateContext);
        const syntheticPrompt = [
          `Execute workflow node type: ${node.type}`,
          `Node name: ${node.name}`,
          `Node config JSON: ${JSON.stringify(resolvedConfig.value)}`,
          'Use available tools as needed and return a concise JSON summary in your final response.',
        ].join('\n');

        const result = await context.executeAgentPrompt(syntheticPrompt, {
          workingDirectory:
            typeof (resolvedConfig.value as Record<string, unknown>).workingDirectory === 'string'
              ? String((resolvedConfig.value as Record<string, unknown>).workingDirectory)
              : undefined,
          model:
            typeof (resolvedConfig.value as Record<string, unknown>).model === 'string'
              ? String((resolvedConfig.value as Record<string, unknown>).model)
              : undefined,
          maxTurns:
            typeof (resolvedConfig.value as Record<string, unknown>).maxTurns === 'number'
              ? Number((resolvedConfig.value as Record<string, unknown>).maxTurns)
              : undefined,
        });

        return {
          output: {
            text: result.content,
            missingPaths: resolvedConfig.missingPaths,
          },
        };
      }

      case 'parallel':
      case 'loop': {
        // Full branch-level execution is planned next; for now these nodes act as pass-through markers.
        return {
          output: {
            passthrough: true,
            nodeType: node.type,
            note: `${node.type} node executed in compatibility mode`,
          },
        };
      }

      default: {
        throw new Error(`Unsupported node type: ${(node as { type: string }).type}`);
      }
    }
  }
}
