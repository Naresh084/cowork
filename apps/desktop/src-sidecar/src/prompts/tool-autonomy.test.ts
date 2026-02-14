// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import type { ToolHandler } from '@cowork/core';
import { buildToolAutonomySection, getAutoUseTools, getToolAutonomyLevel } from './tool-autonomy.js';

function createTool(name: string, description = 'Test tool'): ToolHandler {
  return {
    name,
    description,
    parameters: z.object({}),
    execute: async () => ({ success: true, data: 'ok' }),
  };
}

describe('tool-autonomy', () => {
  it('classifies low-risk analysis tools as auto-use', () => {
    expect(getToolAutonomyLevel('read_any_file')).toBe('auto');
    expect(getToolAutonomyLevel('web_search')).toBe('auto');
    expect(getToolAutonomyLevel('google_grounded_search')).toBe('auto');
    expect(getToolAutonomyLevel('web_fetch')).toBe('auto');
  });

  it('classifies side-effect tools as confirm-first', () => {
    expect(getToolAutonomyLevel('write_file')).toBe('confirm');
    expect(getToolAutonomyLevel('schedule_task')).toBe('confirm');
    expect(getToolAutonomyLevel('send_notification_slack')).toBe('confirm');
    expect(getToolAutonomyLevel('connector_salesforce_update')).toBe('confirm');
    expect(getToolAutonomyLevel('mcp_design_generate')).toBe('confirm');
    expect(getToolAutonomyLevel('start_codex_cli_run')).toBe('confirm');
    expect(getToolAutonomyLevel('start_claude_cli_run')).toBe('confirm');
  });

  it('keeps external-cli progress/respond tools as auto-use', () => {
    expect(getToolAutonomyLevel('external_cli_get_progress')).toBe('auto');
    expect(getToolAutonomyLevel('external_cli_respond')).toBe('auto');
  });

  it('renders autonomy section using runtime tool availability', () => {
    const section = buildToolAutonomySection([
      createTool('read_any_file'),
      createTool('web_search'),
      createTool('write_file'),
      createTool('send_notification_slack'),
    ]);

    expect(section.key).toBe('tool_autonomy_runtime');
    expect(section.content).toContain('`read_any_file`');
    expect(section.content).toContain('`web_search`');
    expect(section.content).toContain('`write_file`');
    expect(section.content).toContain('`send_notification_slack`');
  });

  it('exposes conservative auto-use baseline list', () => {
    expect(getAutoUseTools()).toEqual(
      expect.arrayContaining([
        'read_any_file',
        'ls',
        'glob',
        'grep',
        'web_search',
        'google_grounded_search',
        'web_fetch',
        'external_cli_get_progress',
        'external_cli_respond',
      ]),
    );
  });
});
