/**
 * MemoryService - DB-backed long-term memory management
 *
 * Compatibility notes:
 * - Preserves the existing MemoryService API used by middleware and IPC handlers.
 * - Imports legacy file-based memory from .cowork/memories/ once per project.
 */

import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import {
  DatabaseConnection,
  MemoryAtomRepository,
  MemoryQueryRepository,
} from '@gemini-cowork/storage';
import type {
  MemoryAtom,
  MemoryFeedback,
  MemoryQueryOptions,
  MemoryQueryResult,
} from '@gemini-cowork/shared';
import type {
  CreateMemoryInput,
  Memory,
  MemoryConsolidationPolicy,
  MemoryConsolidationResult,
  MemoryGroup,
  MemorySearchOptions,
  ScoredMemory,
  UpdateMemoryInput,
} from './types.js';
import { createRelevanceScorer, type RelevanceScorer } from './relevance-scorer.js';
import {
  createMemoryConsolidationService,
  type MemoryConsolidationService,
} from './consolidation-service.js';

const DEFAULT_GROUPS: MemoryGroup[] = [
  'preferences',
  'learnings',
  'context',
  'instructions',
];

const SETTINGS_KEY_GROUPS_PREFIX = 'memory.groups';
const SETTINGS_KEY_MIGRATION_PREFIX = 'memory.migration_v2';
const SETTINGS_KEY_CONSOLIDATION_LAST_RUN_PREFIX = 'memory.consolidation.last_run';
const SOURCE_REF_PREFIX = 'memory-meta:';

interface MemoryMetadataBlob {
  group?: string;
  source?: 'auto' | 'manual';
  accessCount?: number;
  lastAccessedAt?: string;
  relatedSessionIds?: string[];
  relatedMemoryIds?: string[];
  contentHash?: string;
  createdAtIso?: string;
  updatedAtIso?: string;
}

interface LegacyIndex {
  memories?: Record<string, { filePath?: string; group?: string }>;
}

export interface MemoryMigrationReport {
  migratedAt: number;
  workingDirectory: string;
  projectId: string;
  importedFromLegacyIndex: number;
  skippedFromLegacyIndex: number;
  importedGeminiMd: number;
  skippedGeminiMd: number;
  legacySourceDir: string;
  legacyGeminiPath: string;
}

