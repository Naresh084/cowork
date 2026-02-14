// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ChatItem } from '@/types/remote';

export interface PendingPermission {
  id: string;
  permissionId: string;
  label: string;
}

export interface PendingQuestion {
  id: string;
  questionId: string;
  question: string;
}

export function extractMessageText(item: ChatItem): string {
  const content = item.content as unknown;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const typed = part as Record<string, unknown>;
        if (typeof typed.text === 'string') return typed.text;
        if (typed.type === 'image') return '[Image]';
        if (typed.type === 'audio') return '[Audio]';
        if (typed.type === 'video') return '[Video]';
        if (typed.type === 'file') return `[File ${String(typed.name || '')}]`;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

export function collectPendingPermissions(items: ChatItem[]): PendingPermission[] {
  return items
    .filter((item) => item.kind === 'permission' && item.status === 'pending')
    .map((item) => {
      const request = (item.request as Record<string, unknown> | undefined) || {};
      const resource = typeof request.resource === 'string' ? request.resource : 'resource';
      const type = typeof request.type === 'string' ? request.type : 'permission';
      return {
        id: item.id,
        permissionId: String(item.permissionId || ''),
        label: `${type}: ${resource}`,
      };
    })
    .filter((entry) => entry.permissionId.length > 0);
}

export function collectPendingQuestions(items: ChatItem[]): PendingQuestion[] {
  return items
    .filter((item) => item.kind === 'question' && item.status === 'pending')
    .map((item) => ({
      id: item.id,
      questionId: String(item.questionId || ''),
      question: typeof item.question === 'string' ? item.question : 'Question',
    }))
    .filter((entry) => entry.questionId.length > 0);
}
