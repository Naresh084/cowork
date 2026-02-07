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
    summary: 'Understand provider runtime, tools, permissions, sessions, and integrations end to end.',
    sections: [
      {
        heading: 'Runtime Model',
        body:
          'Cowork runs locally through a desktop shell and a sidecar agent runtime. Your active provider, keys, model, and routing settings determine which capabilities are enabled for new tool calls.',
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
          'Tool access is dynamic. Missing keys or disabled integrations remove tools at runtime. The Help Center capability matrix shows your current effective access and the reason for disabled tools.',
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
          'WhatsApp, Slack, Telegram, Discord, iMessage (BlueBubbles), and Microsoft Teams can create shared-session message workflows and outbound notifications when connected.',
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
        heading: 'Media and Capability Keys',
        body:
          'Google/OpenAI/Fal media keys govern media tools. Exa/Tavily keys govern search fallback. Stitch key governs Stitch/MCP Stitch tool registration.',
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
    id: 'onboarding',
    title: 'Onboarding Tour',
    description: 'Walk through setup mode, provider configuration, media routing, and capability setup.',
    steps: [
      {
        id: 'onboarding-step-setup-mode',
        title: 'Choose Setup Mode',
        description: 'Pick Fast Path for quick start or Deep Dive for full guided configuration.',
        targetId: 'onboarding-setup-mode',
      },
      {
        id: 'onboarding-step-provider',
        title: 'Provider and Key',
        description: 'Set provider, key, and model. This defines your core runtime behavior.',
        targetId: 'onboarding-provider-block',
      },
      {
        id: 'onboarding-step-media',
        title: 'Media Routing',
        description: 'Control which backend powers image and video generation tools.',
        targetId: 'onboarding-media-block',
      },
      {
        id: 'onboarding-step-capability',
        title: 'Capabilities and Integrations',
        description: 'Set search fallback, research models, and integration-level keys.',
        targetId: 'onboarding-capability-block',
      },
      {
        id: 'onboarding-step-review',
        title: 'Review and Finish',
        description: 'Confirm your setup and complete onboarding.',
        targetId: 'onboarding-review-block',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings Tour',
    description: 'Learn provider, media, and integration settings with impact-aware guidance.',
    steps: [
      {
        id: 'settings-step-tabs',
        title: 'Settings Tabs',
        description: 'Switch between Provider, Media, and Integrations configuration.',
        targetId: 'settings-tab-nav',
      },
      {
        id: 'settings-step-help',
        title: 'Help Controls',
        description: 'Open Help Center or replay tours anytime.',
        targetId: 'settings-help-actions',
      },
      {
        id: 'settings-step-provider',
        title: 'Provider Configuration',
        description: 'Manage provider key, endpoint, and active provider selection.',
        targetId: 'settings-provider-section',
      },
      {
        id: 'settings-step-media',
        title: 'Media Configuration',
        description: 'Control image/video backend routing and specialized model overrides.',
        targetId: 'settings-media-section',
      },
      {
        id: 'settings-step-integrations',
        title: 'Integrations Configuration',
        description: 'Manage fallback search, Stitch, shared session defaults, and messaging integrations.',
        targetId: 'settings-integrations-section',
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
