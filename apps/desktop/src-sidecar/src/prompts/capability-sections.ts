// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type { ToolHandler } from '@cowork/core';
import type {
  PromptBuildContext,
  PromptTemplateSection,
} from './types.js';

function firstLine(value: string): string {
  const line = value.split('\n').find((entry) => entry.trim().length > 0);
  return (line || '').trim();
}

function toolDescriptionMap(toolHandlers: ToolHandler[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tool of toolHandlers) {
    map.set(tool.name, firstLine(tool.description || '').replace(/\s+/g, ' '));
  }
  return map;
}

function buildEffectiveEnvironmentSection(context: PromptBuildContext): PromptTemplateSection {
  const { systemInfo, capabilitySnapshot } = context;
  const rootsPreview = capabilitySnapshot.sandbox.effectiveAllowedRoots.slice(0, 4).join(', ') || context.workingDirectory;

  return {
    key: 'effective_environment',
    content: [
      '## Effective Environment',
      `- Provider: ${context.provider}`,
      `- Model: ${context.model}`,
      `- Session Type: ${context.sessionType}`,
      `- Session Mode: ${context.sessionMode}`,
      `- Execution Mode: ${context.executionMode}`,
      `- Working Directory: ${context.workingDirectory}`,
      `- User: ${systemInfo.username}`,
      `- OS: ${systemInfo.osName} ${systemInfo.osVersion} (${systemInfo.architecture})`,
      `- Shell: ${systemInfo.shell}`,
      `- Time: ${systemInfo.formattedDate} ${systemInfo.formattedTime}`,
      `- Timezone: ${systemInfo.timezone} (${systemInfo.timezoneOffset})`,
      `- Locale: ${systemInfo.locale}`,
      `- Sandbox Mode: ${capabilitySnapshot.sandbox.mode}`,
      `- Sandbox Network: ${capabilitySnapshot.sandbox.networkAllowed ? 'allowed' : 'blocked'}`,
      `- Sandbox Enforcement: ${capabilitySnapshot.sandbox.osEnforced ? 'OS + validator' : 'validator-only'}`,
      `- Allowed Roots (sample): ${rootsPreview}`,
      `- Approval Mode: ${capabilitySnapshot.approvalMode}`,
      `- Media Routing: image=${capabilitySnapshot.mediaRouting.imageBackend}, video=${capabilitySnapshot.mediaRouting.videoBackend}`,
    ].join('\n'),
  };
}

function buildAvailableToolsSection(context: PromptBuildContext): PromptTemplateSection {
  const names = Array.from(new Set(context.toolHandlers.map((tool) => tool.name))).sort();
  const descriptions = toolDescriptionMap(context.toolHandlers);

  const lines = names.map((name) => {
    const desc = descriptions.get(name);
    if (desc) {
      return `- \`${name}\`: ${desc}`;
    }
    return `- \`${name}\``;
  });

  if (lines.length === 0) lines.push('- None');

  return {
    key: 'available_tools_now',
    content: ['## Available Tools Now', ...lines].join('\n'),
  };
}

function buildUnavailableToolsSection(context: PromptBuildContext): PromptTemplateSection {
  const available = new Set(context.toolHandlers.map((tool) => tool.name.toLowerCase()));
  const restricted = context.capabilitySnapshot.toolAccess
    .filter((entry) => !entry.enabled)
    .sort((a, b) => a.toolName.localeCompare(b.toolName));

  const lines: string[] = [];
  for (const entry of restricted) {
    if (available.has(entry.toolName.toLowerCase())) continue;
    lines.push(`- \`${entry.toolName}\`: ${entry.reason}`);
  }

  if (lines.length === 0) {
    lines.push('- None currently restricted beyond runtime registration.');
  }

  return {
    key: 'restricted_tools',
    content: ['## Unavailable or Restricted Tools', ...lines].join('\n'),
  };
}

