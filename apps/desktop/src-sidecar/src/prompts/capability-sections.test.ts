// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { z } from 'zod';
import type { ToolHandler } from '@cowork/core';
import type { PromptBuildContext } from './types.js';
import { buildCapabilitySections } from './capability-sections.js';

function createTool(name: string, description = 'Tool description'): ToolHandler {
  return {
    name,
    description,
    parameters: z.object({}),
    execute: async () => ({ success: true, data: 'ok' }),
  };
}

function createContext(partial?: Partial<PromptBuildContext>): PromptBuildContext {
  return {
    provider: 'google',
    executionMode: 'execute',
    sessionType: 'main',
    workingDirectory: '/workspace/project',
    model: 'gemini-2.5-pro',
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
      createTool('web_search', 'Search the web'),
      createTool('send_notification_slack', 'Send Slack message'),
    ],
    capabilitySnapshot: {
      provider: 'google',
      executionMode: 'execute',
      policyProfile: 'coding',
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
          policyAction: 'allow',
        },
        {
          toolName: 'schedule_task',
          enabled: false,
          reason: 'Unavailable in isolated/cron sessions.',
          policyAction: 'ask',
        },
      ],
      integrationAccess: [
        {
          integrationName: 'slack',
          enabled: true,
          reason: 'Connected and ready.',
        },
      ],
      notes: ['Plan mode disabled for this session.'],
    },
    additionalSections: [],
    defaultNotificationTarget: {
      platform: 'slack',
      chatId: 'C123',
      senderName: 'Naresh',
    },
    ...partial,
  };
}

describe('capability-sections', () => {
  it('renders available and restricted tool sections from runtime state', () => {
    const sections = buildCapabilitySections(createContext());
    const available = sections.find((section) => section.key === 'available_tools_now');
    const restricted = sections.find((section) => section.key === 'restricted_tools');

    expect(available?.content).toContain('`read_any_file`');
    expect(available?.content).toContain('`send_notification_slack`');
    expect(restricted?.content).toContain('`schedule_task`');
    expect(restricted?.content).toContain('Unavailable in isolated/cron sessions.');
  });

  it('reflects plan mode guardrails and cron scheduling limits', () => {
    const sections = buildCapabilitySections(
      createContext({
        executionMode: 'plan',
        sessionType: 'cron',
      }),
    );

    const mode = sections.find((section) => section.key === 'mode_guardrails');
    const skills = sections.find((section) => section.key === 'skill_operating_practice');
    const scheduling = sections.find((section) => section.key === 'scheduling_delivery_defaults');

    expect(mode?.content).toContain('Plan mode is active');
    expect(mode?.content).toContain('<proposed_plan>');
    expect(skills?.content).toContain('Scheduling tools are unavailable in this runtime;');
    expect(scheduling?.content).toContain('Scheduling tools are unavailable in this session type.');
  });

  it('shows integration and notification details only when connected', () => {
    const sections = buildCapabilitySections(createContext());
    const integration = sections.find((section) => section.key === 'integrations_notifications');

    expect(integration?.content).toContain('Connected Integrations: slack');
    expect(integration?.content).toContain('send_notification_slack');
  });

  it('shows no connected integrations when none are available', () => {
    const sections = buildCapabilitySections(
      createContext({
        toolHandlers: [createTool('read_any_file', 'Read local files')],
        capabilitySnapshot: {
          ...createContext().capabilitySnapshot,
          integrationAccess: [],
        },
      }),
    );
    const integration = sections.find((section) => section.key === 'integrations_notifications');

    expect(integration?.content).toContain('Connected Integrations: none');
    expect(integration?.content).toContain('Notification Tools: none');
  });

  it('adds external-cli operating practice section when launch tools are available', () => {
    const sections = buildCapabilitySections(
      createContext({
        toolHandlers: [
          createTool('start_codex_cli_run', 'Launch Codex CLI run'),
          createTool('external_cli_get_progress', 'Get run progress'),
        ],
      }),
    );

    const externalCli = sections.find((section) => section.key === 'external_cli_operating_practice');
    expect(externalCli).toBeDefined();
    expect(externalCli?.content).toContain('`working_directory`');
    expect(externalCli?.content).toContain('`create_if_missing`');
    expect(externalCli?.content).toContain('`bypassPermission`');
    expect(externalCli?.content).toContain('external_cli_get_progress');
    expect(externalCli?.content).toContain('low=5s');
    expect(externalCli?.content).toContain('explicitly asks to use Codex/Claude CLI');
    expect(externalCli?.content).toContain('`web_search`');
  });

  it('adds draft-first skill flow guidance when skill generation and scheduling tools are available', () => {
    const sections = buildCapabilitySections(
      createContext({
        toolHandlers: [
          createTool('draft_skill_from_conversation', 'Draft skill from chat'),
          createTool('create_skill_from_conversation', 'Create skill from chat'),
          createTool('schedule_task', 'Create scheduled task'),
        ],
        capabilitySnapshot: {
          ...createContext().capabilitySnapshot,
          toolAccess: [
            {
              toolName: 'draft_skill_from_conversation',
              enabled: true,
              reason: 'Available',
              policyAction: 'ask',
            },
            {
              toolName: 'create_skill_from_conversation',
              enabled: true,
              reason: 'Available',
              policyAction: 'ask',
            },
            {
              toolName: 'schedule_task',
              enabled: true,
              reason: 'Available',
              policyAction: 'ask',
            },
          ],
        },
      }),
    );

    const skillPractice = sections.find((section) => section.key === 'skill_operating_practice');
    expect(skillPractice).toBeDefined();
    expect(skillPractice?.content).toContain('`draft_skill_from_conversation`');
    expect(skillPractice?.content).toContain('`create_skill_from_conversation`');
    expect(skillPractice?.content).toContain('`Skill used: <name>`');
  });
});
