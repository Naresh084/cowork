// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';
import type {
  AgentEvent,
  AgentEventHandler,
  TauriEventPayload,
  TAURI_EVENT_NAMES,
} from './event-types';

/**
 * Parse a Tauri event into an AgentEvent
 */
function parseTauriEvent(
  eventName: string,
  payload: TauriEventPayload
): AgentEvent | null {
  // Extract the event type from the full event name (e.g., 'agent:stream:chunk' -> 'stream:chunk')
  const type = eventName.replace('agent:', '') as AgentEvent['type'];
  const sessionId = payload.sessionId ?? '';
  const data = (payload.data ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'stream:start':
      return { type: 'stream:start', sessionId };

    case 'stream:chunk':
      return {
        type: 'stream:chunk',
        sessionId,
        content: (data.content as string) ?? '',
      };

    case 'stream:done':
      return {
        type: 'stream:done',
        sessionId,
        message: (data.message as AgentEvent & { type: 'stream:done' } extends {
          message: infer M;
        }
          ? M
          : never) ?? null,
      };

    case 'run:checkpoint':
      return {
        type: 'run:checkpoint',
        sessionId,
        runId: (data.runId as string) ?? '',
        checkpointIndex: (data.checkpointIndex as number) ?? 0,
        stage: (data.stage as string) ?? 'unknown',
      };

    case 'run:recovered':
      return {
        type: 'run:recovered',
        sessionId,
        runId: (data.runId as string) ?? '',
        checkpointCount: data.checkpointCount as number | undefined,
      };

    case 'run:fallback_applied':
      return {
        type: 'run:fallback_applied',
        sessionId,
        runId: (data.runId as string) ?? '',
        fallback: (data.fallback as string) ?? 'unknown',
        reason: data.reason as string | undefined,
      };

    case 'run:stalled':
      return {
        type: 'run:stalled',
        sessionId,
        runId: (data.runId as string) ?? '',
        reason: data.reason as string | undefined,
        stalledAt: data.stalledAt as number | undefined,
      };

    case 'run:health':
      return {
        type: 'run:health',
        sessionId,
        health: ((data.health as 'healthy' | 'degraded' | 'unhealthy') ?? 'degraded'),
        reliabilityScore: (data.reliabilityScore as number) ?? 0,
        counters: {
          streamStarts: ((data.counters as { streamStarts?: number } | undefined)?.streamStarts as number) ?? 0,
          streamDone: ((data.counters as { streamDone?: number } | undefined)?.streamDone as number) ?? 0,
          checkpoints: ((data.counters as { checkpoints?: number } | undefined)?.checkpoints as number) ?? 0,
          runRecovered: ((data.counters as { runRecovered?: number } | undefined)?.runRecovered as number) ?? 0,
          runStalled: ((data.counters as { runStalled?: number } | undefined)?.runStalled as number) ?? 0,
          fallbackApplied: ((data.counters as { fallbackApplied?: number } | undefined)?.fallbackApplied as number) ?? 0,
          errors: ((data.counters as { errors?: number } | undefined)?.errors as number) ?? 0,
          toolErrors: ((data.counters as { toolErrors?: number } | undefined)?.toolErrors as number) ?? 0,
          lastUpdatedAt: ((data.counters as { lastUpdatedAt?: number } | undefined)?.lastUpdatedAt as number) ?? Date.now(),
        },
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'tool:start':
      return {
        type: 'tool:start',
        sessionId,
        toolCall: data.toolCall as AgentEvent & { type: 'tool:start' } extends {
          toolCall: infer T;
        }
          ? T
          : never,
      };

    case 'tool:result':
      return {
        type: 'tool:result',
        sessionId,
        toolCallId: (data.toolCallId as string) ?? (data.toolCall as { id?: string })?.id ?? '',
        result: data.result as AgentEvent & { type: 'tool:result' } extends {
          result: infer R;
        }
          ? R
          : never,
      };

    case 'branch:created':
      return {
        type: 'branch:created',
        sessionId,
        branchId: (data.branchId as string) ?? '',
        name: (data.name as string) ?? 'Branch',
        fromTurnId: data.fromTurnId as string | undefined,
        parentBranchId: data.parentBranchId as string | undefined,
        activeBranchId: data.activeBranchId as string | undefined,
      };

    case 'branch:merged':
      return {
        type: 'branch:merged',
        sessionId,
        mergeId: (data.mergeId as string) ?? '',
        sourceBranchId: (data.sourceBranchId as string) ?? '',
        targetBranchId: (data.targetBranchId as string) ?? '',
        strategy: (data.strategy as string) ?? 'auto',
        status: ((data.status as 'merged' | 'conflict' | 'failed') ?? 'failed'),
        activeBranchId: data.activeBranchId as string | undefined,
      };

    case 'workflow:activated':
      return {
        type: 'workflow:activated',
        sessionId,
        workflowId: (data.workflowId as string) ?? '',
        triggerType: data.triggerType as string | undefined,
      };

    case 'workflow:fallback':
      return {
        type: 'workflow:fallback',
        sessionId,
        workflowId: (data.workflowId as string) ?? '',
        reason: data.reason as string | undefined,
      };

    case 'memory:retrieved':
      return {
        type: 'memory:retrieved',
        sessionId,
        queryId: (data.queryId as string) ?? '',
        query: (data.query as string) ?? '',
        count: (data.count as number) ?? 0,
        limit: (data.limit as number) ?? 0,
      };

    case 'memory:consolidated':
      return {
        type: 'memory:consolidated',
        sessionId,
        strategy: data.strategy as string | undefined,
        queryId: data.queryId as string | undefined,
        atomId: data.atomId as string | undefined,
        feedback: data.feedback as string | undefined,
        timestamp: data.timestamp as number | undefined,
      };

    case 'memory:conflict_detected':
      return {
        type: 'memory:conflict_detected',
        sessionId,
        atomId: (data.atomId as string) ?? '',
        reason: (data.reason as string) ?? 'unknown',
      };

    case 'benchmark:progress':
      return {
        type: 'benchmark:progress',
        sessionId,
        runId: (data.runId as string) ?? '',
        suiteId: (data.suiteId as string) ?? '',
        profile: (data.profile as string) ?? 'default',
        progress: (data.progress as number) ?? 0,
        status: (data.status as string) ?? 'running',
      };

    case 'benchmark:score_updated':
      return {
        type: 'benchmark:score_updated',
        sessionId,
        runId: (data.runId as string) ?? '',
        suiteId: (data.suiteId as string) ?? '',
        scorecard: (data.scorecard as Record<string, unknown>) ?? {},
      };

    case 'release_gate:status':
      return {
        type: 'release_gate:status',
        sessionId,
        status: ((data.status as 'pass' | 'fail' | 'warning') ?? 'warning'),
        reasons: (data.reasons as string[]) ?? [],
        scorecard: data.scorecard as Record<string, unknown> | undefined,
        evaluatedAt: (data.evaluatedAt as number) ?? Date.now(),
      };

    case 'permission:request':
      return {
        type: 'permission:request',
        sessionId,
        request: data.request as AgentEvent & {
          type: 'permission:request';
        } extends { request: infer R }
          ? R
          : never,
      };

    case 'permission:resolved':
      return {
        type: 'permission:resolved',
        sessionId,
        permissionId: (data.permissionId as string) ?? '',
        decision: (data.decision as 'allow' | 'deny' | 'allow_once' | 'allow_session') ?? 'deny',
      };

    case 'question:ask':
      return {
        type: 'question:ask',
        sessionId,
        request: data.request as AgentEvent & { type: 'question:ask' } extends {
          request: infer R;
        }
          ? R
          : never,
      };

    case 'question:answered':
      return {
        type: 'question:answered',
        sessionId,
        questionId: (data.questionId as string) ?? '',
        answer: data.answer as string | string[],
      };

    case 'task:create':
      return {
        type: 'task:create',
        sessionId,
        task: data.task as AgentEvent & { type: 'task:create' } extends {
          task: infer T;
        }
          ? T
          : never,
      };

    case 'task:update':
      return {
        type: 'task:update',
        sessionId,
        task: data.task as AgentEvent & { type: 'task:update' } extends {
          task: infer T;
        }
          ? T
          : never,
      };

    case 'task:delete':
      return {
        type: 'task:delete',
        sessionId,
        taskId: (data.taskId as string) ?? '',
      };

    case 'task:set':
      return {
        type: 'task:set',
        sessionId,
        tasks: (data.tasks as AgentEvent & { type: 'task:set' } extends {
          tasks: infer T;
        }
          ? T
          : never) ?? [],
      };

    case 'artifact:created':
      return {
        type: 'artifact:created',
        sessionId,
        artifact: data.artifact as AgentEvent & {
          type: 'artifact:created';
        } extends { artifact: infer A }
          ? A
          : never,
      };

    case 'artifact:updated':
      return {
        type: 'artifact:updated',
        sessionId,
        artifact: data.artifact as AgentEvent & {
          type: 'artifact:updated';
        } extends { artifact: infer A }
          ? A
          : never,
      };

    case 'artifact:deleted':
      return {
        type: 'artifact:deleted',
        sessionId,
        artifactId: (data.artifactId as string) ?? '',
      };

    case 'context:update':
      // Default to 1M token context window (Gemini 3.0 models)
      // The actual value comes from the sidecar based on the model's API response
      return {
        type: 'context:update',
        sessionId,
        used: (data.used as number) ?? 0,
        total: (data.total as number) ?? 1048576,
      };

    case 'research:progress':
      return {
        type: 'research:progress',
        sessionId,
        status: (data.status as string) ?? 'running',
        progress: (data.progress as number) ?? 0,
      };

    case 'research:evidence':
      return {
        type: 'research:evidence',
        sessionId,
        query: (data.query as string) ?? '',
        totalSources: (data.totalSources as number) ?? 0,
        avgConfidence: (data.avgConfidence as number) ?? 0,
        topSources:
          (data.topSources as Array<{
            title?: string;
            url?: string;
            confidence?: number;
            rank?: number;
          }> | undefined)?.map((source, index) => ({
            title: typeof source?.title === 'string' ? source.title : `Source ${index + 1}`,
            url: typeof source?.url === 'string' ? source.url : '',
            confidence: typeof source?.confidence === 'number' ? source.confidence : 0,
            rank: typeof source?.rank === 'number' ? source.rank : index + 1,
          })) ?? [],
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'browser:progress':
      return {
        type: 'browser:progress',
        sessionId,
        step: (data.step as number) ?? 0,
        maxSteps: (data.maxSteps as number) ?? 0,
        status:
          ((data.status as 'running' | 'blocked' | 'completed' | 'recovered' | undefined) ?? 'running'),
        url: data.url as string | undefined,
        detail: data.detail as string | undefined,
        lastAction: data.lastAction as string | undefined,
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'browser:checkpoint':
      return {
        type: 'browser:checkpoint',
        sessionId,
        checkpointPath: (data.checkpointPath as string) ?? '',
        step: (data.step as number) ?? 0,
        maxSteps: (data.maxSteps as number) ?? 0,
        url: data.url as string | undefined,
        recoverable: (data.recoverable as boolean) ?? true,
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'browser:blocker':
      return {
        type: 'browser:blocker',
        sessionId,
        reason: (data.reason as string) ?? 'Browser automation blocked',
        step: (data.step as number) ?? 0,
        maxSteps: (data.maxSteps as number) ?? 0,
        url: data.url as string | undefined,
        checkpointPath: data.checkpointPath as string | undefined,
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'error':
      return {
        type: 'error',
        sessionId,
        error: (data.error as string) ?? 'Unknown error',
        code: data.code as string | undefined,
        recoverable: data.recoverable as boolean | undefined,
        details: data.details as { retryAfterSeconds?: number; quotaMetric?: string; model?: string; docsUrl?: string } | undefined,
      };

    case 'session:updated':
      {
        const sessionData = (data.session as {
          id?: string;
          title?: string;
          messageCount?: number;
          executionMode?: 'execute' | 'plan';
          type?: 'main' | 'isolated' | 'cron' | 'ephemeral' | 'integration';
          provider?: string;
          workingDirectory?: string;
          model?: string;
          createdAt?: number;
          updatedAt?: number;
          lastAccessedAt?: number;
        } | undefined) ?? undefined;
      return {
        type: 'session:updated',
        sessionId: sessionId || sessionData?.id || '',
        title: (data.title as string | undefined) ?? sessionData?.title,
        messageCount: (data.messageCount as number | undefined) ?? sessionData?.messageCount,
        executionMode:
          (data.executionMode as 'execute' | 'plan' | undefined) ??
          sessionData?.executionMode,
        sessionType:
          (data.type as 'main' | 'isolated' | 'cron' | 'ephemeral' | 'integration' | undefined) ??
          sessionData?.type,
        provider: (data.provider as string | undefined) ?? sessionData?.provider,
        workingDirectory:
          (data.workingDirectory as string | undefined) ?? sessionData?.workingDirectory,
        model: (data.model as string | undefined) ?? sessionData?.model,
        createdAt: (data.createdAt as number | undefined) ?? sessionData?.createdAt,
        updatedAt: (data.updatedAt as number | undefined) ?? sessionData?.updatedAt,
        lastAccessedAt:
          (data.lastAccessedAt as number | undefined) ?? sessionData?.lastAccessedAt,
      };
      }

    case 'agent:started':
      return { type: 'agent:started', sessionId };

    case 'agent:stopped':
      return { type: 'agent:stopped', sessionId };

    case 'browserView:screenshot':
      return {
        type: 'browserView:screenshot',
        sessionId,
        data: (data.data as string) ?? '',
        mimeType: (data.mimeType as string) ?? 'image/png',
        url: (data.url as string) ?? '',
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    // Integration events
    case 'integration:status':
      return {
        type: 'integration:status',
        sessionId,
        platform: (data.platform as string) ?? '',
        connected: (data.connected as boolean) ?? false,
        displayName: data.displayName as string | undefined,
        identityPhone: data.identityPhone as string | undefined,
        identityName: data.identityName as string | undefined,
        error: data.error as string | undefined,
        connectedAt: data.connectedAt as number | undefined,
        lastMessageAt: data.lastMessageAt as number | undefined,
        health: data.health as 'healthy' | 'degraded' | 'unhealthy' | undefined,
        healthMessage: data.healthMessage as string | undefined,
        requiresReconnect: data.requiresReconnect as boolean | undefined,
        lastHealthCheckAt: data.lastHealthCheckAt as number | undefined,
      };

    case 'integration:qr':
      return {
        type: 'integration:qr',
        sessionId,
        qrDataUrl: (data.qrDataUrl as string) ?? '',
      };

    case 'integration:message_in':
      return {
        type: 'integration:message_in',
        sessionId,
        platform: (data.platform as string) ?? '',
        sender: (data.sender as string) ?? '',
        content: (data.content as string) ?? '',
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'integration:message_out':
      return {
        type: 'integration:message_out',
        sessionId,
        platform: (data.platform as string) ?? '',
        chatId: (data.chatId as string) ?? '',
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'integration:queued':
      return {
        type: 'integration:queued',
        sessionId,
        platform: (data.platform as string) ?? '',
        queueSize: (data.queueSize as number) ?? 0,
        timestamp: (data.timestamp as number) ?? Date.now(),
      };

    case 'queue:update':
      return {
        type: 'queue:update',
        sessionId,
        queue: (data.queue as Array<{ id: string; content: string; queuedAt: number }>) ?? [],
      };

    // V2 unified chat item events
    case 'chat:item':
      return {
        type: 'chat:item',
        sessionId,
        item: data.item as AgentEvent & { type: 'chat:item' } extends { item: infer I } ? I : never,
      };

    case 'chat:update':
      return {
        type: 'chat:update',
        sessionId,
        itemId: (data.itemId as string) ?? '',
        updates: (data.updates as Record<string, unknown>) ?? {},
      };

    case 'chat:items':
      return {
        type: 'chat:items',
        sessionId,
        items: (data.items as AgentEvent & { type: 'chat:items' } extends { items: infer I } ? I : never) ?? [],
      };

    // Thinking events
    case 'thinking:start':
      return { type: 'thinking:start', sessionId };

    case 'thinking:chunk':
      return {
        type: 'thinking:chunk',
        sessionId,
        content: (data.content as string) ?? '',
      };

    case 'thinking:done':
      return { type: 'thinking:done', sessionId };

    // Context usage
    case 'context:usage':
      return {
        type: 'context:usage',
        sessionId,
        usedTokens: (data.usedTokens as number) ?? 0,
        maxTokens: (data.maxTokens as number) ?? 1048576,
        percentUsed: (data.percentUsed as number) ?? 0,
      };

    default:
      console.warn('Unknown event type:', type);
      return null;
  }
}

export function parseSidecarEventEnvelope(envelope: {
  type: string;
  sessionId?: string | null;
  data?: unknown;
}): AgentEvent | null {
  return parseTauriEvent(`agent:${envelope.type}`, {
    type: envelope.type,
    sessionId: envelope.sessionId ?? undefined,
    data: envelope.data ?? {},
  });
}

/**
 * Subscribe to agent events for a specific session
 * @param sessionId The session ID to filter events for
 * @param handler Callback function for handling events
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToAgentEvents(
  sessionId: string | null,
  handler: AgentEventHandler
): () => void {
  const unlisteners: UnlistenFn[] = [];
  let isActive = true;

  // Event buffer for batching rapid events
  let eventBuffer: AgentEvent[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;

  const flushEvents = () => {
    if (!isActive || eventBuffer.length === 0) return;

    // Process all buffered events
    for (const event of eventBuffer) {
      handler(event);
    }
    eventBuffer = [];
    flushTimeout = null;
  };

  const queueEvent = (event: AgentEvent) => {
    if (!isActive) return;

    // For stream chunks, batch them together
    if (event.type === 'stream:chunk') {
      eventBuffer.push(event);

      if (!flushTimeout) {
        // Flush after a short delay to batch rapid chunks
        flushTimeout = setTimeout(flushEvents, 16); // ~60fps
      }
    } else {
      // Flush any pending chunks first
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushEvents();
      }
      // Then handle this event immediately
      handler(event);
    }
  };

  // Subscribe to all agent event types
  const eventTypes: (typeof TAURI_EVENT_NAMES)[number][] = [
    'agent:stream:start',
    'agent:stream:chunk',
    'agent:stream:done',
    'agent:run:checkpoint',
    'agent:run:recovered',
    'agent:run:fallback_applied',
    'agent:run:stalled',
    'agent:run:health',
    'agent:thinking:start',
    'agent:thinking:chunk',
    'agent:thinking:done',
    'agent:tool:start',
    'agent:tool:result',
    'agent:branch:created',
    'agent:branch:merged',
    'agent:workflow:activated',
    'agent:workflow:fallback',
    'agent:memory:retrieved',
    'agent:memory:consolidated',
    'agent:memory:conflict_detected',
    'agent:benchmark:progress',
    'agent:benchmark:score_updated',
    'agent:release_gate:status',
    'agent:permission:request',
    'agent:permission:resolved',
    'agent:question:ask',
    'agent:question:answered',
    'agent:task:create',
    'agent:task:update',
    'agent:task:delete',
    'agent:task:set',
    'agent:artifact:created',
    'agent:artifact:updated',
    'agent:artifact:deleted',
    'agent:context:update',
    'agent:context:usage',
    'agent:research:progress',
    'agent:research:evidence',
    'agent:browser:progress',
    'agent:browser:checkpoint',
    'agent:browser:blocker',
    'agent:error',
    'agent:session:updated',
    'agent:started',
    'agent:stopped',
    'agent:browserView:screenshot',
    'agent:chat:item',
    'agent:chat:update',
    'agent:chat:items',
    'agent:integration:status',
    'agent:integration:qr',
    'agent:integration:message_in',
    'agent:integration:message_out',
    'agent:integration:queued',
    'agent:queue:update',
  ];

  // Set up listeners for each event type
  for (const eventType of eventTypes) {
    listen<TauriEventPayload>(eventType, (event: Event<TauriEventPayload>) => {
      // Filter by session ID
      if (sessionId && event.payload.sessionId && event.payload.sessionId !== sessionId) {
        return;
      }

      const parsedEvent = parseTauriEvent(eventType, event.payload);
      if (parsedEvent) {
        queueEvent(parsedEvent);
      }
    })
      .then((unlisten) => {
        if (isActive) {
          unlisteners.push(unlisten);
        } else {
          unlisten();
        }
      })
      .catch((error) => {
        console.error(`Failed to subscribe to ${eventType}:`, error);
      });
  }

  // Return cleanup function
  return () => {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushEvents();
    }

    isActive = false;

    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}

/**
 * Subscribe to all agent events regardless of session
 * @param handler Callback function for handling events
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToAllEvents(handler: AgentEventHandler): () => void {
  const unlisteners: UnlistenFn[] = [];
  let isActive = true;

  const eventTypes: (typeof TAURI_EVENT_NAMES)[number][] = [
    'agent:stream:start',
    'agent:stream:chunk',
    'agent:stream:done',
    'agent:run:checkpoint',
    'agent:run:recovered',
    'agent:run:fallback_applied',
    'agent:run:stalled',
    'agent:run:health',
    'agent:thinking:start',
    'agent:thinking:chunk',
    'agent:thinking:done',
    'agent:tool:start',
    'agent:tool:result',
    'agent:branch:created',
    'agent:branch:merged',
    'agent:workflow:activated',
    'agent:workflow:fallback',
    'agent:memory:retrieved',
    'agent:memory:consolidated',
    'agent:memory:conflict_detected',
    'agent:benchmark:progress',
    'agent:benchmark:score_updated',
    'agent:release_gate:status',
    'agent:permission:request',
    'agent:permission:resolved',
    'agent:question:ask',
    'agent:question:answered',
    'agent:task:create',
    'agent:task:update',
    'agent:task:delete',
    'agent:task:set',
    'agent:artifact:created',
    'agent:artifact:updated',
    'agent:artifact:deleted',
    'agent:context:update',
    'agent:context:usage',
    'agent:research:progress',
    'agent:error',
    'agent:session:updated',
    'agent:started',
    'agent:stopped',
    'agent:browserView:screenshot',
    'agent:chat:item',
    'agent:chat:update',
    'agent:chat:items',
    'agent:integration:status',
    'agent:integration:qr',
    'agent:integration:message_in',
    'agent:integration:message_out',
    'agent:integration:queued',
    'agent:queue:update',
  ];

  for (const eventType of eventTypes) {
    listen<TauriEventPayload>(eventType, (event: Event<TauriEventPayload>) => {
      const parsedEvent = parseTauriEvent(eventType, event.payload);
      if (parsedEvent) {
        handler(parsedEvent);
      }
    })
      .then((unlisten) => {
        if (isActive) {
          unlisteners.push(unlisten);
        } else {
          unlisten();
        }
      })
      .catch((error) => {
        console.error(`Failed to subscribe to ${eventType}:`, error);
      });
  }

  return () => {
    isActive = false;
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}
