// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Checkpointer Manager
 *
 * Provides a singleton SqliteSaver instance for DeepAgents state persistence.
 * The checkpointer stores conversation state per thread_id (= session ID),
 * allowing the agent to remember prior messages without resending full history.
 */

import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';

let checkpointerInstance: SqliteSaver | null = null;
let dataDir: string = join(homedir(), '.cowork');

/**
 * Set the data directory for the checkpointer.
 * Should be called during initialization (before first getCheckpointer call).
 */
export function setCheckpointerDataDir(dir: string): void {
  dataDir = dir;
}

/**
 * Get or create the singleton SqliteSaver instance.
 * Lazily initializes on first call.
 */
export function getCheckpointer(): SqliteSaver {
  if (!checkpointerInstance) {
    const checkpointDir = join(dataDir, 'checkpoints');
    if (!existsSync(checkpointDir)) {
      mkdirSync(checkpointDir, { recursive: true });
    }
    const dbPath = join(checkpointDir, 'agent-state.sqlite');
    checkpointerInstance = SqliteSaver.fromConnString(dbPath);
  }
  return checkpointerInstance;
}

/**
 * Close the checkpointer and release resources.
 */
export async function closeCheckpointer(): Promise<void> {
  checkpointerInstance = null;
}
