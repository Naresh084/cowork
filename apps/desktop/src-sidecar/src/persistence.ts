// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { mkdir, readFile, writeFile, rename, rm, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type {
  Task,
  Artifact,
  PersistedMessage,
  PersistedToolExecution,
  SessionType,
  ProviderId,
  SessionRuntimeState,
} from './types.js';
import type {
  ChatItem,
  UserMessageItem,
  AssistantMessageItem,
  SystemMessageItem,
  ToolStartItem,
  ToolResultItem,
  ContextUsage,
} from '@cowork/shared';

// Schema version for migrations
// v1: Separate messages.json, tools.json
// v2: Unified chat-items.json
const SCHEMA_VERSION = 2;

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

// PersistedMessage and PersistedToolExecution types used internally for V1→V2 migration

interface SessionMetadataV1 {
  version: 1;
  id: string;
  type?: SessionType;
  provider?: ProviderId;
  executionMode?: 'execute' | 'plan';
  title: string | null;
  workingDirectory: string;
  model: string;
  approvalMode: 'auto' | 'read_only' | 'full';
  createdAt: number;
  updatedAt: number;
}

interface SessionMetadataV2 {
  version: 2;
  id: string;
  type?: SessionType;
  provider?: ProviderId;
  executionMode?: 'execute' | 'plan';
  title: string | null;
  workingDirectory: string;
  model: string;
  approvalMode: 'auto' | 'read_only' | 'full';
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

interface SessionIndex {
  version: number;
  sessions: Array<{
    id: string;
    type?: SessionType;
    provider?: ProviderId;
    executionMode?: 'execute' | 'plan';
    title: string | null;
    firstMessage: string | null;
    workingDirectory: string;
    model: string;
    messageCount: number;
    createdAt: number;
    updatedAt: number;
    lastAccessedAt: number;
  }>;
}

// V1 persisted data structure (for migration)
export interface PersistedSessionDataV1 {
  metadata: SessionMetadataV1;
  messages: PersistedMessage[];
  toolExecutions: PersistedToolExecution[];
  tasks: Task[];
  artifacts: Artifact[];
}

// V2 persisted data structure (unified)
export interface PersistedSessionDataV2 {
  metadata: SessionMetadataV2;
  chatItems: ChatItem[];
  tasks: Task[];
  artifacts: Artifact[];
  contextUsage?: ContextUsage;
  runtime?: SessionRuntimeState;
}

// Union type for loading
export type PersistedSessionData = PersistedSessionDataV1 | PersistedSessionDataV2;

/**
 * Migrate V1 session data to V2 format.
 * Converts messages[] and toolExecutions[] into unified chatItems[] array.
 */
function migrateV1toV2(v1Data: PersistedSessionDataV1): PersistedSessionDataV2 {
  const timeline: ChatItem[] = [];
  const { messages, toolExecutions } = v1Data;

  // Get user messages sorted by createdAt for turn association
  const userMessages = messages
    .filter(m => m.role === 'user')
    .sort((a, b) => a.createdAt - b.createdAt);

  // Build map of tool executions by turnMessageId
  const toolsByTurn = new Map<string, PersistedToolExecution[]>();
  for (const tool of toolExecutions) {
    let turnId = tool.turnMessageId;

    // Fallback: find user message that precedes this tool by timestamp
    if (!turnId) {
      const preceding = [...userMessages].reverse().find(m => m.createdAt <= tool.startedAt);
      turnId = preceding?.id || userMessages[userMessages.length - 1]?.id;
    }

    if (turnId) {
      const tools = toolsByTurn.get(turnId) || [];
      tools.push(tool);
      toolsByTurn.set(turnId, tools);
    }
  }

  // Process messages in order
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const timestamp = msg.createdAt;

    if (msg.role === 'user') {
      // User message
      const userItem: UserMessageItem = {
        id: `ci-${msg.id}`,
        kind: 'user_message',
        timestamp,
        turnId: msg.id,
        content: msg.content,
      };
      timeline.push(userItem);

      // Add tool executions for this turn
      const turnTools = (toolsByTurn.get(msg.id) || [])
        .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));

