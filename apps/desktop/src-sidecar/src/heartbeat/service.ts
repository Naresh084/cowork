/**
 * HeartbeatService - Periodic wake-ups and system event processing
 *
 * Features:
 * - Configurable heartbeat interval
 * - Priority event queue for system events
 * - Immediate wake via wake('now')
 * - Events emitted for each heartbeat and processed event
 */

import { EventEmitter } from 'events';
import type {
  HeartbeatConfig,
  HeartbeatStatus,
  SystemEvent,
  WakeMode,
} from '@gemini-cowork/shared';
import { EventQueue } from './event-queue.js';
import {
  readJsonFile,
  writeJsonFileAtomic,
  getHeartbeatConfigPath,
  ensureDataDir,
} from '../utils/paths.js';

/**
 * Default heartbeat configuration
 */
const DEFAULT_CONFIG: HeartbeatConfig = {
  enabled: true,
  intervalMs: 60000, // 1 minute
  systemEventsEnabled: true,
  cronEnabled: true,
};

/**
 * HeartbeatService manages periodic wake-ups and system event processing
 */
export class HeartbeatService extends EventEmitter {
  private config: HeartbeatConfig;
  private eventQueue: EventQueue;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private lastHeartbeat = 0;
  private nextHeartbeat = 0;
  private initialized = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.eventQueue = new EventQueue();
  }

  /**
   * Initialize the service and load config from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await ensureDataDir();

    // Load config from disk
    const savedConfig = await readJsonFile<HeartbeatConfig>(
      getHeartbeatConfigPath(),
      DEFAULT_CONFIG
    );
    this.config = { ...DEFAULT_CONFIG, ...savedConfig };
    this.initialized = true;
  }

  /**
   * Start heartbeat timer
   */
  start(): void {
    if (this.timer || !this.config.enabled) return;
    this.scheduleNext();
    this.emit('heartbeat:started');
  }

  /**
   * Stop heartbeat timer
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.emit('heartbeat:stopped');
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Update configuration
   */
  async configure(config: Partial<HeartbeatConfig>): Promise<void> {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Save to disk
    await writeJsonFileAtomic(getHeartbeatConfigPath(), this.config);

    // Handle enable/disable changes
    if (wasEnabled && !this.config.enabled) {
      this.stop();
    } else if (!wasEnabled && this.config.enabled) {
      this.start();
    } else if (this.timer) {
      // Reschedule with new interval
      this.stop();
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): HeartbeatConfig {
    return { ...this.config };
  }

  /**
   * Queue a system event for processing
   */
  queueEvent(event: Omit<SystemEvent, 'id' | 'scheduledAt'>): string {
    if (!this.config.systemEventsEnabled) {
      throw new Error('System events are disabled');
    }

    const eventId = this.eventQueue.enqueue(event);
    const fullEvent = this.eventQueue.getAll().find(e => e.id === eventId);
    if (fullEvent) {
      this.emit('event:queued', fullEvent);
    }
    return eventId;
  }

  /**
   * Remove a queued event
   */
  cancelEvent(eventId: string): boolean {
    return this.eventQueue.remove(eventId);
  }

  /**
   * Trigger immediate heartbeat
   * @param mode 'now' processes immediately, 'next-heartbeat' waits for scheduled time
   */
  wake(mode: WakeMode = 'next-heartbeat'): void {
    if (mode === 'now' && !this.isProcessing) {
      // Cancel scheduled and run immediately
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.processHeartbeat().then(() => {
        // Reschedule after immediate processing
        if (this.config.enabled && !this.timer) {
          this.scheduleNext();
        }
      });
    }
    // 'next-heartbeat' does nothing special - just waits for scheduled time
  }

  /**
   * Get current status
   */
  getStatus(): HeartbeatStatus {
    return {
      isRunning: this.timer !== null,
      lastHeartbeat: this.lastHeartbeat,
      nextHeartbeat: this.nextHeartbeat,
      eventQueueSize: this.eventQueue.size,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Get queued events
   */
  getQueuedEvents(): SystemEvent[] {
    return this.eventQueue.getAll();
  }

  /**
   * Schedule next heartbeat
   */
  private scheduleNext(): void {
    this.nextHeartbeat = Date.now() + this.config.intervalMs;
    this.timer = setTimeout(() => {
      this.processHeartbeat().then(() => {
        // Schedule next heartbeat after processing
        if (this.config.enabled) {
          this.scheduleNext();
        }
      });
    }, this.config.intervalMs);

    // Don't prevent process exit
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Process heartbeat: emit tick and process queued events
   */
  private async processHeartbeat(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.lastHeartbeat = Date.now();

    try {
      // Emit heartbeat tick
      this.emit('heartbeat:tick', this.lastHeartbeat);

      // Process queued events
      while (!this.eventQueue.isEmpty) {
        const event = this.eventQueue.dequeue();
        if (event) {
          try {
            this.emit('system-event', event);
            this.emit('event:processed', event);
          } catch {
            // Error processing system event - continue
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

/**
 * Singleton instance
 */
export const heartbeatService = new HeartbeatService();
