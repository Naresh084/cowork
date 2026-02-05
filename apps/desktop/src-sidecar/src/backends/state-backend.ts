/**
 * StateBackend - Ephemeral Session State
 *
 * Implements short-term memory for a single session.
 * All data is lost when the session ends.
 */

import type { Message, Task } from '../types.js';
import type {
  StateBackend as IStateBackend,
  CheckpointData,
  ResumeResult,
} from './types.js';

/**
 * Active session reference (minimal interface)
 */
interface SessionRef {
  id: string;
  messages: Message[];
  tasks: Task[];
}

/**
 * StateBackend implementation for ephemeral session state
 */
export class CoworkStateBackend implements IStateBackend {
  private session: SessionRef;
  private ephemeralFiles: Map<string, string> = new Map();

  constructor(session: SessionRef) {
    this.session = session;
  }

  /**
   * Get all messages sorted by createdAt and order
   */
  getMessages(): Message[] {
    return [...this.session.messages].sort((a, b) => {
      // Primary: createdAt
      const timestampCompare = (a.createdAt || 0) - (b.createdAt || 0);
      if (timestampCompare !== 0) return timestampCompare;

      // Secondary: order field if present
      const aOrder = (a as Message & { order?: number }).order ?? 0;
      const bOrder = (b as Message & { order?: number }).order ?? 0;
      return aOrder - bOrder;
    });
  }

  /**
   * Add a message to the session
   */
  async addMessage(message: Message): Promise<void> {
    // Add order field for deterministic sorting
    const messageWithOrder = {
      ...message,
      order: this.session.messages.length,
      createdAt: message.createdAt || Date.now(),
    };

    this.session.messages.push(messageWithOrder as Message);
  }

  /**
   * Get messages in a range
   */
  getMessageRange(start: number, end: number): Message[] {
    const sorted = this.getMessages();
    return sorted.slice(start, end);
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.session.messages.length;
  }

  /**
   * Clear all messages
   */
  async clearMessages(): Promise<void> {
    this.session.messages = [];
  }

  /**
   * Write ephemeral file (lost when session ends)
   */
  async writeEphemeral(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    this.ephemeralFiles.set(normalizedPath, content);
  }

  /**
   * Read ephemeral file
   */
  async readEphemeral(path: string): Promise<string | null> {
    const normalizedPath = this.normalizePath(path);
    return this.ephemeralFiles.get(normalizedPath) || null;
  }

  /**
   * Delete ephemeral file
   */
  async deleteEphemeral(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    this.ephemeralFiles.delete(normalizedPath);
  }

  /**
   * List ephemeral files with optional prefix filter
   */
  async listEphemeral(prefix?: string): Promise<string[]> {
    const paths = Array.from(this.ephemeralFiles.keys());
    if (!prefix) return paths;

    const normalizedPrefix = this.normalizePath(prefix);
    return paths.filter(p => p.startsWith(normalizedPrefix));
  }

  /**
   * Create checkpoint for HITL pause/resume
   */
  async checkpoint(): Promise<string> {
    const checkpointData: CheckpointData = {
      version: '1.0',
      type: 'state',
      timestamp: Date.now(),
      sessionId: this.session.id,
      messages: [...this.session.messages],
      tasks: [...this.session.tasks],
      ephemeralFiles: Object.fromEntries(this.ephemeralFiles),
    };

    return JSON.stringify(checkpointData);
  }

  /**
   * Restore from checkpoint
   */
  async restore(checkpointString: string): Promise<void> {
    try {
      const checkpoint = JSON.parse(checkpointString) as CheckpointData;

      // Validate checkpoint
      if (!checkpoint.version || !checkpoint.sessionId) {
        throw new Error('Invalid checkpoint format');
      }

      // Verify session ID matches
      if (checkpoint.sessionId !== this.session.id) {
        throw new Error(
          `Checkpoint session ID mismatch: expected ${this.session.id}, got ${checkpoint.sessionId}`
        );
      }

      // Restore messages
      this.session.messages = checkpoint.messages || [];

      // Restore tasks
      this.session.tasks = checkpoint.tasks || [];

      // Restore ephemeral files
      this.ephemeralFiles = new Map(
        Object.entries(checkpoint.ephemeralFiles || {})
      );
    } catch (error) {
      throw new Error(
        `Failed to restore checkpoint: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get resume result from checkpoint string
   */
  static getResumeResult(checkpointString: string): ResumeResult {
    const checkpoint = JSON.parse(checkpointString) as CheckpointData;

    return {
      pendingPermission: checkpoint.pendingPermission,
      messagesRestored: checkpoint.messages?.length || 0,
      tasksRestored: checkpoint.tasks?.length || 0,
      resumedAt: Date.now(),
    };
  }

  /**
   * Get current tasks
   */
  getTasks(): Task[] {
    return [...this.session.tasks];
  }

  /**
   * Add or update a task
   */
  async setTask(task: Task): Promise<void> {
    const existingIndex = this.session.tasks.findIndex(t => t.id === task.id);
    if (existingIndex >= 0) {
      this.session.tasks[existingIndex] = task;
    } else {
      this.session.tasks.push(task);
    }
  }

  /**
   * Remove a task
   */
  async removeTask(taskId: string): Promise<void> {
    const index = this.session.tasks.findIndex(t => t.id === taskId);
    if (index >= 0) {
      this.session.tasks.splice(index, 1);
    }
  }

  /**
   * Normalize path for consistent storage
   */
  private normalizePath(path: string): string {
    // Remove leading/trailing slashes and normalize
    return path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  }

  /**
   * Get session reference (for debugging)
   */
  getSessionRef(): SessionRef {
    return this.session;
  }

  /**
   * Get ephemeral file count (for debugging)
   */
  getEphemeralFileCount(): number {
    return this.ephemeralFiles.size;
  }

  /**
   * Clear all ephemeral files
   */
  async clearEphemeral(): Promise<void> {
    this.ephemeralFiles.clear();
  }
}

/**
 * Create a new StateBackend for a session
 */
export function createStateBackend(session: SessionRef): CoworkStateBackend {
  return new CoworkStateBackend(session);
}
