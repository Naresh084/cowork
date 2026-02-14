// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Subagents Module
 *
 * Exports all types and services for the subagent system.
 */

// Types
export type {
  SubagentCategory,
  SubagentSource,
  SubagentManifest,
  SubagentConfig,
  LoadedSubagent,
  SubagentSourceInfo,
  SubagentSearchOptions,
  CreateSubagentParams,
} from './types.js';

export { SUBAGENT_CATEGORIES, BUILT_IN_SUBAGENTS } from './types.js';

export type { BuiltInSubagentName } from './types.js';

// Service
export {
  SubagentService,
  createSubagentService,
  subagentService,
} from './subagent-service.js';
