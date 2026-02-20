// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ExecutionMode, SessionMode } from '../types.js';

export type ModeTemplateKey =
  | 'modes/coding-execute.md'
  | 'modes/coding-plan.md'
  | 'modes/cowork-execute.md'
  | 'modes/cowork-plan.md';

const MODE_TEMPLATE_MAP: Record<`${SessionMode}-${ExecutionMode}`, ModeTemplateKey> = {
  'coding-execute': 'modes/coding-execute.md',
  'coding-plan': 'modes/coding-plan.md',
  'cowork-execute': 'modes/cowork-execute.md',
  'cowork-plan': 'modes/cowork-plan.md',
};

export function getModeTemplateKey(sessionMode: SessionMode, executionMode: ExecutionMode): ModeTemplateKey {
  return MODE_TEMPLATE_MAP[`${sessionMode}-${executionMode}`] || 'modes/cowork-execute.md';
}
