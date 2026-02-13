import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseSidecarEventEnvelope, subscribeToAgentEvents } from '../lib/agent-events';
import type { AgentEvent } from '../lib/event-types';
import { useChatStore } from '../stores/chat-store';
import { useAgentStore, type Task } from '../stores/agent-store';
import { useSessionStore } from '../stores/session-store';
import { useAppStore } from '../stores/app-store';
import { useIntegrationStore } from '../stores/integration-store';
import { useBenchmarkStore, type BenchmarkScorecard } from '../stores/benchmark-store';
import { toast } from '../components/ui/Toast';
import type { PlatformType } from '@gemini-cowork/shared';
import { createStartupIssue } from '../lib/startup-recovery';

function isRecord(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function toBenchmarkScorecard(value: unknown): BenchmarkScorecard | null {
  if (!isRecord(value)) return null;

  const runId = typeof value.runId === 'string' ? value.runId : '';
  const suiteId = typeof value.suiteId === 'string' ? value.suiteId : '';
  if (!runId || !suiteId) return null;

  const dimensions = Array.isArray(value.dimensions)
    ? value.dimensions
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => ({
          dimension: typeof entry.dimension === 'string' ? entry.dimension : 'unknown',
          score: typeof entry.score === 'number' ? entry.score : 0,
          maxScore: typeof entry.maxScore === 'number' ? entry.maxScore : 1,
          weight: typeof entry.weight === 'number' ? entry.weight : 0,
          threshold: typeof entry.threshold === 'number' ? entry.threshold : 0,
          passed: Boolean(entry.passed),
        }))
    : [];

  return {
    runId,
    suiteId,
    benchmarkScore: typeof value.benchmarkScore === 'number' ? value.benchmarkScore : 0,
    featureChecklistScore:
      typeof value.featureChecklistScore === 'number' ? value.featureChecklistScore : 0,
    finalScore: typeof value.finalScore === 'number' ? value.finalScore : 0,
    generatedAt: typeof value.generatedAt === 'number' ? value.generatedAt : Date.now(),
    dimensions,
    passed: typeof value.passed === 'boolean' ? value.passed : undefined,
  };
}

function normalizeTodoStatus(value: unknown): 'pending' | 'in_progress' | 'completed' {
  const normalized = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'completed';
  if (normalized === 'in_progress') return 'in_progress';
  return 'pending';
}

function extractTodosFromToolResult(result: unknown): Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }> | null {
  if (!result) return null;
  if (Array.isArray(result)) {
    return result
      .filter((todo): todo is { content: string; status: 'pending' | 'in_progress' | 'completed' } =>
        !!todo && typeof (todo as { content?: unknown }).content === 'string'
      )
      .map((todo) => ({
        content: String((todo as { content: string }).content),
        status: normalizeTodoStatus((todo as { status?: string }).status),
      }));
  }

  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractTodosFromToolResult(parsed);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (typeof result === 'object') {
    const resultAny = result as { todos?: unknown; output?: unknown };
    if (Array.isArray(resultAny.todos)) {
      return extractTodosFromToolResult(resultAny.todos);
    }
    if (resultAny.output) {
      return extractTodosFromToolResult(resultAny.output);
    }
  }

  return null;
}

function mapTodosToTasks(sessionId: string, todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }>): Task[] {
  const now = Date.now();
  return todos.map((todo, index) => ({
    id: `task-${sessionId}-${index}-${Math.abs(todo.content.length + index)}`,
    subject: todo.content,
    description: '',
    status: todo.status,
    createdAt: now,
    updatedAt: now,
  }));
}

function isInfrastructureError(code: string | undefined, message: string): boolean {
  const normalizedCode = (code || '').toLowerCase();
  const normalizedMessage = message.toLowerCase();
  if (
    normalizedCode.includes('backend') ||
    normalizedCode.includes('connection') ||
    normalizedCode.includes('ipc') ||
    normalizedCode.includes('network')
  ) {
    return true;
  }

  return (
    normalizedMessage.includes('backend') ||
    normalizedMessage.includes('sidecar') ||
    normalizedMessage.includes('connection') ||
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('network error') ||
    normalizedMessage.includes('timeout')
  );
}

interface ReplayEnvelope {
  seq: number;
  timestamp: number;
  type: string;
  sessionId: string | null;
  data: unknown;
}

interface ReplayResponse {
  events: ReplayEnvelope[];
  eventCursor: number;
  replayStart: number;
  hasGap: boolean;
}

const SESSION_RELOAD_COOLDOWN_MS = 5_000;
const STREAM_STALL_TIMEOUT_MS = 90_000;

