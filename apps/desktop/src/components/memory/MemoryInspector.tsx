// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Loader2,
  MessageSquareQuote,
  Pencil,
  Pin,
  Save,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemoryStore, type Memory } from '../../stores/memory-store';

interface MemoryInspectorProps {
  memory: Memory | null;
  sessionId: string | null;
}

const FEEDBACK_BUTTON_BASE =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors';

export function MemoryInspector({ memory, sessionId }: MemoryInspectorProps) {
  const [queryDraft, setQueryDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftGroup, setDraftGroup] = useState<Memory['group']>('context');

  const deepQueryResult = useMemoryStore((state) => state.deepQueryResult);
  const deepQueryAtoms = useMemoryStore((state) => state.deepQueryAtoms);
  const isDeepQuerying = useMemoryStore((state) => state.isDeepQuerying);
  const isSubmittingFeedback = useMemoryStore((state) => state.isSubmittingFeedback);
  const isDeleting = useMemoryStore((state) => state.isDeleting);
  const lastFeedback = useMemoryStore((state) => state.lastFeedback);
  const runDeepQuery = useMemoryStore((state) => state.runDeepQuery);
  const submitDeepFeedback = useMemoryStore((state) => state.submitDeepFeedback);
  const clearDeepQueryState = useMemoryStore((state) => state.clearDeepQueryState);
  const updateMemory = useMemoryStore((state) => state.updateMemory);
  const deleteMemory = useMemoryStore((state) => state.deleteMemory);

  useEffect(() => {
    if (!memory) {
      setQueryDraft('');
      setIsEditing(false);
      clearDeepQueryState();
      return;
    }

    const condensed = `${memory.title} ${memory.content}`.trim().slice(0, 220);
    setQueryDraft(condensed);
    setDraftTitle(memory.title);
    setDraftContent(memory.content);
    setDraftGroup(memory.group);
    setIsEditing(false);
    clearDeepQueryState();
  }, [memory, clearDeepQueryState]);

  const selectedAtomEvidence = useMemo(() => {
    if (!memory || !deepQueryResult) return null;
    return deepQueryResult.evidence.find((entry) => entry.atomId === memory.id) || null;
  }, [memory, deepQueryResult]);
  const selectedAtom = useMemo(() => {
    if (!memory) return null;
    return deepQueryAtoms.find((entry) => entry.id === memory.id) || null;
  }, [memory, deepQueryAtoms]);

  if (!memory) {
    return (
      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/45">
          Select a memory to inspect source evidence and submit feedback.
        </div>
      </div>
    );
  }

  const queryId = deepQueryResult?.queryId;

  const handleQuery = async () => {
    if (!sessionId || !queryDraft.trim()) return;
    await runDeepQuery(sessionId, queryDraft.trim(), {
      limit: 8,
      includeSensitive: false,
      includeGraphExpansion: true,
    });
  };

  const handleFeedback = async (
    atomId: string,
    feedback: 'positive' | 'negative' | 'pin' | 'unpin' | 'hide' | 'report_conflict',
    note?: string,
  ) => {
    if (!sessionId || !queryId) return;
    await submitDeepFeedback(sessionId, queryId, atomId, feedback, note);
  };
  const handleSaveEdit = async () => {
    if (!memory) return;
    const nextTitle = draftTitle.trim();
    const nextContent = draftContent.trim();
    if (!nextTitle || !nextContent) return;
    await updateMemory(memory.id, {
      title: nextTitle,
      content: nextContent,
      group: draftGroup,
    });
    setIsEditing(false);
  };
  const handleDeleteMemory = async () => {
    if (!memory) return;
    const confirmed = window.confirm('Delete this memory?');
    if (!confirmed) return;
    await deleteMemory(memory.id);
  };
  const handleCancelEdit = () => {
    if (!memory) return;
    setDraftTitle(memory.title);
    setDraftContent(memory.content);
    setDraftGroup(memory.group);
    setIsEditing(false);
  };
  const deleteInFlight = memory ? isDeleting.has(memory.id) : false;

  return (
    <div className="border-t border-white/[0.06] px-4 py-3 space-y-3 bg-black/10">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-white/80">Memory Inspector</h4>
        <span className="text-[11px] text-white/45">id: {memory.id}</span>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
        <div className="text-[11px] text-white/55">Selected Memory</div>
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Memory title"
              className={cn(
                'w-full rounded-md border border-white/[0.08] bg-[#0D0D0F] px-2 py-1.5 text-xs text-white/85',
                'focus:outline-none focus:border-[#1D4ED8]/50',
              )}
            />
            <select
              value={draftGroup}
              onChange={(event) => setDraftGroup(event.target.value as Memory['group'])}
              className={cn(
                'w-full rounded-md border border-white/[0.08] bg-[#0D0D0F] px-2 py-1.5 text-xs text-white/75',
                'focus:outline-none focus:border-[#1D4ED8]/50',
              )}
            >
              <option value="preferences">preferences</option>
              <option value="learnings">learnings</option>
              <option value="context">context</option>
              <option value="instructions">instructions</option>
            </select>
            <textarea
              rows={4}
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder="Memory content"
              className={cn(
                'w-full rounded-md border border-white/[0.08] bg-[#0D0D0F] px-2 py-1.5 text-xs text-white/85 resize-none',
                'focus:outline-none focus:border-[#1D4ED8]/50',
              )}
            />
          </div>
        ) : (
          <>
            <div className="mt-1 text-xs text-white/85">{memory.title}</div>
            <div className="mt-1 text-xs text-white/60 line-clamp-3">{memory.content}</div>
          </>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/45">
          <span>group: {memory.group}</span>
          <span>source: {memory.source}</span>
          <span>confidence: {Math.round((memory.confidence || 0) * 100)}%</span>
        </div>
        {selectedAtomEvidence ? (
          <div className="mt-2 rounded-md bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/70">
            rank score: {selectedAtomEvidence.score.toFixed(3)} ·{' '}
            {(selectedAtomEvidence.reasons || []).slice(0, 3).join(', ') || 'no reasons'}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {isEditing ? (
            <>
              <button
                onClick={() => void handleSaveEdit()}
                disabled={!draftTitle.trim() || !draftContent.trim()}
                className={cn(
                  FEEDBACK_BUTTON_BASE,
                  'bg-[#1D4ED8]/20 text-[#BFDBFE] hover:bg-[#1D4ED8]/30',
                  (!draftTitle.trim() || !draftContent.trim()) && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className={cn(
                  FEEDBACK_BUTTON_BASE,
                  'bg-white/[0.08] text-white/75 hover:bg-white/[0.12]',
                )}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className={cn(
                  FEEDBACK_BUTTON_BASE,
                  'bg-white/[0.08] text-white/75 hover:bg-white/[0.12]',
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => void handleDeleteMemory()}
                disabled={deleteInFlight}
                className={cn(
                  FEEDBACK_BUTTON_BASE,
                  'bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
                  deleteInFlight && 'opacity-50 cursor-not-allowed',
                )}
              >
                {deleteInFlight ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete
              </button>
              <button
                onClick={() =>
                  void handleFeedback(
                    memory.id,
                    selectedAtom?.pinned ? 'unpin' : 'pin',
                    'Inspector-selected',
                  )
                }
                disabled={!queryId || isSubmittingFeedback}
                className={cn(
                  FEEDBACK_BUTTON_BASE,
                  'bg-violet-500/10 text-violet-200 hover:bg-violet-500/20',
                  (!queryId || isSubmittingFeedback) && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Pin className="h-3.5 w-3.5" />
                {selectedAtom?.pinned ? 'Unpin' : 'Pin'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
        <label className="text-[11px] text-white/55">Inspect retrieval evidence</label>
        <div className="mt-2 flex gap-2">
          <input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="Ask memory relevance question..."
            className={cn(
              'flex-1 rounded-md border border-white/[0.08] bg-[#0D0D0F] px-2 py-1.5 text-xs text-white/85',
              'focus:outline-none focus:border-[#1D4ED8]/50',
            )}
          />
          <button
            onClick={() => void handleQuery()}
            disabled={!sessionId || !queryDraft.trim() || isDeepQuerying}
            className="rounded-md border border-[#1D4ED8]/35 bg-[#1D4ED8]/20 px-2.5 py-1.5 text-[11px] text-[#BFDBFE] hover:bg-[#1D4ED8]/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeepQuerying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Query'}
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {deepQueryAtoms.length === 0 ? (
          <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-[11px] text-white/45">
            Run a deep query to see ranked atoms and explanations.
          </div>
        ) : (
          deepQueryAtoms.map((atom) => (
            <div key={atom.id} className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-white/70">
                  #{atom.rank} · q:{atom.queryScore.toFixed(3)} · c:{atom.confidenceScore.toFixed(2)}
                </div>
                {atom.id === memory.id ? (
                  <span className="rounded bg-[#1D4ED8]/20 px-1.5 py-0.5 text-[10px] text-[#93C5FD]">
                    selected
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-white/82 line-clamp-2">{atom.content}</div>
              {atom.explanations.length > 0 ? (
                <div className="mt-1 text-[11px] text-white/50">
                  {(atom.explanations || []).slice(0, 3).join(' · ')}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => void handleFeedback(atom.id, 'positive')}
                  disabled={!queryId || isSubmittingFeedback}
                  className={cn(
                    FEEDBACK_BUTTON_BASE,
                    'bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20',
                    !queryId && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Useful
                </button>
                <button
                  onClick={() => void handleFeedback(atom.id, 'negative')}
                  disabled={!queryId || isSubmittingFeedback}
                  className={cn(
                    FEEDBACK_BUTTON_BASE,
                    'bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
                    !queryId && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Noise
                </button>
                <button
                  onClick={() => void handleFeedback(atom.id, 'pin')}
                  disabled={!queryId || isSubmittingFeedback}
                  className={cn(
                    FEEDBACK_BUTTON_BASE,
                    'bg-violet-500/10 text-violet-200 hover:bg-violet-500/20',
                    !queryId && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <Pin className="h-3.5 w-3.5" />
                  Pin
                </button>
                <button
                  onClick={() => void handleFeedback(atom.id, 'report_conflict', 'Inspector-reported')}
                  disabled={!queryId || isSubmittingFeedback}
                  className={cn(
                    FEEDBACK_BUTTON_BASE,
                    'bg-amber-500/10 text-amber-200 hover:bg-amber-500/20',
                    !queryId && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Conflict
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {lastFeedback ? (
        <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-[11px] text-white/70">
          <div className="inline-flex items-center gap-1.5">
            <MessageSquareQuote className="h-3.5 w-3.5 text-cyan-300" />
            feedback saved: <span className="text-white/85">{lastFeedback.feedback}</span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-1 text-[10px] text-white/40">
        <Brain className="h-3 w-3" />
        Feedback updates future memory ranking.
      </div>
    </div>
  );
}
