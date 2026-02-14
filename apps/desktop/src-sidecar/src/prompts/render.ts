// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { PROMPT_TEMPLATES, type PromptTemplateKey } from './generated/templates.js';

const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function getPromptTemplate(key: PromptTemplateKey): string {
  return PROMPT_TEMPLATES[key] || '';
}

export function renderTemplate(
  key: PromptTemplateKey,
  variables: Record<string, string | number | boolean> = {},
): string {
  const template = getPromptTemplate(key);
  return template.replace(VAR_PATTERN, (_match, raw) => {
    const name = String(raw);
    const value = variables[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

function normalizeBlock(block: string): string {
  return block
    .replace(/\r\n/g, '\n')
    .trim();
}

function firstMeaningfulLine(block: string): string {
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    return trimmed;
  }
  return '';
}

export function mergePromptBlocks(blocks: string[]): string {
  const seenBlocks = new Set<string>();
  const seenHeaders = new Set<string>();
  const merged: string[] = [];

  for (const block of blocks) {
    const normalized = normalizeBlock(block);
    if (!normalized) continue;

    const header = firstMeaningfulLine(normalized);
    const looksLikeHeader = header.startsWith('#') || header.startsWith('<provider_profile');

    if (seenBlocks.has(normalized)) continue;
    if (looksLikeHeader && seenHeaders.has(header)) continue;

    seenBlocks.add(normalized);
    if (looksLikeHeader) seenHeaders.add(header);
    merged.push(normalized);
  }

  return merged.join('\n\n');
}
