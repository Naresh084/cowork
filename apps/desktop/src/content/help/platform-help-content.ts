// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  sections: Array<{
    heading: string;
    body: string;
    bullets?: string[];
  }>;
}

export interface GuidedTourStep {
  id: string;
  title: string;
  description: string;
  targetId: string;
}

export interface GuidedTourDefinition {
  id: string;
  title: string;
  description: string;
  steps: GuidedTourStep[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'platform-overview',
    title: 'How Cowork Works',
    summary: 'Understand provider runtime, automations, tools, permissions, sessions, and integrations.',
    sections: [
      {
        heading: 'Runtime Model',
        body:
          'Cowork runs locally through a desktop shell and a sidecar agent runtime. Your active provider, keys, model, and routing settings determine which capabilities are enabled for new tool calls.',
      },
      {
        heading: 'Automation Runtime',
        body:
          'Automations run in a durable, inspectable runtime with policy checks and node-level event history. Scheduling, manual runs, chat-triggered runs, and integration-triggered runs share the same execution model.',
      },
      {
        heading: 'Sessions and Scope',
        body:
          'Each chat session captures provider/model context and workspace directory. Some runtime changes apply immediately, while provider/base URL/model changes usually require a new session for consistency.',
      },
      {
        heading: 'Permissions and Policies',
        body:
          'Tool policy profiles and per-action approval checks work together. Even allowed tools can still prompt for risky actions, depending on policy and operation type.',
      },
      {
        heading: 'Plan Mode Workflow',
        body:
          'Plan mode is per-session and read-only. The agent analyzes and returns a <proposed_plan> block. You can Accept (auto-switch to Execute and auto-run) or Reject (request revision in Plan mode).',
      },
      {
        heading: 'Tool Availability',
        body:
          'Tool access is dynamic. Missing keys or disabled integrations remove tools at runtime. Session type and policy controls determine which automation and integration tools are exposed.',
      },
      {
        heading: 'Where to Build',
        body:
          'Use main chat for natural-language authoring and quick task execution. Use Automations for schedule setup, controls, and run visibility.',
      },
    ],
  },
  {
    id: 'workflow-automation',
    title: 'Workflow Automation',
    summary: 'Build workflows from chat or visual editor, run them manually, and schedule them with full observability.',
    sections: [
      {
        heading: 'Authoring Paths',
        body:
          'You can author workflows from main chat (`create_workflow_from_chat`) or from the Workflows visual builder. Chat authoring is faster for intent-to-draft, while visual builder is better for trigger and step refinement.',
      },
      {
        heading: 'Execution Paths',
        body:
          'Workflows can run manually, via schedule triggers, from chat requests, from integration events, or as subworkflow calls. Every path uses the same runtime engine and run persistence model.',
      },
      {
        heading: 'Scheduler Integration',
        body:
          'Automations UI shows both legacy cron tasks and workflow schedules. New recurring automations can be created as workflow definitions directly from scheduler surfaces.',
      },
      {
        heading: 'Agent Integration',
        body:
          'Main chat can list workflows, inspect definitions, publish drafts, trigger runs, and inspect runs/events through workflow tools. This enables natural language orchestration without leaving chat.',
      },
      {
        heading: 'Safety and Reliability',
        body:
          'Workflow runs enforce policy checks, permission gates, retry/timeout behavior, and audit events for side-effect steps. Schedule pause/resume controls are available from both workflow and automation surfaces.',
      },
    ],
  },
  {
    id: 'integrations-overview',
    title: 'Integrations and Connectors',
    summary: 'Messaging integrations and connectors extend Cowork beyond local chat.',
    sections: [
      {
        heading: 'Messaging Integrations',
        body:
          'WhatsApp, Slack, Telegram, Discord, iMessage (BlueBubbles), and Microsoft Teams can create shared-session message flows, trigger workflow runs, and send outbound notifications when connected.',
        bullets: [
          'WhatsApp includes sender allowlist enforcement and denial messaging.',
          'Slack requires bot token + app token for realtime operation.',
          'Telegram uses a BotFather token for bot connectivity.',
          'Discord supports bot-token ingress with optional guild/channel scoping.',
          'iMessage uses a BlueBubbles bridge and is available on macOS hosts.',
          'Teams uses Azure Graph app credentials for channel messaging.',
        ],
      },
      {
        heading: 'Shared Session Defaults',
        body:
          'A shared integration working directory defines where integration-triggered sessions run file and shell operations by default.',
      },
      {
        heading: 'Connector Marketplace',
        body:
          'Connectors add external MCP-backed tools (OAuth, API-key, and utility integrations) for services like GitHub, Google Workspace, databases, and search platforms.',
      },
      {
        heading: 'Operational Safety',
        body:
          'Use scoped credentials, narrow allowlists, and trusted working directories. Treat connectors and messaging channels as runtime entry points for automated actions.',
      },
    ],
  },
  {
    id: 'keys-and-security',
    title: 'Keys, Models, and Security',
    summary: 'What each key does and how to manage credentials safely.',
    sections: [
      {
        heading: 'Provider Keys',
        body:
          'Provider keys authorize chat and provider-native capability calls. Without a valid key (except LM Studio), runtime capabilities are reduced or unavailable.',
      },
      {
        heading: 'Media and Runtime Extension Keys',
        body:
          'Google/OpenAI/Fal media keys govern media tools. Exa/Tavily/Stitch keys and external CLI controls are managed under Runtime settings.',
      },
      {
        heading: 'Storage and Rotation',
        body:
          'Keys are stored via secure platform credential storage. Rotate keys regularly and replace immediately after exposure.',
      },
    ],
  },
];

