/**
 * Command Parser Service
 *
 * Parses COMMAND.md files with YAML frontmatter and markdown body.
 */

import type { CommandFrontmatter, CommandMetadata, CommandCategory } from '@gemini-cowork/shared';
import { extractFrontmatter } from './skill-parser.js';

/**
 * Parse COMMAND.md content and extract frontmatter
 */
export function parseCommandFrontmatter(content: string): CommandFrontmatter | null {
  const extracted = extractFrontmatter(content);
  if (!extracted) {
    return null;
  }

  const { data } = extracted;

  // Check for required fields
  if (!data.name || typeof data.name !== 'string') {
    console.error('[CommandParser] Missing required field: name');
    return null;
  }

  if (!data.description || typeof data.description !== 'string') {
    console.error('[CommandParser] Missing required field: description');
    return null;
  }

  if (!data.category || typeof data.category !== 'string') {
    console.error('[CommandParser] Missing required field: category');
    return null;
  }

  // Parse aliases - can be string or array
  let aliases: string[] = [];
  if (data.aliases) {
    if (Array.isArray(data.aliases)) {
      aliases = data.aliases.map(String);
    } else if (typeof data.aliases === 'string') {
      aliases = [data.aliases];
    }
  }

  // Parse metadata
  const metadata = data.metadata as CommandMetadata | undefined;

  return {
    name: data.name as string,
    displayName: (data.displayName as string) || data.name as string,
    description: data.description as string,
    aliases,
    category: data.category as CommandCategory,
    icon: data.icon as string | undefined,
    priority: data.priority as number | undefined,
    action: data.action as 'clear_chat' | undefined,
    metadata,
  };
}

/**
 * Parse full command markdown file
 */
export function parseCommandMarkdown(content: string): { frontmatter: CommandFrontmatter; body: string } | null {
  const extracted = extractFrontmatter(content);
  if (!extracted) {
    return null;
  }

  const frontmatter = parseCommandFrontmatter(content);
  if (!frontmatter) {
    return null;
  }

  return {
    frontmatter,
    body: extracted.body,
  };
}

/**
 * Build COMMAND.md content from parameters
 */
export function buildCommandMarkdown(params: {
  name: string;
  displayName: string;
  description: string;
  aliases?: string[];
  category: CommandCategory;
  icon?: string;
  priority?: number;
  content: string;
  emoji?: string;
}): string {
  const escapedDescription = params.description.replace(/"/g, '\\"');

  const aliasesList = params.aliases?.length
    ? `aliases:\n${params.aliases.map((a) => `  - "${a}"`).join('\n')}`
    : '';

  return `---
name: ${params.name}
displayName: ${params.displayName}
description: "${escapedDescription}"
${aliasesList}
category: ${params.category}
${params.icon ? `icon: ${params.icon}` : ''}
${params.priority ? `priority: ${params.priority}` : ''}
metadata:
  author: user
  version: "1.0.0"
  emoji: ${params.emoji || '📦'}
---

${params.content}`;
}
