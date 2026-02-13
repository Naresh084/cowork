/**
 * Memory System Types
 *
 * Long-term persistent memory stored in .cowork/memories/
 */

/**
 * A single memory entry
 */
export interface Memory {
  /** Unique identifier */
  id: string;

  /** Human-readable title */
  title: string;

  /** Memory content (markdown) */
  content: string;

  /** Folder/group name */
  group: MemoryGroup;

  /** Searchable tags */
  tags: string[];

  /** How memory was created */
  source: 'auto' | 'manual';

  /** Confidence score for auto-extracted memories (0-1) */
  confidence: number;

  /** ISO timestamp when created */
  createdAt: string;

  /** ISO timestamp when last updated */
  updatedAt: string;

  /** Number of times this memory was retrieved */
  accessCount: number;

  /** ISO timestamp when last accessed */
  lastAccessedAt: string;

  /** Session IDs that used this memory */
  relatedSessionIds: string[];

  /** IDs of related memories */
  relatedMemoryIds: string[];
}

/**
 * Memory groups (folders)
 */
export type MemoryGroup =
  | 'preferences'
  | 'learnings'
  | 'context'
  | 'instructions'
  | string;

/**
 * Default memory groups
 */
export const DEFAULT_MEMORY_GROUPS: MemoryGroup[] = [
  'preferences',
  'learnings',
  'context',
  'instructions',
];

/**
 * Memory metadata stored in index.json
 */
export interface MemoryMetadata {
  /** Memory ID */
  id: string;

  /** Title for quick reference */
  title: string;

  /** Group/folder */
  group: MemoryGroup;

  /** Tags for filtering */
  tags: string[];

  /** Relative path in memories/ directory */
  filePath: string;

  /** Access count for relevance scoring */
  accessCount: number;

  /** Last access timestamp */
  lastAccessedAt: string;

  /** Source (auto/manual) */
  source: 'auto' | 'manual';

  /** Confidence score */
  confidence: number;

  /** Canonical content hash for dedupe */
  contentHash?: string;
}

/**
 * Index file structure at .cowork/memories/index.json
 */
export interface MemoryIndex {
  /** Schema version for migration */
  version: string;

  /** Working directory this index belongs to */
  workingDirectory: string;

  /** List of groups */
  groups: MemoryGroup[];

  /** Memory metadata keyed by ID */
  memories: Record<string, MemoryMetadata>;

  /** ISO timestamp of last update */
  lastUpdated: string;
}

/**
 * Input for creating a new memory
 */
export interface CreateMemoryInput {
  /** Human-readable title */
  title: string;

  /** Memory content */
  content: string;

  /** Target group */
  group: MemoryGroup;

  /** Optional tags */
  tags?: string[];

  /** Creation source */
  source: 'auto' | 'manual';

  /** Confidence score (required for auto) */
  confidence?: number;

  /** Related memories */
  relatedMemoryIds?: string[];
}

/**
 * Input for updating a memory
 */
export interface UpdateMemoryInput {
  /** New title */
  title?: string;

  /** New content */
  content?: string;

  /** New group */
  group?: MemoryGroup;

  /** New tags */
  tags?: string[];

  /** Related memories to add */
  addRelatedMemoryIds?: string[];

  /** Related memories to remove */
  removeRelatedMemoryIds?: string[];
}

/**
 * Memory search options
 */
export interface MemorySearchOptions {
  /** Search query string */
  query: string;

  /** Filter by groups */
  groups?: MemoryGroup[];

  /** Filter by tags */
  tags?: string[];

  /** Filter by source */
  source?: 'auto' | 'manual';

  /** Maximum results */
  limit?: number;

  /** Minimum confidence for auto-extracted */
  minConfidence?: number;
}

/**
 * Memory with relevance score
 */
export interface ScoredMemory extends Memory {
  /** Relevance score (0-1) */
  relevanceScore: number;
}

/**
 * Semantic memory candidate emitted by the model extractor.
 */
export interface SemanticMemoryCandidate {
  /** Target group */
  group: MemoryGroup;

  /** Canonical memory statement */
  content: string;

  /** Confidence score from model */
  confidence: number;

  /** Whether this appears stable long-term */
  stable: boolean;

  /** Scope classification */
  scope: 'user' | 'project' | 'workflow' | 'general';

  /** Whether content is sensitive and should not be persisted */
  sensitive: boolean;

  /** Optional model-generated title */
  title?: string;

  /** Optional model-generated tags */
  tags?: string[];
}

/**
 * Extracted memory from conversation
 */
export interface ExtractedMemory {
  /** Suggested title */
  title: string;

  /** Extracted content */
  content: string;

  /** Suggested group */
  group: MemoryGroup;

  /** Suggested tags */
  tags: string[];

  /** Confidence score */
  confidence: number;

  /** Source message ID */
  sourceMessageId?: string;

  /** Semantic scope classification */
  scope?: SemanticMemoryCandidate['scope'];

  /** Whether candidate was considered stable */
  stable?: boolean;

  /** Whether candidate was sensitive */
  sensitive?: boolean;
}

/**
 * Memory extraction result
 */
export interface MemoryExtractionResult {
  /** Extracted memories */
  memories: ExtractedMemory[];

  /** Messages processed */
  messagesProcessed: number;

  /** Extraction timestamp */
  extractedAt: string;

  /** Raw model candidates */
  candidates?: SemanticMemoryCandidate[];
}

export interface MemoryConsolidationPolicy {
  strategy: 'balanced' | 'aggressive' | 'conservative';
  redundancyThreshold: number;
  decayFactor: number;
  minConfidence: number;
  staleAfterHours: number;
}

export interface MemoryConsolidationResult {
  runId: string;
  strategy: MemoryConsolidationPolicy['strategy'];
  startedAt: number;
  completedAt: number;
  beforeCount: number;
  afterCount: number;
  mergedCount: number;
  removedCount: number;
  decayedCount: number;
  preservedPinnedCount: number;
  redundancyReduction: number;
  recallRetention: number;
}

export type MemoryExtractionStyle = 'conservative' | 'balanced' | 'aggressive';

/**
 * Configuration for memory extraction
 */
export interface MemoryExtractionConfig {
  /** Enable auto-extraction */
  enabled: boolean;

  /** Minimum confidence threshold (0-1) */
  confidenceThreshold: number;

  /** Maximum memories to extract per conversation */
  maxPerConversation: number;

  /** Accepted memory style */
  style: MemoryExtractionStyle;

  /** Maximum memories to persist after filtering */
  maxAcceptedPerTurn: number;
}

/**
 * Default extraction configuration (moderate aggressiveness)
 */
export const DEFAULT_EXTRACTION_CONFIG: MemoryExtractionConfig = {
  enabled: true,
  confidenceThreshold: 0.7,
  maxPerConversation: 5,
  style: 'balanced',
  maxAcceptedPerTurn: 2,
};
