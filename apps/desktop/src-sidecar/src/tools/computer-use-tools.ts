import { z } from 'zod';
import { GoogleGenAI, Environment } from '@google/genai';
import { chromium, type Browser, type Page } from 'playwright';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import { ChromeCDPDriver } from './chrome-cdp-driver.js';
import { eventEmitter } from '../event-emitter.js';

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

export function createComputerUseTool(
  getApiKey: () => string | null,
  getComputerUseModel: () => string
): ToolHandler {
  return {
    name: 'computer_use',
    description: 'Use a browser to complete a multi-step goal. Returns actions taken and final URL.',
    parameters: z.object({
      goal: z.string().describe('The task or goal to accomplish in the browser'),
      startUrl: z.string().optional().describe('Optional starting URL'),
      maxSteps: z.number().optional().describe('Maximum number of steps (default: 15)'),
      headless: z.boolean().optional().describe('Run browser headless (default: false)'),
    }),

    requiresPermission: (): { type: 'network_request'; resource: string; reason: string } => ({
      type: 'network_request',
      resource: 'Computer Use',
      reason: 'Perform automated browsing to complete the requested task',
    }),

    execute: async (args: unknown, _context: ToolContext): Promise<ToolResult> => {
      const { goal, startUrl, maxSteps = 15 } = args as {
        goal: string;
        startUrl?: string;
        maxSteps?: number;
        headless?: boolean;
      };

      const apiKey = getApiKey();
      if (!apiKey) {
        return { success: false, error: 'API key not set. Please configure an API key first.' };
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

      const ai = new GoogleGenAI({ apiKey });
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

          const response = await ai.models.generateContent({
            model: getComputerUseModel(),
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

          // Check for safety blocks
          const finishReason = response.candidates?.[0]?.finishReason;
          if (finishReason && String(finishReason).toLowerCase().includes('safety')) {
            blocked = true;
            blockedReason = String(finishReason);
            completed = true;
            break;
          }

          // Extract text response (analysis/reasoning)
          let textResponse = '';
          const candidate = response.candidates?.[0];
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              if ('text' in part && part.text) {
                textResponse = part.text;
              }
            }
          }

          // Check if task is complete (no function calls = Gemini decided to stop)
          const functionCalls = response.functionCalls;
          if (!functionCalls?.length) {
            completed = true;
            // Store the analysis if Gemini provided one
            if (textResponse && textResponse.length > 20) {
              finalAnalysis = textResponse;
              actions.push(`[Analysis]: ${textResponse}`);
            }
            break;
          }

          // Execute actions
          for (const call of functionCalls) {
            const name = call.name || 'unknown';
            const actionArgs = call.args || {};
            const action = { name, args: actionArgs };

            await driver.performAction(action);
            actions.push(`${name}(${JSON.stringify(actionArgs)})`);

            // Track action history
            actionHistory.push({
              action: name,
              args: actionArgs,
              url: currentUrl,
            });
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
  getApiKey: () => string | null,
  getComputerUseModel: () => string
): ToolHandler[] {
  return [createComputerUseTool(getApiKey, getComputerUseModel)];
}

function denormalize(coord: number, max: number): number {
  return Math.round((coord / 1000) * max);
}
