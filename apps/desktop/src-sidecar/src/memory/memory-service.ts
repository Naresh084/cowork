/**
 * MemoryService - Long-term Memory Management
 *
 * Handles persistent memory storage in .cowork/memories/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type {
  Memory,
  MemoryGroup,
  MemoryIndex,
  MemoryMetadata,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
  ScoredMemory,
} from './types.js';

/**
 * Current index version for migrations
 */
const INDEX_VERSION = '1.0.0';

/**
 * Default memory groups
 */
const DEFAULT_GROUPS: MemoryGroup[] = [
  'preferences',
  'learnings',
  'context',
  'instructions',
];

/**
 * MemoryService class for long-term memory management
 */
export class MemoryService {
  private workingDir: string;
  private memoriesDir: string;
  private indexPath: string;
  private index: MemoryIndex | null = null;
  private initialized = false;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
    this.memoriesDir = join(workingDir, '.cowork', 'memories');
    this.indexPath = join(this.memoriesDir, 'index.json');
  }

  /**
   * Initialize the memory service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create .cowork/memories directory structure
    this.ensureDirectoryExists(this.memoriesDir);

    // Create default group directories
    for (const group of DEFAULT_GROUPS) {
      this.ensureDirectoryExists(join(this.memoriesDir, group));
    }

    // Load or create index
    this.index = await this.loadOrCreateIndex();
    this.initialized = true;
  }

  /**
   * Ensure a directory exists
   */
  private ensureDirectoryExists(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load existing index or create new one
   */
  private async loadOrCreateIndex(): Promise<MemoryIndex> {
    if (existsSync(this.indexPath)) {
      try {
        const content = readFileSync(this.indexPath, 'utf-8');
        const index = JSON.parse(content) as MemoryIndex;

        // Validate and migrate if needed
        if (index.version !== INDEX_VERSION) {
          return this.migrateIndex(index);
        }

        return index;
      } catch {
        // Failed to load memory index, creating new one
      }
    }

    // Create new index
    const newIndex: MemoryIndex = {
      version: INDEX_VERSION,
      workingDirectory: this.workingDir,
      groups: [...DEFAULT_GROUPS],
      memories: {},
      lastUpdated: new Date().toISOString(),
    };

    await this.saveIndex(newIndex);
    return newIndex;
  }

  /**
   * Migrate index to new version
   */
  private migrateIndex(oldIndex: MemoryIndex): MemoryIndex {
    // Currently no migrations needed
    return {
      ...oldIndex,
      version: INDEX_VERSION,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Save index to disk (atomic write)
   */
  private async saveIndex(index: MemoryIndex): Promise<void> {
    const tempPath = `${this.indexPath}.tmp`;
    const backupPath = `${this.indexPath}.bak`;

    try {
      // Write to temp file
      writeFileSync(tempPath, JSON.stringify(index, null, 2), 'utf-8');

      // Backup existing if present
      if (existsSync(this.indexPath)) {
        try {
          const existing = readFileSync(this.indexPath, 'utf-8');
          writeFileSync(backupPath, existing, 'utf-8');
        } catch {
          // Ignore backup errors
        }
      }

      // Rename temp to actual (atomic on most systems)
      const fs = await import('fs/promises');
      await fs.rename(tempPath, this.indexPath);

      this.index = index;
    } catch (error) {
      // Clean up temp file on error
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * Generate filename from title
   */
  private titleToFilename(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) + '.md';
  }

  /**
   * Generate title from filename (unused but kept for future use)
   */
  // @ts-ignore - Kept for future use
  private _filenameToTitle(filename: string): string {
    return filename
      .replace(/\.md$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Get file path for a memory
   */
  private getMemoryFilePath(group: MemoryGroup, filename: string): string {
    return join(this.memoriesDir, group, filename);
  }

  /**
   * Create a new memory
   */
  async create(input: CreateMemoryInput): Promise<Memory> {
    this.ensureInitialized();

    const id = randomUUID();
    const now = new Date().toISOString();
    const filename = this.titleToFilename(input.title);
    const filePath = join(input.group, filename);
    const fullPath = this.getMemoryFilePath(input.group, filename);

    // Ensure group directory exists
    this.ensureDirectoryExists(join(this.memoriesDir, input.group));

    // Create memory object
    const memory: Memory = {
      id,
      title: input.title,
      content: input.content,
      group: input.group,
      tags: input.tags || [],
      source: input.source,
      confidence: input.confidence ?? (input.source === 'auto' ? 0.7 : 1.0),
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      relatedSessionIds: [],
      relatedMemoryIds: input.relatedMemoryIds || [],
    };

    // Write memory file with frontmatter
    const fileContent = this.memoryToFileContent(memory);
    writeFileSync(fullPath, fileContent, 'utf-8');

    // Update index
    const metadata: MemoryMetadata = {
      id,
      title: input.title,
      group: input.group,
      tags: memory.tags,
      filePath,
      accessCount: 0,
      lastAccessedAt: now,
      source: input.source,
      confidence: memory.confidence,
    };

    this.index!.memories[id] = metadata;
    this.index!.lastUpdated = now;

    // Add group if new
    if (!this.index!.groups.includes(input.group)) {
      this.index!.groups.push(input.group);
    }

    await this.saveIndex(this.index!);

    return memory;
  }

  /**
   * Read a memory by ID
   */
  async read(id: string): Promise<Memory | null> {
    this.ensureInitialized();

    const metadata = this.index!.memories[id];
    if (!metadata) return null;

    const fullPath = join(this.memoriesDir, metadata.filePath);
    if (!existsSync(fullPath)) {
      // Remove from index if file doesn't exist
      delete this.index!.memories[id];
      await this.saveIndex(this.index!);
      return null;
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const memory = this.fileContentToMemory(content, id, metadata);

      // Update access tracking
      const now = new Date().toISOString();
      memory.accessCount++;
      memory.lastAccessedAt = now;
      metadata.accessCount++;
      metadata.lastAccessedAt = now;

      // Save updated file and index
      writeFileSync(fullPath, this.memoryToFileContent(memory), 'utf-8');
      await this.saveIndex(this.index!);

      return memory;
    } catch {
      return null;
    }
  }

  /**
   * Update a memory
   */
  async update(id: string, updates: UpdateMemoryInput): Promise<Memory | null> {
    this.ensureInitialized();

    const metadata = this.index!.memories[id];
    if (!metadata) return null;

    const fullPath = join(this.memoriesDir, metadata.filePath);
    if (!existsSync(fullPath)) {
      delete this.index!.memories[id];
      await this.saveIndex(this.index!);
      return null;
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const memory = this.fileContentToMemory(content, id, metadata);
      const now = new Date().toISOString();

      // Apply updates
      if (updates.title !== undefined) memory.title = updates.title;
      if (updates.content !== undefined) memory.content = updates.content;
      if (updates.tags !== undefined) memory.tags = updates.tags;
      if (updates.addRelatedMemoryIds) {
        memory.relatedMemoryIds = [
          ...new Set([...memory.relatedMemoryIds, ...updates.addRelatedMemoryIds]),
        ];
      }
      if (updates.removeRelatedMemoryIds) {
        memory.relatedMemoryIds = memory.relatedMemoryIds.filter(
          rid => !updates.removeRelatedMemoryIds!.includes(rid)
        );
      }

      memory.updatedAt = now;

      // Handle group change
      if (updates.group && updates.group !== memory.group) {
        const newFilename = this.titleToFilename(memory.title);
        const newFilePath = join(updates.group, newFilename);
        const newFullPath = this.getMemoryFilePath(updates.group, newFilename);

        // Ensure new group directory exists
        this.ensureDirectoryExists(join(this.memoriesDir, updates.group));

        // Write to new location
        writeFileSync(newFullPath, this.memoryToFileContent(memory), 'utf-8');

        // Delete old file
        unlinkSync(fullPath);

        // Update metadata
        metadata.group = updates.group;
        metadata.filePath = newFilePath;
        memory.group = updates.group;

        // Add group if new
        if (!this.index!.groups.includes(updates.group)) {
          this.index!.groups.push(updates.group);
        }
      } else {
        // Write updated content
        writeFileSync(fullPath, this.memoryToFileContent(memory), 'utf-8');
      }

      // Update metadata
      if (updates.title !== undefined) metadata.title = updates.title;
      if (updates.tags !== undefined) metadata.tags = updates.tags;
      this.index!.lastUpdated = now;

      await this.saveIndex(this.index!);

      return memory;
    } catch {
      return null;
    }
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();

    const metadata = this.index!.memories[id];
    if (!metadata) return false;

    const fullPath = join(this.memoriesDir, metadata.filePath);

    try {
      // Delete file if exists
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }

      // Remove from index
      delete this.index!.memories[id];
      this.index!.lastUpdated = new Date().toISOString();

      await this.saveIndex(this.index!);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new group
   */
  async createGroup(name: string): Promise<void> {
    this.ensureInitialized();

    const groupDir = join(this.memoriesDir, name);
    this.ensureDirectoryExists(groupDir);

    if (!this.index!.groups.includes(name)) {
      this.index!.groups.push(name);
      this.index!.lastUpdated = new Date().toISOString();
      await this.saveIndex(this.index!);
    }
  }

  /**
   * Delete a group (and all memories in it)
   */
  async deleteGroup(name: string): Promise<void> {
    this.ensureInitialized();

    // Don't allow deleting default groups
    if (DEFAULT_GROUPS.includes(name as MemoryGroup)) {
      throw new Error(`Cannot delete default group: ${name}`);
    }

    const groupDir = join(this.memoriesDir, name);

    // Remove all memories in group
    for (const [id, metadata] of Object.entries(this.index!.memories)) {
      if (metadata.group === name) {
        delete this.index!.memories[id];
      }
    }

    // Remove group directory
    if (existsSync(groupDir)) {
      rmSync(groupDir, { recursive: true, force: true });
    }

    // Remove from groups list
    this.index!.groups = this.index!.groups.filter(g => g !== name);
    this.index!.lastUpdated = new Date().toISOString();

    await this.saveIndex(this.index!);
  }

  /**
   * List all groups
   */
  async listGroups(): Promise<MemoryGroup[]> {
    this.ensureInitialized();
    return [...this.index!.groups];
  }

  /**
   * Get all memories in a group
   */
  async getMemoriesByGroup(group: string): Promise<Memory[]> {
    this.ensureInitialized();

    const memories: Memory[] = [];

    for (const [id, metadata] of Object.entries(this.index!.memories)) {
      if (metadata.group === group) {
        const memory = await this.read(id);
        if (memory) {
          memories.push(memory);
        }
      }
    }

    return memories;
  }

  /**
   * Search memories
   */
  async search(options: MemorySearchOptions): Promise<Memory[]> {
    this.ensureInitialized();

    const results: Memory[] = [];
    const query = options.query?.toLowerCase() || '';

    for (const [id, metadata] of Object.entries(this.index!.memories)) {
      // Filter by groups
      if (options.groups && !options.groups.includes(metadata.group)) {
        continue;
      }

      // Filter by source
      if (options.source && metadata.source !== options.source) {
        continue;
      }

      // Filter by confidence
      if (options.minConfidence && metadata.confidence < options.minConfidence) {
        continue;
      }

      // Filter by tags
      if (options.tags && options.tags.length > 0) {
        const hasTag = options.tags.some(t => metadata.tags.includes(t));
        if (!hasTag) continue;
      }

      // Search in title and tags
      if (query) {
        const titleMatch = metadata.title.toLowerCase().includes(query);
        const tagMatch = metadata.tags.some(t => t.toLowerCase().includes(query));

        if (!titleMatch && !tagMatch) {
          // Check content
          const fullPath = join(this.memoriesDir, metadata.filePath);
          if (existsSync(fullPath)) {
            const content = readFileSync(fullPath, 'utf-8').toLowerCase();
            if (!content.includes(query)) {
              continue;
            }
          } else {
            continue;
          }
        }
      }

      const memory = await this.read(id);
      if (memory) {
        results.push(memory);
      }

      // Limit results
      if (options.limit && results.length >= options.limit) {
        break;
      }
    }

    return results;
  }

  /**
   * Get all memories
   */
  async getAll(): Promise<Memory[]> {
    this.ensureInitialized();

    const memories: Memory[] = [];

    for (const id of Object.keys(this.index!.memories)) {
      const memory = await this.read(id);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  /**
   * Get relevant memories for a context (simple relevance scoring)
   */
  async getRelevantMemories(context: string, limit = 5): Promise<ScoredMemory[]> {
    this.ensureInitialized();

    const scoredMemories: ScoredMemory[] = [];
    const contextLower = context.toLowerCase();
    const contextWords = contextLower.split(/\s+/).filter(w => w.length > 3);

    for (const [id, _metadata] of Object.entries(this.index!.memories)) {
      const memory = await this.read(id);
      if (!memory) continue;

      // Calculate relevance score
      let score = 0;

      // Title match
      const titleLower = memory.title.toLowerCase();
      for (const word of contextWords) {
        if (titleLower.includes(word)) {
          score += 0.2;
        }
      }

      // Content match
      const contentLower = memory.content.toLowerCase();
      for (const word of contextWords) {
        if (contentLower.includes(word)) {
          score += 0.1;
        }
      }

      // Tag match
      for (const tag of memory.tags) {
        if (contextLower.includes(tag.toLowerCase())) {
          score += 0.15;
        }
      }

      // Recency bonus (accessed in last 24h)
      const lastAccess = new Date(memory.lastAccessedAt).getTime();
      const hoursSinceAccess = (Date.now() - lastAccess) / (1000 * 60 * 60);
      if (hoursSinceAccess < 24) {
        score += 0.1 * (1 - hoursSinceAccess / 24);
      }

      // Access frequency bonus
      if (memory.accessCount > 5) {
        score += 0.05;
      }

      // Confidence factor (for auto-extracted)
      score *= memory.confidence;

      // Normalize to 0-1
      score = Math.min(1, Math.max(0, score));

      if (score > 0.1) {
        scoredMemories.push({
          ...memory,
          relevanceScore: score,
        });
      }
    }

    // Sort by relevance score descending
    scoredMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return scoredMemories.slice(0, limit);
  }

  /**
   * Build memory section for system prompt
   */
  async buildMemoryPromptSection(sessionContext?: string): Promise<string> {
    this.ensureInitialized();

    const memories = sessionContext
      ? await this.getRelevantMemories(sessionContext, 5)
      : await this.getAll();

    if (memories.length === 0) {
      return '';
    }

    let section = `## Relevant Memories\n\nThe following memories from previous interactions may be relevant:\n\n`;

    for (const memory of memories) {
      const scoreInfo = 'relevanceScore' in memory
        ? ` (relevance: ${((memory as ScoredMemory).relevanceScore * 100).toFixed(0)}%)`
        : '';
      section += `### ${memory.title}${scoreInfo}\n`;
      section += `*Group: ${memory.group} | Tags: ${memory.tags.join(', ') || 'none'}*\n\n`;
      section += `${memory.content}\n\n`;
    }

    return section;
  }

  /**
   * Convert memory to file content with frontmatter
   */
  private memoryToFileContent(memory: Memory): string {
    const frontmatter = [
      '---',
      `id: ${memory.id}`,
      `title: ${memory.title}`,
      `group: ${memory.group}`,
      `tags: [${memory.tags.join(', ')}]`,
      `source: ${memory.source}`,
      `confidence: ${memory.confidence}`,
      `createdAt: ${memory.createdAt}`,
      `updatedAt: ${memory.updatedAt}`,
      `accessCount: ${memory.accessCount}`,
      `lastAccessedAt: ${memory.lastAccessedAt}`,
      `relatedSessionIds: [${memory.relatedSessionIds.join(', ')}]`,
      `relatedMemoryIds: [${memory.relatedMemoryIds.join(', ')}]`,
      '---',
      '',
    ].join('\n');

    return frontmatter + memory.content;
  }

  /**
   * Parse file content to memory object
   */
  private fileContentToMemory(content: string, id: string, metadata: MemoryMetadata): Memory {
    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    let memoryContent = content;
    let frontmatter: Record<string, string> = {};

    if (frontmatterMatch) {
      memoryContent = content.slice(frontmatterMatch[0].length);
      const lines = frontmatterMatch[1].split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          frontmatter[key] = value;
        }
      }
    }

    // Parse arrays from frontmatter
    const parseTags = (str: string): string[] => {
      const match = str.match(/\[(.*)\]/);
      if (!match) return [];
      return match[1].split(',').map(s => s.trim()).filter(Boolean);
    };

    return {
      id,
      title: frontmatter.title || metadata.title,
      content: memoryContent.trim(),
      group: (frontmatter.group || metadata.group) as MemoryGroup,
      tags: parseTags(frontmatter.tags || '[]'),
      source: (frontmatter.source || metadata.source || 'manual') as 'auto' | 'manual',
      confidence: parseFloat(frontmatter.confidence || String(metadata.confidence)) || 1.0,
      createdAt: frontmatter.createdAt || new Date().toISOString(),
      updatedAt: frontmatter.updatedAt || new Date().toISOString(),
      accessCount: parseInt(frontmatter.accessCount || '0') || metadata.accessCount,
      lastAccessedAt: frontmatter.lastAccessedAt || metadata.lastAccessedAt,
      relatedSessionIds: parseTags(frontmatter.relatedSessionIds || '[]'),
      relatedMemoryIds: parseTags(frontmatter.relatedMemoryIds || '[]'),
    };
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.index) {
      throw new Error('MemoryService not initialized. Call initialize() first.');
    }
  }

  /**
   * Get the memories directory path
   */
  getMemoriesDir(): string {
    return this.memoriesDir;
  }

  /**
   * Get the working directory
   */
  getWorkingDir(): string {
    return this.workingDir;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Add session ID to a memory's related sessions
   */
  async addRelatedSession(memoryId: string, sessionId: string): Promise<void> {
    this.ensureInitialized();

    const metadata = this.index!.memories[memoryId];
    if (!metadata) return;

    const fullPath = join(this.memoriesDir, metadata.filePath);
    if (!existsSync(fullPath)) return;

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const memory = this.fileContentToMemory(content, memoryId, metadata);

      if (!memory.relatedSessionIds.includes(sessionId)) {
        memory.relatedSessionIds.push(sessionId);
        memory.updatedAt = new Date().toISOString();
        writeFileSync(fullPath, this.memoryToFileContent(memory), 'utf-8');
      }
    } catch {
      // Failed to add related session - continue
    }
  }
}

/**
 * Create a new MemoryService instance
 */
export function createMemoryService(workingDir: string): MemoryService {
  return new MemoryService(workingDir);
}
