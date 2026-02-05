/**
 * StoreBackend - Persistent Memory Storage
 *
 * Routes memory operations to MemoryService for .cowork/memories/ paths
 */

import type { MemoryService } from '../memory/memory-service.js';
import type {
  StoreBackend as IStoreBackend,
  FileMetadata,
} from './types.js';

/**
 * StoreBackend implementation that routes to MemoryService
 */
export class CoworkStoreBackend implements IStoreBackend {
  private memoryService: MemoryService;

  constructor(memoryService: MemoryService) {
    this.memoryService = memoryService;
  }

  /**
   * Read file content
   * Path format: /.cowork/memories/[group]/[filename].md
   */
  async read(path: string): Promise<string> {
    const { group, filename, memoryTitle } = this.parsePath(path);

    if (!group) {
      throw new Error(`Invalid memory path: ${path}`);
    }

    // If no filename, return group listing
    if (!filename) {
      const memories = await this.memoryService.getMemoriesByGroup(group);
      return memories.map(m => `- ${m.title}`).join('\n');
    }

    // Find memory by title in group
    const memories = await this.memoryService.getMemoriesByGroup(group);
    const memory = memories.find(
      m => this.toFilename(m.title) === filename ||
           m.title.toLowerCase() === memoryTitle?.toLowerCase()
    );

    if (!memory) {
      throw new Error(`Memory not found: ${path}`);
    }

    return memory.content;
  }

  /**
   * Write file content
   * Creates or updates a memory
   */
  async write(path: string, content: string): Promise<void> {
    const { group, filename, memoryTitle } = this.parsePath(path);

    if (!group || !filename) {
      throw new Error(`Invalid memory path for write: ${path}`);
    }

    // Check if memory exists
    const memories = await this.memoryService.getMemoriesByGroup(group);
    const existingMemory = memories.find(
      m => this.toFilename(m.title) === filename ||
           m.title.toLowerCase() === memoryTitle?.toLowerCase()
    );

    if (existingMemory) {
      // Update existing memory
      await this.memoryService.update(existingMemory.id, { content });
    } else {
      // Create new memory
      const title = memoryTitle || this.filenameToTitle(filename);
      await this.memoryService.create({
        title,
        content,
        group,
        tags: [],
        source: 'manual',
      });
    }
  }

  /**
   * Delete file
   */
  async delete(path: string): Promise<void> {
    const { group, filename, memoryTitle } = this.parsePath(path);

    if (!group || !filename) {
      throw new Error(`Invalid memory path for delete: ${path}`);
    }

    const memories = await this.memoryService.getMemoriesByGroup(group);
    const memory = memories.find(
      m => this.toFilename(m.title) === filename ||
           m.title.toLowerCase() === memoryTitle?.toLowerCase()
    );

    if (!memory) {
      throw new Error(`Memory not found: ${path}`);
    }

    await this.memoryService.delete(memory.id);
  }

  /**
   * List directory contents
   */
  async ls(path: string): Promise<string[]> {
    const { group } = this.parsePath(path);

    // Root level - list groups
    if (!group || path === '/.cowork/memories' || path === '/.cowork/memories/') {
      return this.memoryService.listGroups();
    }

    // Group level - list memories in group
    const memories = await this.memoryService.getMemoriesByGroup(group);
    return memories.map(m => this.toFilename(m.title));
  }

  /**
   * Check if path exists
   */
  async exists(path: string): Promise<boolean> {
    const { group, filename, memoryTitle } = this.parsePath(path);

    // Root always exists
    if (!group) {
      return true;
    }

    // Check if group exists
    const groups = await this.memoryService.listGroups();
    if (!groups.includes(group)) {
      return false;
    }

    // If no filename, group exists
    if (!filename) {
      return true;
    }

    // Check if memory exists
    const memories = await this.memoryService.getMemoriesByGroup(group);
    return memories.some(
      m => this.toFilename(m.title) === filename ||
           m.title.toLowerCase() === memoryTitle?.toLowerCase()
    );
  }

  /**
   * Get file metadata
   */
  async stat(path: string): Promise<FileMetadata | null> {
    const { group, filename, memoryTitle } = this.parsePath(path);

    // Root directory
    if (!group) {
      return {
        name: 'memories',
        path: '/.cowork/memories',
        size: 0,
        isDirectory: true,
        modifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    }

    // Group directory
    if (!filename) {
      const groups = await this.memoryService.listGroups();
      if (!groups.includes(group)) {
        return null;
      }

      return {
        name: group,
        path: `/.cowork/memories/${group}`,
        size: 0,
        isDirectory: true,
        modifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    }

    // Memory file
    const memories = await this.memoryService.getMemoriesByGroup(group);
    const memory = memories.find(
      m => this.toFilename(m.title) === filename ||
           m.title.toLowerCase() === memoryTitle?.toLowerCase()
    );

    if (!memory) {
      return null;
    }

    return {
      name: this.toFilename(memory.title),
      path: `/.cowork/memories/${group}/${this.toFilename(memory.title)}`,
      size: memory.content.length,
      isDirectory: false,
      modifiedAt: memory.updatedAt,
      createdAt: memory.createdAt,
    };
  }

  /**
   * Parse path into components
   * Format: /.cowork/memories/[group]/[filename]
   */
  private parsePath(path: string): ParsedPathResult {
    // Normalize path
    const normalized = path
      .replace(/^\/\.cowork\/memories\/?/, '')
      .replace(/^\.cowork\/memories\/?/, '')
      .replace(/^\/+|\/+$/g, '');

    if (!normalized) {
      return { group: '', filename: '', memoryTitle: '' };
    }

    const parts = normalized.split('/');
    const group = parts[0] || '';
    const filename = parts[1] || '';

    // Extract title from filename (remove .md extension)
    const memoryTitle = filename ? this.filenameToTitle(filename) : '';

    return { group, filename, memoryTitle };
  }

  /**
   * Convert title to filename
   */
  private toFilename(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) + '.md';
  }

  /**
   * Convert filename to title
   */
  private filenameToTitle(filename: string): string {
    return filename
      .replace(/\.md$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}

/**
 * Parsed path result
 */
interface ParsedPathResult {
  group: string;
  filename: string;
  memoryTitle: string;
}

/**
 * Create a new StoreBackend instance
 */
export function createStoreBackend(memoryService: MemoryService): CoworkStoreBackend {
  return new CoworkStoreBackend(memoryService);
}
