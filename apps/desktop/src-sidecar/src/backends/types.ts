/**
 * Backend Types
 *
 * State, Store, and Composite backend interfaces for Deep Agents integration
 */

import type { Message, Task } from '../types.js';

/**
 * State backend for ephemeral session state
 * Implements short-term memory within a session
 */
export interface StateBackend {
  /**
   * Get all messages in order
   */
  getMessages(): Message[];

  /**
   * Add a message to the session
   */
  addMessage(message: Message): Promise<void>;

  /**
   * Get messages in a range
   */
  getMessageRange(start: number, end: number): Message[];

  /**
   * Get message count
   */
  getMessageCount(): number;

  /**
   * Clear all messages
   */
  clearMessages(): Promise<void>;

  /**
   * Write ephemeral file (lost when session ends)
   */
  writeEphemeral(path: string, content: string): Promise<void>;

  /**
   * Read ephemeral file
   */
  readEphemeral(path: string): Promise<string | null>;

  /**
   * Delete ephemeral file
   */
  deleteEphemeral(path: string): Promise<void>;

  /**
   * List ephemeral files
   */
  listEphemeral(prefix?: string): Promise<string[]>;

  /**
   * Create checkpoint for HITL pause/resume
   */
  checkpoint(): Promise<string>;

  /**
   * Restore from checkpoint
   */
  restore(checkpoint: string): Promise<void>;

  /**
   * Get current tasks
   */
  getTasks(): Task[];

  /**
   * Add or update a task
   */
  setTask(task: Task): Promise<void>;

  /**
   * Remove a task
   */
  removeTask(taskId: string): Promise<void>;
}

/**
 * Store backend for persistent storage
 * Routes to MemoryService for .cowork/memories/ paths
 */
export interface StoreBackend {
  /**
   * Read file content
   */
  read(path: string): Promise<string>;

  /**
   * Write file content
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Delete file
   */
  delete(path: string): Promise<void>;

  /**
   * List directory contents
   */
  ls(path: string): Promise<string[]>;

  /**
   * Check if path exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file metadata
   */
  stat(path: string): Promise<FileMetadata | null>;
}

/**
 * File metadata
 */
export interface FileMetadata {
  /** File name */
  name: string;

  /** Full path */
  path: string;

  /** File size in bytes */
  size: number;

  /** Is directory */
  isDirectory: boolean;

  /** Last modified timestamp */
  modifiedAt: string;

  /** Created timestamp */
  createdAt: string;
}

/**
 * Backend route configuration
 */
export interface BackendRoute {
  /** Path prefix to match */
  prefix: string;

  /** Backend to route to */
  backend: StateBackend | StoreBackend | FilesystemBackend;

  /** Backend type */
  type: 'state' | 'store' | 'filesystem';
}

/**
 * Filesystem backend (wraps CoworkBackend)
 */
export interface FilesystemBackend {
  /**
   * Read file content
   */
  readFile(path: string): Promise<string>;

  /**
   * Write file content
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Delete file
   */
  deleteFile(path: string): Promise<void>;

  /**
   * List directory
   */
  lsInfo(path: string): Promise<DirectoryEntry[]>;

  /**
   * Create directory
   */
  mkdir(path: string): Promise<void>;

  /**
   * Glob files
   */
  glob(pattern: string): Promise<string[]>;

  /**
   * Execute command
   */
  executeCommand(command: string, cwd?: string): Promise<CommandResult>;

  /**
   * Edit file lines
   */
  editFile(
    path: string,
    startLine: number,
    endLine: number,
    newContent: string
  ): Promise<void>;

  /**
   * Grep file
   */
  grepFile(path: string, pattern: string): Promise<GrepResult[]>;
}

/**
 * Directory entry
 */
export interface DirectoryEntry {
  /** Entry name */
  name: string;

  /** Is directory */
  isDirectory: boolean;

  /** File size (for files) */
  size?: number;

  /** Last modified */
  modifiedAt?: string;
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Exit code */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Execution duration in ms */
  duration: number;
}

/**
 * Grep result
 */
export interface GrepResult {
  /** Line number */
  line: number;

  /** Line content */
  content: string;

  /** Match start index */
  matchStart: number;

  /** Match end index */
  matchEnd: number;
}

/**
 * Composite backend options
 */
export interface CompositeBackendOptions {
  /** Default backend for unmatched paths */
  default: StateBackend;

  /** Route configuration */
  routes: Record<string, StoreBackend | FilesystemBackend>;

  /** Working directory */
  workingDirectory: string;
}

/**
 * Checkpoint data structure
 */
export interface CheckpointData {
  /** Checkpoint version */
  version: string;

  /** Checkpoint type */
  type: 'state' | 'permission_pending';

  /** Checkpoint timestamp */
  timestamp: number;

  /** Session ID */
  sessionId: string;

  /** Messages */
  messages: Message[];

  /** Tasks */
  tasks: Task[];

  /** Ephemeral files */
  ephemeralFiles: Record<string, string>;

  /** Pending permission (if any) */
  pendingPermission?: PendingPermissionCheckpoint;
}

/**
 * Pending permission checkpoint
 */
export interface PendingPermissionCheckpoint {
  /** Permission request ID */
  requestId: string;

  /** Tool name */
  toolName: string;

  /** Tool input */
  toolInput: Record<string, unknown>;

  /** Request timestamp */
  requestedAt: number;
}

/**
 * Resume result from checkpoint
 */
export interface ResumeResult {
  /** Pending permission to show */
  pendingPermission?: PendingPermissionCheckpoint;

  /** Messages restored */
  messagesRestored: number;

  /** Tasks restored */
  tasksRestored: number;

  /** Resume timestamp */
  resumedAt: number;
}

/**
 * Backend operation result
 */
export interface BackendOperationResult<T = unknown> {
  /** Operation succeeded */
  success: boolean;

  /** Result data */
  data?: T;

  /** Error message */
  error?: string;

  /** Error code */
  errorCode?: string;
}

/**
 * Path parsing result
 */
export interface ParsedPath {
  /** Original path */
  original: string;

  /** Matched prefix */
  prefix: string;

  /** Remaining path after prefix */
  remainder: string;

  /** Backend type to route to */
  backendType: 'state' | 'store' | 'filesystem';

  /** Is virtual path */
  isVirtual: boolean;
}

/**
 * Virtual path prefixes
 */
export const VIRTUAL_PATH_PREFIXES = {
  /** Ephemeral state files */
  STATE: '/.state/',

  /** Memory store */
  MEMORIES: '/.cowork/memories/',

  /** Checkpoints */
  CHECKPOINTS: '/.checkpoints/',

  /** Skills (existing) */
  SKILLS: '/skills/',
} as const;

/**
 * Backend error codes
 */
export const BACKEND_ERROR_CODES = {
  NOT_FOUND: 'BACKEND_NOT_FOUND',
  PERMISSION_DENIED: 'BACKEND_PERMISSION_DENIED',
  INVALID_PATH: 'BACKEND_INVALID_PATH',
  WRITE_FAILED: 'BACKEND_WRITE_FAILED',
  READ_FAILED: 'BACKEND_READ_FAILED',
  CHECKPOINT_FAILED: 'BACKEND_CHECKPOINT_FAILED',
  RESTORE_FAILED: 'BACKEND_RESTORE_FAILED',
} as const;
