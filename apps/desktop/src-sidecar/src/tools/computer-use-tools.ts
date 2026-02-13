import { z } from 'zod';
import { GoogleGenAI, Environment } from '@google/genai';
import { chromium, type Browser, type Page } from 'playwright';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { mkdir, readFile, writeFile } from 'fs/promises';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import { ChromeCDPDriver } from './chrome-cdp-driver.js';
import { eventEmitter } from '../event-emitter.js';
import type { ProviderId } from '../types.js';

interface ComputerUseAction extends Record<string, unknown> {
  name: string;
  args: Record<string, unknown>;
}

interface ActionHistoryEntry {
  action: string;
  args: Record<string, unknown>;
  url: string;
  ts: number;
  signature: string;
}

interface ActionSafetyDecision {
  allowed: boolean;
  reason?: string;
}

interface BrowserRunCheckpoint {
  version: 1;
  sessionId: string;
  goal: string;
  provider: ProviderId;
  model: string;
  createdAt: number;
  updatedAt: number;
  steps: number;
  maxSteps: number;
  completed: boolean;
  blocked: boolean;
  blockedReason?: string;
  finalAnalysis?: string;
  lastUrl?: string;
  urlStabilityCount: number;
  actions: string[];
  pagesVisited: string[];
  actionHistory: ActionHistoryEntry[];
}

const ACTION_RETRY_LIMIT = 2;
const ACTION_REPEAT_LIMIT = 4;
const URL_STABILITY_LIMIT = 6;
const SCROLL_REPEAT_LIMIT = 3;

function getBrowserStateDir(context: ToolContext): string {
  const baseDir = context.appDataDir || join(homedir(), '.cowork');
  return join(baseDir, 'sessions', context.sessionId, 'browser');
}

function getBrowserCheckpointPath(context: ToolContext, overridePath?: string): string {
  if (overridePath && overridePath.trim().length > 0) {
    return overridePath.trim();
  }
  return join(getBrowserStateDir(context), 'computer-use-checkpoint.json');
}

async function loadBrowserCheckpoint(path: string): Promise<BrowserRunCheckpoint | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as BrowserRunCheckpoint;
    if (parsed && parsed.version === 1 && typeof parsed.goal === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveBrowserCheckpoint(path: string, checkpoint: BrowserRunCheckpoint): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

function actionSignature(action: string, args: Record<string, unknown>): string {
  const sortedEntries = Object.entries(args)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 8);
  return `${action}:${JSON.stringify(Object.fromEntries(sortedEntries))}`;
}

function classifyActionSafety(action: string, args: Record<string, unknown>): ActionSafetyDecision {
  const normalized = action.trim().toLowerCase();

  if (normalized === 'navigate' || normalized === 'open_web_browser') {
    const rawUrl = String(args.url ?? '').trim().toLowerCase();
    if (!rawUrl) {
      return { allowed: false, reason: 'Navigate action missing URL.' };
    }
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      return {
        allowed: false,
        reason: `Unsafe navigation target blocked (${rawUrl.split(':')[0] || 'unknown'} scheme).`,
      };
    }
  }

  if (normalized === 'key_combination') {
    const keys = Array.isArray(args.keys) ? args.keys.map(String).join('+').toLowerCase() : '';
    const blockedCombos = ['alt+f4', 'meta+q', 'cmd+q', 'control+q', 'ctrl+q'];
    if (blockedCombos.some((combo) => keys.includes(combo))) {
      return {
        allowed: false,
        reason: `Blocked unsafe key combination: ${keys}`,
      };
    }
  }

  return { allowed: true };
}

function isTransientBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes('timeout')
    || normalized.includes('timed out')
    || normalized.includes('navigation')
    || normalized.includes('context was destroyed')
    || normalized.includes('target closed')
    || normalized.includes('detached')
    || normalized.includes('temporar')
  );
}

async function performActionWithRetry(
  driver: BrowserDriver,
  action: ComputerUseAction,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= ACTION_RETRY_LIMIT; attempt += 1) {
    try {
      await driver.performAction(action);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientBrowserError(error) || attempt === ACTION_RETRY_LIMIT) {
        throw error;
      }
      const waitMs = 300 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'unknown action error'));
}

