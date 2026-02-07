import { useMemo } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';

export function WorkflowInspector() {
  const selectedWorkflowId = useWorkflowStore((state) => state.selectedWorkflowId);
  const selectedRunId = useWorkflowStore((state) => state.selectedRunId);
  const workflows = useWorkflowStore((state) => state.workflows);
  const runDetails = useWorkflowStore((state) => state.runDetails);
  const scheduledTasks = useWorkflowStore((state) => state.scheduledTasks);

  const workflow = useMemo(
    () => workflows.find((item) => item.id === selectedWorkflowId),
    [workflows, selectedWorkflowId],
  );

  const details = selectedRunId ? runDetails[selectedRunId] : undefined;

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
    </div>
  );
}
