/**
 * MemoryService - Long-term Memory Management
 *
 * Handles persistent memory storage in .cowork/memories/
 */

import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type {
  CreateMemoryInput,
  Memory,
  MemoryGroup,
  MemoryIndex,
  MemoryMetadata,
  MemorySearchOptions,
  ScoredMemory,
  UpdateMemoryInput,
} from './types.js';

/**
 * Current index version for migrations
 */
const INDEX_VERSION = '1.1.0';

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
    this.workingDir = workingDir || homedir();
    this.memoriesDir = join(this.workingDir, '.cowork', 'memories');
    this.indexPath = join(this.memoriesDir, 'index.json');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.ensureDirectoryExists(this.memoriesDir);

    for (const group of DEFAULT_GROUPS) {
      this.ensureDirectoryExists(join(this.memoriesDir, group));
    }

    this.index = await this.loadOrCreateIndex();
    this.initialized = true;
  }

  private ensureDirectoryExists(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private async loadOrCreateIndex(): Promise<MemoryIndex> {
    if (existsSync(this.indexPath)) {
      try {
        const content = readFileSync(this.indexPath, 'utf-8');
        const index = JSON.parse(content) as MemoryIndex;
        return this.migrateIndex(index);
      } catch {
        // fall through to create a new index
      }
    }

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

  private migrateIndex(oldIndex: MemoryIndex): MemoryIndex {
    const groups = new Set<MemoryGroup>([...DEFAULT_GROUPS, ...(oldIndex.groups || [])]);

    return {
      ...oldIndex,
      version: INDEX_VERSION,
      groups: [...groups],
      memories: oldIndex.memories || {},
      lastUpdated: new Date().toISOString(),
    };
  }

  private async saveIndex(index: MemoryIndex): Promise<void> {
    const tempPath = `${this.indexPath}.tmp`;
    const backupPath = `${this.indexPath}.bak`;

    try {
      writeFileSync(tempPath, JSON.stringify(index, null, 2), 'utf-8');

      if (existsSync(this.indexPath)) {
        try {
          const existing = readFileSync(this.indexPath, 'utf-8');
          writeFileSync(backupPath, existing, 'utf-8');
        } catch {
          // Ignore backup errors
        }
      }

      const fs = await import('fs/promises');
      await fs.rename(tempPath, this.indexPath);

      this.index = index;
    } catch (error) {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
      throw error;
    }
  }

  private slugifyTitle(title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    return slug || 'memory';
  }

  private buildFilename(title: string, id: string): string {
    const slug = this.slugifyTitle(title);
    const shortId = id.replace(/-/g, '').slice(0, 8) || randomUUID().replace(/-/g, '').slice(0, 8);
    return `${slug}-${shortId}.md`;
  }

  private getMemoryFilePath(group: MemoryGroup, filename: string): string {
    return join(this.memoriesDir, group, filename);
  }

  private normalizeForHash(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private computeContentHash(content: string): string {
    return createHash('sha256').update(this.normalizeForHash(content)).digest('hex');
  }

  private contentSimilarity(a: string, b: string): number {
    const normA = this.normalizeForHash(a);
    const normB = this.normalizeForHash(b);

    if (!normA || !normB) return 0;
    if (normA === normB) return 1;
    if (normA.includes(normB) || normB.includes(normA)) return 0.95;

    const wordsA = new Set(normA.split(' ').filter((w) => w.length > 2));
    const wordsB = new Set(normB.split(' ').filter((w) => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private async findDuplicateMemory(input: CreateMemoryInput): Promise<Memory | null> {
    const targetHash = this.computeContentHash(input.content);

    for (const [id, metadata] of Object.entries(this.index!.memories)) {
      if (metadata.contentHash && metadata.contentHash === targetHash) {
        return this.readById(id, false);
      }
    }

    for (const [id, metadata] of Object.entries(this.index!.memories)) {
      if (metadata.group !== input.group) continue;
      const existing = await this.readById(id, false);
      if (!existing) continue;
      if (this.contentSimilarity(existing.content, input.content) >= 0.9) {
        return existing;
      }
    }

    return null;
  }

  private async mergeIntoExistingMemory(existing: Memory, input: CreateMemoryInput): Promise<Memory> {
    const mergedTags = [...new Set([...(existing.tags || []), ...(input.tags || [])])];
    const incomingNormalized = this.normalizeForHash(input.content);
    const existingNormalized = this.normalizeForHash(existing.content);

    const useIncomingContent =
      incomingNormalized &&
      incomingNormalized !== existingNormalized &&
      input.content.trim().length > existing.content.trim().length;

    const updates: UpdateMemoryInput = {
      content: useIncomingContent ? input.content : existing.content,
      tags: mergedTags,
      group: existing.group,
    };

    if (existing.source === 'auto' && input.source === 'manual') {
      updates.title = input.title;
    }

    const updated = await this.update(existing.id, updates);
    return updated || existing;
  }

  async create(input: CreateMemoryInput): Promise<Memory> {
    this.ensureInitialized();

    const duplicate = await this.findDuplicateMemory(input);
    if (duplicate) {
      return this.mergeIntoExistingMemory(duplicate, input);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const filename = this.buildFilename(input.title, id);
    const filePath = join(input.group, filename);
    const fullPath = this.getMemoryFilePath(input.group, filename);

    this.ensureDirectoryExists(join(this.memoriesDir, input.group));

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

    writeFileSync(fullPath, this.memoryToFileContent(memory), 'utf-8');

    const metadata: MemoryMetadata = {
      id,
      title: memory.title,
      group: memory.group,
      tags: memory.tags,
      filePath,
      accessCount: 0,
      lastAccessedAt: now,
      source: memory.source,
      confidence: memory.confidence,
      contentHash: this.computeContentHash(memory.content),
    };

    this.index!.memories[id] = metadata;
    this.index!.lastUpdated = now;

    if (!this.index!.groups.includes(input.group)) {
      this.index!.groups.push(input.group);
    }

    await this.saveIndex(this.index!);

    return memory;
  }

  async upsertAutoMemory(input: CreateMemoryInput): Promise<Memory> {
    return this.create({
      ...input,
      source: 'auto',
    });
  }

  async read(id: string): Promise<Memory | null> {
    return this.readById(id, true);
  }

  private async readById(id: string, trackAccess: boolean): Promise<Memory | null> {
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

      if (!trackAccess) {
        return memory;
      }

      const now = new Date().toISOString();
      memory.accessCount++;
      memory.lastAccessedAt = now;
      metadata.accessCount = memory.accessCount;
      metadata.lastAccessedAt = now;
      metadata.contentHash = metadata.contentHash || this.computeContentHash(memory.content);

      writeFileSync(fullPath, this.memoryToFileContent(memory), 'utf-8');
      await this.saveIndex(this.index!);

      return memory;
    } catch {
      return null;
    }
  }

  async update(id: string, updates: UpdateMemoryInput): Promise<Memory | null> {
    this.ensureInitialized();

    const metadata = this.index!.memories[id];
    if (!metadata) return null;

    const currentPath = join(this.memoriesDir, metadata.filePath);
    if (!existsSync(currentPath)) {
      delete this.index!.memories[id];
      await this.saveIndex(this.index!);
      return null;
    }

    try {
      const content = readFileSync(currentPath, 'utf-8');
      const memory = this.fileContentToMemory(content, id, metadata);
      const now = new Date().toISOString();

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
          (rid) => !updates.removeRelatedMemoryIds!.includes(rid),
        );
      }

      const nextGroup = updates.group || memory.group;
      memory.group = nextGroup;
      memory.updatedAt = now;

      const nextFilename = this.buildFilename(memory.title, id);
      const nextFilePath = join(nextGroup, nextFilename);
      const nextFullPath = this.getMemoryFilePath(nextGroup, nextFilename);

      this.ensureDirectoryExists(join(this.memoriesDir, nextGroup));
      writeFileSync(nextFullPath, this.memoryToFileContent(memory), 'utf-8');

      if (nextFullPath !== currentPath && existsSync(currentPath)) {
        unlinkSync(currentPath);
      }

      metadata.title = memory.title;
      metadata.group = nextGroup;
      metadata.tags = memory.tags;
      metadata.filePath = nextFilePath;
      metadata.source = memory.source;
      metadata.confidence = memory.confidence;
      metadata.contentHash = this.computeContentHash(memory.content);
      this.index!.lastUpdated = now;

      if (!this.index!.groups.includes(nextGroup)) {
        this.index!.groups.push(nextGroup);
      }

      await this.saveIndex(this.index!);

      return memory;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();

    const metadata = this.index!.memories[id];
    if (!metadata) return false;

    const fullPath = join(this.memoriesDir, metadata.filePath);

    try {
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }

      delete this.index!.memories[id];
      this.index!.lastUpdated = new Date().toISOString();

      await this.saveIndex(this.index!);
      return true;
    } catch {
      return false;
    }
  }

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

  async deleteGroup(name: string): Promise<void> {
    this.ensureInitialized();

    if (DEFAULT_GROUPS.includes(name as MemoryGroup)) {
      throw new Error(`Cannot delete default group: ${name}`);
    }

    const groupDir = join(this.memoriesDir, name);

    for (const [id, metadata] of Object.entries(this.index!.memories)) {
      if (metadata.group === name) {
        delete this.index!.memories[id];
      }
    }

    if (existsSync(groupDir)) {
      rmSync(groupDir, { recursive: true, force: true });
    }

    this.index!.groups = this.index!.groups.filter((g) => g !== name);
    this.index!.lastUpdated = new Date().toISOString();

    await this.saveIndex(this.index!);
  }

  async listGroups(): Promise<MemoryGroup[]> {
    this.ensureInitialized();
    return [...this.index!.groups];
  }

  async getMemoriesByGroup(group: string): Promise<Memory[]> {
    this.ensureInitialized();

    const memories: Memory[] = [];

    for (const [id, metadata] of Object.entries(this.index!.memories)) {
      if (metadata.group !== group) continue;
      const memory = await this.readById(id, false);
      if (memory) memories.push(memory);
    }

    return memories;
  }

  async search(options: MemorySearchOptions): Promise<Memory[]> {
    this.ensureInitialized();

    const results: Memory[] = [];
    const query = options.query?.toLowerCase() || '';

    for (const [id, metadata] of Object.entries(this.index!.memories)) {
      if (options.groups && !options.groups.includes(metadata.group)) continue;
      if (options.source && metadata.source !== options.source) continue;
      if (options.minConfidence && metadata.confidence < options.minConfidence) continue;

      if (options.tags && options.tags.length > 0) {
        const hasTag = options.tags.some((tag) => metadata.tags.includes(tag));
        if (!hasTag) continue;
      }

      if (query) {
        const titleMatch = metadata.title.toLowerCase().includes(query);
        const tagMatch = metadata.tags.some((tag) => tag.toLowerCase().includes(query));

        if (!titleMatch && !tagMatch) {
          const fullPath = join(this.memoriesDir, metadata.filePath);
          if (!existsSync(fullPath)) continue;
          const fileContent = readFileSync(fullPath, 'utf-8').toLowerCase();
          if (!fileContent.includes(query)) continue;
        }
      }

      const memory = await this.readById(id, false);
      if (memory) {
        results.push(memory);
      }

      if (options.limit && results.length >= options.limit) {
        break;
      }
    }

    return results;
  }

  async getAll(): Promise<Memory[]> {
    this.ensureInitialized();

    const memories: Memory[] = [];

    for (const id of Object.keys(this.index!.memories)) {
      const memory = await this.readById(id, false);
      if (memory) memories.push(memory);
    }

    return memories;
  }

  async getRelevantMemories(context: string, limit = 5): Promise<ScoredMemory[]> {
    this.ensureInitialized();

    const scored: ScoredMemory[] = [];
    const contextLower = context.toLowerCase();
    const contextWords = contextLower.split(/\s+/).filter((word) => word.length > 3);

    for (const id of Object.keys(this.index!.memories)) {
      const memory = await this.readById(id, false);
      if (!memory) continue;

      let score = 0;

      const titleLower = memory.title.toLowerCase();
      for (const word of contextWords) {
        if (titleLower.includes(word)) score += 0.2;
      }

      const contentLower = memory.content.toLowerCase();
      for (const word of contextWords) {
        if (contentLower.includes(word)) score += 0.1;
      }

      for (const tag of memory.tags) {
        if (contextLower.includes(tag.toLowerCase())) score += 0.15;
      }

      const lastAccess = new Date(memory.lastAccessedAt).getTime();
      const hoursSinceAccess = (Date.now() - lastAccess) / (1000 * 60 * 60);
      if (hoursSinceAccess < 24) {
        score += 0.1 * (1 - hoursSinceAccess / 24);
      }

      if (memory.accessCount > 5) {
        score += 0.05;
      }

      score *= memory.confidence;
      score = Math.min(1, Math.max(0, score));

      if (score > 0.1) {
        scored.push({ ...memory, relevanceScore: score });
      }
    }

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.slice(0, limit);
  }

  async buildMemoryPromptSection(sessionContext?: string): Promise<string> {
    this.ensureInitialized();

    const memories = sessionContext
      ? await this.getRelevantMemories(sessionContext, 5)
      : await this.getAll();

    if (memories.length === 0) {
      return '';
    }

    let section = '## Relevant Memories\n\nThe following memories from previous interactions may be relevant:\n\n';

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

    return `${frontmatter}${memory.content}`;
  }

  private fileContentToMemory(content: string, id: string, metadata: MemoryMetadata): Memory {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    let memoryContent = content;
    let frontmatter: Record<string, string> = {};

    if (frontmatterMatch) {
      memoryContent = content.slice(frontmatterMatch[0].length);
      const lines = frontmatterMatch[1].split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex <= 0) continue;
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        frontmatter[key] = value;
      }
    }

    const parseArray = (value: string): string[] => {
      const match = value.match(/\[(.*)\]/);
      if (!match) return [];
      return match[1].split(',').map((entry) => entry.trim()).filter(Boolean);
    };

    return {
      id,
      title: frontmatter.title || metadata.title,
      content: memoryContent.trim(),
      group: (frontmatter.group || metadata.group) as MemoryGroup,
      tags: parseArray(frontmatter.tags || '[]'),
      source: (frontmatter.source || metadata.source || 'manual') as 'auto' | 'manual',
      confidence: parseFloat(frontmatter.confidence || String(metadata.confidence)) || 1.0,
      createdAt: frontmatter.createdAt || new Date().toISOString(),
      updatedAt: frontmatter.updatedAt || new Date().toISOString(),
      accessCount: parseInt(frontmatter.accessCount || String(metadata.accessCount || 0), 10) || 0,
      lastAccessedAt: frontmatter.lastAccessedAt || metadata.lastAccessedAt,
      relatedSessionIds: parseArray(frontmatter.relatedSessionIds || '[]'),
      relatedMemoryIds: parseArray(frontmatter.relatedMemoryIds || '[]'),
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.index) {
      throw new Error('MemoryService not initialized. Call initialize() first.');
    }
  }

  getMemoriesDir(): string {
    return this.memoriesDir;
  }

  getWorkingDir(): string {
    return this.workingDir;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

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
      // ignore relation update failures
    }
  }
}

export function createMemoryService(workingDir: string): MemoryService {
  return new MemoryService(workingDir);
}
