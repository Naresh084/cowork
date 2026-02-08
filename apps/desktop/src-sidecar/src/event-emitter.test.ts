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