function detectBrowserBlocker(params: {
  currentUrl: string;
  previousUrl: string | null;
  actionHistory: ActionHistoryEntry[];
  currentUrlStabilityCount: number;
}): string | null {
  const normalizedUrl = params.currentUrl.toLowerCase();
  if (
    normalizedUrl.includes('/login')
    || normalizedUrl.includes('/signin')
    || normalizedUrl.includes('/auth')
    || normalizedUrl.includes('consent')
  ) {
    return 'Login/consent blocker detected. Cannot proceed without user authentication.';
  }

  if (params.currentUrlStabilityCount >= URL_STABILITY_LIMIT) {
    return `No navigation progress detected after ${params.currentUrlStabilityCount} steps on the same page.`;
  }

  if (params.actionHistory.length >= ACTION_REPEAT_LIMIT) {
    const recent = params.actionHistory.slice(-ACTION_REPEAT_LIMIT);
    const firstSignature = recent[0]?.signature;
    if (firstSignature && recent.every((entry) => entry.signature === firstSignature)) {
      return `Loop detected: repeated action pattern ${ACTION_REPEAT_LIMIT} times.`;
    }
  }

  if (params.actionHistory.length >= SCROLL_REPEAT_LIMIT) {
    const recentScrolls = params.actionHistory
      .slice(-SCROLL_REPEAT_LIMIT)
      .filter((entry) => entry.action === 'scroll_document' || entry.action === 'scroll_at');
    if (
      recentScrolls.length === SCROLL_REPEAT_LIMIT
      && recentScrolls.every((entry) => entry.url === params.currentUrl)
    ) {
      return `Scroll loop detected on ${params.currentUrl}.`;
    }
  }

  if (params.previousUrl && params.previousUrl !== params.currentUrl) {
    return null;
  }

  return null;
}

const COMPUTER_USE_SYSTEM_PROMPT = `You are an expert browser research agent. Efficiently gather information and complete the task.

## TASK
{goal}

## CRITICAL RULES
1. **NO LOOPS**: If you see the same action repeated in recent history, STOP and provide your analysis immediately.
2. **LOGIN/PAYWALL**: If you see a login form, paywall, or "sign in required" - DO NOT try to login. Instead, describe what you can see and provide analysis with available information.
3. **BLOCKED CONTENT**: If content is blocked, restricted, or requires authentication - report this and analyze whatever IS visible.
4. **MAX 3 SCROLLS**: Only scroll a page 3 times max in one direction, then conclude or navigate elsewhere.
5. **SIMPLE GOALS**: For simple goals like "open X and confirm", just navigate and confirm - no need for extensive exploration.

## WHEN TO STOP IMMEDIATELY
- The page has loaded and you can confirm the goal is achieved
- You see a login/signup form blocking content
- You've scrolled the same page 3+ times
- You're repeating the same actions
- You have enough information to answer the query
- The page shows "access denied", "please login", "subscribe to view", etc.

## ACTIONS (coordinates use 0-1000 normalized grid)
**Navigation:** navigate(url), go_back(), go_forward(), open_web_browser(url)
**Mouse:** click_at(x, y), hover_at(x, y), drag_and_drop(x, y, destination_x, destination_y)
**Keyboard:** type_text_at(x, y, text, press_enter, clear_before_typing), key_combination(keys)
**Scrolling:** scroll_document(direction), scroll_at(x, y, direction, magnitude)
**Waiting:** wait_5_seconds()

## OUTPUT
When task is complete OR you've exhausted options, respond with ONLY text analysis (NO function calls):
- What you found relevant to the goal
- What content was visible
- Any limitations encountered
- Confirmation of goal achievement (if applicable)
`;

interface BrowserDriver {
  getScreenshot(): Promise<{ data: string; mimeType: string; url?: string }>;
  getUrl(): Promise<string>;
  performAction(action: ComputerUseAction): Promise<void>;
  close(): Promise<void>;
}

// PlaywrightDriver kept as fallback option - can be enabled via environment variable
export class PlaywrightDriver implements BrowserDriver {
  private browser: Browser;
  private page: Page;

  private constructor(browser: Browser, page: Page) {
    this.browser = browser;
    this.page = page;
  }

  static async create(startUrl?: string, headless = false): Promise<PlaywrightDriver> {
    const browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    if (startUrl) {
      await page.goto(startUrl);
    }
    return new PlaywrightDriver(browser, page);
  }

  async getScreenshot(): Promise<{ data: string; mimeType: string; url?: string }> {
    const screenshot = await this.page.screenshot({ type: 'png' });
    return {
      data: Buffer.from(screenshot).toString('base64'),
      mimeType: 'image/png',
      url: this.page.url(),
    };
  }

  async getUrl(): Promise<string> {
    return this.page.url();
  }

