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

// Re-export types from shared
export type {
  Session,
  Message,
  MessageRole,
  MessageContentPart,
  PermissionRequest,
  PermissionDecision,
} from '@gemini-cowork/shared';

// Convenience function to create all repositories
import { DatabaseConnection, getDatabase, type DatabaseOptions } from './database.js';
import { SessionRepository } from './repositories/session.js';
import { MessageRepository } from './repositories/message.js';
import { PermissionRepository } from './repositories/permission.js';
import { SettingsRepository } from './repositories/settings.js';

export interface Repositories {
  sessions: SessionRepository;
  messages: MessageRepository;
  permissions: PermissionRepository;
  settings: SettingsRepository;
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
    db,
  };
}
