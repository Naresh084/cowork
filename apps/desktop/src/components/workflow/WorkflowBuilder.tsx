import { useEffect, useMemo, useState } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useSettingsStore } from '@/stores/settings-store';
import type {
  CreateWorkflowDraftInput,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowSchedule,
  WorkflowTrigger,
} from '@gemini-cowork/shared';
import { WorkflowRunPanel } from './WorkflowRunPanel';
import { WorkflowInspector } from './WorkflowInspector';

interface WorkflowPackTemplate {
  id: string;
  name: string;
  description: string;
  triggerPhrases: string[];
  scheduleIntervalMinutes?: number;
  steps: Array<{
    name: string;
    promptTemplate: string;
  }>;
}

const WORKFLOW_PACK_TEMPLATES: WorkflowPackTemplate[] = [
  {
    id: 'pack_repo_triage',
    name: 'Repo Triage Pack',
    description: 'Scans git diff, groups risks, and drafts action items.',
    triggerPhrases: ['triage repository changes', 'review recent code changes'],
    scheduleIntervalMinutes: 120,
    steps: [
      {
        name: 'Collect Change Summary',
        promptTemplate: 'Summarize all meaningful code changes from the current workspace in bullet form.',
      },
      {
        name: 'Risk Classification',
        promptTemplate: 'Classify detected changes by risk level and identify missing tests or migration issues.',
      },
      {
        name: 'Action Plan Draft',
        promptTemplate: 'Produce a prioritized remediation checklist with concrete next actions.',
      },
    ],
  },
  {
    id: 'pack_incident_response',
    name: 'Incident Response Pack',
    description: 'Performs incident triage, mitigation plan, and stakeholder update draft.',
    triggerPhrases: ['triage production incident', 'open incident response workflow'],
    steps: [
      {
        name: 'Incident Snapshot',
        promptTemplate: 'Collect incident context, impact, suspected blast radius, and confidence.',
      },
      {
        name: 'Mitigation Plan',
        promptTemplate: 'Draft immediate mitigations with rollback-safe execution steps.',
      },
      {
        name: 'Status Communication',
        promptTemplate: 'Draft concise stakeholder update with ETA assumptions and risk disclaimers.',
      },
    ],
  },
  {
    id: 'pack_release_readiness',
    name: 'Release Readiness Pack',
    description: 'Runs release checks, validates gates, and prepares launch brief.',
    triggerPhrases: ['run release readiness workflow', 'evaluate release candidate'],
    scheduleIntervalMinutes: 1440,
    steps: [
      {
        name: 'Gate Validation',
        promptTemplate: 'Validate release gates, benchmark deltas, and unresolved high-severity issues.',
      },
      {
        name: 'Regression Sweep',
        promptTemplate: 'Identify likely regressions by comparing previous baseline and current branch behavior.',
      },
      {
        name: 'Launch Brief',
        promptTemplate: 'Prepare launch/no-launch recommendation with evidence and unresolved risks.',
      },
    ],
  },
];

function createDefaultWorkflowInput(name: string, workingDirectory?: string): CreateWorkflowDraftInput {
  return {
    name,
    triggers: [{ id: 'manual_default', type: 'manual', enabled: true }],
    nodes: [
      { id: 'start', type: 'start', name: 'Start', config: {} },
      {
        id: 'agent_step_1',
        type: 'agent_step',
        name: 'Agent Step',
        config: {
          promptTemplate: 'Describe what this workflow should do.',
          workingDirectory,
          maxTurns: 20,
        },
      },
      { id: 'end', type: 'end', name: 'End', config: {} },
    ],
    edges: [
      { id: 'edge_start_to_step', from: 'start', to: 'agent_step_1', condition: 'always' },
      { id: 'edge_step_to_end', from: 'agent_step_1', to: 'end', condition: 'always' },
    ],
    defaults: {
      workingDirectory,
      maxRunTimeMs: 30 * 60 * 1000,
      nodeTimeoutMs: 5 * 60 * 1000,
      retryProfile: 'balanced',
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 20000,
        jitterRatio: 0.2,
      },
    },
  };
}

