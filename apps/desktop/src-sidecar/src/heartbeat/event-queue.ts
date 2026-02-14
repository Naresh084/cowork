// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * EventQueue - Priority queue for system events
 *
 * Events are sorted by priority (high → normal → low)
 * Within same priority, FIFO order is maintained
 */

import type { SystemEvent, SystemEventType, EventPriority } from '@cowork/shared';

/**
 * Priority values for sorting (higher = more urgent)
 */
const PRIORITY_VALUES: Record<EventPriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Priority event queue for system events
 */
export class EventQueue {
  private events: SystemEvent[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add event to queue (sorted by priority)
   * Returns the event ID
   */
  enqueue(event: Omit<SystemEvent, 'id' | 'scheduledAt'>): string {
    const fullEvent: SystemEvent = {
      ...event,
      id: generateId('evt'),
      scheduledAt: Date.now(),
    };

    // Check capacity
    if (this.events.length >= this.maxSize) {
      // Remove oldest low-priority event first
      const lowPriorityIndex = this.events.findIndex(e => e.priority === 'low');
      if (lowPriorityIndex >= 0) {
        this.events.splice(lowPriorityIndex, 1);
      } else {
        // Remove oldest event if no low priority events
        this.events.shift();
      }
    }

    // Insert in priority order (high first, then by scheduledAt)
    const insertIndex = this.findInsertIndex(fullEvent);
    this.events.splice(insertIndex, 0, fullEvent);

    return fullEvent.id;
  }

  /**
   * Remove and return next event
   */
  dequeue(): SystemEvent | undefined {
    return this.events.shift();
  }

  /**
   * Peek at next event without removing
   */
  peek(): SystemEvent | undefined {
    return this.events[0];
  }

  /**
   * Get all events (for inspection)
   */
  getAll(): SystemEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getByType(type: SystemEventType): SystemEvent[] {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Remove event by ID
   */
  remove(eventId: string): boolean {
    const index = this.events.findIndex(e => e.id === eventId);
    if (index >= 0) {
      this.events.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.events.length;
  }

  /**
   * Check if empty
   */
  get isEmpty(): boolean {
    return this.events.length === 0;
  }

  /**
   * Find insert position maintaining priority order
   * Higher priority events come first
   * Within same priority, newer events come after older (FIFO)
   */
  private findInsertIndex(event: SystemEvent): number {
    const eventPriority = PRIORITY_VALUES[event.priority];

    for (let i = 0; i < this.events.length; i++) {
      const existingPriority = PRIORITY_VALUES[this.events[i].priority];
      if (eventPriority > existingPriority) {
        return i;
      }
      // Same priority: insert after existing (FIFO within priority)
    }

    return this.events.length; // Add at end
  }
}