  async performAction(action: ComputerUseAction): Promise<void> {
    const { name, args } = action;
    const x = denormalize(Number(args.x ?? 0), 1440);
    const y = denormalize(Number(args.y ?? 0), 900);

    switch (name) {
      case 'open_web_browser': {
        const url = String(args.url ?? '');
        if (url) {
          await this.page.goto(url);
        }
        break;
      }
      case 'navigate': {
        const url = String(args.url ?? '');
        if (url) {
          await this.page.goto(url);
        }
        break;
      }
      case 'search': {
        const query = String(args.query ?? '');
        if (query) {
          const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          await this.page.goto(url);
        }
        break;
      }
      case 'click_at':
        await this.page.mouse.click(x, y);
        break;
      case 'hover_at':
        await this.page.mouse.move(x, y);
        break;
      case 'type_text_at': {
        await this.page.mouse.click(x, y);
        if (args.clear_text) {
          await this.page.keyboard.press('Control+a');
        }
        await this.page.keyboard.type(String(args.text ?? ''));
        if (args.press_enter) {
          await this.page.keyboard.press('Enter');
        }
        break;
      }
      case 'scroll_document': {
        const direction = String(args.direction ?? 'down');
        const delta = direction === 'down' ? 500 : -500;
        await this.page.mouse.wheel(0, delta);
        break;
      }
      case 'scroll_at': {
        const direction = String(args.direction ?? 'down');
        const amount = Number(args.amount ?? 500);
        const delta = direction === 'down' ? amount : -amount;
        await this.page.mouse.move(x, y);
        await this.page.mouse.wheel(0, delta);
        break;
      }
      case 'drag_and_drop': {
        const toX = denormalize(Number(args.to_x ?? 0), 1440);
        const toY = denormalize(Number(args.to_y ?? 0), 900);
        await this.page.mouse.move(x, y);
        await this.page.mouse.down();
        await this.page.mouse.move(toX, toY);
        await this.page.mouse.up();
        break;
      }
      case 'go_back':
        await this.page.goBack();
        break;
      case 'go_forward':
        await this.page.goForward();
        break;
      case 'key_combination': {
        const keys = Array.isArray(args.keys) ? args.keys.map(String) : [];
        if (keys.length > 0) {
          await this.page.keyboard.press(keys.join('+'));
        }
        break;
      }
      case 'wait_5_seconds':
        await new Promise((resolve) => setTimeout(resolve, 5000));
        break;
    }

    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  async close(): Promise<void> {
    await this.browser.close().catch(() => undefined);
  }
}

// ChromeExtensionDriver removed - now using session-based CDP instances
// Each session gets its own Chrome instance via ChromeCDPDriver.forSession()

const COMPUTER_USE_VIEWPORT = {
  width: 1440,
  height: 900,
};

function ensureOpenAIBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl || 'https://api.openai.com').trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
}

function normalizeCoordinateForDriver(raw: unknown, axis: 'x' | 'y'): number {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return 0;
  const max = axis === 'x' ? COMPUTER_USE_VIEWPORT.width : COMPUTER_USE_VIEWPORT.height;
  if (numeric <= 1 && numeric >= 0) {
    return Math.round(numeric * 1000);
  }
  const normalized = Math.round((numeric / max) * 1000);
  return Math.max(0, Math.min(1000, normalized));
}

function parseActionType(actionInput: Record<string, unknown>): string {
  const action = actionInput.action || actionInput.type || actionInput.name || '';
  return String(action).toLowerCase().trim();
}

async function performProviderAction(
  driver: BrowserDriver,
  actionInput: Record<string, unknown>,
): Promise<{ log: string; args: Record<string, unknown> }> {
  const actionType = parseActionType(actionInput);
  const x = normalizeCoordinateForDriver(actionInput.x, 'x');
  const y = normalizeCoordinateForDriver(actionInput.y, 'y');

  switch (actionType) {
    case 'navigate':
    case 'open_url':
    case 'open_web_browser': {
      const url = String(actionInput.url || actionInput.target_url || '');
      if (!url) throw new Error('Computer use navigate action missing URL.');
      const args = { url };
      await performActionWithRetry(driver, { name: 'navigate', args });
      return { log: `navigate(${JSON.stringify(args)})`, args };
    }
    case 'click':
    case 'left_click':
    case 'single_click': {
      const args = { x, y };
      await performActionWithRetry(driver, { name: 'click_at', args });
      return { log: `click_at(${JSON.stringify(args)})`, args };
    }
    case 'double_click': {
      const args = { x, y };
      await performActionWithRetry(driver, { name: 'click_at', args });
      await performActionWithRetry(driver, { name: 'click_at', args });
      return { log: `double_click(${JSON.stringify(args)})`, args };
    }
    case 'right_click': {
      const args = { x, y };
      await performActionWithRetry(driver, { name: 'click_at', args });
      return { log: `right_click_as_click(${JSON.stringify(args)})`, args };
    }
    case 'mouse_move':
    case 'hover': {
      const args = { x, y };
      await performActionWithRetry(driver, { name: 'hover_at', args });
      return { log: `hover_at(${JSON.stringify(args)})`, args };
    }
    case 'drag':
    case 'left_click_drag':
    case 'drag_and_drop': {
      const destinationX = normalizeCoordinateForDriver(
        actionInput.destination_x ?? actionInput.to_x ?? actionInput.end_x,
        'x',
      );
      const destinationY = normalizeCoordinateForDriver(
        actionInput.destination_y ?? actionInput.to_y ?? actionInput.end_y,
        'y',
      );
      const args = { x, y, destination_x: destinationX, destination_y: destinationY };
      await performActionWithRetry(driver, { name: 'drag_and_drop', args });
      return { log: `drag_and_drop(${JSON.stringify(args)})`, args };
    }
    case 'type':
    case 'type_text':
    case 'input_text': {
      const text = String(actionInput.text || actionInput.value || '');
      const pressEnter = Boolean(actionInput.press_enter || actionInput.submit);
      const args = {
        x,
        y,
        text,
        press_enter: pressEnter,
        clear_before_typing: Boolean(actionInput.clear_before_typing || actionInput.clear_text),
      };
      await performActionWithRetry(driver, { name: 'type_text_at', args });
      return { log: `type_text_at(${JSON.stringify(args)})`, args };
    }
    case 'keypress':
    case 'key':
    case 'key_combination': {
      const keysRaw = actionInput.keys ?? actionInput.key ?? actionInput.key_code;
      const keys = Array.isArray(keysRaw) ? keysRaw.map(String) : [String(keysRaw || '')].filter(Boolean);
      const args = { keys };
      await performActionWithRetry(driver, { name: 'key_combination', args });
      return { log: `key_combination(${JSON.stringify(args)})`, args };
    }
    case 'scroll':
    case 'scroll_at':
    case 'scroll_document': {
      const deltaY = Number(actionInput.scroll_y ?? actionInput.delta_y ?? actionInput.dy ?? actionInput.amount ?? 0);
      if (Number.isFinite(deltaY) && deltaY !== 0) {
        const args = {
          x,
          y,
          direction: deltaY > 0 ? 'down' : 'up',
          magnitude: Math.max(50, Math.min(2000, Math.abs(Math.round(deltaY)))),
        };
        await performActionWithRetry(driver, { name: 'scroll_at', args });
        return { log: `scroll_at(${JSON.stringify(args)})`, args };
      }
      const direction = String(actionInput.direction || 'down').toLowerCase().includes('up') ? 'up' : 'down';
      const args = { direction };
      await performActionWithRetry(driver, { name: 'scroll_document', args });
      return { log: `scroll_document(${JSON.stringify(args)})`, args };
    }
    case 'go_back': {
      const args = {};
      await performActionWithRetry(driver, { name: 'go_back', args });
      return { log: 'go_back()', args };
    }
    case 'go_forward': {
      const args = {};
      await performActionWithRetry(driver, { name: 'go_forward', args });
      return { log: 'go_forward()', args };
    }
    case 'wait':
    case 'wait_5_seconds': {
      const args = {};
      await performActionWithRetry(driver, { name: 'wait_5_seconds', args });
      return { log: 'wait_5_seconds()', args };
    }
    default:
      throw new Error(`Unsupported computer-use action: ${actionType || 'unknown'}`);
  }
}

