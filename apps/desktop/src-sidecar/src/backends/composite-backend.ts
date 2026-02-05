/**
 * CompositeBackend - Route operations by path prefix
 *
 * Routes operations to appropriate backends:
 * - /.state/ → StateBackend (ephemeral session state)
 * - /.cowork/memories/ → StoreBackend (persistent memories)
 * - /* → CoworkBackend (filesystem operations)
 */

import type { CoworkStateBackend } from './state-backend.js';
import type { CoworkStoreBackend } from './store-backend.js';
import type { CoworkBackend } from '../deepagents-backend.js';
import type { ParsedPath } from './types.js';
import type {
  SandboxBackendProtocol,
  FileInfo,
  FileData,
  WriteResult,
  EditResult,
  GrepMatch,
  ExecuteResponse,
} from 'deepagents';

/**
 * Virtual path prefixes and their routing
 */
const PATH_ROUTES = {
  /** Ephemeral state files */
  STATE: '/.state/',
  /** Memory store */
  MEMORIES: '/.cowork/memories/',
  /** Checkpoints */
  CHECKPOINTS: '/.checkpoints/',
} as const;

/**
 * CompositeBackend implementation
 * Implements SandboxBackendProtocol and routes to appropriate backends
 */
export class CompositeBackend implements SandboxBackendProtocol {
  readonly id: string;

  private stateBackend: CoworkStateBackend;
  private storeBackend: CoworkStoreBackend;
  private filesystemBackend: CoworkBackend;

  constructor(
    id: string,
    stateBackend: CoworkStateBackend,
    storeBackend: CoworkStoreBackend,
    filesystemBackend: CoworkBackend,
    _workingDirectory: string
  ) {
    this.id = id;
    this.stateBackend = stateBackend;
    this.storeBackend = storeBackend;
    this.filesystemBackend = filesystemBackend;
  }

  /**
   * Parse path and determine routing
   */
  private parsePath(path: string): ParsedPath {
    const normalized = path.replace(/\/+/g, '/');

    // Check for state paths
    if (normalized.startsWith(PATH_ROUTES.STATE)) {
      return {
        original: path,
        prefix: PATH_ROUTES.STATE,
        remainder: normalized.slice(PATH_ROUTES.STATE.length),
        backendType: 'state',
        isVirtual: true,
      };
    }

    // Check for memory paths
    if (normalized.startsWith(PATH_ROUTES.MEMORIES) || normalized === '/.cowork/memories') {
      return {
        original: path,
        prefix: PATH_ROUTES.MEMORIES,
        remainder: normalized.slice(PATH_ROUTES.MEMORIES.length),
        backendType: 'store',
        isVirtual: true,
      };
    }

    // Check for checkpoint paths
    if (normalized.startsWith(PATH_ROUTES.CHECKPOINTS)) {
      return {
        original: path,
        prefix: PATH_ROUTES.CHECKPOINTS,
        remainder: normalized.slice(PATH_ROUTES.CHECKPOINTS.length),
        backendType: 'state',
        isVirtual: true,
      };
    }

    // Default to filesystem
    return {
      original: path,
      prefix: '/',
      remainder: normalized,
      backendType: 'filesystem',
      isVirtual: false,
    };
  }

  /**
   * List directory contents
   */
  async lsInfo(path: string): Promise<FileInfo[]> {
    const parsed = this.parsePath(path);

    switch (parsed.backendType) {
      case 'state': {
        // List ephemeral files
        const files = await this.stateBackend.listEphemeral(parsed.remainder);
        return files.map(f => ({
          path: `${parsed.prefix}${f}`,
          is_dir: false,
          size: 0,
          modified_at: new Date().toISOString(),
        }));
      }

      case 'store': {
        // List memories
        const items = await this.storeBackend.ls(path);
        const parentPath = path.endsWith('/') ? path : `${path}/`;
        return items.map(item => ({
          path: `${parentPath}${item}`,
          is_dir: !item.includes('.'),
          size: 0,
          modified_at: new Date().toISOString(),
        }));
      }

      case 'filesystem':
      default:
        return this.filesystemBackend.lsInfo(path);
    }
  }

  /**
   * Read file content
   */
  async read(filePath: string, offset = 0, limit = 500): Promise<string> {
    const parsed = this.parsePath(filePath);

    switch (parsed.backendType) {
      case 'state': {
        const content = await this.stateBackend.readEphemeral(parsed.remainder);
        if (!content) {
          return `Error: Ephemeral file '${filePath}' not found`;
        }
        const lines = content.split('\n');
        const end = Math.min(offset + limit, lines.length);
        const slice = lines.slice(offset, end);
        return this.formatWithLineNumbers(slice, offset + 1);
      }

      case 'store': {
        try {
          const content = await this.storeBackend.read(filePath);
          const lines = content.split('\n');
          const end = Math.min(offset + limit, lines.length);
          const slice = lines.slice(offset, end);
          return this.formatWithLineNumbers(slice, offset + 1);
        } catch (error) {
          return `Error: Memory '${filePath}' not found`;
        }
      }

      case 'filesystem':
      default:
        return this.filesystemBackend.read(filePath, offset, limit);
    }
  }

