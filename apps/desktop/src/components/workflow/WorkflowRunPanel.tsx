import { useEffect, useMemo, useState } from 'react';
import type { WorkflowEvent, WorkflowNodeRun, WorkflowRun, WorkflowRunStatus } from '@gemini-cowork/shared';
import { useWorkflowStore } from '@/stores/workflow-store';

interface WorkflowRunPanelProps {
  workflowId?: string;
}

type EventTone = 'neutral' | 'good' | 'warn' | 'bad';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatDate(value?: number): string {
  if (!value) return 'n/a';
  return new Date(value).toLocaleString();
}

function formatTime(value?: number): string {
  if (!value) return 'n/a';
  return new Date(value).toLocaleTimeString();
}

function formatDuration(value?: number): string {
  if (typeof value !== 'number') return 'n/a';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function statusPillClass(status: WorkflowRunStatus): string {
  switch (status) {
    case 'running':
      return 'bg-[#22C55E]/20 text-[#86EFAC] border-[#22C55E]/40';
    case 'queued':
      return 'bg-[#3B82F6]/20 text-[#BFDBFE] border-[#3B82F6]/40';
    case 'completed':
      return 'bg-[#14B8A6]/20 text-[#99F6E4] border-[#14B8A6]/40';
    case 'paused':
      return 'bg-[#F59E0B]/20 text-[#FCD34D] border-[#F59E0B]/40';
    case 'failed':
    case 'failed_recoverable':
      return 'bg-[#EF4444]/20 text-[#FCA5A5] border-[#EF4444]/40';
    case 'cancelled':
      return 'bg-white/[0.10] text-white/70 border-white/[0.14]';
    default:
      return 'bg-white/[0.08] text-white/70 border-white/[0.12]';
  }
}

function eventTone(type: WorkflowEvent['type']): EventTone {
  switch (type) {
    case 'run_started':
    case 'run_resumed':
    case 'node_started':
      return 'neutral';
    case 'node_succeeded':
    case 'run_completed':
      return 'good';
    case 'run_paused':
    case 'run_cancelled':
    case 'node_skipped':
      return 'warn';
    case 'node_failed':
    case 'run_failed':
      return 'bad';
    default:
      return 'neutral';
  }
}

function eventToneClass(tone: EventTone): string {
  switch (tone) {
    case 'good':
      return 'border-[#22C55E]/35 bg-[#22C55E]/10 text-[#BBF7D0]';
    case 'warn':
      return 'border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#FCD34D]';
    case 'bad':
      return 'border-[#EF4444]/35 bg-[#EF4444]/10 text-[#FCA5A5]';
    case 'neutral':
    default:
      return 'border-white/[0.12] bg-white/[0.03] text-white/80';
  }
}

function describeEvent(event: WorkflowEvent): string {
  const payload = asRecord(event.payload);
  const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : null;
  const reason = typeof payload.reason === 'string' ? payload.reason : null;
  const error = typeof payload.error === 'string' ? payload.error : null;
  const step = typeof payload.steps === 'number' ? payload.steps : null;

  switch (event.type) {
    case 'run_started':
      return 'Run entered execution loop';
    case 'run_completed':
      return step != null ? `Run completed in ${step} steps` : 'Run completed successfully';
    case 'run_failed':
      return error || 'Run failed';
    case 'run_paused':
      return reason || 'Run paused';
    case 'run_resumed':
      return nodeId ? `Resumed at node ${nodeId}` : 'Run resumed';
    case 'run_cancelled':
      return reason || 'Run cancelled';
    case 'node_started':
      return nodeId ? `Node ${nodeId} started` : 'Node started';
    case 'node_succeeded':
      return nodeId ? `Node ${nodeId} succeeded` : 'Node succeeded';
    case 'node_failed':
      return error || (nodeId ? `Node ${nodeId} failed` : 'Node failed');
    case 'node_skipped':
      return nodeId ? `Node ${nodeId} skipped` : 'Node skipped';
    default:
      return event.type;
  }
}

function stringifyPayload(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function terminalStatus(status: WorkflowRunStatus): boolean {
  return (
    status === 'completed'
    || status === 'failed'
    || status === 'failed_recoverable'
    || status === 'cancelled'
  );
}

export function WorkflowRunPanel({ workflowId }: WorkflowRunPanelProps) {
  const runs = useWorkflowStore((state) => state.runs);
  const selectedRunId = useWorkflowStore((state) => state.selectedRunId);
  const runDetails = useWorkflowStore((state) => state.runDetails);
  const runEventBuffers = useWorkflowStore((state) => state.runEventBuffers);
  const runReplayCursor = useWorkflowStore((state) => state.runReplayCursor);
  const runStreamState = useWorkflowStore((state) => state.runStreamState);
  const runHealth = useWorkflowStore((state) => state.runHealth);
  const scheduledHealth = useWorkflowStore((state) => state.scheduledHealth);

  const loadRuns = useWorkflowStore((state) => state.loadRuns);
  const getRunDetails = useWorkflowStore((state) => state.getRunDetails);
  const pollRunNow = useWorkflowStore((state) => state.pollRunNow);
  const startRunStream = useWorkflowStore((state) => state.startRunStream);
  const stopRunStream = useWorkflowStore((state) => state.stopRunStream);
  const setSelectedRun = useWorkflowStore((state) => state.setSelectedRun);
  const setRunReplayCursor = useWorkflowStore((state) => state.setRunReplayCursor);
  const pauseRun = useWorkflowStore((state) => state.pauseRun);
  const resumeRun = useWorkflowStore((state) => state.resumeRun);
  const cancelRun = useWorkflowStore((state) => state.cancelRun);

  const [selectedNodeRunId, setSelectedNodeRunId] = useState<string | null>(null);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);

  useEffect(() => {
    void loadRuns({ workflowId, limit: 50 });
  }, [loadRuns, workflowId]);

  const visibleRuns = useMemo(
    () => (workflowId ? runs.filter((run) => run.workflowId === workflowId) : runs),
    [runs, workflowId],
  );

  useEffect(() => {
    if (visibleRuns.length === 0) return;
    if (!selectedRunId || !visibleRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRun(visibleRuns[0]?.id || null);
    }
  }, [visibleRuns, selectedRunId, setSelectedRun]);

  useEffect(() => {
    if (!selectedRunId) return;

    void getRunDetails(selectedRunId);
    void startRunStream(selectedRunId, { includeSnapshot: true });

    return () => {
      stopRunStream(selectedRunId);
    };
  }, [selectedRunId, getRunDetails, startRunStream, stopRunStream]);

  const selectedRun = useMemo(
    () => visibleRuns.find((run) => run.id === selectedRunId) || null,
    [visibleRuns, selectedRunId],
  );

  const details = selectedRunId ? runDetails[selectedRunId] : undefined;

  const timelineEvents = useMemo(() => {
    if (!selectedRunId) return [] as WorkflowEvent[];
    return runEventBuffers[selectedRunId] || details?.events || [];
  }, [selectedRunId, runEventBuffers, details]);

  const replayMaxIndex = Math.max(timelineEvents.length - 1, 0);
  const replayIndex = selectedRunId
    ? Math.max(0, Math.min(runReplayCursor[selectedRunId] ?? replayMaxIndex, replayMaxIndex))
    : 0;

  const currentEvent = timelineEvents[replayIndex] || null;

  const nodeRuns = useMemo(() => {
    const items = details?.nodeRuns || ([] as WorkflowNodeRun[]);
    return [...items].sort((a, b) => {
      const left = b.startedAt ?? b.completedAt ?? 0;
      const right = a.startedAt ?? a.completedAt ?? 0;
      if (left !== right) return left - right;
      return b.attempt - a.attempt;
    });
  }, [details]);

  useEffect(() => {
    if (nodeRuns.length === 0) {
      setSelectedNodeRunId(null);
      return;
    }
    if (!selectedNodeRunId || !nodeRuns.some((run) => run.id === selectedNodeRunId)) {
      setSelectedNodeRunId(nodeRuns[0]?.id || null);
    }
  }, [nodeRuns, selectedNodeRunId]);

  useEffect(() => {
    if (!isReplayPlaying || !selectedRunId) return;
    if (timelineEvents.length === 0) return;

    const timer = setInterval(() => {
      const state = useWorkflowStore.getState();
      const events = state.runEventBuffers[selectedRunId] || [];
      if (events.length === 0) return;

      const maxIndex = Math.max(events.length - 1, 0);
      const cursor = Math.max(
        0,
        Math.min(state.runReplayCursor[selectedRunId] ?? maxIndex, maxIndex),
      );

      if (cursor >= maxIndex) {
        setIsReplayPlaying(false);
        return;
      }

      state.advanceRunReplayCursor(selectedRunId, 1);
    }, 700);

    return () => {
      clearInterval(timer);
    };
  }, [isReplayPlaying, selectedRunId, timelineEvents.length]);

  const selectedNodeRun = useMemo(
    () => nodeRuns.find((nodeRun) => nodeRun.id === selectedNodeRunId) || null,
    [nodeRuns, selectedNodeRunId],
  );

  const workflowHealth = workflowId ? scheduledHealth[workflowId] : null;

  const streamMeta = selectedRun ? runStreamState[selectedRun.id] : undefined;
  const selectedRunHealth = selectedRun ? runHealth[selectedRun.id] : undefined;

  const handleReplayReset = () => {
    if (!selectedRunId) return;
    setRunReplayCursor(selectedRunId, 0);
  };

  const handleReplayLive = () => {
    if (!selectedRunId) return;
    setRunReplayCursor(selectedRunId, replayMaxIndex);
    setIsReplayPlaying(false);
  };

  const handlePauseResume = async (run: WorkflowRun) => {
    if (run.status === 'running') {
      await pauseRun(run.id);
      return;
    }

    if (run.status === 'paused' || run.status === 'failed_recoverable') {
      await resumeRun(run.id);
    }
  };

  return (
    <div className="h-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white/90">Run Timeline</h3>
        <button
          onClick={() => {
            if (!selectedRunId) return;
            void pollRunNow(selectedRunId);
          }}
          disabled={!selectedRunId}
          className="rounded border border-white/[0.12] px-2 py-1 text-[11px] text-white/80 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {workflowHealth && (
        <div className="mt-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-[11px] text-white/70">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white/85">Schedule Health</span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${
              workflowHealth.status === 'healthy'
                ? 'border-[#22C55E]/45 bg-[#22C55E]/15 text-[#86EFAC]'
                : workflowHealth.status === 'degraded'
                  ? 'border-[#F59E0B]/45 bg-[#F59E0B]/15 text-[#FCD34D]'
                  : workflowHealth.status === 'stalled'
                    ? 'border-[#EF4444]/45 bg-[#EF4444]/15 text-[#FCA5A5]'
                    : workflowHealth.status === 'paused'
                      ? 'border-white/[0.15] bg-white/[0.08] text-white/75'
                      : 'border-[#3B82F6]/45 bg-[#3B82F6]/15 text-[#BFDBFE]'
            }`}>
              {workflowHealth.status}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-white/55">
            {workflowHealth.reason} · running {workflowHealth.runningRuns} · queued {workflowHealth.queuedRuns}
          </div>
        </div>
      )}

      <div className="mt-3 grid h-[420px] grid-cols-12 gap-3">
        <div className="col-span-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2">
          <div className="mb-2 text-[11px] font-medium text-white/75">Runs</div>
          <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
            {visibleRuns.length === 0 && (
              <p className="text-xs text-white/50">No runs yet.</p>
            )}

            {visibleRuns.map((run) => {
              const stream = runStreamState[run.id];
              const health = runHealth[run.id];
              const isSelected = run.id === selectedRunId;

              return (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run.id)}
                  className={`w-full rounded-lg border px-2 py-2 text-left ${
                    isSelected
                      ? 'border-[#1D4ED8]/55 bg-[#1D4ED8]/10'
                      : 'border-white/[0.08] bg-black/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-medium text-white/85">{run.id}</div>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusPillClass(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-white/55">
                    v{run.workflowVersion} · {formatTime(run.createdAt)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
                    <span>{stream?.active ? 'live polling' : 'snapshot mode'}</span>
                    <span>{stream?.lastError ? 'poll error' : 'ok'}</span>
                  </div>
                  {health && (
                    <div className="mt-1 truncate text-[10px] text-white/50">{health.reason}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="col-span-8 flex min-h-0 flex-col gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
          {!selectedRun && (
            <p className="text-xs text-white/50">Select a run to inspect timeline and node details.</p>
          )}

          {selectedRun && (
            <>
              <div className="rounded border border-white/[0.08] bg-black/20 p-2 text-[11px] text-white/70">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-white/50">Run:</span> {selectedRun.id}
                  </div>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusPillClass(selectedRun.status)}`}>
                    {selectedRun.status}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-white/55">
                  <div>Created: {formatDate(selectedRun.createdAt)}</div>
                  <div>Current node: {selectedRun.currentNodeId || 'n/a'}</div>
                  <div>Started: {formatDate(selectedRun.startedAt)}</div>
                  <div>Completed: {formatDate(selectedRun.completedAt)}</div>
                </div>
                {selectedRun.error && (
                  <div className="mt-1 rounded border border-[#EF4444]/35 bg-[#EF4444]/10 px-2 py-1 text-[10px] text-[#FCA5A5]">
                    {selectedRun.error}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => void pollRunNow(selectedRun.id)}
                    className="rounded border border-white/[0.14] px-2 py-1 text-[10px] text-white/75"
                  >
                    Pull Latest
                  </button>

                  {(selectedRun.status === 'running' || selectedRun.status === 'paused' || selectedRun.status === 'failed_recoverable') && (
                    <button
                      onClick={() => void handlePauseResume(selectedRun)}
                      className="rounded border border-[#1D4ED8]/45 px-2 py-1 text-[10px] text-[#BFDBFE]"
                    >
                      {selectedRun.status === 'running' ? 'Pause Run' : 'Resume Run'}
                    </button>
                  )}

                  {!terminalStatus(selectedRun.status) && (
                    <button
                      onClick={() => void cancelRun(selectedRun.id)}
                      className="rounded border border-[#EF4444]/45 px-2 py-1 text-[10px] text-[#FCA5A5]"
                    >
                      Cancel Run
                    </button>
                  )}

                  {streamMeta?.lastError && (
                    <span className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-1 text-[10px] text-[#FCD34D]">
                      polling: {streamMeta.lastError}
                    </span>
                  )}

                  {selectedRunHealth && (
                    <span className="rounded border border-white/[0.14] bg-white/[0.04] px-2 py-1 text-[10px] text-white/70">
                      health: {selectedRunHealth.health}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded border border-white/[0.08] bg-black/20 p-2">
                <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-white/75">
                  <span>Timeline Replay</span>
                  <span>
                    {timelineEvents.length === 0
                      ? 'No events'
                      : `${Math.min(replayIndex + 1, timelineEvents.length)} / ${timelineEvents.length}`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsReplayPlaying((value) => !value)}
                    disabled={timelineEvents.length === 0}
                    className="rounded border border-[#1D4ED8]/45 px-2 py-1 text-[10px] text-[#BFDBFE] disabled:opacity-50"
                  >
                    {isReplayPlaying ? 'Pause Replay' : 'Play Replay'}
                  </button>
                  <button
                    onClick={handleReplayReset}
                    disabled={timelineEvents.length === 0}
                    className="rounded border border-white/[0.14] px-2 py-1 text-[10px] text-white/75 disabled:opacity-50"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleReplayLive}
                    disabled={timelineEvents.length === 0}
                    className="rounded border border-white/[0.14] px-2 py-1 text-[10px] text-white/75 disabled:opacity-50"
                  >
                    Live Tail
                  </button>
                </div>

                <input
                  type="range"
                  min={0}
                  max={replayMaxIndex}
                  value={replayIndex}
                  onChange={(event) => {
                    if (!selectedRunId) return;
                    setRunReplayCursor(selectedRunId, Number(event.target.value) || 0);
                    setIsReplayPlaying(false);
                  }}
                  disabled={timelineEvents.length === 0 || !selectedRunId}
                  className="mt-2 w-full"
                />
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
                <div className="min-h-0 rounded border border-white/[0.08] bg-black/20 p-2">
                  <div className="mb-2 text-[11px] font-medium text-white/75">Timeline Events</div>
                  <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
                    {timelineEvents.length === 0 && (
                      <p className="text-[11px] text-white/45">No events captured yet.</p>
                    )}

                    {timelineEvents.map((event, index) => {
                      const isVisible = index <= replayIndex;
                      const isActive = index === replayIndex;
                      const tone = eventTone(event.type);
                      return (
                        <button
                          key={event.id}
                          onClick={() => {
                            if (!selectedRunId) return;
                            setRunReplayCursor(selectedRunId, index);
                            setIsReplayPlaying(false);
                          }}
                          className={`w-full rounded border px-2 py-1.5 text-left transition ${eventToneClass(tone)} ${
                            isActive ? 'ring-1 ring-[#3B82F6]/60' : ''
                          } ${!isVisible ? 'opacity-45' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium">{event.type}</span>
                            <span className="text-[10px] text-white/45">{formatTime(event.ts)}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-white/70">{describeEvent(event)}</div>
                        </button>
                      );
                    })}
                  </div>

                  {currentEvent && (
                    <div className="mt-2 rounded border border-white/[0.10] bg-white/[0.03] p-2">
                      <div className="text-[10px] text-white/55">Selected event payload</div>
                      <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all text-[10px] text-white/70">
                        {stringifyPayload(currentEvent.payload)}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="min-h-0 rounded border border-white/[0.08] bg-black/20 p-2">
                  <div className="mb-2 text-[11px] font-medium text-white/75">Node Drilldown</div>
                  <div className="grid h-[250px] grid-cols-2 gap-2">
                    <div className="max-h-[250px] space-y-1 overflow-y-auto pr-1">
                      {nodeRuns.length === 0 && (
                        <p className="text-[11px] text-white/45">No node attempts yet.</p>
                      )}
                      {nodeRuns.map((nodeRun) => (
                        <button
                          key={nodeRun.id}
                          onClick={() => setSelectedNodeRunId(nodeRun.id)}
                          className={`w-full rounded border px-2 py-1.5 text-left ${
                            nodeRun.id === selectedNodeRunId
                              ? 'border-[#1D4ED8]/50 bg-[#1D4ED8]/10'
                              : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="truncate text-[10px] font-medium text-white/85">{nodeRun.nodeId}</div>
                          <div className="mt-0.5 text-[10px] text-white/55">
                            attempt {nodeRun.attempt} · {nodeRun.status}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="min-h-0 rounded border border-white/[0.08] bg-white/[0.03] p-2 text-[10px] text-white/70">
                      {!selectedNodeRun && (
                        <p className="text-white/45">Select a node attempt for details.</p>
                      )}

                      {selectedNodeRun && (
                        <>
                          <div>
                            <span className="text-white/50">Node:</span> {selectedNodeRun.nodeId}
                          </div>
                          <div>
                            <span className="text-white/50">Status:</span> {selectedNodeRun.status}
                          </div>
                          <div>
                            <span className="text-white/50">Attempt:</span> {selectedNodeRun.attempt}
                          </div>
                          <div>
                            <span className="text-white/50">Started:</span> {formatTime(selectedNodeRun.startedAt)}
                          </div>
                          <div>
                            <span className="text-white/50">Completed:</span> {formatTime(selectedNodeRun.completedAt)}
                          </div>
                          <div>
                            <span className="text-white/50">Duration:</span> {formatDuration(selectedNodeRun.durationMs)}
                          </div>

                          {selectedNodeRun.error && (
                            <div className="mt-1 rounded border border-[#EF4444]/35 bg-[#EF4444]/10 px-1.5 py-1 text-[10px] text-[#FCA5A5]">
                              {selectedNodeRun.error}
                            </div>
                          )}

                          <div className="mt-2 text-[10px] text-white/55">Input</div>
                          <pre className="max-h-16 overflow-auto whitespace-pre-wrap break-all rounded border border-white/[0.08] bg-black/30 p-1 text-[10px] text-white/70">
                            {stringifyPayload(selectedNodeRun.input)}
                          </pre>

                          <div className="mt-2 text-[10px] text-white/55">Output</div>
                          <pre className="max-h-16 overflow-auto whitespace-pre-wrap break-all rounded border border-white/[0.08] bg-black/30 p-1 text-[10px] text-white/70">
                            {stringifyPayload(selectedNodeRun.output || {})}
                          </pre>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
