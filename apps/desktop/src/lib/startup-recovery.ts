import type { StartupIssue } from '../stores/app-store';

const AUTH_KEYWORDS = ['api key', 'unauthorized', 'authentication', '401', 'forbidden', 'invalid key'];
const CAPABILITY_KEYWORDS = [
  'capability',
  'tool policy',
  'permission policy',
  'policy profile',
  'capability table',
];
const RUNTIME_KEYWORDS = [
  'stitch',
  'external search',
  'fallback',
  'exa',
  'tavily',
  'computer use',
  'deep research',
  'model override',
  'external cli',
  'codex cli',
  'claude cli',
  'runtime extension',
];
const INTEGRATION_KEYWORDS = [
  'integration',
  'whatsapp',
  'slack',
  'telegram',
  'discord',
  'teams',
  'imessage',
  'bridge',
  'backend',
  'sidecar',
  'session',
  'initialize',
  'initialization',
];
const REMOTE_KEYWORDS = ['remote', 'tunnel', 'mesh', 'pair', 'qr', 'mobile', 'phone', 'device'];
const MEDIA_KEYWORDS = ['media', 'image', 'video', 'fal', 'sora', 'generation'];
const SOUL_KEYWORDS = ['soul', 'persona'];

function hasAnyKeyword(input: string, keywords: string[]): boolean {
  return keywords.some((keyword) => input.includes(keyword));
}

export function inferRecoveryTab(title: string, message: string): StartupIssue['target'] {
  const content = `${title} ${message}`.toLowerCase();

  if (hasAnyKeyword(content, AUTH_KEYWORDS)) {
    return { view: 'settings', settingsTab: 'provider' };
  }

  if (hasAnyKeyword(content, RUNTIME_KEYWORDS)) {
    return { view: 'settings', settingsTab: 'runtime' };
  }

  if (hasAnyKeyword(content, CAPABILITY_KEYWORDS)) {
    return { view: 'settings', settingsTab: 'capabilities' };
  }

  if (hasAnyKeyword(content, REMOTE_KEYWORDS)) {
    return { view: 'settings', settingsTab: 'remote' };
  }

  if (hasAnyKeyword(content, MEDIA_KEYWORDS)) {
    return { view: 'settings', settingsTab: 'media' };
  }

  if (hasAnyKeyword(content, SOUL_KEYWORDS)) {
    return { view: 'settings', settingsTab: 'souls' };
  }

  if (hasAnyKeyword(content, INTEGRATION_KEYWORDS)) {
    return { view: 'settings', settingsTab: 'integrations' };
  }

  return { view: 'settings', settingsTab: 'integrations' };
}

export function createStartupIssue(title: string, message: string): StartupIssue {
  return {
    title,
    message,
    target: inferRecoveryTab(title, message),
  };
}