export const HELP_ARTICLE_BY_ID: Record<string, HelpArticle> = HELP_ARTICLES.reduce(
  (acc, article) => {
    acc[article.id] = article;
    return acc;
  },
  {} as Record<string, HelpArticle>,
);

export const GUIDED_TOURS: GuidedTourDefinition[] = [
  {
    id: 'settings',
    title: 'Settings Tour',
    description: 'Learn provider, media, capabilities, runtime, integrations, and remote access with impact-aware guidance.',
    steps: [
      {
        id: 'settings-step-tabs',
        title: 'Settings Tabs',
        description: 'Use tabs to switch between Provider, Media, Capabilities, Runtime, Integrations, Remote, and Souls.',
        targetId: 'settings-tab-nav',
      },
      {
        id: 'settings-step-provider-tab',
        title: 'Provider Tab',
        description: 'Configure provider, chat model, and command sandbox controls.',
        targetId: 'settings-tab-provider',
      },
      {
        id: 'settings-step-capabilities-tab',
        title: 'Capabilities Tab',
        description: 'Review capability availability and set Allow/Ask/Deny policy in one unified table.',
        targetId: 'settings-tab-capabilities',
      },
      {
        id: 'settings-step-runtime-tab',
        title: 'Runtime Tab',
        description: 'Manage search fallback, Stitch key, external CLI orchestration, and specialized runtime models.',
        targetId: 'settings-tab-runtime',
      },
      {
        id: 'settings-step-integrations-tab',
        title: 'Integrations Tab',
        description: 'Configure messaging channels and shared integration working directory defaults.',
        targetId: 'settings-tab-integrations',
      },
      {
        id: 'settings-step-remote-tab',
        title: 'Remote Tab',
        description:
          'Follow guided setup: choose provider, set tunnel name/domain/access policy, install dependency, authenticate, start tunnel, then pair mobile with QR.',
        targetId: 'settings-tab-remote',
      },
      {
        id: 'settings-step-help',
        title: 'Help and Logout Controls',
        description: 'Open Help Center, replay tours, or run secure logout/reset cleanup from here.',
        targetId: 'settings-help-actions',
      },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace Tour',
    description: 'Understand key navigation controls inside Cowork.',
    steps: [
      {
        id: 'workspace-step-sidebar',
        title: 'Sidebar Navigation',
        description: 'Create tasks, switch sessions, and open platform modules from here.',
        targetId: 'sidebar-root',
      },
      {
        id: 'workspace-step-workflows',
        title: 'Automations',
        description: 'Use Automations for schedule overview, controls, and run visibility.',
        targetId: 'sidebar-automations-button',
      },
      {
        id: 'workspace-step-session-header',
        title: 'Session Controls',
        description: 'Manage approval mode, connection status, and session metadata.',
        targetId: 'session-header-root',
      },
      {
        id: 'workspace-step-plan-mode',
        title: 'Plan Mode',
        description: 'Switch between Execute and Plan mode. Plan mode is read-only and requires plan approval before execution.',
        targetId: 'session-execution-mode-plan',
      },
      {
        id: 'workspace-step-input',
        title: 'Input and Attachments',
        description: 'Send prompts, attach files, and run slash commands from the input area.',
        targetId: 'chat-input-area',
      },
    ],
  },
];

export const GUIDED_TOUR_BY_ID: Record<string, GuidedTourDefinition> = GUIDED_TOURS.reduce(
  (acc, tour) => {
    acc[tour.id] = tour;
    return acc;
  },
  {} as Record<string, GuidedTourDefinition>,
);
