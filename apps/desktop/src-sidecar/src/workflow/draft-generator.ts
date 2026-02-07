import type {
  CreateWorkflowDraftInput,
  CreateWorkflowFromPromptInput,
  WorkflowSchedule,
  WorkflowTrigger,
} from '@gemini-cowork/shared';
import { generateId } from '@gemini-cowork/shared';
import { detectSchedulingIntent } from '../suggestion-detector.js';

const DAY_TO_CRON: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseTime(value: string | null): { hour: number; minute: number } {
  const source = (value || '09:00').trim();
  const match = source.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hour: 9, minute: 0 };
  }

  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return { hour, minute };
}

function sentenceCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return 'Workflow';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function buildStepName(raw: string, index: number): string {
  const compact = raw
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return `Step ${index + 1}`;
  return sentenceCase(compact.slice(0, 80));
}

function splitIntoSteps(prompt: string): string[] {
  const raw = prompt
    .split(/\s+->\s+|\s+then\s+|[\n\r]+/gi)
    .map((step) => step.trim())
    .filter(Boolean);

  if (raw.length === 0) return [prompt.trim()];
  if (raw.length === 1) return raw;
  return raw.slice(0, 12);
}

function scheduleFromPrompt(prompt: string): WorkflowSchedule | null {
  const detection = detectSchedulingIntent(prompt);
  if (!detection.shouldSuggest || !detection.scheduleType) {
    return null;
  }

  switch (detection.scheduleType) {
    case 'interval': {
      const everyMinutes = detection.extractedInterval || 60;
      return {
        type: 'every',
        intervalMs: Math.max(1, everyMinutes) * 60_000,
      };
    }
    case 'weekly': {
      const day = (detection.extractedDay || 'monday').toLowerCase();
      const dayNum = DAY_TO_CRON[day] ?? 1;
      const { hour, minute } = parseTime(detection.extractedTime);
      return {
        type: 'cron',
        expression: `${minute} ${hour} * * ${dayNum}`,
      };
    }
    case 'once': {
      const ts = Date.now() + 60 * 60 * 1000;
      return {
        type: 'at',
        timestamp: ts,
      };
    }
    case 'daily':
    case 'cron':
    default: {
      const { hour, minute } = parseTime(detection.extractedTime);
      return {
        type: 'cron',
        expression: `${minute} ${hour} * * *`,
      };
    }
  }
}

export function buildWorkflowDraftFromPrompt(
  input: CreateWorkflowFromPromptInput,
): CreateWorkflowDraftInput {
  const prompt = input.prompt.trim();
  const schedule = scheduleFromPrompt(prompt);
  const steps = splitIntoSteps(prompt);

  const nodes: CreateWorkflowDraftInput['nodes'] = [
    { id: 'start', type: 'start', name: 'Start', config: {} },
  ];
  const edges: CreateWorkflowDraftInput['edges'] = [];

  const stepNodeIds: string[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const nodeId = `agent_step_${i + 1}`;
    stepNodeIds.push(nodeId);
    nodes.push({
      id: nodeId,
      type: 'agent_step',
      name: buildStepName(steps[i], i),
      config: {
        promptTemplate: steps.length === 1
          ? prompt
          : `Workflow goal:\n${prompt}\n\nExecute only this step:\n${steps[i]}`,
        workingDirectory: input.workingDirectory,
        maxTurns: input.maxTurnsPerStep || 20,
      },
    });
  }
  nodes.push({ id: 'end', type: 'end', name: 'End', config: {} });

  let previousId = 'start';
  for (const stepNodeId of stepNodeIds) {
    edges.push({
      id: generateId('edge'),
      from: previousId,
      to: stepNodeId,
      condition: 'always',
    });
    previousId = stepNodeId;
  }
  edges.push({
    id: generateId('edge'),
    from: previousId,
    to: 'end',
    condition: 'always',
  });

  const triggers: WorkflowTrigger[] = [
    { id: 'manual_default', type: 'manual', enabled: true },
  ];
  if (schedule) {
    triggers.push({
      id: `schedule_${Date.now()}`,
      type: 'schedule',
      enabled: true,
      schedule,
    });
  }

  return {
    name: input.name?.trim() || sentenceCase(steps[0] || 'Workflow automation'),
    description: `Generated from prompt: ${prompt.slice(0, 200)}`,
    triggers,
    nodes,
    edges,
    defaults: {
      workingDirectory: input.workingDirectory,
      maxRunTimeMs: 30 * 60 * 1000,
      nodeTimeoutMs: 5 * 60 * 1000,
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 20000,
        jitterRatio: 0.2,
      },
    },
  };
}
