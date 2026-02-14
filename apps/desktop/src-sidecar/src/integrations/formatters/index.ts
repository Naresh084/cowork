// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { PlatformType } from '../types.js';

function collapseWhitespace(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, '');
}

function stripMarkdownForPlain(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

function truncateForPlatform(text: string, platform: PlatformType): string {
  const limit =
    platform === 'whatsapp'
      // WhatsApp supports substantially larger text payloads than 4k.
      // Keep a high safety ceiling so long replies do not appear to stop "randomly".
      ? 32000
      : platform === 'telegram'
        ? 4096
        : platform === 'imessage'
          ? 5000
          : 8000;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 64)}\n\n...(truncated, see Cowork desktop for full response)`;
}

export function formatIntegrationText(platform: PlatformType, text: string): string {
  try {
    const cleaned = collapseWhitespace(stripHtml(text));
    const normalized = stripMarkdownForPlain(cleaned);

    if (platform === 'slack') {
      return truncateForPlatform(normalized.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), platform);
    }

    if (platform === 'telegram') {
      return truncateForPlatform(normalized, platform);
    }

    return truncateForPlatform(normalized, platform);
  } catch {
    return truncateForPlatform(text, platform);
  }
}
