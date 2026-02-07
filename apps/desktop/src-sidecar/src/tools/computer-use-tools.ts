import { z } from 'zod';
import { GoogleGenAI, Environment } from '@google/genai';
import { chromium, type Browser, type Page } from 'playwright';
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
      await driver.performAction({ name: 'navigate', args });
      return { log: `navigate(${JSON.stringify(args)})`, args };
    }
    case 'click':
    case 'left_click':
    case 'single_click': {
      const args = { x, y };
      await driver.performAction({ name: 'click_at', args });
      return { log: `click_at(${JSON.stringify(args)})`, args };
    }
    case 'double_click': {
      const args = { x, y };
      await driver.performAction({ name: 'click_at', args });
      await driver.performAction({ name: 'click_at', args });
      return { log: `double_click(${JSON.stringify(args)})`, args };
    }
    case 'right_click': {
      const args = { x, y };
      await driver.performAction({ name: 'click_at', args });
      return { log: `right_click_as_click(${JSON.stringify(args)})`, args };
    }
    case 'mouse_move':
    case 'hover': {
      const args = { x, y };
      await driver.performAction({ name: 'hover_at', args });
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
      await driver.performAction({ name: 'drag_and_drop', args });
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
      await driver.performAction({ name: 'type_text_at', args });
      return { log: `type_text_at(${JSON.stringify(args)})`, args };
    }
    case 'keypress':
    case 'key':
    case 'key_combination': {
      const keysRaw = actionInput.keys ?? actionInput.key ?? actionInput.key_code;
      const keys = Array.isArray(keysRaw) ? keysRaw.map(String) : [String(keysRaw || '')].filter(Boolean);
      const args = { keys };
      await driver.performAction({ name: 'key_combination', args });
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
        await driver.performAction({ name: 'scroll_at', args });
        return { log: `scroll_at(${JSON.stringify(args)})`, args };
      }
      const direction = String(actionInput.direction || 'down').toLowerCase().includes('up') ? 'up' : 'down';
      const args = { direction };
      await driver.performAction({ name: 'scroll_document', args });
      return { log: `scroll_document(${JSON.stringify(args)})`, args };
    }
    case 'go_back': {
      const args = {};
      await driver.performAction({ name: 'go_back', args });
      return { log: 'go_back()', args };
    }
    case 'go_forward': {
      const args = {};
      await driver.performAction({ name: 'go_forward', args });
      return { log: 'go_forward()', args };
    }
    case 'wait':
    case 'wait_5_seconds': {
      const args = {};
      await driver.performAction({ name: 'wait_5_seconds', args });
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
    }),

    requiresPermission: (): { type: 'network_request'; resource: string; reason: string } => ({
      type: 'network_request',
      resource: 'Computer Use',
      reason: 'Perform automated browsing to complete the requested task',
    }),

    execute: async (args: unknown, _context: ToolContext): Promise<ToolResult> => {
      const { goal, startUrl, maxSteps = 15, model } = args as {
        goal: string;
        startUrl?: string;
        maxSteps?: number;
        headless?: boolean;
        model?: string;
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

      let driver: BrowserDriver | null = null;

      // Get or create a Chrome instance for this session
      // Each session gets its own isolated Chrome with a dedicated profile
      // User's main browser is never touched

      try {
        driver = await ChromeCDPDriver.forSession(_context.sessionId);

        if (startUrl) {
          await driver.performAction({ name: 'navigate', args: { url: startUrl } });
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

      let steps = 0;
      let completed = false;
      let blocked = false;
      let blockedReason: string | undefined;
      const actions: string[] = [];
      const actionHistory: ActionHistoryEntry[] = [];
      const pagesVisited: string[] = [];
      let finalAnalysis = '';

      // Initial URL tracking
      if (startUrl) {
        pagesVisited.push(startUrl);
      }

      try {
        while (steps < maxSteps) {
          const screenshot = await driver.getScreenshot();
          const currentUrl = screenshot.url || await driver.getUrl();

          // Track visited pages
          if (currentUrl && !pagesVisited.includes(currentUrl)) {
            pagesVisited.push(currentUrl);
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
              break;
            }

            for (const call of functionCalls) {
              const name = call.name || 'unknown';
              const actionArgs = call.args || {};
              const action = { name, args: actionArgs };

              await driver.performAction(action);
              actions.push(`${name}(${JSON.stringify(actionArgs)})`);
              actionHistory.push({
                action: name,
                args: actionArgs,
                url: currentUrl,
              });
            }
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
              break;
            }

            const actionInput = (computerCall.action || {}) as Record<string, unknown>;
            const executed = await performProviderAction(driver, actionInput);
            actions.push(executed.log);
            actionHistory.push({
              action: parseActionType(actionInput),
              args: executed.args,
              url: currentUrl,
            });
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
              break;
            }

            const executed = await performProviderAction(driver, toolUse.input);
            actions.push(executed.log);
            actionHistory.push({
              action: parseActionType(toolUse.input),
              args: executed.args,
              url: currentUrl,
            });
          } else {
            return {
              success: false,
              error: `Computer use is not supported for provider "${providerContext.provider}".`,
            };
          }

          steps += 1;

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

        return {
          success: true,
          data: {
            completed,
            blocked,
            blockedReason,
            actions,
            pagesVisited,
            finalUrl: await driver.getUrl(),
            steps,
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
