import { z } from 'zod';
import { GoogleGenAI, Environment } from '@google/genai';
import { chromium, type Browser, type Page } from 'playwright';
import type { ToolHandler, ToolContext, ToolResult } from '@gemini-cowork/core';
import { chromeBridge } from '../chrome-bridge.js';
import { ChromeCDPDriver, checkChromeAvailable } from './chrome-cdp-driver.js';
import { ensureChromeWithDebugging } from './chrome-launcher.js';
import { eventEmitter } from '../event-emitter.js';

interface ComputerUseAction extends Record<string, unknown> {
  name: string;
  args: Record<string, unknown>;
}

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

class ChromeExtensionDriver implements BrowserDriver {
  private lastWidth = 0;
  private lastHeight = 0;

  async getScreenshot(): Promise<{ data: string; mimeType: string; url?: string }> {
    const result = await chromeBridge.requestScreenshot();
    this.lastWidth = result.width ?? this.lastWidth;
    this.lastHeight = result.height ?? this.lastHeight;
    return {
      data: result.data,
      mimeType: result.mimeType || 'image/png',
      url: result.url,
    };
  }

  async getUrl(): Promise<string> {
    const result = await chromeBridge.requestScreenshot();
    return result.url || '';
  }

  async performAction(action: ComputerUseAction): Promise<void> {
    const adjusted = this.denormalizeAction(action);
    await chromeBridge.performAction(adjusted);
  }

  async close(): Promise<void> {
    // No-op for extension driver
  }

  private denormalizeAction(action: ComputerUseAction): ComputerUseAction {
    const width = this.lastWidth || 1000;
    const height = this.lastHeight || 1000;
    const args = { ...action.args };

    const mapCoord = (value: unknown, max: number) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return value;
      return Math.round((num / 1000) * max);
    };

    if ('x' in args) args.x = mapCoord(args.x, width);
    if ('y' in args) args.y = mapCoord(args.y, height);
    if ('to_x' in args) args.to_x = mapCoord(args.to_x, width);
    if ('to_y' in args) args.to_y = mapCoord(args.to_y, height);

    return { ...action, args };
  }
}

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
      let driverType: 'cdp' | 'chrome_extension' | 'playwright' = 'cdp';
      let usingFallback = false;

      // Strategy 1: Try Chrome Extension first (best UX - works with user's existing Chrome)
      console.error('[computer_use] Attempting to connect to Chrome extension...');
      const extensionConnected = await chromeBridge.waitForConnection(2000);

      if (extensionConnected) {
        console.error('[computer_use] Chrome extension connected! Using extension driver.');
        driver = new ChromeExtensionDriver();
        driverType = 'chrome_extension';
        if (startUrl) {
          await driver.performAction({ name: 'navigate', args: { url: startUrl } });
        }
      } else {
        console.error('[computer_use] Chrome extension not available, falling back to CDP...');
      }

      // Strategy 2: Fallback to Chrome CDP (auto-launch/restart Chrome if needed)
      if (!driver) {
        usingFallback = true;
        try {
          let cdpAvailable = await checkChromeAvailable(9222);

          if (!cdpAvailable) {
            // Auto-launch Chrome with debugging using user's profile
            // This will also auto-restart Chrome if it's running without debugging
            const launchResult = await ensureChromeWithDebugging();
            if (launchResult.success) {
              // Wait a bit for Chrome to be fully ready
              await new Promise(resolve => setTimeout(resolve, 1500));
              cdpAvailable = await checkChromeAvailable(9222);
            } else if (launchResult.error) {
              // Chrome couldn't be launched or restarted
              return {
                success: false,
                error: launchResult.error + '\n\n💡 Tip: Install the Chrome Extension for seamless browser control.',
              };
            }
          }

          if (cdpAvailable) {
            driver = await ChromeCDPDriver.connect(9222);
            driverType = 'cdp';
            if (startUrl) {
              await driver.performAction({ name: 'navigate', args: { url: startUrl } });
            }
          }
        } catch (error) {
          console.error('CDP connection failed:', error);
        }
      }

      // If still no driver, Chrome is likely not installed
      if (!driver) {
        return {
          success: false,
          error: `Google Chrome is required for browser automation but could not be found.\n\n` +
                 `Please install Google Chrome from:\n` +
                 `https://www.google.com/chrome/\n\n` +
                 `After installing, try again.`,
        };
      }

      // Log suggestion to install extension if using fallback (non-blocking)
      if (usingFallback) {
        console.error('[computer_use] Using CDP fallback. For better experience, install the Gemini Cowork Chrome Extension.');
      }

      const ai = new GoogleGenAI({ apiKey });
      let steps = 0;
      let completed = false;
      let blocked = false;
      let blockedReason: string | undefined;
      const actions: string[] = [];

      try {
        while (steps < maxSteps) {
          const screenshot = await driver.getScreenshot();

          // Emit screenshot for live browser view
          const currentUrl = screenshot.url || await driver.getUrl();
          eventEmitter.browserViewScreenshot(_context.sessionId, {
            data: screenshot.data,
            mimeType: screenshot.mimeType,
            url: currentUrl,
            timestamp: Date.now(),
          });

          const response = await ai.models.generateContent({
            model: getComputerUseModel(),
            contents: [
              {
                role: 'user',
                parts: [
                  { text: `Goal: ${goal}\n\nCurrent URL: ${await driver.getUrl()}` },
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

          const functionCalls = response.functionCalls;
          if (!functionCalls?.length) {
            completed = true;
            break;
          }

          for (const call of functionCalls) {
            const name = call.name || 'unknown';
            const action = { name, args: call.args || {} };
            await driver.performAction(action);
            actions.push(`${name}(${JSON.stringify(call.args || {})})`);
          }

          steps += 1;
        }

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
            finalUrl: await driver.getUrl(),
            steps,
            driver: driverType,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        await driver.close().catch(() => undefined);
      }
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
