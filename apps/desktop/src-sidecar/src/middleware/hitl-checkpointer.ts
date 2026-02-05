/**
 * HITL Checkpointer
 *
 * Checkpoint/Resume functionality for interrupted operations
 */

import type { CoworkStateBackend } from '../backends/state-backend.js';
import type { CheckpointData, PendingPermissionCheckpoint, ResumeResult } from '../backends/types.js';

/**
 * Pending permission info
 */
export interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  requestedAt: number;
}

/**
 * HitlCheckpointer class
 */
export class HitlCheckpointer {
  private stateBackend: CoworkStateBackend;

  constructor(stateBackend: CoworkStateBackend) {
    this.stateBackend = stateBackend;
  }

  /**
   * Save checkpoint before permission request
   * If user closes app during permission dialog, we can resume
   */
  async saveCheckpoint(pendingPermission: PendingPermission): Promise<string> {
    const checkpointId = `checkpoint_${pendingPermission.requestId}`;

    // Get current state
    const currentState = await this.stateBackend.checkpoint();
    const stateData = JSON.parse(currentState) as CheckpointData;

    // Create checkpoint with pending permission
    const checkpoint: CheckpointData = {
      ...stateData,
      type: 'permission_pending',
      pendingPermission: {
        requestId: pendingPermission.requestId,
        toolName: pendingPermission.toolName,
        toolInput: pendingPermission.toolInput,
        requestedAt: pendingPermission.requestedAt,
      },
    };

    // Save to ephemeral storage
    await this.stateBackend.writeEphemeral(
      `.checkpoints/${checkpointId}.json`,
      JSON.stringify(checkpoint)
    );

    return checkpointId;
  }

  /**
   * Resume from checkpoint after app restart
   */
  async resumeFromCheckpoint(checkpointId: string): Promise<ResumeResult | null> {
    const checkpointData = await this.stateBackend.readEphemeral(
      `.checkpoints/${checkpointId}.json`
    );

    if (!checkpointData) {
      return null;
    }

    try {
      const checkpoint = JSON.parse(checkpointData) as CheckpointData;

      // Restore agent state
      await this.stateBackend.restore(JSON.stringify({
        version: checkpoint.version,
        type: 'state',
        timestamp: checkpoint.timestamp,
        sessionId: checkpoint.sessionId,
        messages: checkpoint.messages,
        tasks: checkpoint.tasks,
        ephemeralFiles: checkpoint.ephemeralFiles,
      }));

      return {
        pendingPermission: checkpoint.pendingPermission,
        messagesRestored: checkpoint.messages?.length || 0,
        tasksRestored: checkpoint.tasks?.length || 0,
        resumedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Clear checkpoint after permission resolved
   */
  async clearCheckpoint(checkpointId: string): Promise<void> {
    await this.stateBackend.deleteEphemeral(`.checkpoints/${checkpointId}.json`);
  }

  /**
   * List all pending checkpoints
   */
  async listCheckpoints(): Promise<string[]> {
    const files = await this.stateBackend.listEphemeral('.checkpoints/');
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.checkpoints/', '').replace('.json', ''));
  }

  /**
   * Get checkpoint details without restoring
   */
  async getCheckpointInfo(checkpointId: string): Promise<{
    sessionId: string;
    timestamp: number;
    pendingPermission?: PendingPermissionCheckpoint;
  } | null> {
    const checkpointData = await this.stateBackend.readEphemeral(
      `.checkpoints/${checkpointId}.json`
    );

    if (!checkpointData) {
      return null;
    }

    try {
      const checkpoint = JSON.parse(checkpointData) as CheckpointData;
      return {
        sessionId: checkpoint.sessionId,
        timestamp: checkpoint.timestamp,
        pendingPermission: checkpoint.pendingPermission,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if there's a pending checkpoint for a session
   */
  async hasPendingCheckpoint(sessionId: string): Promise<boolean> {
    const checkpoints = await this.listCheckpoints();

    for (const checkpointId of checkpoints) {
      const info = await this.getCheckpointInfo(checkpointId);
      if (info?.sessionId === sessionId && info.pendingPermission) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get pending checkpoint for a session
   */
  async getPendingCheckpoint(sessionId: string): Promise<{
    checkpointId: string;
    pendingPermission: PendingPermissionCheckpoint;
  } | null> {
    const checkpoints = await this.listCheckpoints();

    for (const checkpointId of checkpoints) {
      const info = await this.getCheckpointInfo(checkpointId);
      if (info?.sessionId === sessionId && info.pendingPermission) {
        return {
          checkpointId,
          pendingPermission: info.pendingPermission,
        };
      }
    }

    return null;
  }

  /**
   * Clean up old checkpoints (older than 24 hours)
   */
  async cleanupOldCheckpoints(): Promise<number> {
    const checkpoints = await this.listCheckpoints();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleaned = 0;

    for (const checkpointId of checkpoints) {
      const info = await this.getCheckpointInfo(checkpointId);
      if (info && now - info.timestamp > maxAge) {
        await this.clearCheckpoint(checkpointId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Create a HitlCheckpointer instance
 */
export function createHitlCheckpointer(stateBackend: CoworkStateBackend): HitlCheckpointer {
  return new HitlCheckpointer(stateBackend);
}
