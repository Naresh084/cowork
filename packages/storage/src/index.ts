// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

// Database
export {
  DatabaseConnection,
  getDatabase,
  closeDatabase,
  getDefaultDatabasePath,
  type DatabaseOptions,
} from './database.js';

// Repositories
export { SessionRepository } from './repositories/session.js';
export { MessageRepository } from './repositories/message.js';
export { PermissionRepository, type StoredPermission } from './repositories/permission.js';
export { SettingsRepository, type Setting } from './repositories/settings.js';
export { WorkflowRepository } from './repositories/workflow.js';
export { WorkflowRunRepository, type WorkflowRunWithDetails } from './repositories/workflow-run.js';
export { WorkflowEventRepository } from './repositories/workflow-event.js';
export { MemoryAtomRepository } from './repositories/memory-atom.js';
export { MemoryQueryRepository, type MemoryQueryLog } from './repositories/memory-query.js';
export { SessionBranchRepository } from './repositories/session-branch.js';
export { RunCheckpointRepository } from './repositories/run-checkpoint.js';
export {
  BenchmarkRepository,
  type BenchmarkSuiteRecord,
  type BenchmarkRunRecord,
  type BenchmarkResultRecord,
} from './repositories/benchmark.js';

// Re-export types from shared
export type {
  Session,
  Message,
  MessageRole,
  MessageContentPart,
  PermissionRequest,
  PermissionDecision,
} from '@cowork/shared';

// Convenience function to create all repositories
import { DatabaseConnection, getDatabase, type DatabaseOptions } from './database.js';
import { SessionRepository } from './repositories/session.js';
import { MessageRepository } from './repositories/message.js';
import { PermissionRepository } from './repositories/permission.js';
import { SettingsRepository } from './repositories/settings.js';
import { WorkflowRepository } from './repositories/workflow.js';
import { WorkflowRunRepository } from './repositories/workflow-run.js';
import { WorkflowEventRepository } from './repositories/workflow-event.js';
import { MemoryAtomRepository } from './repositories/memory-atom.js';
import { MemoryQueryRepository } from './repositories/memory-query.js';
import { SessionBranchRepository } from './repositories/session-branch.js';
import { RunCheckpointRepository } from './repositories/run-checkpoint.js';
import { BenchmarkRepository } from './repositories/benchmark.js';

export interface Repositories {
  sessions: SessionRepository;
  messages: MessageRepository;
  permissions: PermissionRepository;
  settings: SettingsRepository;
  workflows: WorkflowRepository;
  workflowRuns: WorkflowRunRepository;
  workflowEvents: WorkflowEventRepository;
  memoryAtoms: MemoryAtomRepository;
  memoryQueries: MemoryQueryRepository;
  sessionBranches: SessionBranchRepository;
  runCheckpoints: RunCheckpointRepository;
  benchmarks: BenchmarkRepository;
  db: DatabaseConnection;
}

/**
 * Create all repositories with a shared database connection.
 */
export function createRepositories(options?: DatabaseOptions): Repositories {
  const db = getDatabase(options);

  return {
    sessions: new SessionRepository(db),
    messages: new MessageRepository(db),
    permissions: new PermissionRepository(db),
    settings: new SettingsRepository(db),
    workflows: new WorkflowRepository(db),
    workflowRuns: new WorkflowRunRepository(db),
    workflowEvents: new WorkflowEventRepository(db),
    memoryAtoms: new MemoryAtomRepository(db),
    memoryQueries: new MemoryQueryRepository(db),
    sessionBranches: new SessionBranchRepository(db),
    runCheckpoints: new RunCheckpointRepository(db),
    benchmarks: new BenchmarkRepository(db),
    db,
  };
}
