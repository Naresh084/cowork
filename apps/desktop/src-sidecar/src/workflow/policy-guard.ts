import type { SessionType, ToolCallContext } from '@gemini-cowork/shared';
import { toolPolicyService } from '../tool-policy.js';

export interface WorkflowPolicyGuardInput {
  toolName: string;
  args: Record<string, unknown>;
  sessionId: string;
  sessionType: SessionType;
  provider?: string;
}

export function assertWorkflowToolAllowed(input: WorkflowPolicyGuardInput): void {
  const ctx: ToolCallContext = {
    toolName: input.toolName,
    arguments: input.args,
    sessionId: input.sessionId,
    sessionType: input.sessionType,
    provider: input.provider,
  };

  const result = toolPolicyService.evaluate(ctx);
  if (!result.allowed) {
    throw new Error(result.reason || `Tool blocked by policy: ${input.toolName}`);
  }
}
