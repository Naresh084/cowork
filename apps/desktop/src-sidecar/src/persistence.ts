import { mkdir, readFile, writeFile, rm, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type { Task, Artifact, PersistedMessage, PersistedToolExecution, SessionType } from './types.js';

// Schema version for migrations
const SCHEMA_VERSION = 1;

/**
 * Generate a stable hash for a working directory path.
 * Used to create workspace index files.
 */
function hashWorkingDirectory(workingDirectory: string): string {
  return createHash('md5')
    .update(workingDirectory.toLowerCase())
    .digest('hex')
    .substring(0, 16);
}

// Re-export types for convenience
export type { PersistedMessage, PersistedToolExecution };

interface SessionMetadata {
  version: number;
  id: string;
  type?: SessionType; // Optional for backwards compatibility with legacy sessions
  title: string | null;
  workingDirectory: string;
  model: string;
  approvalMode: 'auto' | 'read_only' | 'full';
  createdAt: number;
  updatedAt: number;
}

interface SessionIndex {
  version: number;
  sessions: Array<{
    id: string;
    type?: SessionType; // Optional for backwards compatibility
    title: string | null;
    firstMessage: string | null;
    workingDirectory: string;
    model: string;
    messageCount: number;
    createdAt: number;
    updatedAt: number;
  }>;
}

export interface PersistedSessionData {
  metadata: SessionMetadata;
  messages: PersistedMessage[];
  toolExecutions: PersistedToolExecution[];
  tasks: Task[];
  artifacts: Artifact[];
}

export class SessionPersistence {
  private sessionsDir: string;
  private workspacesDir: string;

  constructor(appDataDir: string) {
    // appDataDir is now ~/.geminicowork
    this.sessionsDir = join(appDataDir, 'sessions');
    this.workspacesDir = join(appDataDir, 'workspaces');
  }

  async initialize(): Promise<void> {
    // Create all directories
    await mkdir(this.sessionsDir, { recursive: true });
    await mkdir(this.workspacesDir, { recursive: true });

    // Create index if doesn't exist
    const indexPath = join(this.sessionsDir, 'index.json');
    if (!existsSync(indexPath)) {
      await this.writeJson(indexPath, { version: SCHEMA_VERSION, sessions: [] });
    }
  }

  /**
   * Get all session IDs associated with a working directory.
   */
  async getSessionsForWorkspace(workingDirectory: string): Promise<string[]> {
    const hash = hashWorkingDirectory(workingDirectory);
    const indexPath = join(this.workspacesDir, `${hash}.json`);

    if (!existsSync(indexPath)) {
      return [];
    }

    try {
      const data = await this.readJson<{ sessions: string[] }>(indexPath);
      return data.sessions || [];
    } catch {
      return [];
    }
  }

  /**
   * Add a session to the workspace index.
   */
  async addSessionToWorkspace(sessionId: string, workingDirectory: string): Promise<void> {
    const hash = hashWorkingDirectory(workingDirectory);
    const indexPath = join(this.workspacesDir, `${hash}.json`);

    let sessions: string[] = [];
    if (existsSync(indexPath)) {
      try {
        const data = await this.readJson<{ sessions: string[] }>(indexPath);
        sessions = data.sessions || [];
      } catch {
        // Start fresh
      }
    }

    if (!sessions.includes(sessionId)) {
      sessions.push(sessionId);
      await this.writeJson(indexPath, {
        workingDirectory,
        sessions,
        updatedAt: Date.now()
      });
    }
  }

  /**
   * Remove a session from the workspace index.
   */
  async removeSessionFromWorkspace(sessionId: string, workingDirectory: string): Promise<void> {
    const hash = hashWorkingDirectory(workingDirectory);
    const indexPath = join(this.workspacesDir, `${hash}.json`);

    if (!existsSync(indexPath)) return;

    try {
      const data = await this.readJson<{ sessions: string[] }>(indexPath);
      const sessions = (data.sessions || []).filter(id => id !== sessionId);

      if (sessions.length === 0) {
        // Remove empty index file
        await unlink(indexPath);
      } else {
        await this.writeJson(indexPath, {
          workingDirectory,
          sessions,
          updatedAt: Date.now()
        });
      }
    } catch {
      // Ignore errors
    }
  }

  async loadAllSessions(): Promise<Map<string, PersistedSessionData>> {
    const result = new Map<string, PersistedSessionData>();

    try {
      const index = await this.readJson<SessionIndex>(join(this.sessionsDir, 'index.json'));

      for (const entry of index.sessions) {
        try {
          const data = await this.loadSession(entry.id);
          if (data) {
            result.set(entry.id, data);
          }
        } catch (error) {
          console.error(`Failed to load session ${entry.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load session index:', error);
    }

    return result;
  }

  async loadSession(sessionId: string): Promise<PersistedSessionData | null> {
    const sessionDir = join(this.sessionsDir, sessionId);

    if (!existsSync(sessionDir)) {
      return null;
    }

    const [metadata, messages, toolExecutions, tasks, artifacts] = await Promise.all([
      this.readJson<SessionMetadata>(join(sessionDir, 'session.json')),
      this.readJson<{ messages: PersistedMessage[] }>(join(sessionDir, 'messages.json'))
        .then(d => d.messages).catch(() => []),
      this.readJson<{ executions: PersistedToolExecution[] }>(join(sessionDir, 'tools.json'))
        .then(d => d.executions).catch(() => []),
      this.readJson<{ tasks: Task[] }>(join(sessionDir, 'tasks.json'))
        .then(d => d.tasks).catch(() => []),
      this.readJson<{ artifacts: Artifact[] }>(join(sessionDir, 'artifacts.json'))
        .then(d => d.artifacts).catch(() => []),
    ]);

    return { metadata, messages, toolExecutions, tasks, artifacts };
  }

  async saveSession(session: {
    id: string;
    type?: SessionType;
    title: string | null;
    workingDirectory: string;
    model: string;
    approvalMode: 'auto' | 'read_only' | 'full';
    messages: PersistedMessage[];
    toolExecutions: PersistedToolExecution[];
    tasks: Task[];
    artifacts: Artifact[];
    createdAt: number;
    updatedAt: number;
  }): Promise<void> {
    const sessionDir = join(this.sessionsDir, session.id);

    // Ensure session directory exists
    if (!existsSync(sessionDir)) {
      await mkdir(sessionDir, { recursive: true });
    }

    // Write all files in parallel
    await Promise.all([
      this.writeJson(join(sessionDir, 'session.json'), {
        version: SCHEMA_VERSION,
        id: session.id,
        type: session.type || 'main', // Default to 'main' for legacy
        title: session.title,
        workingDirectory: session.workingDirectory,
        model: session.model,
        approvalMode: session.approvalMode,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
      this.writeJson(join(sessionDir, 'messages.json'), {
        version: SCHEMA_VERSION,
        messages: session.messages,
      }),
      this.writeJson(join(sessionDir, 'tools.json'), {
        version: SCHEMA_VERSION,
        executions: session.toolExecutions,
      }),
      this.writeJson(join(sessionDir, 'tasks.json'), {
        version: SCHEMA_VERSION,
        tasks: session.tasks,
      }),
      this.writeJson(join(sessionDir, 'artifacts.json'), {
        version: SCHEMA_VERSION,
        artifacts: session.artifacts,
      }),
    ]);

    // Update index
    await this.updateIndex(session);

    // Update workspace index
    await this.addSessionToWorkspace(session.id, session.workingDirectory);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    // Load session first to get working directory for workspace index cleanup
    const session = await this.loadSession(sessionId);

    const sessionDir = join(this.sessionsDir, sessionId);

    if (existsSync(sessionDir)) {
      await rm(sessionDir, { recursive: true, force: true });
    }

    // Update workspace index
    if (session) {
      await this.removeSessionFromWorkspace(sessionId, session.metadata.workingDirectory);
    }

    // Update index
    await this.removeFromIndex(sessionId);

    return true;
  }

  private async updateIndex(session: {
    id: string;
    type?: SessionType;
    title: string | null;
    workingDirectory: string;
    model: string;
    messages: PersistedMessage[];
    createdAt: number;
    updatedAt: number;
  }): Promise<void> {
    const indexPath = join(this.sessionsDir, 'index.json');
    const index = await this.readJson<SessionIndex>(indexPath).catch((): SessionIndex => ({
      version: SCHEMA_VERSION,
      sessions: [],
    }));

    // Find first user message for preview
    const firstUserMsg = session.messages.find(m => m.role === 'user');
    const firstMessage = firstUserMsg
      ? (typeof firstUserMsg.content === 'string'
          ? firstUserMsg.content.slice(0, 100)
          : null)
      : null;

    // Update or add session entry
    const existingIdx = index.sessions.findIndex(s => s.id === session.id);
    const entry = {
      id: session.id,
      type: session.type || 'main',
      title: session.title,
      firstMessage,
      workingDirectory: session.workingDirectory,
      model: session.model,
      messageCount: session.messages.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };

    if (existingIdx >= 0) {
      index.sessions[existingIdx] = entry;
    } else {
      index.sessions.unshift(entry); // Add to beginning (most recent)
    }

    await this.writeJson(indexPath, index);
  }

  private async removeFromIndex(sessionId: string): Promise<void> {
    const indexPath = join(this.sessionsDir, 'index.json');
    const index = await this.readJson<SessionIndex>(indexPath).catch((): SessionIndex => ({
      version: SCHEMA_VERSION,
      sessions: [],
    }));

    index.sessions = index.sessions.filter(s => s.id !== sessionId);
    await this.writeJson(indexPath, index);
  }

  private async readJson<T>(path: string): Promise<T> {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
  }
}