function extractOpenAIOutputText(payload: Record<string, unknown>): string {
  const outputText = payload.output_text;
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text =
        (part as { text?: unknown }).text ||
        (part as { output_text?: unknown }).output_text;
      if (typeof text === 'string' && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

function extractAnthropicOutputText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && typeof part === 'object' && (part as { type?: unknown }).type === 'text')
    .map((part) => String((part as { text?: unknown }).text || '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function findAnthropicToolUse(content: unknown): { id: string; input: Record<string, unknown> } | null {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const type = String((part as { type?: unknown }).type || '');
    if (type !== 'tool_use') continue;
    const id = String((part as { id?: unknown }).id || '');
    const input = (part as { input?: unknown }).input;
    if (!id || !input || typeof input !== 'object') continue;
    return { id, input: input as Record<string, unknown> };
  }
  return null;
}

function createComputerUseProviderContext(
  provider: ProviderId,
  modelOverride: string | undefined,
  getProviderApiKey: (providerId: ProviderId) => string | null,
  getProviderBaseUrl: (providerId: ProviderId) => string | undefined,
  getGoogleApiKey: () => string | null,
  getComputerUseModel: () => string,
  getSessionModel: () => string,
): {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
} | null {
  if (provider === 'google') {
    const apiKey = getGoogleApiKey() || getProviderApiKey('google');
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: modelOverride || getComputerUseModel(),
      baseUrl: getProviderBaseUrl('google'),
    };
  }

  if (provider === 'openai') {
    const apiKey = getProviderApiKey('openai');
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: modelOverride || getSessionModel() || 'computer-use-preview',
      baseUrl: getProviderBaseUrl('openai'),
    };
  }

  if (provider === 'anthropic') {
    const apiKey = getProviderApiKey('anthropic');
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: modelOverride || getSessionModel() || 'claude-sonnet-4-5',
      baseUrl: getProviderBaseUrl('anthropic'),
    };
  }

  // Fallback: for providers without native computer-use integration,
  // allow Google-backed computer-use if a Google key is configured.
  const googleFallbackKey = getGoogleApiKey() || getProviderApiKey('google');
  if (!googleFallbackKey) return null;
  return {
    provider: 'google',
    apiKey: googleFallbackKey,
    model: modelOverride || getComputerUseModel(),
    baseUrl: getProviderBaseUrl('google'),
  };
}