      for (const tool of turnTools) {
        // Skip sub-tools - they'll be rendered inside their parent
        if (tool.parentToolId) continue;

        // Tool start
        const toolStartItem: ToolStartItem = {
          id: `ci-ts-${tool.id}`,
          kind: 'tool_start',
          timestamp: tool.startedAt,
          turnId: msg.id,
          toolId: tool.id,
          name: tool.name,
          args: tool.args,
          status: tool.status === 'running' ? 'running' : tool.status === 'error' ? 'error' : 'completed',
          parentToolId: tool.parentToolId,
        };
        timeline.push(toolStartItem);

        // Tool result (if completed)
        if (tool.completedAt || tool.status !== 'running') {
          const toolResultItem: ToolResultItem = {
            id: `ci-tr-${tool.id}`,
            kind: 'tool_result',
            timestamp: tool.completedAt || tool.startedAt + 1,
            turnId: msg.id,
            toolId: tool.id,
            name: tool.name,
            status: tool.status === 'error' ? 'error' : 'success',
            result: tool.result,
            error: tool.error,
            duration: tool.completedAt ? tool.completedAt - tool.startedAt : undefined,
            parentToolId: tool.parentToolId,
          };
          timeline.push(toolResultItem);
        }
      }
    } else if (msg.role === 'assistant') {
      // Find the preceding user message to get turnId
      const precedingUserMsg = [...userMessages].reverse().find(m => m.createdAt < timestamp);
      const turnId = precedingUserMsg?.id;

      const assistantItem: AssistantMessageItem = {
        id: `ci-${msg.id}`,
        kind: 'assistant_message',
        timestamp,
        turnId,
        content: msg.content,
        metadata: msg.metadata,
      };
      timeline.push(assistantItem);
    } else if (msg.role === 'system') {
      const systemItem: SystemMessageItem = {
        id: `ci-${msg.id}`,
        kind: 'system_message',
        timestamp,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        metadata: msg.metadata,
      };
      timeline.push(systemItem);
    }
  }

  // Sort timeline by timestamp
  timeline.sort((a, b) => a.timestamp - b.timestamp);

  return {
    metadata: {
      ...v1Data.metadata,
      version: 2,
      provider: v1Data.metadata.provider || 'google',
      executionMode: v1Data.metadata.executionMode || 'execute',
      // For migrated sessions, set lastAccessedAt to updatedAt
      lastAccessedAt: v1Data.metadata.updatedAt,
    },
    chatItems: timeline,
    tasks: v1Data.tasks,
    artifacts: v1Data.artifacts,
    contextUsage: undefined,
  };
}

export class SessionPersistence {
  private sessionsDir: string;
  private workspacesDir: string;
  private sessionWriteQueues: Map<string, Promise<void>> = new Map();

  constructor(appDataDir: string) {
    this.sessionsDir = join(appDataDir, 'sessions');
    this.workspacesDir = join(appDataDir, 'workspaces');
  }

