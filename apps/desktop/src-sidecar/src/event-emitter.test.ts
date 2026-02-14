// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from './event-emitter.js';

describe('EventEmitter chat:update coalescing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges buffered updates for the same chat item', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const emitter = new EventEmitter();
    emitter.chatItemUpdate('session-1', 'item-1', {
      content: 'Hello world',
    } as never);
    emitter.chatItemUpdate('session-1', 'item-1', {
      stream: {
        phase: 'intermediate',
        status: 'done',
        segmentIndex: 0,
      },
    } as never);

    emitter.flush();

    expect(writes).toHaveLength(1);
    const event = JSON.parse(writes[0]!) as {
      type: string;
      sessionId: string;
      data: { itemId: string; updates: Record<string, unknown> };
    };

    expect(event.type).toBe('chat:update');
    expect(event.sessionId).toBe('session-1');
    expect(event.data.itemId).toBe('item-1');
    expect(event.data.updates.content).toBe('Hello world');
    expect(event.data.updates.stream).toEqual({
      phase: 'intermediate',
      status: 'done',
      segmentIndex: 0,
    });
  });

  it('keeps updates separate for different chat items', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const emitter = new EventEmitter();
    emitter.chatItemUpdate('session-1', 'item-1', { content: 'A' } as never);
    emitter.chatItemUpdate('session-1', 'item-2', { content: 'B' } as never);
    emitter.flush();

    expect(writes).toHaveLength(2);

    const first = JSON.parse(writes[0]!) as { data: { itemId: string } };
    const second = JSON.parse(writes[1]!) as { data: { itemId: string } };

    expect(first.data.itemId).toBe('item-1');
    expect(second.data.itemId).toBe('item-2');
  });
});

describe('EventEmitter reliability health events', () => {
  it('emits run:health counters for reliability-relevant lifecycle events', () => {
    const emitter = new EventEmitter({ enableStdoutSink: false });
    const events: Array<{ type: string; sessionId: string | null; data: unknown }> = [];
    emitter.subscribe((event) => {
      events.push(event);
    });

    emitter.streamStart('session-1');
    emitter.streamDone('session-1', null);
    emitter.emit('run:stalled', 'session-1', { runId: 'run-1' });
    emitter.emit('run:recovered', 'session-1', { runId: 'run-1' });
    emitter.error('session-1', 'provider failed');

    const healthEvents = events.filter((event) => event.type === 'run:health');
    expect(healthEvents.length).toBeGreaterThanOrEqual(1);

    const latest = healthEvents[healthEvents.length - 1] as {
      data: {
        counters: {
          streamStarts: number;
          streamDone: number;
          runStalled: number;
          runRecovered: number;
          errors: number;
        };
        reliabilityScore: number;
        health: 'healthy' | 'degraded' | 'unhealthy';
      };
    };

    expect(latest.data.counters.streamStarts).toBe(1);
    expect(latest.data.counters.streamDone).toBe(1);
    expect(latest.data.counters.runStalled).toBe(1);
    expect(latest.data.counters.runRecovered).toBe(1);
    expect(latest.data.counters.errors).toBe(1);
    expect(latest.data.reliabilityScore).toBeGreaterThanOrEqual(0);
    expect(latest.data.reliabilityScore).toBeLessThanOrEqual(1);
    expect(['healthy', 'degraded', 'unhealthy']).toContain(latest.data.health);
  });
});

describe('EventEmitter schema + correlation envelope', () => {
  it('adds schemaVersion and stable run correlation IDs', () => {
    const emitter = new EventEmitter({ enableStdoutSink: false });
    const events: Array<{
      type: string;
      sessionId: string | null;
      schemaVersion: number;
      correlationId: string;
      data: unknown;
    }> = [];

    emitter.subscribe((event) => {
      events.push(event as never);
    });

    emitter.emit('run:checkpoint', 'session-1', { runId: 'run-abc', checkpointIndex: 1 });
    emitter.emit('tool:start', 'session-1', { toolCall: { id: 'tool-1' } });
    emitter.emit('run:recovered', 'session-1', { runId: 'run-abc', checkpointCount: 1 });

    const relevant = events.filter((event) => event.type !== 'run:health');
    expect(relevant).toHaveLength(3);
    expect(relevant[0]!.schemaVersion).toBe(1);
    expect(relevant[0]!.correlationId).toBe('session-1:run-abc');
    expect(relevant[1]!.correlationId).toBe('session-1:run-abc');
    expect(relevant[2]!.correlationId).toBe('session-1:run-abc');
  });
});