function createWorkflowInputFromTemplate(
  template: WorkflowPackTemplate,
  workingDirectory?: string,
): CreateWorkflowDraftInput {
  const nodes: WorkflowNode[] = [
    { id: 'start', type: 'start', name: 'Start', config: {} },
    ...template.steps.map((step, index) => ({
      id: `agent_step_${index + 1}`,
      type: 'agent_step' as const,
      name: step.name,
      config: {
        promptTemplate: step.promptTemplate,
        workingDirectory,
        maxTurns: 24,
      },
    })),
    { id: 'end', type: 'end', name: 'End', config: {} },
  ];

  const triggers: WorkflowTrigger[] = [
    { id: 'manual_default', type: 'manual', enabled: true },
    {
      id: `chat_${template.id}`,
      type: 'chat',
      enabled: true,
      strictMatch: false,
      phrases: template.triggerPhrases,
    },
  ];

  if (template.scheduleIntervalMinutes) {
    triggers.push({
      id: `schedule_${template.id}`,
      type: 'schedule',
      enabled: false,
      schedule: {
        type: 'every',
        intervalMs: template.scheduleIntervalMinutes * 60 * 1000,
      },
    });
  }

  return {
    name: template.name,
    description: template.description,
    tags: ['pack', 'template'],
    triggers,
    nodes,
    edges: rebuildLinearEdges(nodes),
    defaults: {
      workingDirectory,
      maxRunTimeMs: 30 * 60 * 1000,
      nodeTimeoutMs: 5 * 60 * 1000,
      retryProfile: 'balanced',
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 20000,
        jitterRatio: 0.2,
      },
    },
  };
}

function ensureStartEnd(nodes: WorkflowNode[]): WorkflowNode[] {
  const existing = [...nodes];
  if (!existing.some((node) => node.type === 'start')) {
    existing.unshift({ id: 'start', type: 'start', name: 'Start', config: {} });
  }
  if (!existing.some((node) => node.type === 'end')) {
    existing.push({ id: 'end', type: 'end', name: 'End', config: {} });
  }
  return existing;
}

function rebuildLinearEdges(nodes: WorkflowNode[]) {
  const safeNodes = ensureStartEnd(nodes);
  const start = safeNodes.find((node) => node.type === 'start');
  const end = safeNodes.find((node) => node.type === 'end');
  const steps = safeNodes.filter((node) => node.type !== 'start' && node.type !== 'end');

  if (!start || !end) {
    return [];
  }

  const orderedIds = [start.id, ...steps.map((step) => step.id), end.id];
  const edges = [] as Array<{
    id: string;
    from: string;
    to: string;
    condition: 'always';
  }>;

  for (let i = 0; i < orderedIds.length - 1; i += 1) {
    edges.push({
      id: `edge_${orderedIds[i]}_${orderedIds[i + 1]}`,
      from: orderedIds[i],
      to: orderedIds[i + 1],
      condition: 'always',
    });
  }

  return edges;
}

function getScheduleTrigger(definition: WorkflowDefinition | null): Extract<WorkflowTrigger, { type: 'schedule' }> | null {
  if (!definition) return null;
  const trigger = definition.triggers.find((item) => item.type === 'schedule');
  return trigger && trigger.type === 'schedule' ? trigger : null;
}

function formatScheduleLabel(schedule: WorkflowSchedule): string {
  switch (schedule.type) {
    case 'at':
      return `Once at ${new Date(schedule.timestamp).toLocaleString()}`;
    case 'every':
      return `Every ${Math.round(schedule.intervalMs / 60000)}m`;
    case 'cron':
      return `Cron ${schedule.expression}`;
    default:
      return 'Schedule';
  }
}

