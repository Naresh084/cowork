import { useMemo, useState } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function WorkflowInspector() {
  const selectedWorkflowId = useWorkflowStore((state) => state.selectedWorkflowId);
  const selectedRunId = useWorkflowStore((state) => state.selectedRunId);
  const workflows = useWorkflowStore((state) => state.workflows);
  const runDetails = useWorkflowStore((state) => state.runDetails);
  const scheduledTasks = useWorkflowStore((state) => state.scheduledTasks);
  const triggerEvaluation = useWorkflowStore((state) => state.triggerEvaluation);
  const triggerEvaluationLoading = useWorkflowStore((state) => state.triggerEvaluationLoading);
  const evaluateTriggerMessage = useWorkflowStore((state) => state.evaluateTriggerMessage);
  const clearTriggerEvaluation = useWorkflowStore((state) => state.clearTriggerEvaluation);

  const [diagnosticMessage, setDiagnosticMessage] = useState('');
  const [activationThreshold, setActivationThreshold] = useState(0.72);

  const workflow = useMemo(
    () => workflows.find((item) => item.id === selectedWorkflowId),
    [workflows, selectedWorkflowId],
  );

  const details = selectedRunId ? runDetails[selectedRunId] : undefined;

  const handleEvaluate = async (autoRun = false) => {
    if (!diagnosticMessage.trim()) return;
    await evaluateTriggerMessage({
      message: diagnosticMessage.trim(),
      workflowIds: workflow ? [workflow.id] : undefined,
      activationThreshold,
      autoRun,
    });
  };

  return (
    <div className="h-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-white/90">Inspector</h3>

      {!workflow && !details && (
        <p className="mt-3 text-xs text-white/50">Select a workflow or run to inspect details.</p>
      )}

      {workflow && (
        <div className="mt-3 space-y-2 text-xs text-white/70">
          <div>
            <span className="text-white/50">Workflow:</span> {workflow.name}
          </div>
          <div>
            <span className="text-white/50">Version:</span> {workflow.version}
          </div>
          <div>
            <span className="text-white/50">Status:</span> {workflow.status}
          </div>
          <div>
            <span className="text-white/50">Nodes:</span> {workflow.nodes.length}
          </div>
          <div>
            <span className="text-white/50">Triggers:</span> {workflow.triggers.length}
          </div>
          <div>
            <span className="text-white/50">Scheduled:</span>{' '}
            {scheduledTasks.some((task) => task.workflowId === workflow.id) ? 'Yes' : 'No'}
          </div>
        </div>
      )}

      {details && (
        <div className="mt-4 space-y-2 text-xs text-white/70">
          <div>
            <span className="text-white/50">Run:</span> {details.run.id}
          </div>
          <div>
            <span className="text-white/50">Run status:</span> {details.run.status}
          </div>
          <div>
            <span className="text-white/50">Node attempts:</span> {details.nodeRuns.length}
          </div>
          <div>
            <span className="text-white/50">Events:</span> {details.events.length}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
        <div className="text-xs font-semibold text-white/85">Trigger Diagnostics</div>
        <p className="mt-1 text-[11px] text-white/55">
          Evaluate confidence and reason codes before enabling auto-trigger behavior.
        </p>

        <textarea
          value={diagnosticMessage}
          onChange={(event) => setDiagnosticMessage(event.target.value)}
          placeholder="Type a user message to evaluate trigger confidence..."
          className="mt-2 h-20 w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white/90"
        />

        <div className="mt-2 flex items-center gap-2 text-[11px] text-white/60">
          <span>Activation threshold</span>
          <input
            type="number"
            min={0.5}
            max={0.95}
            step={0.01}
            value={activationThreshold}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isNaN(value)) {
                setActivationThreshold(Math.min(0.95, Math.max(0.5, value)));
              }
            }}
            className="w-20 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-white/90"
          />
        </div>

        <div className="mt-2 flex gap-2">
          <button
            onClick={() => void handleEvaluate(false)}
            disabled={triggerEvaluationLoading || !diagnosticMessage.trim()}
            className="rounded bg-[#2563EB] px-2 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
          >
            {triggerEvaluationLoading ? 'Evaluating...' : 'Evaluate'}
          </button>
          <button
            onClick={() => void handleEvaluate(true)}
            disabled={triggerEvaluationLoading || !diagnosticMessage.trim()}
            className="rounded border border-[#1D4ED8]/40 px-2 py-1.5 text-[11px] text-[#BFDBFE] disabled:opacity-50"
          >
            Evaluate + Run Top Match
          </button>
          {triggerEvaluation && (
            <button
              onClick={clearTriggerEvaluation}
              className="rounded border border-white/[0.12] px-2 py-1.5 text-[11px] text-white/70"
            >
              Clear
            </button>
          )}
        </div>

        {triggerEvaluation && (
          <div className="mt-3 space-y-2">
            <div className="text-[11px] text-white/55">
              Evaluated at {new Date(triggerEvaluation.evaluatedAt).toLocaleTimeString()} ·
              {` ${triggerEvaluation.matches.length} match(es)`}
            </div>
            {triggerEvaluation.activatedRun && (
              <div className="rounded border border-[#22C55E]/30 bg-[#22C55E]/10 px-2 py-1 text-[11px] text-[#86EFAC]">
                Activated run: {triggerEvaluation.activatedRun.id}
              </div>
            )}

            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {triggerEvaluation.matches.map((match) => (
                <div key={`${match.workflowId}:${match.triggerId}`} className="rounded border border-white/[0.08] bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-white/85">
                      {match.workflowName || match.workflowId}
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                      match.shouldActivate
                        ? 'bg-[#22C55E]/20 text-[#86EFAC]'
                        : 'bg-[#F59E0B]/20 text-[#FCD34D]'
                    }`}>
                      {Math.round(match.confidence * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-white/55">
                    phrase: {match.matchedPhrase || 'n/a'}
                  </div>
                  <div className="mt-1 text-[10px] text-white/50">
                    token coverage {formatPercent(match.breakdown.tokenCoverage)} · message coverage {formatPercent(match.breakdown.messageCoverage)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {match.reasonCodes.map((reason) => (
                      <span key={reason} className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/65">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
