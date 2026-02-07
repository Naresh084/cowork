import type { ToolHandler } from '@gemini-cowork/core';
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