export function WorkflowBuilder() {
  const workflows = useWorkflowStore((state) => state.workflows);
  const selectedWorkflowId = useWorkflowStore((state) => state.selectedWorkflowId);
  const loadWorkflows = useWorkflowStore((state) => state.loadWorkflows);
  const createDraft = useWorkflowStore((state) => state.createDraft);
  const createFromPrompt = useWorkflowStore((state) => state.createFromPrompt);
  const updateDraft = useWorkflowStore((state) => state.updateDraft);
  const publishWorkflow = useWorkflowStore((state) => state.publishWorkflow);
  const runWorkflow = useWorkflowStore((state) => state.runWorkflow);
  const loadScheduledTasks = useWorkflowStore((state) => state.loadScheduledTasks);
  const getWorkflow = useWorkflowStore((state) => state.getWorkflow);
  const setSelectedWorkflow = useWorkflowStore((state) => state.setSelectedWorkflow);
  const defaultWorkingDirectory = useSettingsStore((state) => state.defaultWorkingDirectory);

  const [draftName, setDraftName] = useState('');
  const [promptName, setPromptName] = useState('');
  const [promptSpec, setPromptSpec] = useState('');
  const [editing, setEditing] = useState<WorkflowDefinition | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkflows();
    void loadScheduledTasks();
  }, [loadWorkflows, loadScheduledTasks]);

  useEffect(() => {
    const loadSelected = async () => {
      if (!selectedWorkflowId) {
        setEditing(null);
        return;
      }
      const definition = await getWorkflow(selectedWorkflowId);
      setEditing(definition ? structuredClone(definition) : null);
    };

    void loadSelected();
  }, [selectedWorkflowId, getWorkflow]);

  const selected = useMemo(
    () => workflows.find((wf) => wf.id === selectedWorkflowId) || null,
    [workflows, selectedWorkflowId],
  );

  const stepNodes = useMemo(
    () => (editing?.nodes || []).filter((node) => node.type === 'agent_step'),
    [editing],
  );

  const scheduleTrigger = getScheduleTrigger(editing);

  const patchEditing = (mutator: (draft: WorkflowDefinition) => WorkflowDefinition) => {
    setEditing((current) => {
      if (!current) return current;
      return mutator(current);
    });
  };

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name) return;
    const created = await createDraft(createDefaultWorkflowInput(name, defaultWorkingDirectory || undefined));
    setSelectedWorkflow(created.id);
    setDraftName('');
  };

  const handleCreateFromPrompt = async (publish = false) => {
    if (!promptSpec.trim()) return;
    const created = await createFromPrompt({
      prompt: promptSpec.trim(),
      name: promptName.trim() || undefined,
      workingDirectory: defaultWorkingDirectory || undefined,
      publish,
    });
    setSelectedWorkflow(created.id);
    setPromptName('');
    setPromptSpec('');
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    const template = WORKFLOW_PACK_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setActiveTemplateId(templateId);
    try {
      const created = await createDraft(
        createWorkflowInputFromTemplate(template, defaultWorkingDirectory || undefined),
      );
      setSelectedWorkflow(created.id);
    } finally {
      setActiveTemplateId(null);
    }
  };

  const handleRun = async (workflow: WorkflowDefinition) => {
    await runWorkflow({ workflowId: workflow.id });
  };

  const handleSaveDraft = async () => {
    if (!editing) return;
    setIsSaving(true);
    try {
      const payload = {
        name: editing.name,
        description: editing.description,
        tags: editing.tags,
        triggers: editing.triggers,
        nodes: ensureStartEnd(editing.nodes),
        edges: rebuildLinearEdges(editing.nodes),
        defaults: editing.defaults,
      };
      const saved = await updateDraft(editing.id, payload);
      setEditing(structuredClone(saved));
      await loadWorkflows();
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!editing) return;
    setIsSaving(true);
    try {
      const published = await publishWorkflow(editing.id);
      setEditing(structuredClone(published));
      await loadWorkflows();
    } finally {
      setIsSaving(false);
    }
  };

  const addStep = () => {
    patchEditing((draft) => {
      const next = structuredClone(draft);
      const idx = next.nodes.filter((node) => node.type === 'agent_step').length + 1;
      next.nodes = ensureStartEnd([
        ...next.nodes.filter((node) => node.type !== 'end'),
        {
          id: `agent_step_${idx}`,
          type: 'agent_step',
          name: `Step ${idx}`,
          config: {
            promptTemplate: `Execute step ${idx}.`,
            workingDirectory: next.defaults.workingDirectory,
            maxTurns: 20,
          },
        },
        ...next.nodes.filter((node) => node.type === 'end'),
      ]);
      next.edges = rebuildLinearEdges(next.nodes);
      next.updatedAt = Date.now();
      return next;
    });
  };

  const removeStep = (nodeId: string) => {
    patchEditing((draft) => {
      const next = structuredClone(draft);
      next.nodes = ensureStartEnd(next.nodes.filter((node) => node.id !== nodeId));
      next.edges = rebuildLinearEdges(next.nodes);
      next.updatedAt = Date.now();
      return next;
    });
  };

  const updateStep = (nodeId: string, patch: Partial<WorkflowNode>) => {
    patchEditing((draft) => {
      const next = structuredClone(draft);
      next.nodes = next.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          ...patch,
          config: patch.config ? patch.config : node.config,
        };
      });
      next.updatedAt = Date.now();
      return next;
    });
  };

  const setScheduleEnabled = (enabled: boolean) => {
    patchEditing((draft) => {
      const next = structuredClone(draft);
      const existing = next.triggers.find((trigger) => trigger.type === 'schedule');
      if (enabled && !existing) {
        next.triggers = [
          ...next.triggers,
          {
            id: `schedule_${Date.now()}`,
            type: 'schedule',
            enabled: true,
            schedule: {
              type: 'every',
              intervalMs: 60 * 60 * 1000,
            },
          },
        ];
      } else {
        next.triggers = next.triggers.map((trigger) =>
          trigger.type === 'schedule'
            ? { ...trigger, enabled }
            : trigger,
        );
      }
      next.updatedAt = Date.now();
      return next;
    });
  };

  const updateSchedule = (schedule: WorkflowSchedule) => {
    patchEditing((draft) => {
      const next = structuredClone(draft);
      next.triggers = next.triggers.map((trigger) =>
        trigger.type === 'schedule'
          ? { ...trigger, schedule, enabled: true }
          : trigger,
      );
      next.updatedAt = Date.now();
      return next;
    });
  };

  const renderScheduleEditor = () => {
    if (!scheduleTrigger) return null;

    const schedule = scheduleTrigger.schedule;
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
        <div className="text-[11px] text-white/50">{formatScheduleLabel(schedule)}</div>

        <select
          value={schedule.type}
          onChange={(e) => {
            const type = e.target.value as WorkflowSchedule['type'];
            if (type === 'every') {
              updateSchedule({ type: 'every', intervalMs: 60 * 60 * 1000 });
              return;
            }
            if (type === 'at') {
              updateSchedule({ type: 'at', timestamp: Date.now() + 60 * 60 * 1000 });
              return;
            }
            updateSchedule({ type: 'cron', expression: '0 * * * *' });
          }}
          className="app-select app-select--compact w-full rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs text-white/90"
        >
          <option value="every">Every interval</option>
          <option value="cron">Cron expression</option>
          <option value="at">Run once</option>
        </select>

        {schedule.type === 'every' && (
          <div className="flex items-center gap-2 text-xs text-white/75">
            <span>Every</span>
            <input
              type="number"
              min={1}
              value={Math.max(1, Math.round(schedule.intervalMs / 60000))}
              onChange={(e) => {
                const mins = Math.max(1, Number(e.target.value) || 1);
                updateSchedule({ ...schedule, intervalMs: mins * 60000 });
              }}
              className="w-24 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-white/90"
            />
            <span>minutes</span>
          </div>
        )}

        {schedule.type === 'cron' && (
          <input
            value={schedule.expression}
            onChange={(e) => updateSchedule({ ...schedule, expression: e.target.value })}
            placeholder="0 * * * *"
            className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white/90"
          />
        )}

        {schedule.type === 'at' && (
          <input
            type="datetime-local"
            value={new Date(schedule.timestamp).toISOString().slice(0, 16)}
            onChange={(e) => {
              const ts = new Date(e.target.value).getTime();
              if (!Number.isNaN(ts)) {
                updateSchedule({ ...schedule, timestamp: ts });
              }
            }}
            className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white/90"
          />
        )}
      </div>
    );
  };

  return (
    <div className="grid h-full grid-cols-12 gap-4">
      <div className="col-span-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <h3 className="text-sm font-semibold text-white/90">Workflows</h3>

        <div className="mt-3 flex gap-2">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="New workflow name"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/90 outline-none focus:border-[#1D4ED8]/60"
          />
          <button
            onClick={handleCreate}
            className="rounded-lg bg-[#1D4ED8] px-3 py-2 text-xs font-medium text-white hover:bg-[#2563EB]"
          >
            New
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-[#1D4ED8]/30 bg-[#1D4ED8]/10 p-3">
          <div className="text-xs font-semibold text-[#BFDBFE]">Build From Chat Prompt</div>
          <input
            value={promptName}
            onChange={(e) => setPromptName(e.target.value)}
            placeholder="Optional workflow name"
            className="mt-2 w-full rounded border border-white/[0.12] bg-white/[0.06] px-2 py-1.5 text-xs text-white/90"
          />
          <textarea
            value={promptSpec}
            onChange={(e) => setPromptSpec(e.target.value)}
            placeholder="Example: Analyze repo changes every hour then summarize and post to Slack"
            className="mt-2 h-24 w-full rounded border border-white/[0.12] bg-white/[0.06] px-2 py-2 text-xs text-white/90"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void handleCreateFromPrompt(false)}
              className="rounded bg-[#2563EB] px-2 py-1.5 text-[11px] font-medium text-white"
            >
              Generate Draft
            </button>
            <button
              onClick={() => void handleCreateFromPrompt(true)}
              className="rounded border border-[#1D4ED8]/40 px-2 py-1.5 text-[11px] text-[#BFDBFE]"
            >
              Generate + Publish
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/[0.1] bg-white/[0.03] p-3">
          <div className="text-xs font-semibold text-white/85">Workflow Pack Templates</div>
          <p className="mt-1 text-[11px] text-white/55">
            Start from curated templates with chat triggers and default step chains.
          </p>

          <div className="mt-2 space-y-2">
            {WORKFLOW_PACK_TEMPLATES.map((template) => (
              <div key={template.id} className="rounded border border-white/[0.08] bg-black/20 p-2">
                <div className="text-xs font-medium text-white/85">{template.name}</div>
                <div className="mt-0.5 text-[11px] text-white/55">{template.description}</div>
                <div className="mt-1 text-[10px] text-white/45">
                  {template.steps.length} step(s)
                  {template.scheduleIntervalMinutes
                    ? ` · schedule every ${template.scheduleIntervalMinutes}m`
                    : ''}
                </div>
                <button
                  onClick={() => void handleCreateFromTemplate(template.id)}
                  disabled={activeTemplateId === template.id}
                  className="mt-2 rounded border border-[#1D4ED8]/45 px-2 py-1 text-[11px] text-[#BFDBFE] disabled:opacity-60"
                >
                  {activeTemplateId === template.id ? 'Creating...' : 'Use Template'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {workflows.map((workflow) => (
            <button
              key={`${workflow.id}:${workflow.version}`}
              onClick={() => setSelectedWorkflow(workflow.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                selectedWorkflowId === workflow.id
                  ? 'border-[#1D4ED8]/60 bg-[#1D4ED8]/10 text-white'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/80 hover:bg-white/[0.04]'
              }`}
            >
              <div className="font-medium">{workflow.name}</div>
              <div className="mt-0.5 text-[11px] text-white/55">
                v{workflow.version} · {workflow.status}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <h3 className="text-sm font-semibold text-white/90">Visual Builder</h3>

        {!editing && <p className="mt-3 text-xs text-white/50">Select a workflow to edit.</p>}

        {editing && (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
              <label className="text-[11px] text-white/55">Workflow Name</label>
              <input
                value={editing.name}
                onChange={(e) => patchEditing((draft) => ({ ...draft, name: e.target.value }))}
                className="mt-1 w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white/90"
              />

              <label className="mt-2 block text-[11px] text-white/55">Description</label>
              <textarea
                value={editing.description || ''}
                onChange={(e) => patchEditing((draft) => ({ ...draft, description: e.target.value || undefined }))}
                className="mt-1 h-16 w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white/90"
              />

              <div className="mt-3 flex items-center justify-between text-xs text-white/70">
                <span>Schedule Trigger</span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(scheduleTrigger?.enabled)}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                  />
                  Enabled
                </label>
              </div>
              {scheduleTrigger?.enabled && renderScheduleEditor()}
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-white/80">Step Nodes</div>
                <button
                  onClick={addStep}
                  className="rounded bg-[#1D4ED8] px-2 py-1 text-[11px] text-white"
                >
                  Add Step
                </button>
              </div>

              <div className="mt-2 space-y-2">
                {stepNodes.map((node, idx) => (
                  <div key={node.id} className="rounded border border-white/[0.08] bg-white/[0.03] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={node.name}
                        onChange={(e) => updateStep(node.id, { name: e.target.value })}
                        className="w-full rounded border border-white/[0.08] bg-white/[0.05] px-2 py-1 text-xs text-white/90"
                      />
                      <button
                        onClick={() => removeStep(node.id)}
                        className="rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      value={String(node.config.promptTemplate || '')}
                      onChange={(e) =>
                        updateStep(node.id, {
                          config: {
                            ...node.config,
                            promptTemplate: e.target.value,
                          },
                        })
                      }
                      className="mt-2 h-16 w-full rounded border border-white/[0.08] bg-white/[0.05] px-2 py-2 text-xs text-white/90"
                    />
                    <div className="mt-1 text-[10px] text-white/40">Step {idx + 1}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded border border-white/[0.08] bg-black/20 p-2 text-xs text-white/70">
                <div className="mb-1 font-medium text-white/80">Flow Preview</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-white/[0.06] px-2 py-1">Start</span>
                  {stepNodes.map((node) => (
                    <span key={`preview_${node.id}`} className="rounded bg-[#1D4ED8]/20 px-2 py-1 text-[#BFDBFE]">
                      → {node.name}
                    </span>
                  ))}
                  <span className="rounded bg-white/[0.06] px-2 py-1">→ End</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleSaveDraft()}
                disabled={isSaving}
                className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-medium text-white hover:bg-[#3B82F6] disabled:opacity-60"
              >
                Save Draft
              </button>
              <button
                onClick={() => void handlePublish()}
                disabled={isSaving}
                className="rounded-lg border border-[#1D4ED8]/40 px-3 py-2 text-xs font-medium text-[#BFDBFE] disabled:opacity-60"
              >
                Publish
              </button>
              <button
                onClick={() => selected && void handleRun(selected)}
                className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-medium text-white/80"
              >
                Run Now
              </button>
            </div>

            <WorkflowRunPanel workflowId={editing.id} />
          </div>
        )}
      </div>

      <div className="col-span-3">
        <WorkflowInspector />
      </div>
    </div>
  );
}
