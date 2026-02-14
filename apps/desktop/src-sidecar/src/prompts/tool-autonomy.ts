// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ToolHandler } from '@cowork/core';
import type {
  PromptTemplateSection,
  ToolAutonomyLevel,
} from './types.js';

const AUTO_USE_TOOLS = new Set<string>([
  'read_any_file',
  'read_file',
  'read',
  'ls',
  'glob',
  'grep',
  'web_search',
  'google_grounded_search',
  'web_fetch',
  'external_cli_get_progress',
  'external_cli_respond',
]);

export function getToolAutonomyLevel(toolName: string): ToolAutonomyLevel {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) return 'confirm';
  if (AUTO_USE_TOOLS.has(normalized)) return 'auto';

  if (
    normalized.startsWith('send_notification_') ||
    normalized.startsWith('connector_') ||
    normalized.startsWith('mcp_') ||
    normalized.startsWith('generate_')
  ) {
    return 'confirm';
  }

  const confirmTools = new Set<string>([
    'write_file',
    'edit_file',
    'delete_file',
    'execute',
    'bash',
    'run_command',
    'shell',
    'schedule_task',
    'manage_scheduled_task',
    'edit_image',
    'computer_use',
    'deep_research',
    'analyze_video',
    'start_codex_cli_run',
    'start_claude_cli_run',
    'external_cli_cancel_run',
  ]);

  if (confirmTools.has(normalized)) return 'confirm';
  return 'confirm';
}

function listWithBackticks(values: string[]): string {
  if (values.length === 0) return '- None currently available';
  return values.map((value) => `- \`${value}\``).join('\n');
}

export function buildToolAutonomySection(toolHandlers: ToolHandler[]): PromptTemplateSection {
  const names = Array.from(new Set(toolHandlers.map((tool) => tool.name))).sort();
  const autoUse = names.filter((name) => getToolAutonomyLevel(name) === 'auto');
  const confirmFirst = names.filter((name) => getToolAutonomyLevel(name) === 'confirm');

  return {
    key: 'tool_autonomy_runtime',
    content: [
      '## Tool Autonomy (Runtime)',
      '',
      'Auto-use tools currently available:',
      listWithBackticks(autoUse),
      '',
      'Confirm-first tools currently available:',
      listWithBackticks(confirmFirst),
      '',
      'When confirmation is required, ask a direct, concise question before execution.',
    ].join('\n'),
  };
}

export function getAutoUseTools(): string[] {
  return Array.from(AUTO_USE_TOOLS).sort();
}