  /**
   * Read raw file data
   */
  async readRaw(filePath: string): Promise<FileData> {
    const parsed = this.parsePath(filePath);

    switch (parsed.backendType) {
      case 'state': {
        const content = await this.stateBackend.readEphemeral(parsed.remainder);
        if (!content) {
          throw new Error(`Ephemeral file '${filePath}' not found`);
        }
        return {
          content: content.split('\n'),
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
        };
      }

      case 'store': {
        const content = await this.storeBackend.read(filePath);
        return {
          content: content.split('\n'),
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
        };
      }

      case 'filesystem':
      default:
        return this.filesystemBackend.readRaw(filePath);
    }
  }

  /**
   * Search with grep
   */
  async grepRaw(pattern: string, path = '/', glob: string | null = null): Promise<GrepMatch[] | string> {
    const parsed = this.parsePath(path);

    // Only filesystem backend supports grep
    if (parsed.backendType !== 'filesystem') {
      return `Error: Grep is only supported on filesystem paths`;
    }

    return this.filesystemBackend.grepRaw(pattern, path, glob);
  }

  /**
   * Glob files
   */
  async globInfo(pattern: string, path = '/'): Promise<FileInfo[]> {
    const parsed = this.parsePath(path);

    // Only filesystem backend supports glob
    if (parsed.backendType !== 'filesystem') {
      return [];
    }

    return this.filesystemBackend.globInfo(pattern, path);
  }

  /**
   * Write file
   */
  async write(filePath: string, content: string): Promise<WriteResult> {
    const parsed = this.parsePath(filePath);

    switch (parsed.backendType) {
      case 'state': {
        await this.stateBackend.writeEphemeral(parsed.remainder, content);
        return { path: filePath, filesUpdate: null };
      }

      case 'store': {
        try {
          await this.storeBackend.write(filePath, content);
          return { path: filePath, filesUpdate: null };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      case 'filesystem':
      default:
        return this.filesystemBackend.write(filePath, content);
    }
  }

  /**
   * Edit file
   */
  async edit(filePath: string, oldString: string, newString: string, replaceAll = false): Promise<EditResult> {
    const parsed = this.parsePath(filePath);

    switch (parsed.backendType) {
      case 'state': {
        const content = await this.stateBackend.readEphemeral(parsed.remainder);
        if (!content) {
          return { error: `Error: Ephemeral file '${filePath}' not found` };
        }

        const occurrences = content.split(oldString).length - 1;
        if (occurrences === 0) {
          return { error: `Error: String not found in file: '${oldString}'` };
        }
        if (occurrences > 1 && !replaceAll) {
          return {
            error: `Error: String '${oldString}' appears ${occurrences} times. Use replace_all=true.`,
          };
        }

        const updated = replaceAll
          ? content.split(oldString).join(newString)
          : content.replace(oldString, newString);

        await this.stateBackend.writeEphemeral(parsed.remainder, updated);
        return { path: filePath, filesUpdate: null, occurrences };
      }

      case 'store': {
        try {
          const content = await this.storeBackend.read(filePath);
          const occurrences = content.split(oldString).length - 1;
          if (occurrences === 0) {
            return { error: `Error: String not found in memory: '${oldString}'` };
          }
          if (occurrences > 1 && !replaceAll) {
            return {
              error: `Error: String '${oldString}' appears ${occurrences} times. Use replace_all=true.`,
            };
          }

          const updated = replaceAll
            ? content.split(oldString).join(newString)
            : content.replace(oldString, newString);

          await this.storeBackend.write(filePath, updated);
          return { path: filePath, filesUpdate: null, occurrences };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      case 'filesystem':
      default:
        return this.filesystemBackend.edit(filePath, oldString, newString, replaceAll);
    }
  }

  /**
   * Execute command
   */
  async execute(command: string): Promise<ExecuteResponse> {
    // Commands always go to filesystem backend
    return this.filesystemBackend.execute(command);
  }

  /**
   * Format content with line numbers
   */
  private formatWithLineNumbers(lines: string[], startLine = 1): string {
    const LINE_NUMBER_WIDTH = 6;
    return lines
      .map((line, index) => {
        const lineNumber = startLine + index;
        return `${lineNumber.toString().padStart(LINE_NUMBER_WIDTH)}\t${line}`;
      })
      .join('\n');
  }

  /**
   * Get state backend (for direct access)
   */
  getStateBackend(): CoworkStateBackend {
    return this.stateBackend;
  }

  /**
   * Get store backend (for direct access)
   */
  getStoreBackend(): CoworkStoreBackend {
    return this.storeBackend;
  }

  /**
   * Get filesystem backend (for direct access)
   */
  getFilesystemBackend(): CoworkBackend {
    return this.filesystemBackend;
  }

  /**
   * Check if path is virtual
   */
  isVirtualPath(path: string): boolean {
    return this.parsePath(path).isVirtual;
  }

  /**
   * Get path routing info (for debugging)
   */
  getPathRouting(path: string): ParsedPath {
    return this.parsePath(path);
  }
}

/**
 * Create a composite backend
 */
export function createCompositeBackend(
  sessionId: string,
  stateBackend: CoworkStateBackend,
  storeBackend: CoworkStoreBackend,
  filesystemBackend: CoworkBackend,
  workingDirectory: string
): CompositeBackend {
  return new CompositeBackend(
    sessionId,
    stateBackend,
    storeBackend,
    filesystemBackend,
    workingDirectory
  );
}
