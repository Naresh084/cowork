// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Backward-compatible memory extractor exports.
 *
 * The implementation is semantic/LLM-driven in semantic-memory-extractor.ts.
 */

export {
  SemanticMemoryExtractor as MemoryExtractor,
  createSemanticMemoryExtractor as createMemoryExtractor,
  type SemanticMemoryExtractorInvoker,
  type SemanticMemoryExtractorInvocation,
} from './semantic-memory-extractor.js';
