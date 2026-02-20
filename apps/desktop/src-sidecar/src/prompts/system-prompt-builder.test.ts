// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import type { ToolHandler } from '@cowork/core';
import type { PromptBuildContext, PromptProviderId } from './types.js';
import { SystemPromptBuilder } from './system-prompt-builder.js';

function createTool(name: string, description = 'Tool description'): ToolHandler {
  return {
    name,
    description,
    parameters: z.object({}),
    execute: async () => ({ success: true, data: 'ok' }),
  };
}

function createContext(
  provider: PromptProviderId,
  mode: 'execute' | 'plan' = 'execute',
  sessionMode: 'coding' | 'cowork' = 'cowork',
): PromptBuildContext {
  return {
    provider,
    executionMode: mode,
    sessionMode,
    sessionType: 'main',
    workingDirectory: '/workspace/project',
    model: 'model-x',
    systemInfo: {
      username: 'naresh',
      osName: 'macOS',
      osVersion: '14.0',
      architecture: 'arm64',
      shell: '/bin/zsh',
      computerName: 'MacBook',
      cpuModel: 'Apple M2',
      cpuCores: 8,
      totalMemoryGB: '16.0',
      timezone: 'America/Los_Angeles',
      timezoneOffset: 'UTC-08:00',
      locale: 'en-US',
      formattedDate: 'Saturday, February 7, 2026',
      formattedTime: '10:15 AM',
    },
    toolHandlers: [
      createTool('read_any_file', 'Read local files'),
      createTool('web_search', 'Search web data'),
      createTool('write_file', 'Write file content'),
    ],
    capabilitySnapshot: {
      provider,
      executionMode: mode,
      approvalMode: 'ask',
      mediaRouting: {
        imageBackend: 'google',
        videoBackend: 'google',
      },
      sandbox: {
        mode: 'workspace-write',
        osEnforced: true,
        networkAllowed: false,
        effectiveAllowedRoots: ['/workspace/project'],
      },
      toolAccess: [
        {
          toolName: 'read_any_file',
          enabled: true,
          reason: 'Available',
        },
        {
          toolName: 'write_file',
          enabled: true,
          reason: 'Available',
        },
      ],
      integrationAccess: [],
      notes: [],
    },
    additionalSections: [{ key: 'custom_context', content: '## Custom Context\n- extra context' }],
    defaultNotificationTarget: null,
  };
}

describe('system-prompt-builder', () => {
  const builder = new SystemPromptBuilder();
  const providers: PromptProviderId[] = ['google'];

  it.each(providers)('selects provider template for %s', (provider) => {
    const result = builder.build(createContext(provider));

    expect(result.diagnostics.provider).toBe(provider);
    expect(result.diagnostics.providerTemplateKey).toContain(`providers/${provider}.md`);
    expect(result.prompt).toContain('## Effective Environment');
    expect(result.prompt).toContain('## Tool Autonomy Policy: Conservative');
    expect(result.prompt).toContain('## Skill Operating Practice');
  });

  it('uses plan-mode template and keeps deterministic output for fixed input', () => {
    const context = createContext('google', 'plan');
    const first = builder.build(context);
    const second = builder.build(context);

    expect(first.prompt).toBe(second.prompt);
    expect(first.prompt).toContain('Plan mode');
    expect(first.prompt).toContain('<proposed_plan>');
  });

  it('selects coding-execute template when sessionMode is coding', () => {
    const result = builder.build(createContext('google', 'execute', 'coding'));

    expect(result.diagnostics.modeTemplateKey).toBe('modes/coding-execute.md');
    expect(result.prompt).toContain('precision software engineering agent');
  });

  it('selects coding-plan template when sessionMode is coding and mode is plan', () => {
    const result = builder.build(createContext('google', 'plan', 'coding'));

    expect(result.diagnostics.modeTemplateKey).toBe('modes/coding-plan.md');
    expect(result.prompt).toContain('codebase analyst and architecture advisor');
  });

  it('selects cowork-execute template when sessionMode is cowork', () => {
    const result = builder.build(createContext('google', 'execute', 'cowork'));

    expect(result.diagnostics.modeTemplateKey).toBe('modes/cowork-execute.md');
  });

  it('keeps prompt size under regression guard threshold', () => {
    const result = builder.build(createContext('google'));
    expect(result.prompt.length).toBeLessThan(40000);
  });

});
