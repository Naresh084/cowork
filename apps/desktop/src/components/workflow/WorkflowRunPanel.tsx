import { useEffect } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';

interface WorkflowRunPanelProps {
  workflowId?: string;
}

export function WorkflowRunPanel({ workflowId }: WorkflowRunPanelProps) {
  const runs = useWorkflowStore((state) => state.runs);
  const loadRuns = useWorkflowStore((state) => state.loadRuns);
  const getRunDetails = useWorkflowStore((state) => state.getRunDetails);
  const setSelectedRun = useWorkflowStore((state) => state.setSelectedRun);

  useEffect(() => {
    void loadRuns({ workflowId, limit: 50 });
  }, [loadRuns, workflowId]);

  return (
    <div className="h-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-white/90">Run Timeline</h3>

      <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {runs.length === 0 && <p className="text-xs text-white/50">No runs yet.</p>}

        {runs.map((run) => (
          <button
            key={run.id}
            onClick={() => {
              setSelectedRun(run.id);
              void getRunDetails(run.id);
            }}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.04]"
          >
            <div className="text-xs font-medium text-white/85">{run.id}</div>
            <div className="mt-0.5 text-[11px] text-white/60">
              {run.status} · v{run.workflowVersion} · {new Date(run.createdAt).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