  private async enqueueSessionWrite<T>(sessionId: string, op: () => Promise<T>): Promise<T> {
    const previous = this.sessionWriteQueues.get(sessionId) ?? Promise.resolve();
    let releaseCurrent: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });

    this.sessionWriteQueues.set(
      sessionId,
      previous.then(() => current).catch(() => current),
    );

    try {
      await previous;
      return await op();
    } finally {
      releaseCurrent();
      if (this.sessionWriteQueues.get(sessionId) === current) {
        this.sessionWriteQueues.delete(sessionId);
      }
    }
  }

  async initialize(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    await mkdir(this.workspacesDir, { recursive: true });

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

  async loadAllSessions(): Promise<Map<string, PersistedSessionDataV2>> {
    const result = new Map<string, PersistedSessionDataV2>();

    try {
      const index = await this.readJson<SessionIndex>(join(this.sessionsDir, 'index.json'));

      for (const entry of index.sessions) {
        try {
          const data = await this.loadSession(entry.id);
          if (data) {
            result.set(entry.id, data);
          }
        } catch {
          // Skip sessions that fail to load
        }
      }
    } catch {
      // Session index load failed
    }

    return result;
  }

  /**
   * Load a session, automatically migrating v1 to v2 format.
   */
  async loadSession(sessionId: string): Promise<PersistedSessionDataV2 | null> {
    const sessionDir = join(this.sessionsDir, sessionId);

    if (!existsSync(sessionDir)) {
      return null;
    }

    // Check for v2 format first (chat-items.json)
    const chatItemsPath = join(sessionDir, 'chat-items.json');
    if (existsSync(chatItemsPath)) {
      // V2 format - load unified data
      const [metadata, chatItemsData, tasks, artifacts, contextUsage, runtime] = await Promise.all([
        this.readJson<SessionMetadataV2>(join(sessionDir, 'session.json')),
        this.readJson<{ chatItems: ChatItem[] }>(chatItemsPath)
          .then(d => d.chatItems).catch(() => []),
        this.readJson<{ tasks: Task[] }>(join(sessionDir, 'tasks.json'))
          .then(d => d.tasks).catch(() => []),
        this.readJson<{ artifacts: Artifact[] }>(join(sessionDir, 'artifacts.json'))
          .then(d => d.artifacts).catch(() => []),
        this.readJson<ContextUsage>(join(sessionDir, 'context.json')).catch(() => undefined),
        this.readJson<SessionRuntimeState>(join(sessionDir, 'runtime.json')).catch(() => undefined),
      ]);

      return {
        metadata: {
          ...metadata,
          version: 2,
          provider: metadata.provider || 'google',
          executionMode: metadata.executionMode || 'execute',
          // Backward compat: if lastAccessedAt is missing, use updatedAt
          lastAccessedAt: metadata.lastAccessedAt || metadata.updatedAt,
        },
        chatItems: chatItemsData,
        tasks,
        artifacts,
        contextUsage,
        runtime,
      };
    }

    // V1 format - load and migrate
    const [metadata, messages, toolExecutions, tasks, artifacts] = await Promise.all([
      this.readJson<SessionMetadataV1>(join(sessionDir, 'session.json')),
      this.readJson<{ messages: PersistedMessage[] }>(join(sessionDir, 'messages.json'))
        .then(d => d.messages).catch(() => []),
      this.readJson<{ executions: PersistedToolExecution[] }>(join(sessionDir, 'tools.json'))
        .then(d => d.executions).catch(() => []),
      this.readJson<{ tasks: Task[] }>(join(sessionDir, 'tasks.json'))
        .then(d => d.tasks).catch(() => []),
      this.readJson<{ artifacts: Artifact[] }>(join(sessionDir, 'artifacts.json'))
        .then(d => d.artifacts).catch(() => []),
    ]);

    const v1Data: PersistedSessionDataV1 = {
      metadata: { ...metadata, version: 1 },
      messages,
      toolExecutions,
      tasks,
      artifacts,
    };

    // Migrate to v2
    const v2Data = migrateV1toV2(v1Data);

    // Save migrated data
    try {
      await this.saveSessionV2(v2Data);

      // Clean up old v1 files
      await this.cleanupV1Files(sessionDir);
    } catch {
      // Migration save failed
    }

    return v2Data;
  }

  /**
   * Remove old v1 format files after migration.
   */
  private async cleanupV1Files(sessionDir: string): Promise<void> {
    const v1Files = ['messages.json', 'tools.json'];
    for (const file of v1Files) {
      const filePath = join(sessionDir, file);
      if (existsSync(filePath)) {
        try {
          await unlink(filePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Save session in V2 format (unified chatItems).
   */
  async saveSessionV2(data: PersistedSessionDataV2): Promise<void> {
    await this.enqueueSessionWrite(data.metadata.id, async () => {
      const sessionDir = join(this.sessionsDir, data.metadata.id);

      if (!existsSync(sessionDir)) {
        await mkdir(sessionDir, { recursive: true });
      }

      await Promise.all([
        this.writeJson(join(sessionDir, 'session.json'), {
          version: SCHEMA_VERSION,
          id: data.metadata.id,
          type: data.metadata.type || 'main',
          provider: data.metadata.provider || 'google',
          executionMode: data.metadata.executionMode || 'execute',
          title: data.metadata.title,
          workingDirectory: data.metadata.workingDirectory,
          model: data.metadata.model,
          approvalMode: data.metadata.approvalMode,
          createdAt: data.metadata.createdAt,
          updatedAt: data.metadata.updatedAt,
          lastAccessedAt: data.metadata.lastAccessedAt,
        }),
        this.writeJson(join(sessionDir, 'chat-items.json'), {
          version: SCHEMA_VERSION,
          chatItems: data.chatItems,
        }),
        this.writeJson(join(sessionDir, 'tasks.json'), {
          version: SCHEMA_VERSION,
          tasks: data.tasks,
        }),
        this.writeJson(join(sessionDir, 'artifacts.json'), {
          version: SCHEMA_VERSION,
          artifacts: data.artifacts,
        }),
        data.contextUsage
          ? this.writeJson(join(sessionDir, 'context.json'), data.contextUsage)
          : Promise.resolve(),
        data.runtime
          ? this.writeJson(join(sessionDir, 'runtime.json'), data.runtime)
          : Promise.resolve(),
      ]);

      // Update index
      await this.updateIndexV2(data);

      // Update workspace index
      await this.addSessionToWorkspace(data.metadata.id, data.metadata.workingDirectory);
    });
  }

  /**
   * Legacy saveSession for backwards compatibility during migration.
   * Converts to V2 format internally.
   */
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
    // Convert to V1 format then migrate to V2
    const v1Data: PersistedSessionDataV1 = {
      metadata: {
        version: 1,
        id: session.id,
        type: session.type,
        provider: 'google',
        executionMode: 'execute',
        title: session.title,
        workingDirectory: session.workingDirectory,
        model: session.model,
        approvalMode: session.approvalMode,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      messages: session.messages,
      toolExecutions: session.toolExecutions,
      tasks: session.tasks,
      artifacts: session.artifacts,
    };

    const v2Data = migrateV1toV2(v1Data);
    await this.saveSessionV2(v2Data);
  }

  /**
   * Save chatItems directly for incremental updates.
   */
  private async saveChatItemsUnsafe(sessionId: string, chatItems: ChatItem[]): Promise<void> {
    const sessionDir = join(this.sessionsDir, sessionId);
    if (!existsSync(sessionDir)) {
      await mkdir(sessionDir, { recursive: true });
    }

    await this.writeJson(join(sessionDir, 'chat-items.json'), {
      version: SCHEMA_VERSION,
      chatItems,
    });
  }

  /**
   * Save chatItems directly for incremental updates.
   */
  async saveChatItems(sessionId: string, chatItems: ChatItem[]): Promise<void> {
    await this.enqueueSessionWrite(sessionId, async () => {
      await this.saveChatItemsUnsafe(sessionId, chatItems);
    });
  }

  /**
   * Append a single chat item for real-time persistence.
   */
  async appendChatItem(sessionId: string, item: ChatItem): Promise<void> {
    await this.enqueueSessionWrite(sessionId, async () => {
      const sessionDir = join(this.sessionsDir, sessionId);
      const chatItemsPath = join(sessionDir, 'chat-items.json');

      let chatItems: ChatItem[] = [];
      if (existsSync(chatItemsPath)) {
        try {
          const data = await this.readJson<{ chatItems: ChatItem[] }>(chatItemsPath);
          chatItems = data.chatItems || [];
        } catch {
          // Start fresh
        }
      }

      chatItems.push(item);
      await this.saveChatItemsUnsafe(sessionId, chatItems);
    });
  }

  /**
   * Update a chat item by ID.
   */
  async updateChatItem(sessionId: string, itemId: string, updates: Partial<ChatItem>): Promise<void> {
    await this.enqueueSessionWrite(sessionId, async () => {
      const sessionDir = join(this.sessionsDir, sessionId);
      const chatItemsPath = join(sessionDir, 'chat-items.json');

      if (!existsSync(chatItemsPath)) return;

      const data = await this.readJson<{ chatItems: ChatItem[] }>(chatItemsPath);
      const chatItems = data.chatItems || [];

      const index = chatItems.findIndex(item => item.id === itemId);
      if (index >= 0) {
        chatItems[index] = { ...chatItems[index], ...updates } as ChatItem;
        await this.saveChatItemsUnsafe(sessionId, chatItems);
      }
    });
  }

  /**
   * Save context usage.
   */
  async saveContextUsage(sessionId: string, contextUsage: ContextUsage): Promise<void> {
    const sessionDir = join(this.sessionsDir, sessionId);
    if (!existsSync(sessionDir)) {
      await mkdir(sessionDir, { recursive: true });
    }

    await this.writeJson(join(sessionDir, 'context.json'), {
      ...contextUsage,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Save runtime snapshot for reconnect hydration.
   */
  async saveRuntimeState(sessionId: string, runtime: SessionRuntimeState): Promise<void> {
    await this.enqueueSessionWrite(sessionId, async () => {
      const sessionDir = join(this.sessionsDir, sessionId);
      if (!existsSync(sessionDir)) {
        await mkdir(sessionDir, { recursive: true });
      }
      await this.writeJson(join(sessionDir, 'runtime.json'), runtime);
    });
  }

  /**
   * Load runtime snapshot for reconnect hydration.
   */
  async loadRuntimeState(sessionId: string): Promise<SessionRuntimeState | null> {
    const runtimePath = join(this.sessionsDir, sessionId, 'runtime.json');
    if (!existsSync(runtimePath)) return null;

    try {
      return await this.readJson<SessionRuntimeState>(runtimePath);
    } catch {
      return null;
    }
  }

  /**
   * Load context usage.
   */
  async loadContextUsage(sessionId: string): Promise<ContextUsage | null> {
    const contextPath = join(this.sessionsDir, sessionId, 'context.json');
    if (!existsSync(contextPath)) return null;

    try {
      return await this.readJson<ContextUsage>(contextPath);
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    const sessionDir = join(this.sessionsDir, sessionId);

    if (existsSync(sessionDir)) {
      await rm(sessionDir, { recursive: true, force: true });
    }

    if (session) {
      await this.removeSessionFromWorkspace(sessionId, session.metadata.workingDirectory);
    }

    await this.removeFromIndex(sessionId);

    return true;
  }

  private async updateIndexV2(data: PersistedSessionDataV2): Promise<void> {
    const indexPath = join(this.sessionsDir, 'index.json');
    const index = await this.readJson<SessionIndex>(indexPath).catch((): SessionIndex => ({
      version: SCHEMA_VERSION,
      sessions: [],
    }));

    // Find first user message for preview
    const firstUserItem = data.chatItems.find(item => item.kind === 'user_message') as UserMessageItem | undefined;
    const firstMessage = firstUserItem
      ? (typeof firstUserItem.content === 'string'
          ? firstUserItem.content.slice(0, 100)
          : null)
      : null;

    // Count message items
    const messageCount = data.chatItems.filter(
      item => item.kind === 'user_message' || item.kind === 'assistant_message'
    ).length;

    const existingIdx = index.sessions.findIndex(s => s.id === data.metadata.id);
    const entry = {
      id: data.metadata.id,
      type: data.metadata.type || 'main',
      provider: data.metadata.provider || 'google',
      executionMode: data.metadata.executionMode || 'execute',
      title: data.metadata.title,
      firstMessage,
      workingDirectory: data.metadata.workingDirectory,
      model: data.metadata.model,
      messageCount,
      createdAt: data.metadata.createdAt,
      updatedAt: data.metadata.updatedAt,
      lastAccessedAt: data.metadata.lastAccessedAt,
    };

    if (existingIdx >= 0) {
      index.sessions[existingIdx] = entry;
    } else {
      index.sessions.unshift(entry);
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

  // ===========================================================================
  // Attachment file storage
  // ===========================================================================

  /**
   * Save an attachment's base64 data to a file on disk.
   * Returns the absolute file path for storage in ChatItem.
   */
  async saveAttachmentFile(
    sessionId: string,
    fileName: string,
    base64Data: string,
    mimeType: string
  ): Promise<string> {
    const attachDir = join(this.sessionsDir, sessionId, 'attachments');
    await mkdir(attachDir, { recursive: true });

    // Content hash for dedup + unique naming
    const hash = createHash('sha256').update(base64Data.slice(0, 1024)).digest('hex').slice(0, 12);
    const ext = this.mimeToExt(mimeType);
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50);
    const diskName = `${hash}-${safeName}.${ext}`;
    const filePath = join(attachDir, diskName);

    if (!existsSync(filePath)) {
      await writeFile(filePath, Buffer.from(base64Data, 'base64'));
    }
    return filePath;
  }

  /**
   * Read an attachment file back as base64 string.
   */
  async readAttachmentAsBase64(filePath: string): Promise<string> {
    const buf = await readFile(filePath);
    return buf.toString('base64');
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
      'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav',
      'video/mp4': 'mp4', 'video/webm': 'webm',
      'application/pdf': 'pdf',
    };
    return map[mime] || mime.split('/')[1] || 'bin';
  }

  private async readJson<T>(path: string): Promise<T> {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    const tmpPath = path + '.tmp';
    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await rename(tmpPath, path);
  }
}