/**
 * Hook to subscribe to agent events for the current session
 * and automatically update the relevant stores
 */
export function useAgentEvents(sessionId: string | null): void {
  const chatStoreRef = useRef(useChatStore.getState());
  const agentStoreRef = useRef(useAgentStore.getState());
  const sessionStoreRef = useRef(useSessionStore.getState());
  const activeSessionRef = useRef<string | null>(sessionId);
  const sessionReloadTimerRef = useRef<number | null>(null);
  const sessionReloadAttemptRef = useRef(0);
  const lastSessionReloadAtRef = useRef(0);
  const streamStallTimersRef = useRef<Record<string, number>>({});

  // Keep refs up to date
  useEffect(() => {
    const unsubChat = useChatStore.subscribe(
      (state) => (chatStoreRef.current = state)
    );
    const unsubAgent = useAgentStore.subscribe(
      (state) => (agentStoreRef.current = state)
    );
    const unsubSession = useSessionStore.subscribe(
      (state) => (sessionStoreRef.current = state)
    );
    const unsubActive = useSessionStore.subscribe((state) => {
      activeSessionRef.current = state.activeSessionId;
    });

    return () => {
      unsubChat();
      unsubAgent();
      unsubSession();
      unsubActive();
    };
  }, []);

  useEffect(() => {
    activeSessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const scheduleSessionReload = (delayMs = 250, force = false) => {
      if (sessionReloadTimerRef.current !== null) return;
      sessionReloadTimerRef.current = window.setTimeout(() => {
        sessionReloadTimerRef.current = null;
        const sessionStore = sessionStoreRef.current;
        if (sessionStore.isLoading) {
          if (sessionReloadAttemptRef.current < 120) {
            sessionReloadAttemptRef.current += 1;
            scheduleSessionReload(250);
          } else {
            sessionReloadAttemptRef.current = 0;
          }
          return;
        }

        sessionReloadAttemptRef.current = 0;
        const nowTs = Date.now();
        if (!force && nowTs - lastSessionReloadAtRef.current < SESSION_RELOAD_COOLDOWN_MS) {
          return;
        }
        lastSessionReloadAtRef.current = nowTs;
        void sessionStore.loadSessions({ reset: true });
      }, delayMs);
    };

    const clearStreamStallTimer = (targetSessionId: string) => {
      const timer = streamStallTimersRef.current[targetSessionId];
      if (typeof timer === 'number') {
        window.clearTimeout(timer);
      }
      delete streamStallTimersRef.current[targetSessionId];
    };

    const scheduleStreamStallCheck = (targetSessionId: string) => {
      clearStreamStallTimer(targetSessionId);
      const chat = chatStoreRef.current;
      const sessionState = chat.getSessionState(targetSessionId);
      if (!sessionState.isStreaming) {
        return;
      }
      streamStallTimersRef.current[targetSessionId] = window.setTimeout(() => {
        const chat = chatStoreRef.current;
        const sessionState = chat.getSessionState(targetSessionId);
        if (!sessionState.isStreaming || sessionState.streamStall.isStalled) {
          return;
        }

        const now = Date.now();
        const hasPendingInteractiveWait =
          sessionState.pendingPermissions.length > 0 || sessionState.pendingQuestions.length > 0;
        const hasActiveTool = sessionState.currentTool?.status === 'running';
        const browserStatus = sessionState.browserRun.status;
        const hasActiveBrowserRun = browserStatus === 'running' || browserStatus === 'recovered';

        // Long-running tools, explicit approval waits, and browser runs can have sparse stream chunks.
        // Do not mark these sessions stalled just because text chunks are quiet.
        if (hasPendingInteractiveWait || hasActiveTool || hasActiveBrowserRun) {
          chat.markStreamActivity(targetSessionId, now);
          scheduleStreamStallCheck(targetSessionId);
          return;
        }

        const lastActivityAt = sessionState.streamStall.lastActivityAt ?? now;
        if (now - lastActivityAt < STREAM_STALL_TIMEOUT_MS - 250) {
          scheduleStreamStallCheck(targetSessionId);
          return;
        }

        chat.markRunStalled(targetSessionId, {
          reason: `No stream updates for ${Math.round(STREAM_STALL_TIMEOUT_MS / 1000)}s`,
          recoverable: Boolean(sessionState.streamStall.runId),
        });
        toast.warning('Run stalled', 'No stream updates detected. Use Recover run to resume.', 7000);
      }, STREAM_STALL_TIMEOUT_MS);
    };

    const handleEvent = (event: AgentEvent) => {
      try {
      const chat = chatStoreRef.current;
      const agent = agentStoreRef.current;
      const activeId = activeSessionRef.current;
      const eventSessionId = event.sessionId;

      // Handle events that don't require a sessionId first
      if (event.type === 'session:updated') {
        const updatedSessionId = event.sessionId?.trim();
        if (updatedSessionId) {
          let didPatch = false;
          let didInsert = false;
          useSessionStore.setState((state) => {
            const sessionIndex = state.sessions.findIndex((session) => session.id === updatedSessionId);
            if (sessionIndex < 0) {
              const now = Date.now();
              const sessionType =
                event.sessionType === 'main' ||
                event.sessionType === 'isolated' ||
                event.sessionType === 'cron' ||
                event.sessionType === 'ephemeral' ||
                event.sessionType === 'integration'
                  ? event.sessionType
                  : undefined;

              didInsert = true;
              return {
                sessions: [
                  {
                    id: updatedSessionId,
                    type: sessionType,
                    executionMode: event.executionMode ?? 'execute',
                    title: event.title ?? (sessionType === 'integration' ? 'Shared Session' : null),
                    firstMessage: null,
                    workingDirectory: event.workingDirectory ?? null,
                    model: event.model ?? null,
                    messageCount: typeof event.messageCount === 'number' ? event.messageCount : 0,
                    createdAt: event.createdAt ?? now,
                    updatedAt: event.updatedAt ?? now,
                    lastAccessedAt: event.lastAccessedAt ?? now,
                  },
                  ...state.sessions,
                ],
              };
            }

            didPatch = true;
            const current = state.sessions[sessionIndex];
            const patched = {
              ...current,
              type:
                event.sessionType === 'main' ||
                event.sessionType === 'isolated' ||
                event.sessionType === 'cron' ||
                event.sessionType === 'ephemeral' ||
                event.sessionType === 'integration'
                  ? event.sessionType
                  : current.type,
              title: event.title ?? current.title,
              messageCount:
                typeof event.messageCount === 'number' ? event.messageCount : current.messageCount,
              executionMode: event.executionMode ?? current.executionMode,
              workingDirectory: event.workingDirectory ?? current.workingDirectory,
              model: event.model ?? current.model,
              createdAt: event.createdAt ?? current.createdAt,
              updatedAt: event.updatedAt ?? Date.now(),
              lastAccessedAt: event.lastAccessedAt ?? current.lastAccessedAt,
            };
            const sessions = [...state.sessions];
            sessions[sessionIndex] = patched;
            return { sessions };
          });

          if (didPatch) {
            sessionReloadAttemptRef.current = 0;
            return;
          }

          if (didInsert) {
            sessionReloadAttemptRef.current = 0;
            scheduleSessionReload();
            return;
          }
        }

        // Fallback for unknown/new sessions: debounced refresh.
        scheduleSessionReload();
        return;
      }

      // Integration events are emitted without a sessionId; handle them before
      // per-session guards so status/QR updates are not dropped.
      if (event.type === 'integration:status') {
        const statusEvent = event as unknown as {
          platform: string;
          connected: boolean;
          displayName?: string;
          identityPhone?: string;
          identityName?: string;
          error?: string;
          connectedAt?: number;
          lastMessageAt?: number;
          health?: 'healthy' | 'degraded' | 'unhealthy';
          healthMessage?: string;
          requiresReconnect?: boolean;
          lastHealthCheckAt?: number;
        };
        useIntegrationStore.getState().updatePlatformStatus({
          platform: statusEvent.platform as PlatformType,
          connected: statusEvent.connected,
          displayName: statusEvent.displayName,
          identityPhone: statusEvent.identityPhone,
          identityName: statusEvent.identityName,
          error: statusEvent.error,
          connectedAt: statusEvent.connectedAt,
          lastMessageAt: statusEvent.lastMessageAt,
          health: statusEvent.health,
          healthMessage: statusEvent.healthMessage,
          requiresReconnect: statusEvent.requiresReconnect,
          lastHealthCheckAt: statusEvent.lastHealthCheckAt,
        });
        return;
      }

      if (event.type === 'integration:qr') {
        const qrEvent = event as unknown as { qrDataUrl: string };
        useIntegrationStore.getState().setQRCode(qrEvent.qrDataUrl);
        return;
      }

      if (event.type === 'integration:message_in') {
        const msgEvent = event as unknown as { platform: string; sender: string; content: string };
        const platformNames: Record<string, string> = {
          whatsapp: 'WhatsApp',
          slack: 'Slack',
          telegram: 'Telegram',
          discord: 'Discord',
          imessage: 'iMessage',
          teams: 'Microsoft Teams',
        };
        toast.info(
          `${platformNames[msgEvent.platform] || msgEvent.platform}`,
          `${msgEvent.sender}: ${msgEvent.content}`,
          5000
        );
        return;
      }

      if (event.type === 'integration:message_out') {
        const outEvent = event as unknown as { platform: string; timestamp: number };
        const currentStatus = useIntegrationStore.getState().platforms[outEvent.platform as PlatformType];
        if (currentStatus) {
          useIntegrationStore.getState().updatePlatformStatus({
            ...currentStatus,
            lastMessageAt: outEvent.timestamp || Date.now(),
          });
        }
        return;
      }

      if (event.type === 'integration:queued') {
        const queuedEvent = event as unknown as { platform: string; queueSize: number };
        const queuePlatformNames: Record<string, string> = {
          whatsapp: 'WhatsApp',
          slack: 'Slack',
          telegram: 'Telegram',
          discord: 'Discord',
          imessage: 'iMessage',
          teams: 'Microsoft Teams',
        };
        toast.info(
          `${queuePlatformNames[queuedEvent.platform] || queuedEvent.platform}`,
          `Message queued (${queuedEvent.queueSize} waiting)`,
          3000
        );
        return;
      }

      if (event.type === 'benchmark:progress') {
        useBenchmarkStore.getState().setRunProgress({
          runId: event.runId,
          suiteId: event.suiteId,
          profile: event.profile,
          progress: event.progress,
          status: event.status,
        });
        return;
      }

      if (event.type === 'benchmark:score_updated') {
        const scorecard = toBenchmarkScorecard(event.scorecard);
        if (scorecard) {
          useBenchmarkStore.getState().setScorecard(scorecard);
        }
        return;
      }

      if (event.type === 'run:health') {
        useBenchmarkStore.getState().setRunHealth({
          sessionId: event.sessionId,
          health: event.health,
          reliabilityScore: event.reliabilityScore,
          counters: event.counters,
          timestamp: event.timestamp,
        });
        return;
      }

      if (event.type === 'release_gate:status') {
        useBenchmarkStore.getState().setReleaseGateStatus({
          status: event.status,
          reasons: Array.isArray(event.reasons) ? event.reasons : [],
          scorecard: toBenchmarkScorecard(event.scorecard ?? null) ?? undefined,
          evaluatedAt: typeof event.evaluatedAt === 'number' ? event.evaluatedAt : Date.now(),
        });
        return;
      }

      if (!eventSessionId) return;
      chat.ensureSession(eventSessionId);
      agent.ensureSession(eventSessionId);

      const appendMemoryTimelineItem = (
        eventType: 'memory:retrieved' | 'memory:consolidated' | 'memory:conflict_detected',
        content: string,
        metadata: Record<string, unknown>,
      ) => {
        const sessionSnapshot = chat.getSessionState(eventSessionId);
        let turnId = sessionSnapshot.activeTurnId;
        if (!turnId) {
          for (let index = sessionSnapshot.chatItems.length - 1; index >= 0; index -= 1) {
            const item = sessionSnapshot.chatItems[index];
            if (item.kind === 'user_message') {
              turnId = item.turnId || item.id;
              break;
            }
          }
        }

        chat.appendChatItem(eventSessionId, {
          id: `memory-${eventType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'system_message',
          content,
          metadata: {
            timelineCategory: 'memory',
            eventType,
            ...metadata,
          },
          turnId,
          timestamp: Date.now(),
        } as import('@gemini-cowork/shared').ChatItem);
      };

      switch (event.type) {
        // Streaming events
        case 'stream:start':
          chat.setStreaming(eventSessionId, true);
          chat.markStreamActivity(eventSessionId);
          chat.clearRunStalled(eventSessionId);
          chat.setThinking(eventSessionId, true);
          chat.clearStreamingContent(eventSessionId);
          agent.setRunning(eventSessionId, true);
          scheduleStreamStallCheck(eventSessionId);
          break;

        case 'stream:chunk':
          // Assistant text now comes from persisted chat:item/chat:update events.
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          break;

        case 'stream:done':
          chat.setStreaming(eventSessionId, false);
          chat.clearRunStalled(eventSessionId);
          chat.setThinking(eventSessionId, false);
          chat.clearStreamingContent(eventSessionId);
          chat.clearThinkingContent(eventSessionId);
          agent.setRunning(eventSessionId, false);
          clearStreamStallTimer(eventSessionId);
          break;

        case 'run:stalled':
          chat.markRunStalled(eventSessionId, {
            runId: event.runId,
            reason: event.reason,
            stalledAt: event.stalledAt,
            recoverable: true,
          });
          toast.warning('Run stalled', 'A recovery point is available. Click Recover run.', 7000);
          break;

        case 'run:recovered':
          chat.clearRunStalled(eventSessionId);
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          toast.success('Run recovered', 'Execution resumed from the latest checkpoint.', 4000);
          break;

        case 'branch:created':
          useSessionStore.getState().upsertBranch(
            eventSessionId,
            {
              id: event.branchId,
              sessionId: eventSessionId,
              name: event.name,
              status: 'active',
              fromTurnId: event.fromTurnId,
              parentBranchId: event.parentBranchId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            true,
          );
          toast.success('Branch created', `${event.name} is now active.`, 2500);
          break;

        case 'branch:merged':
          useSessionStore.getState().applyBranchMerge(eventSessionId, {
            mergeId: event.mergeId,
            sourceBranchId: event.sourceBranchId,
            targetBranchId: event.targetBranchId,
            strategy:
              event.strategy === 'ours' ||
              event.strategy === 'theirs' ||
              event.strategy === 'manual'
                ? event.strategy
                : 'auto',
            status: event.status,
            conflictCount: 0,
            conflicts: [],
            mergedAt: Date.now(),
            activeBranchId: event.activeBranchId,
          });
          if (event.status === 'merged') {
            toast.success('Branch merged', 'Branch merge completed successfully.', 2500);
          } else if (event.status === 'conflict') {
            toast.warning('Merge conflict', 'Branch merge requires conflict resolution.', 3500);
          } else {
            toast.error('Merge failed', 'Unable to merge the selected branch.', 3500);
          }
          break;

        case 'memory:retrieved':
          appendMemoryTimelineItem('memory:retrieved', 'Retrieved relevant memory evidence.', {
            queryId: event.queryId,
            query: event.query,
            count: event.count,
            limit: event.limit,
          });
          break;

        case 'memory:consolidated':
          appendMemoryTimelineItem('memory:consolidated', 'Memory consolidation pass completed.', {
            strategy: event.strategy,
            queryId: event.queryId,
            atomId: event.atomId,
            feedback: event.feedback,
            consolidatedAt: event.timestamp ?? Date.now(),
          });
          break;

        case 'memory:conflict_detected':
          appendMemoryTimelineItem('memory:conflict_detected', 'Potential memory conflict detected.', {
            atomId: event.atomId,
            reason: event.reason,
          });
          break;

        // Thinking events (agent's internal reasoning)
        case 'thinking:start':
          chat.setThinking(eventSessionId, true);
          chat.clearThinkingContent(eventSessionId);
          break;

        case 'thinking:chunk':
          chat.appendThinkingChunk(eventSessionId, event.content);
          break;

        case 'thinking:done':
          // Keep thinking content visible but mark thinking as done
          // Content will be cleared when stream:done is received
          break;

        // Tool execution events
        case 'tool:start': {
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          const parentToolId = event.parentToolId || event.toolCall.parentToolId;
          chat.setStreamingTool(eventSessionId, {
            id: event.toolCall.id,
            name: event.toolCall.name,
            args: event.toolCall.args,
            status: 'running',
            startedAt: Date.now(),
            parentToolId,
          });
          if (event.toolCall.name.toLowerCase() === 'computer_use') {
            const goal =
              typeof event.toolCall.args.goal === 'string' ? event.toolCall.args.goal : null;
            const maxStepsRaw = Number(event.toolCall.args.maxSteps ?? 15);
            const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? Math.round(maxStepsRaw) : 15;
            chat.updateBrowserRunState(eventSessionId, {
              status: 'running',
              goal,
              step: 0,
              maxSteps,
              blockedReason: null,
              recoverable: false,
            });
            chat.appendBrowserRunEvent(eventSessionId, {
              id: `browser-start-${event.toolCall.id}`,
              type: 'progress',
              status: 'running',
              step: 0,
              maxSteps,
              detail: 'Browser automation started.',
              timestamp: Date.now(),
            });
          }
          chat.setThinking(eventSessionId, false);
          break;
        }

        case 'tool:result': {
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          const result = event.result;
          const toolCallId = event.toolCallId || (result as { toolCallId?: string })?.toolCallId || '';

          // Resolve tool name from chatItems (V2 source)
          const sessionSnapshot = chat.getSessionState(eventSessionId);
          const toolStartItem = sessionSnapshot.chatItems.find(
            (ci) => ci.kind === 'tool_start' && ci.toolId === toolCallId
          );
          const toolName = toolStartItem && toolStartItem.kind === 'tool_start' ? toolStartItem.name : '';

          if (result.success && toolName) {
            const lower = toolName.toLowerCase();

            // Resolve tool args for write_todos from chatItems
            if (lower === 'write_todos') {
              const toolArgs = toolStartItem && toolStartItem.kind === 'tool_start' ? toolStartItem.args : undefined;
              const todos = extractTodosFromToolResult(result.result) ?? (toolArgs ? extractTodosFromToolResult(toolArgs) : null);
              if (todos && todos.length > 0) {
                agent.setTasks(eventSessionId, mapTodosToTasks(eventSessionId, todos));
              }
            }

            if (lower === 'computer_use') {
              const data = result.result as {
                completed?: boolean;
                blocked?: boolean;
                blockedReason?: string;
                finalUrl?: string;
                steps?: number;
                maxSteps?: number;
                checkpointPath?: string;
                resumedFromCheckpoint?: boolean;
              } | undefined;
              const steps = Number(data?.steps ?? 0);
              const maxSteps = Number(data?.maxSteps ?? 0);
              const status = data?.blocked
                ? 'blocked'
                : data?.completed
                  ? 'completed'
                  : 'error';
              chat.updateBrowserRunState(eventSessionId, {
                status,
                step: Number.isFinite(steps) ? steps : 0,
                maxSteps: Number.isFinite(maxSteps) ? maxSteps : 0,
                lastUrl: data?.finalUrl ?? null,
                blockedReason: data?.blockedReason ?? null,
                checkpointPath: data?.checkpointPath ?? null,
                recoverable: Boolean(data?.checkpointPath),
              });
              chat.appendBrowserRunEvent(eventSessionId, {
                id: `browser-result-${toolCallId || Date.now()}`,
                type: data?.blocked ? 'blocked' : 'completed',
                status,
                step: Number.isFinite(steps) ? steps : 0,
                maxSteps: Number.isFinite(maxSteps) ? maxSteps : 0,
                url: data?.finalUrl,
                checkpointPath: data?.checkpointPath,
                detail:
                  data?.blocked
                    ? data.blockedReason || 'Browser run blocked.'
                    : data?.resumedFromCheckpoint
                      ? 'Browser run resumed from checkpoint and completed.'
                      : 'Browser run completed.',
                timestamp: Date.now(),
              });
            }
          }

          chat.setStreamingTool(eventSessionId, null);
          break;
        }

        // Permission events
        case 'permission:request': {
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          const requestAny = event.request as {
            createdAt?: number;
            timestamp?: number;
            sessionId?: string;
          };
          chat.addPermissionRequest(eventSessionId, {
            ...event.request,
            sessionId: eventSessionId,
            createdAt:
              requestAny.createdAt ??
              requestAny.timestamp ??
              Date.now(),
          });
          break;
        }

        case 'permission:resolved':
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          chat.removePermissionRequest(eventSessionId, event.permissionId);
          break;

        // Question events (agent asking user questions)
        case 'question:ask':
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          chat.addQuestion(eventSessionId, {
            id: event.request.id,
            sessionId: eventSessionId,
            question: event.request.question,
            header: event.request.header,
            options: event.request.options?.map(opt => ({
              label: opt.label,
              description: opt.description,
              value: opt.value,
            })) || [],
            multiSelect: event.request.multiSelect,
            allowCustom: event.request.allowCustom,
            createdAt: event.request.timestamp || Date.now(),
          });
          break;

        case 'question:answered':
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          chat.removeQuestion(eventSessionId, event.questionId);
          break;

        // Task events
        case 'task:create':
          agent.addTask(eventSessionId, event.task);
          break;

        case 'task:update':
          agent.updateTask(eventSessionId, event.task);
          break;

        case 'task:delete':
          agent.removeTask(eventSessionId, event.taskId);
          break;

        case 'task:set':
          agent.setTasks(eventSessionId, event.tasks);
          break;

        // Artifact events
        case 'artifact:created':
        case 'artifact:updated':
          agent.addArtifact(eventSessionId, event.artifact);
          break;

        case 'artifact:deleted':
          agent.removeArtifact(eventSessionId, event.artifactId);
          break;

        // Context events
        case 'context:update':
          agent.setContextUsage(eventSessionId, event.used, event.total);
          break;

        case 'research:progress':
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          agent.setResearchProgress(eventSessionId, { status: event.status, progress: event.progress });
          break;

        case 'research:evidence':
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          chat.appendChatItem(eventSessionId, {
            id: `research-evidence-${event.timestamp}-${Math.max(0, event.totalSources)}`,
            kind: 'system_message',
            content:
              event.totalSources > 0
                ? `Research evidence updated: ${event.totalSources} sources ranked (avg confidence ${Math.round(event.avgConfidence * 100)}%).`
                : 'Research evidence updated: no sources detected.',
            timestamp: event.timestamp,
          } as import('@gemini-cowork/shared').ChatItem);
          break;

        case 'browser:progress':
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          chat.updateBrowserRunState(eventSessionId, {
            status: event.status === 'running' ? 'running' : event.status,
            step: event.step,
            maxSteps: event.maxSteps,
            lastUrl: event.url ?? null,
          });
          chat.appendBrowserRunEvent(eventSessionId, {
            id: `browser-progress-${event.timestamp}-${event.step}`,
            type: event.status === 'recovered' ? 'recovered' : 'progress',
            status: event.status,
            step: event.step,
            maxSteps: event.maxSteps,
            url: event.url,
            detail: event.detail,
            lastAction: event.lastAction,
            timestamp: event.timestamp,
          });
          break;

        case 'browser:checkpoint':
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          chat.updateBrowserRunState(eventSessionId, {
            step: event.step,
            maxSteps: event.maxSteps,
            lastUrl: event.url ?? null,
            checkpointPath: event.checkpointPath,
            recoverable: event.recoverable,
          });
          chat.appendBrowserRunEvent(eventSessionId, {
            id: `browser-checkpoint-${event.timestamp}-${event.step}`,
            type: 'checkpoint',
            status: 'running',
            step: event.step,
            maxSteps: event.maxSteps,
            url: event.url,
            checkpointPath: event.checkpointPath,
            detail: 'Checkpoint saved.',
            timestamp: event.timestamp,
          });
          break;

        case 'browser:blocker':
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          chat.updateBrowserRunState(eventSessionId, {
            status: 'blocked',
            step: event.step,
            maxSteps: event.maxSteps,
            lastUrl: event.url ?? null,
            blockedReason: event.reason,
            checkpointPath: event.checkpointPath ?? null,
            recoverable: Boolean(event.checkpointPath),
          });
          chat.appendBrowserRunEvent(eventSessionId, {
            id: `browser-blocked-${event.timestamp}-${event.step}`,
            type: 'blocked',
            status: 'blocked',
            step: event.step,
            maxSteps: event.maxSteps,
            url: event.url,
            checkpointPath: event.checkpointPath,
            detail: event.reason,
            timestamp: event.timestamp,
          });
          toast.warning('Browser run blocked', event.reason, 6000);
          break;

        // Error events
        case 'error': {
          clearStreamStallTimer(eventSessionId);
          chat.setStreaming(eventSessionId, false);
          chat.clearRunStalled(eventSessionId);
          chat.setThinking(eventSessionId, false);
          agent.setRunning(eventSessionId, false);

          // Safely convert event.error to string
          const errorMsg = typeof event.error === 'string'
            ? event.error
            : (isRecord(event.error) ? String((event.error as Record<string, unknown>).message || event.error) : String(event.error));

          // Check if it's an auth/API key error
          const isAuthError =
            event.code === 'INVALID_API_KEY' ||
            errorMsg.toLowerCase().includes('api key') ||
            errorMsg.includes('401') ||
            errorMsg.toLowerCase().includes('authentication') ||
            errorMsg.toLowerCase().includes('unauthorized');

          if (isAuthError) {
            // Show API key modal for auth errors
            useAppStore.getState().setShowApiKeyModal(true, errorMsg);
            useAppStore
              .getState()
              .setStartupIssue(
                createStartupIssue(
                  'Provider authentication failed',
                  `${errorMsg}. Update provider credentials and retry.`
                )
              );
          } else {
            // Show error toast for other errors
            if (event.code === 'RATE_LIMIT') {
              const retry = event.details?.retryAfterSeconds;
              const message = retry ? `Retry in ${Math.ceil(retry)}s` : 'Please retry shortly';
              toast.warning('Rate limit exceeded', message, 8000);
            } else {
              toast.error('Agent Error', errorMsg, 8000);
              if (isInfrastructureError(event.code, errorMsg)) {
                useAppStore
                  .getState()
                  .setStartupIssue(
                    createStartupIssue(
                      'Connection issue detected',
                      `${errorMsg}. Open the highlighted recovery screen and retry.`
                    )
                  );
              }
            }
          }

          // V2: Error is also emitted as chat:item by sidecar, but create one
          // if the sidecar doesn't emit it (e.g. frontend-only errors)
          chat.appendChatItem(eventSessionId, {
            id: `error-${Date.now()}`,
            kind: 'error',
            message: errorMsg,
            code: event.code,
            details: event.details,
            turnId: chat.getSessionState(eventSessionId).activeTurnId,
            timestamp: Date.now(),
          } as import('@gemini-cowork/shared').ChatItem);
          break;
        }

        // Agent state events
        case 'agent:started':
          agent.setRunning(eventSessionId, true);
          break;

        case 'agent:stopped':
          clearStreamStallTimer(eventSessionId);
          agent.setRunning(eventSessionId, false);
          chat.clearRunStalled(eventSessionId);
          if (activeId) {
            chat.setStreaming(activeId, false);
            chat.setThinking(activeId, false);
          }
          break;

        // ============================================================================
        // V2 Unified ChatItem Events
        // ============================================================================

        case 'chat:item': {
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          // Append new chat item to the unified timeline
          chat.appendChatItem(eventSessionId, event.item);
          break;
        }

        case 'chat:update': {
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          // Update an existing chat item (e.g., status change)
          chat.updateChatItem(eventSessionId, event.itemId, event.updates);
          break;
        }

        case 'chat:items': {
          chat.markStreamActivity(eventSessionId);
          scheduleStreamStallCheck(eventSessionId);
          // Batch set chat items (e.g., on session load)
          chat.setChatItems(eventSessionId, event.items);
          break;
        }

        case 'context:usage': {
          // Update context usage stats
          chat.updateContextUsage(eventSessionId, {
            usedTokens: event.usedTokens,
            maxTokens: event.maxTokens,
            percentUsed: event.percentUsed,
          });
          break;
        }

        // Message Queue events
        case 'queue:update': {
          chat.updateMessageQueue(eventSessionId, event.queue);
          break;
        }

        // Browser View events (live screenshot streaming)
        case 'browserView:screenshot': {
          const screenshotEvent = event as {
            type: 'browserView:screenshot';
            sessionId: string;
            data: string;
            mimeType: string;
            url: string;
            timestamp: number;
          };
          chat.updateBrowserScreenshot(eventSessionId, {
            data: screenshotEvent.data,
            mimeType: screenshotEvent.mimeType,
            url: screenshotEvent.url,
            timestamp: screenshotEvent.timestamp,
          });
          break;
        }

      }
      } catch (error) {
        console.error('[useAgentEvents] Event handler error:', error);
      }
    };

    let unsubscribe = () => {};
    let disposed = false;

    const start = async () => {
      try {
        // Best-effort command to ensure backend subscription state exists.
        await invoke('agent_subscribe_events');
      } catch {
        // Ignore and continue with passive event listening.
      }

      const cursor = useSessionStore.getState().bootstrapEventCursor;
      if (cursor > 0) {
        try {
          const replay = await invoke<ReplayResponse>('agent_get_events_since', {
            afterSeq: cursor,
            limit: 4000,
          });

          if (replay.hasGap) {
            // Replay window has moved forward; do a full refresh.
            lastSessionReloadAtRef.current = Date.now();
            void useSessionStore.getState().loadSessions({ reset: true });
          } else {
            for (const envelope of replay.events || []) {
              const parsed = parseSidecarEventEnvelope(envelope);
              if (parsed) {
                handleEvent(parsed);
              }
            }
          }

          useSessionStore.setState({ bootstrapEventCursor: replay.eventCursor || cursor });
        } catch {
          // Non-fatal; live stream subscription will still recover current state.
        }
      }

      if (disposed) return;
      unsubscribe = subscribeToAgentEvents(null, (event) => {
        handleEvent(event);
      });
    };

    void start();

    return () => {
      disposed = true;
      Object.values(streamStallTimersRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });
      streamStallTimersRef.current = {};
      if (sessionReloadTimerRef.current !== null) {
        window.clearTimeout(sessionReloadTimerRef.current);
        sessionReloadTimerRef.current = null;
      }
      sessionReloadAttemptRef.current = 0;
      lastSessionReloadAtRef.current = 0;
      unsubscribe();
    };
  }, []);
}

/**
 * Hook to get the current streaming state
 */
export function useStreamingState(sessionId: string | null) {
  return useChatStore((state) => {
    const session = sessionId ? state.sessions[sessionId] : undefined;
    return {
      isStreaming: session?.isStreaming ?? false,
      isThinking: session?.isThinking ?? false,
      streamingContent: session?.streamingContent ?? '',
      currentTool: session?.currentTool ?? null,
    };
  });
}

/**
 * Hook to get pending permissions that need user action
 */
export function usePendingPermissionsCount() {
  return useChatStore((state) =>
    Object.values(state.sessions).reduce(
      (count, session) => count + session.pendingPermissions.length,
      0
    )
  );
}