function parseIso(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export class MemoryService {
  private workingDir: string;
  private appDataDir: string;
  private memoriesDir: string;
  private dbPath: string;
  private projectId: string;

  private db: DatabaseConnection | null = null;
  private memoryAtoms: MemoryAtomRepository | null = null;
  private memoryQueries: MemoryQueryRepository | null = null;
  private memoryConsolidator: MemoryConsolidationService | null = null;
  private relevanceScorer: RelevanceScorer = createRelevanceScorer();
  private initialized = false;

  constructor(workingDir: string, options?: { appDataDir?: string }) {
    const resolvedWorkingDir = resolve(workingDir || homedir());
    this.workingDir = resolvedWorkingDir;
    this.appDataDir = resolve(options?.appDataDir || join(homedir(), '.cowork'));
    this.memoriesDir = join(this.workingDir, '.cowork', 'memories');
    this.dbPath = join(this.appDataDir, 'data.db');
    this.projectId = this.computeProjectId(resolvedWorkingDir);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!existsSync(this.appDataDir)) {
      mkdirSync(this.appDataDir, { recursive: true });
    }

    if (!existsSync(this.memoriesDir)) {
      mkdirSync(this.memoriesDir, { recursive: true });
    }

    this.db = new DatabaseConnection({ path: this.dbPath });
    this.memoryAtoms = new MemoryAtomRepository(this.db);
    this.memoryQueries = new MemoryQueryRepository(this.db);
    this.memoryConsolidator = createMemoryConsolidationService({
      listAtoms: () => this.listProjectAtoms(),
      upsertAtom: (atom) => {
        this.memoryAtoms!.upsert(atom);
      },
      deleteAtom: (id) => this.memoryAtoms!.delete(id),
    });

    this.initialized = true;
    try {
      await this.importLegacyDataIfNeeded();
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.memoryAtoms || !this.memoryQueries || !this.db) {
      throw new Error('MemoryService not initialized. Call initialize() first.');
    }
  }

  private computeProjectId(workingDir: string): string {
    const digest = createHash('sha256').update(workingDir.toLowerCase()).digest('hex').slice(0, 16);
    return `project_${digest}`;
  }

  private atomTypeForGroup(group: MemoryGroup): MemoryAtom['atomType'] {
    const normalized = String(group).toLowerCase();
    if (normalized === 'instructions') return 'instructions';
    if (normalized === 'preferences') return 'preference';
    if (normalized === 'context') return 'context';
    if (normalized === 'learnings') return 'semantic';
    return 'semantic';
  }

  private defaultGroupForAtomType(atomType: MemoryAtom['atomType']): MemoryGroup {
    switch (atomType) {
      case 'instructions':
        return 'instructions';
      case 'preference':
        return 'preferences';
      case 'context':
        return 'context';
      default:
        return 'learnings';
    }
  }

  private encodeMetadata(meta: MemoryMetadataBlob): string {
    try {
      const raw = JSON.stringify(meta);
      return `${SOURCE_REF_PREFIX}${Buffer.from(raw).toString('base64url')}`;
    } catch {
      return `${SOURCE_REF_PREFIX}e30`;
    }
  }

  private decodeMetadata(sourceRef: string | undefined): MemoryMetadataBlob {
    if (!sourceRef || !sourceRef.startsWith(SOURCE_REF_PREFIX)) {
      return {};
    }
    const encoded = sourceRef.slice(SOURCE_REF_PREFIX.length);
    try {
      const raw = Buffer.from(encoded, 'base64url').toString('utf-8');
      const parsed = JSON.parse(raw) as MemoryMetadataBlob;
      return parsed || {};
    } catch {
      return {};
    }
  }

  private memoryToAtom(memory: Memory, existingAtom?: MemoryAtom): MemoryAtom {
    const createdAtMs = parseIso(memory.createdAt, Date.now());
    const updatedAtMs = parseIso(memory.updatedAt, createdAtMs);
    const metadata: MemoryMetadataBlob = {
      group: memory.group,
      source: memory.source,
      accessCount: memory.accessCount,
      lastAccessedAt: memory.lastAccessedAt,
      relatedSessionIds: memory.relatedSessionIds,
      relatedMemoryIds: memory.relatedMemoryIds,
      contentHash: this.computeContentHash(memory.content),
      createdAtIso: memory.createdAt,
      updatedAtIso: memory.updatedAt,
    };

    return {
      id: memory.id,
      projectId: this.projectId,
      sessionId: memory.relatedSessionIds.at(-1),
      runId: existingAtom?.runId,
      atomType: this.atomTypeForGroup(memory.group),
      content: memory.content,
      summary: memory.title,
      keywords: memory.tags,
      provenance: {
        source: memory.source === 'manual' ? 'user' : 'assistant',
        sourceRef: this.encodeMetadata(metadata),
        tags: [`group:${memory.group}`],
        createdBy: 'memory_service_v2',
      },
      confidence: memory.confidence,
      sensitivity: existingAtom?.sensitivity || 'normal',
      pinned: existingAtom?.pinned || false,
      createdAt: existingAtom?.createdAt || createdAtMs,
      updatedAt: updatedAtMs,
      expiresAt: existingAtom?.expiresAt,
    };
  }

  private atomToMemory(atom: MemoryAtom): Memory {
    const metadata = this.decodeMetadata(atom.provenance?.sourceRef);
    const group = (metadata.group || this.defaultGroupForAtomType(atom.atomType)) as MemoryGroup;
    const source: 'manual' | 'auto' = metadata.source || (atom.provenance?.source === 'user' ? 'manual' : 'auto');
    const createdAtIso = metadata.createdAtIso || new Date(atom.createdAt).toISOString();
    const updatedAtIso = metadata.updatedAtIso || new Date(atom.updatedAt).toISOString();

    return {
      id: atom.id,
      title: atom.summary || `Memory ${atom.id.slice(0, 8)}`,
      content: atom.content,
      group,
      tags: atom.keywords || [],
      source,
      confidence: atom.confidence,
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
      accessCount: metadata.accessCount || 0,
      lastAccessedAt: metadata.lastAccessedAt || updatedAtIso,
      relatedSessionIds: normalizeArray(metadata.relatedSessionIds),
      relatedMemoryIds: normalizeArray(metadata.relatedMemoryIds),
    };
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

    const wordsA = new Set(normA.split(' ').filter((word) => word.length > 2));
    const wordsB = new Set(normB.split(' ').filter((word) => word.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection += 1;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private listProjectAtoms(limit = 5000): MemoryAtom[] {
    this.ensureInitialized();
    return this.memoryAtoms!.listByProject(this.projectId, limit, 0);
  }

  private async findDuplicateMemory(input: CreateMemoryInput): Promise<Memory | null> {
    const targetHash = this.computeContentHash(input.content);
    const atoms = this.listProjectAtoms();

    for (const atom of atoms) {
      const metadata = this.decodeMetadata(atom.provenance?.sourceRef);
      if (metadata.contentHash && metadata.contentHash === targetHash) {
        return this.atomToMemory(atom);
      }
    }

    for (const atom of atoms) {
      const memory = this.atomToMemory(atom);
      if (memory.group !== input.group) continue;
      if (this.contentSimilarity(memory.content, input.content) >= 0.9) {
        return memory;
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

  private async ensureCustomGroup(group: string): Promise<void> {
    if (DEFAULT_GROUPS.includes(group)) return;
    const groups = await this.getStoredCustomGroups();
    if (groups.includes(group)) return;
    groups.push(group);
    await this.setStoredCustomGroups(groups);
  }

  async create(input: CreateMemoryInput): Promise<Memory> {
    this.ensureInitialized();

    const duplicate = await this.findDuplicateMemory(input);
    if (duplicate) {
      return this.mergeIntoExistingMemory(duplicate, input);
    }

    const nowIso = new Date().toISOString();
    const memory: Memory = {
      id: randomUUID(),
      title: input.title,
      content: input.content,
      group: input.group,
      tags: input.tags || [],
      source: input.source,
      confidence: input.confidence ?? (input.source === 'auto' ? 0.7 : 1.0),
      createdAt: nowIso,
      updatedAt: nowIso,
      accessCount: 0,
      lastAccessedAt: nowIso,
      relatedSessionIds: [],
      relatedMemoryIds: input.relatedMemoryIds || [],
    };

    const atom = this.memoryToAtom(memory);
    this.memoryAtoms!.upsert(atom);
    await this.ensureCustomGroup(input.group);
    return this.atomToMemory(atom);
  }

  async upsertAutoMemory(input: CreateMemoryInput): Promise<Memory> {
    return this.create({
      ...input,
      source: 'auto',
    });
  }

  async read(id: string): Promise<Memory | null> {
    this.ensureInitialized();

    const atom = this.memoryAtoms!.findById(id);
    if (!atom || atom.projectId !== this.projectId) {
      return null;
    }

    const memory = this.atomToMemory(atom);
    const nowIso = new Date().toISOString();
    const updated: Memory = {
      ...memory,
      accessCount: memory.accessCount + 1,
      lastAccessedAt: nowIso,
      updatedAt: nowIso,
    };

    this.memoryAtoms!.upsert(this.memoryToAtom(updated, atom));
    return updated;
  }

  async update(id: string, updates: UpdateMemoryInput): Promise<Memory | null> {
    this.ensureInitialized();

    const atom = this.memoryAtoms!.findById(id);
    if (!atom || atom.projectId !== this.projectId) {
      return null;
    }

    const current = this.atomToMemory(atom);
    const nextGroup = updates.group || current.group;
    const nowIso = new Date().toISOString();

    const updatedMemory: Memory = {
      ...current,
      title: updates.title !== undefined ? updates.title : current.title,
      content: updates.content !== undefined ? updates.content : current.content,
      group: nextGroup,
      tags: updates.tags !== undefined ? updates.tags : current.tags,
      updatedAt: nowIso,
      relatedMemoryIds: updates.addRelatedMemoryIds
        ? [...new Set([...current.relatedMemoryIds, ...updates.addRelatedMemoryIds])]
        : current.relatedMemoryIds,
    };

    if (updates.removeRelatedMemoryIds?.length) {
      updatedMemory.relatedMemoryIds = updatedMemory.relatedMemoryIds.filter(
        (relatedId) => !updates.removeRelatedMemoryIds!.includes(relatedId),
      );
    }

    const updatedAtom = this.memoryToAtom(updatedMemory, atom);
    this.memoryAtoms!.upsert(updatedAtom);
    await this.ensureCustomGroup(nextGroup);
    return this.atomToMemory(updatedAtom);
  }

  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.memoryAtoms!.delete(id);
  }

  async createGroup(name: string): Promise<void> {
    this.ensureInitialized();
    const groups = await this.getStoredCustomGroups();
    if (!groups.includes(name) && !DEFAULT_GROUPS.includes(name)) {
      groups.push(name);
      await this.setStoredCustomGroups(groups);
    }
  }

  async deleteGroup(name: string): Promise<void> {
    this.ensureInitialized();

    if (DEFAULT_GROUPS.includes(name as MemoryGroup)) {
      throw new Error(`Cannot delete default group: ${name}`);
    }

    const atoms = this.listProjectAtoms();
    for (const atom of atoms) {
      const memory = this.atomToMemory(atom);
      if (memory.group === name) {
        this.memoryAtoms!.delete(memory.id);
      }
    }

    const groups = await this.getStoredCustomGroups();
    const nextGroups = groups.filter((group) => group !== name);
    await this.setStoredCustomGroups(nextGroups);
  }

  async listGroups(): Promise<MemoryGroup[]> {
    this.ensureInitialized();

    const groups = new Set<MemoryGroup>(DEFAULT_GROUPS);
    const customGroups = await this.getStoredCustomGroups();
    for (const group of customGroups) {
      groups.add(group);
    }

    const atoms = this.listProjectAtoms();
    for (const atom of atoms) {
      const memory = this.atomToMemory(atom);
      groups.add(memory.group);
    }

    return Array.from(groups);
  }

  async getMemoriesByGroup(group: string): Promise<Memory[]> {
    this.ensureInitialized();

    const atoms = this.listProjectAtoms();
    const memories = atoms
      .map((atom) => this.atomToMemory(atom))
      .filter((memory) => memory.group === group)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return memories;
  }

  async search(options: MemorySearchOptions): Promise<Memory[]> {
    this.ensureInitialized();

    const query = options.query?.trim() || '';
    const candidateAtoms = query
      ? this.memoryAtoms!.search(this.projectId, query, Math.max(options.limit || 20, 20))
      : this.listProjectAtoms();

    const matches = candidateAtoms
      .map((atom) => this.atomToMemory(atom))
      .filter((memory) => {
        if (options.groups?.length && !options.groups.includes(memory.group)) {
          return false;
        }
        if (options.source && memory.source !== options.source) {
          return false;
        }
        if (options.minConfidence && memory.confidence < options.minConfidence) {
          return false;
        }
        if (options.tags?.length) {
          const hasTag = options.tags.some((tag) => memory.tags.includes(tag));
          if (!hasTag) return false;
        }
        if (!query) return true;

        const q = query.toLowerCase();
        return (
          memory.title.toLowerCase().includes(q) ||
          memory.content.toLowerCase().includes(q) ||
          memory.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (options.limit && matches.length > options.limit) {
      return matches.slice(0, options.limit);
    }
    return matches;
  }

  async getAll(): Promise<Memory[]> {
    this.ensureInitialized();

    return this.listProjectAtoms()
      .map((atom) => this.atomToMemory(atom))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getRelevantMemories(context: string, limit = 5): Promise<ScoredMemory[]> {
    this.ensureInitialized();

    const memories = await this.getAll();
    return this.rankMemoriesWithHybrid(memories, context, {
      limit,
      lexicalWeight: 0.35,
      denseWeight: 0.4,
      graphWeight: 0.15,
      rerankWeight: 0.1,
    }).slice(0, limit);
  }

  async buildMemoryPromptSection(sessionContext?: string): Promise<string> {
    this.ensureInitialized();

    const memories = sessionContext
      ? await this.getRelevantMemories(sessionContext, 5)
      : await this.getAll();

    if (memories.length === 0) {
      return '';
    }

    let section =
      '## Relevant Memories\n\nThe following memories from previous interactions may be relevant:\n\n';

    for (const memory of memories) {
      const scoreInfo =
        'relevanceScore' in memory
          ? ` (relevance: ${((memory as ScoredMemory).relevanceScore * 100).toFixed(0)}%)`
          : '';
      section += `### ${memory.title}${scoreInfo}\n`;
      section += `*Group: ${memory.group} | Tags: ${memory.tags.join(', ') || 'none'}*\n\n`;
      section += `${memory.content}\n\n`;
    }

    return section;
  }

  async addRelatedSession(memoryId: string, sessionId: string): Promise<void> {
    this.ensureInitialized();

    const atom = this.memoryAtoms!.findById(memoryId);
    if (!atom || atom.projectId !== this.projectId) return;

    const memory = this.atomToMemory(atom);
    if (!memory.relatedSessionIds.includes(sessionId)) {
      memory.relatedSessionIds.push(sessionId);
      memory.updatedAt = new Date().toISOString();
      this.memoryAtoms!.upsert(this.memoryToAtom(memory, atom));
    }
  }

  async deepQuery(
    sessionId: string,
    query: string,
    options?: Partial<MemoryQueryOptions> | Record<string, unknown>,
  ): Promise<MemoryQueryResult> {
    this.ensureInitialized();

    const startedAt = Date.now();
    const rawOptions = options as Record<string, unknown> | undefined;
    const clampWeight = (value: unknown, fallback: number): number => {
      if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
      return Math.max(0, Math.min(1, value));
    };
    const normalizedOptions: MemoryQueryOptions = {
      limit:
        typeof rawOptions?.limit === 'number'
          ? Math.max(1, Math.min(50, rawOptions.limit))
          : 8,
      includeSensitive: rawOptions?.includeSensitive === true,
      includeGraphExpansion: rawOptions?.includeGraphExpansion !== false,
      lexicalWeight: clampWeight(rawOptions?.lexicalWeight, 0.35),
      denseWeight: clampWeight(rawOptions?.denseWeight, 0.4),
      graphWeight: clampWeight(rawOptions?.graphWeight, 0.15),
      rerankWeight: clampWeight(rawOptions?.rerankWeight, 0.1),
    };

    const relevant = this.rankMemoriesWithHybrid(
      await this.getAll(),
      query,
      normalizedOptions,
    );
    const allAtoms = this.listProjectAtoms();
    const atomById = new Map(allAtoms.map((atom) => [atom.id, atom] as const));
    const atoms = relevant
      .map((memory) => atomById.get(memory.id))
      .filter((atom): atom is MemoryAtom => Boolean(atom));

    const queryResult: MemoryQueryResult = {
      queryId: `mq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      query,
      options: normalizedOptions,
      evidence: relevant.map((memory) => ({
        atomId: memory.id,
        score: memory.relevanceScore,
        reasons: [
          `group:${memory.group}`,
          `confidence:${memory.confidence.toFixed(2)}`,
          ...(memory.tags.slice(0, 3).map((tag) => `tag:${tag}`)),
        ],
      })),
      atoms,
      totalCandidates: allAtoms.length,
      latencyMs: Math.max(0, Date.now() - startedAt),
      createdAt: Date.now(),
    };

    this.memoryQueries!.logQuery(queryResult, this.projectId);
    return queryResult;
  }

  private rankMemoriesWithHybrid(
    memories: Memory[],
    query: string,
    options: Pick<
      MemoryQueryOptions,
      'limit' | 'lexicalWeight' | 'denseWeight' | 'graphWeight' | 'rerankWeight'
    >,
  ): ScoredMemory[] {
    if (!query.trim() || memories.length === 0) return [];

    const lexicalRanked = this.relevanceScorer.scoreMemories(memories, query);
    const lexicalById = new Map(lexicalRanked.map((item) => [item.id, item.relevanceScore] as const));
    const queryTokens = this.tokenizeForHybrid(query);

    const scored = memories
      .map((memory) => {
        const memoryTokens = this.tokenizeForHybrid(`${memory.title} ${memory.content}`);
        const lexical = lexicalById.get(memory.id) || 0;
        const dense = this.computeDenseSimilarity(queryTokens, memoryTokens);
        const coverage = this.computeQueryCoverage(queryTokens, memoryTokens);
        const graph = this.computeGraphSignal(memory);
        const rerank = this.computeRerankSignal(memory, query);

        const blended =
          lexical * options.lexicalWeight +
          dense * options.denseWeight +
          graph * options.graphWeight +
          rerank * options.rerankWeight;

        return {
          ...memory,
          relevanceScore: Math.max(
            0,
            Math.min(1, blended * (0.7 + coverage * 0.3) * memory.confidence),
          ),
        } as ScoredMemory;
      })
      .filter((memory) => memory.relevanceScore > 0.05);

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.slice(0, options.limit);
  }

  private tokenizeForHybrid(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2);
  }

  private computeDenseSimilarity(queryTokens: string[], memoryTokens: string[]): number {
    if (queryTokens.length === 0 || memoryTokens.length === 0) return 0;
    const querySet = new Set(queryTokens);
    const memorySet = new Set(memoryTokens);
    let intersection = 0;
    for (const token of querySet) {
      if (memorySet.has(token)) intersection += 1;
    }
    const union = querySet.size + memorySet.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private computeQueryCoverage(queryTokens: string[], memoryTokens: string[]): number {
    if (queryTokens.length === 0 || memoryTokens.length === 0) return 0;
    const querySet = new Set(queryTokens);
    const memorySet = new Set(memoryTokens);
    let covered = 0;
    for (const token of querySet) {
      if (memorySet.has(token)) covered += 1;
    }
    return querySet.size > 0 ? covered / querySet.size : 0;
  }

  private computeGraphSignal(memory: Memory): number {
    const relatedMemoriesScore = Math.min(1, memory.relatedMemoryIds.length / 5);
    const relatedSessionsScore = Math.min(1, memory.relatedSessionIds.length / 8);
    return Math.max(relatedMemoriesScore, relatedSessionsScore * 0.6);
  }

  private computeRerankSignal(memory: Memory, query: string): number {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    const title = memory.title.toLowerCase();
    const content = memory.content.toLowerCase();
    const tagHit = memory.tags.some((tag) => q.includes(tag.toLowerCase()));

    if (title === q) return 1;
    if (title.includes(q)) return 0.9;
    if (content.includes(q)) return 0.75;
    if (tagHit) return 0.55;
    return 0.2;
  }

  async applyFeedback(input: {
    sessionId: string;
    queryId: string;
    atomId: string;
    feedback: MemoryFeedback['feedback'];
    note?: string;
  }): Promise<MemoryFeedback> {
    this.ensureInitialized();

    const feedback: MemoryFeedback = {
      id: `mf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: input.sessionId,
      queryId: input.queryId,
      atomId: input.atomId,
      feedback: input.feedback,
      note: input.note,
      createdAt: Date.now(),
    };

    this.memoryQueries!.addFeedback(feedback);

    const atom = this.memoryAtoms!.findById(input.atomId);
    if (atom && atom.projectId === this.projectId) {
      if (input.feedback === 'pin' || input.feedback === 'unpin' || input.feedback === 'hide') {
        const updatedAtom: MemoryAtom = {
          ...atom,
          pinned: input.feedback === 'pin' ? true : input.feedback === 'unpin' ? false : atom.pinned,
          sensitivity: input.feedback === 'hide' ? 'restricted' : atom.sensitivity,
          updatedAt: Date.now(),
        };
        this.memoryAtoms!.upsert(updatedAtom);
      }
    }

    return feedback;
  }

  async consolidateMemory(
    options?: Partial<MemoryConsolidationPolicy>,
  ): Promise<MemoryConsolidationResult> {
    this.ensureInitialized();

    if (!this.memoryConsolidator) {
      throw new Error('Memory consolidation service is not available.');
    }

    const dbRunId = `mcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    this.db!.instance
      .prepare(
        `
        INSERT INTO memory_consolidation_runs (id, project_id, status, stats_json, started_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(dbRunId, this.projectId, 'running', '{}', startedAt);

    try {
      const result = this.memoryConsolidator.run(options);
      this.db!.instance
        .prepare(
          `
          UPDATE memory_consolidation_runs
          SET status = ?, stats_json = ?, completed_at = ?
          WHERE id = ?
        `,
        )
        .run('completed', JSON.stringify(result), result.completedAt, dbRunId);
      this.setSetting(this.settingKeyForConsolidationLastRun(), String(result.completedAt));
      return result;
    } catch (error) {
      const completedAt = Date.now();
      this.db!.instance
        .prepare(
          `
          UPDATE memory_consolidation_runs
          SET status = ?, completed_at = ?, error = ?
          WHERE id = ?
        `,
        )
        .run('failed', completedAt, error instanceof Error ? error.message : String(error), dbRunId);
      throw error;
    }
  }

  async maybeRunPeriodicConsolidation(options?: {
    enabled?: boolean;
    intervalMinutes?: number;
    redundancyThreshold?: number;
    decayFactor?: number;
    minConfidence?: number;
    staleAfterHours?: number;
    strategy?: MemoryConsolidationPolicy['strategy'];
    force?: boolean;
  }): Promise<MemoryConsolidationResult | null> {
    this.ensureInitialized();

    if (options?.enabled === false) {
      return null;
    }

    const intervalMinutes =
      typeof options?.intervalMinutes === 'number' && options.intervalMinutes > 0
        ? options.intervalMinutes
        : 60;

    const lastRunRaw = this.getSetting(this.settingKeyForConsolidationLastRun());
    const lastRunMs = Number(lastRunRaw || 0);
    const nowMs = Date.now();
    const due = nowMs - lastRunMs >= intervalMinutes * 60 * 1000;

    if (!options?.force && !due) {
      return null;
    }

    return this.consolidateMemory({
      strategy: options?.strategy,
      redundancyThreshold: options?.redundancyThreshold,
      decayFactor: options?.decayFactor,
      minConfidence: options?.minConfidence,
      staleAfterHours: options?.staleAfterHours,
    });
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

  getMigrationReport(): MemoryMigrationReport | null {
    this.ensureInitialized();
    const raw = this.getSetting(this.settingKeyForMigration());
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<MemoryMigrationReport>;
      if (
        typeof parsed.migratedAt !== 'number' ||
        typeof parsed.workingDirectory !== 'string' ||
        typeof parsed.projectId !== 'string' ||
        typeof parsed.importedFromLegacyIndex !== 'number' ||
        typeof parsed.skippedFromLegacyIndex !== 'number' ||
        typeof parsed.importedGeminiMd !== 'number' ||
        typeof parsed.skippedGeminiMd !== 'number' ||
        typeof parsed.legacySourceDir !== 'string' ||
        typeof parsed.legacyGeminiPath !== 'string'
      ) {
        return null;
      }
      return parsed as MemoryMigrationReport;
    } catch {
      return null;
    }
  }

  private settingKeyForGroups(): string {
    return `${SETTINGS_KEY_GROUPS_PREFIX}.${this.projectId}`;
  }

  private settingKeyForMigration(): string {
    return `${SETTINGS_KEY_MIGRATION_PREFIX}.${this.projectId}`;
  }

  private settingKeyForConsolidationLastRun(): string {
    return `${SETTINGS_KEY_CONSOLIDATION_LAST_RUN_PREFIX}.${this.projectId}`;
  }

  private getSetting(key: string): string | null {
    this.ensureInitialized();
    const row = this.db!.instance
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value || null;
  }

  private setSetting(key: string, value: string): void {
    this.ensureInitialized();
    this.db!.instance
      .prepare(
        `
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `,
      )
      .run(key, value, Date.now());
  }

  private async getStoredCustomGroups(): Promise<string[]> {
    const raw = this.getSetting(this.settingKeyForGroups());
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    } catch {
      return [];
    }
  }

  private async setStoredCustomGroups(groups: string[]): Promise<void> {
    const deduped = [...new Set(groups.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    this.setSetting(this.settingKeyForGroups(), JSON.stringify(deduped));
  }

  private parseLegacyMemoryFile(memoryId: string, fileContent: string, fallbackGroup: string): Memory {
    const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---\n/);
    let content = fileContent;
    const frontmatter = new Map<string, string>();

    if (frontmatterMatch) {
      content = fileContent.slice(frontmatterMatch[0].length);
      const lines = frontmatterMatch[1].split('\n');
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        frontmatter.set(key, value);
      }
    }

    const parseArray = (value: string | undefined): string[] => {
      if (!value) return [];
      const match = value.match(/\[(.*)\]/);
      if (!match) return [];
      return match[1]
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    };

    const nowIso = new Date().toISOString();
    return {
      id: memoryId,
      title: frontmatter.get('title') || `Memory ${memoryId.slice(0, 8)}`,
      content: content.trim(),
      group: (frontmatter.get('group') || fallbackGroup || 'context') as MemoryGroup,
      tags: parseArray(frontmatter.get('tags')),
      source: (frontmatter.get('source') as 'auto' | 'manual' | undefined) || 'manual',
      confidence: parseFloat(frontmatter.get('confidence') || '1') || 1,
      createdAt: frontmatter.get('createdAt') || nowIso,
      updatedAt: frontmatter.get('updatedAt') || nowIso,
      accessCount: parseInt(frontmatter.get('accessCount') || '0', 10) || 0,
      lastAccessedAt: frontmatter.get('lastAccessedAt') || nowIso,
      relatedSessionIds: parseArray(frontmatter.get('relatedSessionIds')),
      relatedMemoryIds: parseArray(frontmatter.get('relatedMemoryIds')),
    };
  }

  private upsertImportedMemory(memory: Memory): void {
    const existing = this.memoryAtoms!.findById(memory.id);
    const atom = this.memoryToAtom(memory, existing || undefined);
    this.memoryAtoms!.upsert(atom);
  }

  private importLegacyFromIndex(): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;

    const indexPath = join(this.memoriesDir, 'index.json');
    if (!existsSync(indexPath)) {
      return { imported, skipped };
    }

    let parsedIndex: LegacyIndex | null = null;
    try {
      parsedIndex = JSON.parse(readFileSync(indexPath, 'utf-8')) as LegacyIndex;
    } catch {
      parsedIndex = null;
    }

    const memories = parsedIndex?.memories || {};
    for (const [id, meta] of Object.entries(memories)) {
      const relPath = meta.filePath;
      if (!relPath) {
        skipped += 1;
        continue;
      }

      const absPath = join(this.memoriesDir, relPath);
      if (!existsSync(absPath)) {
        skipped += 1;
        continue;
      }

      try {
        const fileContent = readFileSync(absPath, 'utf-8');
        const memory = this.parseLegacyMemoryFile(id, fileContent, meta.group || 'context');
        this.upsertImportedMemory(memory);
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    return { imported, skipped };
  }

  private importLegacyGeminiMarkdown(): { imported: number; skipped: number } {
    const geminiPath = join(this.workingDir, 'GEMINI.md');
    if (!existsSync(geminiPath)) {
      return { imported: 0, skipped: 0 };
    }

    try {
      const content = readFileSync(geminiPath, 'utf-8').trim();
      if (!content) {
        return { imported: 0, skipped: 1 };
      }

      const id = `legacy_gemini_${createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
      const nowIso = new Date().toISOString();
      const memory: Memory = {
        id,
        title: 'Legacy GEMINI.md Instructions',
        content,
        group: 'instructions',
        tags: ['legacy_gemini_md', 'instructions'],
        source: 'manual',
        confidence: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        accessCount: 0,
        lastAccessedAt: nowIso,
        relatedSessionIds: [],
        relatedMemoryIds: [],
      };

      this.upsertImportedMemory(memory);
      return { imported: 1, skipped: 0 };
    } catch {
      return { imported: 0, skipped: 1 };
    }
  }

  private async importLegacyDataIfNeeded(): Promise<void> {
    this.ensureInitialized();

    const migrationKey = this.settingKeyForMigration();
    const done = this.getSetting(migrationKey);
    if (done) {
      return;
    }

    const indexed = this.importLegacyFromIndex();
    const gemini = this.importLegacyGeminiMarkdown();

    const report: MemoryMigrationReport = {
      migratedAt: Date.now(),
      workingDirectory: this.workingDir,
      projectId: this.projectId,
      importedFromLegacyIndex: indexed.imported,
      skippedFromLegacyIndex: indexed.skipped,
      importedGeminiMd: gemini.imported,
      skippedGeminiMd: gemini.skipped,
      legacySourceDir: this.memoriesDir,
      legacyGeminiPath: join(this.workingDir, 'GEMINI.md'),
    };

    this.setSetting(migrationKey, JSON.stringify(report));
  }
}

export function createMemoryService(
  workingDir: string,
  options?: { appDataDir?: string },
): MemoryService {
  return new MemoryService(workingDir, options);
}