export function createComputerUseTool(
  getProvider: () => ProviderId,
  getProviderApiKey: (provider: ProviderId) => string | null,
  getProviderBaseUrl: (provider: ProviderId) => string | undefined,
  getGoogleApiKey: () => string | null,
  getComputerUseModel: () => string,
  getSessionModel: () => string,
): ToolHandler {
  return {
    name: 'computer_use',
    description: 'Use a browser to complete a multi-step goal. Returns actions taken and final URL.',
    parameters: z.object({
      goal: z.string().describe('The task or goal to accomplish in the browser'),
      startUrl: z.string().optional().describe('Optional starting URL'),
      maxSteps: z.number().optional().describe('Maximum number of steps (default: 15)'),
      headless: z.boolean().optional().describe('Run browser headless (default: false)'),
      model: z.string().optional().describe('Optional model override'),
      resumeFromCheckpoint: z
        .boolean()
        .optional()
        .describe('Resume this browser run from the last saved checkpoint'),
      checkpointPath: z
        .string()
        .optional()
        .describe('Optional custom checkpoint path for run recovery'),
    }),

    requiresPermission: (): { type: 'network_request'; resource: string; reason: string } => ({
      type: 'network_request',
      resource: 'Computer Use',
      reason: 'Perform automated browsing to complete the requested task',
    }),

    execute: async (args: unknown, _context: ToolContext): Promise<ToolResult> => {
      const {
        goal,
        startUrl,
        maxSteps = 15,
        model,
        resumeFromCheckpoint = false,
        checkpointPath: checkpointPathOverride,
      } = args as {
        goal: string;
        startUrl?: string;
        maxSteps?: number;
        headless?: boolean;
        model?: string;
        resumeFromCheckpoint?: boolean;
        checkpointPath?: string;
      };

      const provider = getProvider();
      const providerContext = createComputerUseProviderContext(
        provider,
        model,
        getProviderApiKey,
        getProviderBaseUrl,
        getGoogleApiKey,
        getComputerUseModel,
        getSessionModel,
      );
      if (!providerContext) {
        return {
          success: false,
          error: `Computer use is not configured for provider "${provider}".`,
        };
      }

      const checkpointPath = getBrowserCheckpointPath(_context, checkpointPathOverride);
      const requestedMaxSteps = Math.max(1, Math.round(Number(maxSteps) || 15));
      const checkpointCandidate = resumeFromCheckpoint
        ? await loadBrowserCheckpoint(checkpointPath)
        : null;
      const canResumeFromCheckpoint = Boolean(
        checkpointCandidate
          && checkpointCandidate.goal === goal
          && checkpointCandidate.completed === false,
      );
      const effectiveMaxSteps = canResumeFromCheckpoint
        ? Math.max(requestedMaxSteps, checkpointCandidate?.maxSteps || requestedMaxSteps)
        : requestedMaxSteps;
      const resumeStartUrl = canResumeFromCheckpoint
        ? checkpointCandidate?.lastUrl || checkpointCandidate?.pagesVisited[checkpointCandidate.pagesVisited.length - 1]
        : startUrl;

      let driver: BrowserDriver | null = null;

      // Get or create a Chrome instance for this session
      // Each session gets its own isolated Chrome with a dedicated profile
      // User's main browser is never touched

      try {
        driver = await ChromeCDPDriver.forSession(_context.sessionId);

        if (resumeStartUrl) {
          await performActionWithRetry(driver, { name: 'navigate', args: { url: resumeStartUrl } });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to start Chrome for browser automation:\n${errorMsg}\n\n` +
                 `Please ensure Google Chrome is installed.`,
        };
      }

      if (!driver) {
        return {
          success: false,
          error: `Google Chrome is required for browser automation but could not be started.\n\n` +
                 `Please install Google Chrome from:\n` +
                 `https://www.google.com/chrome/`,
        };
      }

      let steps = canResumeFromCheckpoint ? checkpointCandidate?.steps || 0 : 0;
      let completed = false;
      let blocked = false;
      let blockedReason: string | undefined = canResumeFromCheckpoint
        ? checkpointCandidate?.blockedReason
        : undefined;
      const actions: string[] = canResumeFromCheckpoint
        ? [...(checkpointCandidate?.actions || [])]
        : [];
      const actionHistory: ActionHistoryEntry[] = canResumeFromCheckpoint
        ? [...(checkpointCandidate?.actionHistory || [])]
        : [];
      const pagesVisited: string[] = canResumeFromCheckpoint
        ? [...(checkpointCandidate?.pagesVisited || [])]
        : [];
      let finalAnalysis = '';
      let lastObservedUrl: string | null = canResumeFromCheckpoint
        ? checkpointCandidate?.lastUrl || null
        : null;
      let urlStabilityCount = canResumeFromCheckpoint ? checkpointCandidate?.urlStabilityCount || 0 : 0;

      // Initial URL tracking
      if (resumeStartUrl && !pagesVisited.includes(resumeStartUrl)) {
        pagesVisited.push(resumeStartUrl);
      }
      if (startUrl && !pagesVisited.includes(startUrl)) {
        pagesVisited.push(startUrl);
      }

      const persistCheckpoint = async (
        status: 'running' | 'blocked' | 'completed' | 'recovered',
        currentUrl?: string,
      ): Promise<void> => {
        const now = Date.now();
        const checkpoint: BrowserRunCheckpoint = {
          version: 1,
          sessionId: _context.sessionId,
          goal,
          provider: providerContext.provider,
          model: providerContext.model,
          createdAt: checkpointCandidate?.createdAt || now,
          updatedAt: now,
          steps,
          maxSteps: effectiveMaxSteps,
          completed,
          blocked,
          blockedReason,
          finalAnalysis,
          lastUrl: currentUrl || lastObservedUrl || undefined,
          urlStabilityCount,
          actions: [...actions],
          pagesVisited: [...pagesVisited],
          actionHistory: [...actionHistory],
        };
        await saveBrowserCheckpoint(checkpointPath, checkpoint);
        eventEmitter.browserCheckpoint(_context.sessionId, {
          checkpointPath,
          step: steps,
          maxSteps: effectiveMaxSteps,
          url: checkpoint.lastUrl,
          recoverable: !completed || blocked,
        });
        if (status === 'recovered') {
          eventEmitter.browserProgress(_context.sessionId, {
            status: 'recovered',
            step: steps,
            maxSteps: effectiveMaxSteps,
            url: checkpoint.lastUrl,
            detail: 'Recovered browser run from checkpoint.',
          });
        }
      };

      try {
        if (canResumeFromCheckpoint) {
          await persistCheckpoint('recovered', resumeStartUrl || lastObservedUrl || undefined);
        }

        while (steps < effectiveMaxSteps) {
          const screenshot = await driver.getScreenshot();
          const currentUrl = screenshot.url || await driver.getUrl();
          if (lastObservedUrl && currentUrl === lastObservedUrl) {
            urlStabilityCount += 1;
          } else {
            urlStabilityCount = 0;
          }
          lastObservedUrl = currentUrl;

          // Track visited pages
          if (currentUrl && !pagesVisited.includes(currentUrl)) {
            pagesVisited.push(currentUrl);
          }

          eventEmitter.browserProgress(_context.sessionId, {
            status: 'running',
            step: steps,
            maxSteps: effectiveMaxSteps,
            url: currentUrl,
            detail: `Running browser step ${steps + 1} of ${effectiveMaxSteps}.`,
          });

          const blockerReason = detectBrowserBlocker({
            currentUrl,
            previousUrl: pagesVisited.length > 1 ? pagesVisited[pagesVisited.length - 2] || null : null,
            actionHistory,
            currentUrlStabilityCount: urlStabilityCount,
          });
          if (blockerReason) {
            blocked = true;
            blockedReason = blockerReason;
            completed = true;
            eventEmitter.browserBlocked(_context.sessionId, {
              reason: blockerReason,
              step: steps,
              maxSteps: effectiveMaxSteps,
              url: currentUrl,
              checkpointPath,
            });
            await persistCheckpoint('blocked', currentUrl);
            break;
          }

          // Emit screenshot for live browser view
          eventEmitter.browserViewScreenshot(_context.sessionId, {
            data: screenshot.data,
            mimeType: screenshot.mimeType,
            url: currentUrl,
            timestamp: Date.now(),
          });

          // Build prompt with system instructions and action history
          let prompt = COMPUTER_USE_SYSTEM_PROMPT.replace('{goal}', goal);
          prompt += `\n\nCurrent URL: ${currentUrl}`;

          // Add recent action history for context
          if (actionHistory.length > 0) {
            const recent = actionHistory.slice(-5);
            prompt += '\n\n## RECENT ACTIONS';
            for (const entry of recent) {
              prompt += `\n- ${entry.action}: ${JSON.stringify(entry.args)}`;
            }

            // Detect loops - if last 3 actions are the same type, warn strongly
            if (actionHistory.length >= 3) {
              const lastThree = actionHistory.slice(-3).map(a => a.action);
              if (lastThree.every(a => a === lastThree[0])) {
                prompt += `\n\n⚠️ WARNING: You are STUCK IN A LOOP repeating '${lastThree[0]}'. ` +
                  `STOP and provide your final analysis NOW with NO function calls.`;
              }
            }
          }

          if (providerContext.provider === 'google') {
            const ai = new GoogleGenAI({ apiKey: providerContext.apiKey });
            const response = await ai.models.generateContent({
              model: providerContext.model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: screenshot.mimeType,
                        data: screenshot.data,
                      },
                    },
                  ],
                },
              ],
              config: {
                tools: [
                  {
                    computerUse: { environment: Environment.ENVIRONMENT_BROWSER },
                  },
                ],
              },
            });

            const finishReason = response.candidates?.[0]?.finishReason;
            if (finishReason && String(finishReason).toLowerCase().includes('safety')) {
              blocked = true;
              blockedReason = String(finishReason);
              completed = true;
              eventEmitter.browserBlocked(_context.sessionId, {
                reason: blockedReason,
                step: steps,
                maxSteps: effectiveMaxSteps,
                url: currentUrl,
                checkpointPath,
              });
              await persistCheckpoint('blocked', currentUrl);
              break;
            }

            let textResponse = '';
            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts) {
              for (const part of candidate.content.parts) {
                if ('text' in part && part.text) {
                  textResponse = part.text;
                }
              }
            }

            const functionCalls = response.functionCalls;
            if (!functionCalls?.length) {
              completed = true;
              if (textResponse && textResponse.length > 20) {
                finalAnalysis = textResponse;
                actions.push(`[Analysis]: ${textResponse}`);
              }
              eventEmitter.browserProgress(_context.sessionId, {
                status: 'completed',
                step: steps,
                maxSteps: effectiveMaxSteps,
                url: currentUrl,
                detail: 'Model returned final browser analysis.',
              });
              await persistCheckpoint('completed', currentUrl);
              break;
            }

            for (const call of functionCalls) {
              const name = call.name || 'unknown';
              const actionArgs = call.args || {};
              const safety = classifyActionSafety(name, actionArgs);
              if (!safety.allowed) {
                blocked = true;
                blockedReason = safety.reason || `Blocked unsafe action: ${name}`;
                completed = true;
                eventEmitter.browserBlocked(_context.sessionId, {
                  reason: blockedReason,
                  step: steps,
                  maxSteps: effectiveMaxSteps,
                  url: currentUrl,
                  checkpointPath,
                });
                await persistCheckpoint('blocked', currentUrl);
                break;
              }
              const action = { name, args: actionArgs };

              await performActionWithRetry(driver, action);
              actions.push(`${name}(${JSON.stringify(actionArgs)})`);
              actionHistory.push({
                action: name,
                args: actionArgs,
                url: currentUrl,
                ts: Date.now(),
                signature: actionSignature(name, actionArgs),
              });
            }
            if (completed) break;
          } else if (providerContext.provider === 'openai') {
            const endpoint = `${ensureOpenAIBaseUrl(providerContext.baseUrl)}/responses`;
            const openaiPrompt =
              `${COMPUTER_USE_SYSTEM_PROMPT.replace('{goal}', goal)}\n\nCurrent URL: ${currentUrl}`;

            const openaiResponse = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${providerContext.apiKey}`,
              },
              body: JSON.stringify({
                model: providerContext.model,
                input: [
                  {
                    role: 'user',
                    content: [
                      { type: 'input_text', text: openaiPrompt },
                      { type: 'input_image', image_url: `data:${screenshot.mimeType};base64,${screenshot.data}` },
                    ],
                  },
                ],
                tools: [
                  {
                    type: 'computer_use_preview',
                    environment: 'browser',
                    display_width: COMPUTER_USE_VIEWPORT.width,
                    display_height: COMPUTER_USE_VIEWPORT.height,
                  },
                ],
              }),
            });

            const openaiText = await openaiResponse.text();
            if (!openaiResponse.ok) {
              return {
                success: false,
                error: `OpenAI computer_use failed (${openaiResponse.status}): ${openaiText}`,
              };
            }

            const payload = JSON.parse(openaiText) as Record<string, unknown>;
            const output = Array.isArray(payload.output) ? payload.output : [];
            const computerCall = output.find(
              (item) => item && typeof item === 'object' && (item as { type?: unknown }).type === 'computer_call',
            ) as Record<string, unknown> | undefined;

            if (!computerCall) {
              completed = true;
              const textResponse = extractOpenAIOutputText(payload);
              if (textResponse) {
                finalAnalysis = textResponse;
                actions.push(`[Analysis]: ${textResponse}`);
              }
              eventEmitter.browserProgress(_context.sessionId, {
                status: 'completed',
                step: steps,
                maxSteps: effectiveMaxSteps,
                url: currentUrl,
                detail: 'Provider returned final browser analysis.',
              });
              await persistCheckpoint('completed', currentUrl);
              break;
            }

            const actionInput = (computerCall.action || {}) as Record<string, unknown>;
            const actionType = parseActionType(actionInput);
            const safety = classifyActionSafety(actionType, actionInput);
            if (!safety.allowed) {
              blocked = true;
              blockedReason = safety.reason || `Blocked unsafe action: ${actionType}`;
              completed = true;
              eventEmitter.browserBlocked(_context.sessionId, {
                reason: blockedReason,
                step: steps,
                maxSteps: effectiveMaxSteps,
                url: currentUrl,
                checkpointPath,
              });
              await persistCheckpoint('blocked', currentUrl);
              break;
            }
            const executed = await performProviderAction(driver, actionInput);
            actions.push(executed.log);
            actionHistory.push({
              action: actionType,
              args: executed.args,
              url: currentUrl,
              ts: Date.now(),
              signature: actionSignature(actionType, executed.args),
            });
            if (completed) break;
          } else if (providerContext.provider === 'anthropic') {
            const anthropicPrompt =
              `${COMPUTER_USE_SYSTEM_PROMPT.replace('{goal}', goal)}\n\nCurrent URL: ${currentUrl}`;

            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': providerContext.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'computer-use-2025-01-24',
              },
              body: JSON.stringify({
                model: providerContext.model,
                max_tokens: 1400,
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: anthropicPrompt },
                      {
                        type: 'image',
                        source: {
                          type: 'base64',
                          media_type: screenshot.mimeType,
                          data: screenshot.data,
                        },
                      },
                    ],
                  },
                ],
                tools: [
                  {
                    type: 'computer_20250124',
                    name: 'computer',
                    display_width_px: COMPUTER_USE_VIEWPORT.width,
                    display_height_px: COMPUTER_USE_VIEWPORT.height,
                    display_number: 1,
                  },
                ],
              }),
            });

            const bodyText = await response.text();
            if (!response.ok) {
              return {
                success: false,
                error: `Anthropic computer_use failed (${response.status}): ${bodyText}`,
              };
            }

            const payload = JSON.parse(bodyText) as {
              stop_reason?: string;
              content?: unknown;
            };
            if (String(payload.stop_reason || '').toLowerCase().includes('safety')) {
              blocked = true;
              blockedReason = String(payload.stop_reason);
              completed = true;
              eventEmitter.browserBlocked(_context.sessionId, {
                reason: blockedReason,
                step: steps,
                maxSteps: effectiveMaxSteps,
                url: currentUrl,
                checkpointPath,
              });
              await persistCheckpoint('blocked', currentUrl);
              break;
            }

            const toolUse = findAnthropicToolUse(payload.content);
            if (!toolUse) {
              completed = true;
              const textResponse = extractAnthropicOutputText(payload.content);
              if (textResponse) {
                finalAnalysis = textResponse;
                actions.push(`[Analysis]: ${textResponse}`);
              }
              eventEmitter.browserProgress(_context.sessionId, {
                status: 'completed',
                step: steps,
                maxSteps: effectiveMaxSteps,
                url: currentUrl,
                detail: 'Provider returned final browser analysis.',
              });
              await persistCheckpoint('completed', currentUrl);
              break;
            }

            const actionType = parseActionType(toolUse.input);
            const safety = classifyActionSafety(actionType, toolUse.input);
            if (!safety.allowed) {
              blocked = true;
              blockedReason = safety.reason || `Blocked unsafe action: ${actionType}`;
              completed = true;
              eventEmitter.browserBlocked(_context.sessionId, {
                reason: blockedReason,
                step: steps,
                maxSteps: effectiveMaxSteps,
                url: currentUrl,
                checkpointPath,
              });
              await persistCheckpoint('blocked', currentUrl);
              break;
            }
            const executed = await performProviderAction(driver, toolUse.input);
            actions.push(executed.log);
            actionHistory.push({
              action: actionType,
              args: executed.args,
              url: currentUrl,
              ts: Date.now(),
              signature: actionSignature(actionType, executed.args),
            });
            if (completed) break;
          } else {
            return {
              success: false,
              error: `Computer use is not supported for provider "${providerContext.provider}".`,
            };
          }

          steps += 1;
          await persistCheckpoint('running', lastObservedUrl || undefined);
          eventEmitter.browserProgress(_context.sessionId, {
            status: 'running',
            step: steps,
            maxSteps: effectiveMaxSteps,
            url: lastObservedUrl || undefined,
            lastAction: actions.length > 0 ? actions[actions.length - 1] : undefined,
            detail: 'Browser step executed.',
          });

          // Small delay between iterations to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // If we exited the loop without a proper completion, note it in result
        // (max steps reached)

        // Emit final screenshot to show the end state
        try {
          const finalScreenshot = await driver.getScreenshot();
          const finalUrl = finalScreenshot.url || await driver.getUrl();
          eventEmitter.browserViewScreenshot(_context.sessionId, {
            data: finalScreenshot.data,
            mimeType: finalScreenshot.mimeType,
            url: finalUrl,
            timestamp: Date.now(),
          });
        } catch {
          // Ignore screenshot errors at the end
        }

        const finalUrl = await driver.getUrl();
        await persistCheckpoint(
          blocked ? 'blocked' : completed ? 'completed' : 'running',
          finalUrl,
        );
        if (!completed && !blocked && steps >= effectiveMaxSteps) {
          eventEmitter.browserProgress(_context.sessionId, {
            status: 'running',
            step: steps,
            maxSteps: effectiveMaxSteps,
            url: finalUrl,
            detail: 'Stopped after reaching maximum step budget. Resume is available from checkpoint.',
          });
        }

        return {
          success: true,
          data: {
            completed,
            blocked,
            blockedReason,
            actions,
            actionHistory,
            pagesVisited,
            finalUrl,
            steps,
            maxSteps: effectiveMaxSteps,
            checkpointPath,
            resumedFromCheckpoint: canResumeFromCheckpoint,
            sessionId: _context.sessionId,
            ...(finalAnalysis && { analysis: finalAnalysis }),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      // Note: We don't close the driver here - it's reused for the entire session
      // The Chrome instance will be cleaned up when the session ends
    },
  };
}

export function createComputerUseTools(
  getProvider: () => ProviderId,
  getProviderApiKey: (provider: ProviderId) => string | null,
  getProviderBaseUrl: (provider: ProviderId) => string | undefined,
  getGoogleApiKey: () => string | null,
  getComputerUseModel: () => string,
  getSessionModel: () => string,
): ToolHandler[] {
  return [
    createComputerUseTool(
      getProvider,
      getProviderApiKey,
      getProviderBaseUrl,
      getGoogleApiKey,
      getComputerUseModel,
      getSessionModel,
    ),
  ];
}

function denormalize(coord: number, max: number): number {
  return Math.round((coord / 1000) * max);
}
