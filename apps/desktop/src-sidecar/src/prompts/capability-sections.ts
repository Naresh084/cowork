import type { ToolHandler } from '@gemini-cowork/core';
import type {
  PromptBuildContext,
  PromptCapabilityToolAccessEntry,
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

function findToolAccess(
  list: PromptCapabilityToolAccessEntry[],
  toolName: string,
): PromptCapabilityToolAccessEntry | undefined {
  const normalized = toolName.toLowerCase();
  return list.find((entry) => entry.toolName.toLowerCase() === normalized);
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
      `- Tool Policy Profile: ${capabilitySnapshot.policyProfile}`,
      `- Media Routing: image=${capabilitySnapshot.mediaRouting.imageBackend}, video=${capabilitySnapshot.mediaRouting.videoBackend}`,
    ].join('\n'),
  };
}

function buildAvailableToolsSection(context: PromptBuildContext): PromptTemplateSection {
  const names = Array.from(new Set(context.toolHandlers.map((tool) => tool.name))).sort();
  const descriptions = toolDescriptionMap(context.toolHandlers);

  const lines = names.map((name) => {
    const access = findToolAccess(context.capabilitySnapshot.toolAccess, name);
    const policy = access ? `policy=${access.policyAction}` : 'policy=ask';
    const desc = descriptions.get(name);
    if (desc) {
      return `- \`${name}\` (${policy}): ${desc}`;
    }
    return `- \`${name}\` (${policy})`;
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
    lines.push(`- \`${entry.toolName}\`: ${entry.reason} (policy=${entry.policyAction})`);
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
      '- Execute mode is active: implementation is allowed within policy and sandbox constraints.',
      '- Non-trivial or high-impact actions should include a concise intent statement before execution.',
    ].join('\n'),
  };
}

function buildExternalCliOperatingPracticeSection(context: PromptBuildContext): PromptTemplateSection | null {
  const toolNames = new Set(context.toolHandlers.map((tool) => tool.name));
  const hasCodexStart = toolNames.has('start_codex_cli_run');
  const hasClaudeStart = toolNames.has('start_claude_cli_run');

  if (!hasCodexStart && !hasClaudeStart) {
    return null;
  }

  const availableStarts: string[] = [];
  if (hasCodexStart) availableStarts.push('`start_codex_cli_run`');
  if (hasClaudeStart) availableStarts.push('`start_claude_cli_run`');

  return {
    key: 'external_cli_operating_practice',
    content: [
      '## External CLI Operating Practice',
      `- Available launch tools: ${availableStarts.join(', ')}.`,
      '- Before launching, run a short conversational checklist and confirm all values in natural language:',
      '  - `working_directory`',
      '  - `create_if_missing` (default recommendation: `true`)',
      '  - `bypassPermission` (default recommendation: `false`)',
      '- If the user omitted directory, ask whether to use the current session working directory.',
      '- If requested directory is missing, default to creating it automatically by setting `create_if_missing=true` unless user explicitly asks not to create directories.',
      '- If user asks for bypass but settings disallow it, explain and ask whether to continue with bypass disabled.',
      '- After launch, keep monitoring with `external_cli_get_progress` until terminal status (`completed`, `failed`, `cancelled`, `interrupted`).',
      '- Adaptive polling cadence should be auto-derived from task complexity: low=5s, medium=10s, high=60s.',
      '- If status is `waiting_user`, ask user/respond and then resume polling.',
      '- After confirmations, call the start tool with explicit structured arguments only.',
    ].join('\n'),
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

function buildNotesSection(context: PromptBuildContext): PromptTemplateSection | null {
  const notes = context.capabilitySnapshot.notes || [];
  if (notes.length === 0) return null;

  return {
    key: 'runtime_notes',
    content: ['## Runtime Notes', ...notes.map((note) => `- ${note}`)].join('\n'),
  };
}

export function buildCapabilitySections(context: PromptBuildContext): PromptTemplateSection[] {
  const externalCliSection = buildExternalCliOperatingPracticeSection(context);
  const sections: PromptTemplateSection[] = [
    buildEffectiveEnvironmentSection(context),
    buildModeGuardrailsSection(context),
    ...(externalCliSection ? [externalCliSection] : []),
    buildAvailableToolsSection(context),
    buildUnavailableToolsSection(context),
    buildIntegrationsSection(context),
    buildSchedulingDefaultsSection(context),
  ];

  const notes = buildNotesSection(context);
  if (notes) sections.push(notes);
  return sections;
}