function buildIntegrationsSection(context: PromptBuildContext): PromptTemplateSection {
  const connected = context.capabilitySnapshot.integrationAccess
    .filter((entry) => entry.enabled)
    .sort((a, b) => a.integrationName.localeCompare(b.integrationName));

  const notificationTools = context.toolHandlers
    .map((tool) => tool.name)
    .filter((name) => name.startsWith('send_notification_'))
    .sort();

  const lines: string[] = [];
  if (connected.length === 0) {
    lines.push('- Connected Integrations: none');
  } else {
    lines.push(`- Connected Integrations: ${connected.map((entry) => entry.integrationName).join(', ')}`);
  }

  if (notificationTools.length === 0) {
    lines.push('- Notification Tools: none');
  } else {
    lines.push(`- Notification Tools: ${notificationTools.map((name) => `\`${name}\``).join(', ')}`);
    lines.push('- Use notifications for meaningful completion/alert events, not trivial updates.');
    lines.push('- For integration-origin turns, do not call send_notification_<same platform> for the immediate reply turn; router already returns that response to origin chat.');
  }

  return {
    key: 'integrations_notifications',
    content: ['## Integrations and Notifications', ...lines].join('\n'),
  };
}

function buildModeGuardrailsSection(context: PromptBuildContext): PromptTemplateSection {
  if (context.executionMode === 'plan') {
    const allowed = context.toolHandlers.map((tool) => tool.name).sort();
    return {
      key: 'mode_guardrails',
      content: [
        '## Mode Guardrails',
        '- Plan mode is active: operate read-only and avoid side effects.',
        `- Currently callable tools in plan mode: ${allowed.length > 0 ? allowed.map((name) => `\`${name}\``).join(', ') : 'none'}`,
        '- Return exactly one <proposed_plan> block in the final response.',
      ].join('\n'),
    };
  }

  return {
    key: 'mode_guardrails',
    content: [
      '## Mode Guardrails',
      '- Execute mode is active: implementation is allowed within approval and sandbox constraints.',
      '- Non-trivial or high-impact actions should include a concise intent statement before execution.',
    ].join('\n'),
  };
}

function buildSkillOperatingPracticeSection(context: PromptBuildContext): PromptTemplateSection {
  const toolNames = new Set(context.toolHandlers.map((tool) => tool.name));
  const hasDraftSkillTool = toolNames.has('draft_skill_from_conversation');
  const hasCreateSkillTool = toolNames.has('create_skill_from_conversation');
  const hasScheduleTaskTool = toolNames.has('schedule_task');

  const lines: string[] = [
    '## Skill Operating Practice',
    '- Prefer reusable skills when workflow quality depends on repeatability, strict constraints, or stable multi-step orchestration.',
    '- Mine current-session conversation for durable signals before creating a skill: repeated intent, required tools, constraints, and output contract.',
    '- Preserve durable knowledge in skills and remove temporary turn-only context from generated instructions.',
    '- If the workflow has independent tracks, create multiple focused skills rather than one overloaded skill.',
    '- Generated skills should include: trigger description, when-to-use / when-not-to-use guidance, deterministic workflow steps, and output quality checks.',
    '- Proactively suggest creating a skill when repeated manual requests, repeated correction loops, or recurring automation intent appears.',
  ];

  if (hasDraftSkillTool && hasCreateSkillTool) {
    lines.push(
      '- Use draft-first skill flow: `draft_skill_from_conversation` -> concise preview -> explicit user confirmation -> `create_skill_from_conversation`.',
    );
  } else {
    lines.push(
      '- If conversation skill tools are unavailable in this runtime, state that limitation and continue with the best available fallback.',
    );
  }

  if (hasScheduleTaskTool) {
    lines.push(
      '- For scheduled automations, bind generated skill(s) into the execution prompt and require explicit skill usage instructions.',
    );
    lines.push(
      '- Skill binding is instruction-level: require loading `/skills/<name>/SKILL.md`, following its workflow, and reporting `Skill used: <name>` in run output.',
    );
  } else {
    lines.push('- Scheduling tools are unavailable in this runtime; skip automation creation and continue with non-scheduled execution.');
  }

  return {
    key: 'skill_operating_practice',
    content: lines.join('\n'),
  };
}

function buildSchedulingDefaultsSection(context: PromptBuildContext): PromptTemplateSection {
  const lines: string[] = ['## Scheduling Delivery Defaults'];

  if (context.sessionType === 'isolated' || context.sessionType === 'cron') {
    lines.push('- Scheduling tools are unavailable in this session type.');
    return {
      key: 'scheduling_delivery_defaults',
      content: lines.join('\n'),
    };
  }

  if (context.defaultNotificationTarget) {
    const target = context.defaultNotificationTarget;
    lines.push(`- Default scheduled-task delivery target: ${target.platform}${target.chatId ? ` (chatId=${target.chatId})` : ''}.`);
    lines.push('- If user does not specify a destination, use this origin target.');
  } else {
    lines.push('- No default integration-origin delivery target is currently set.');
    lines.push('- Ask for destination only when required by user intent and no default exists.');
  }

  return {
    key: 'scheduling_delivery_defaults',
    content: lines.join('\n'),
  };
}

function buildStitchSection(context: PromptBuildContext): PromptTemplateSection | null {
  if (!context.stitchApiKeyConfigured) return null;
  const stitchTools = context.toolHandlers.filter((t) => t.name.toLowerCase().includes('stitch'));
  if (stitchTools.length === 0) return null;

  return {
    key: 'stitch_design',
    content: [
      '## Stitch Design Tools',
      `- Available Stitch tools: ${stitchTools.map((t) => `\`${t.name}\``).join(', ')}`,
      '- Use Stitch tools for design/UI workflows: generating designs, creating mockups, converting designs to code.',
      '- Stitch tools require an API key which is already configured for this session.',
    ].join('\n'),
  };
}

function buildNotesSection(context: PromptBuildContext): PromptTemplateSection | null {
  const notes = context.capabilitySnapshot.notes || [];
  if (notes.length === 0) return null;

  return {
    key: 'runtime_notes',
    content: ['## Runtime Notes', ...notes.map((note) => `- ${note}`)].join('\n'),
  };
}

function buildSchedulingInstructionsSection(context: PromptBuildContext): PromptTemplateSection | null {
  const toolNames = new Set(context.toolHandlers.map((t) => t.name));
  if (!toolNames.has('schedule_task')) return null;

  return {
    key: 'scheduling_instructions',
    content: [
      '## Scheduling Instructions',
      '',
      '### Schedule Expressions (Cron Syntax)',
      '- `"0 9 * * 1-5"` — Weekdays at 9:00 AM',
      '- `"*/30 * * * *"` — Every 30 minutes',
      '- `"0 0 1 * *"` — First day of each month at midnight',
      '- `"0 */6 * * *"` — Every 6 hours',
      '- `"0 18 * * 5"` — Fridays at 6:00 PM',
      '',
      '### Execution Prompt Rules',
      '1. Scheduled task prompts MUST be completely self-contained. They cannot reference prior conversation context.',
      '2. Include explicit success criteria and error handling instructions in the execution prompt.',
      '3. If the task should deliver results, include a `send_notification_<platform>` instruction with the target channel.',
      '',
      '### Skill Binding in Scheduled Tasks',
      '- When creating scheduled tasks that use a skill, include explicit instructions to load and follow the skill.',
      '- Format: "Load /skills/<name>/SKILL.md, follow its workflow, and report \'Skill used: <name>\' in output."',
      '',
      '### Constraints',
      '- Scheduled tasks run in isolated sessions with no access to the originating conversation.',
      '- Each run is independent — do not assume state persists between scheduled runs unless using /memories/.',
    ].join('\n'),
  };
}

export function buildCapabilitySections(context: PromptBuildContext): PromptTemplateSection[] {
  const sections: PromptTemplateSection[] = [
    buildEffectiveEnvironmentSection(context),
    buildModeGuardrailsSection(context),
    buildSkillOperatingPracticeSection(context),
    buildAvailableToolsSection(context),
    buildUnavailableToolsSection(context),
    buildIntegrationsSection(context),
    buildSchedulingDefaultsSection(context),
  ];

  const scheduling = buildSchedulingInstructionsSection(context);
  if (scheduling) sections.push(scheduling);
  const stitch = buildStitchSection(context);
  if (stitch) sections.push(stitch);
  const notes = buildNotesSection(context);
  if (notes) sections.push(notes);
  return sections;
}
